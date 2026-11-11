// Tiến trình chính Electron: đọc/ghi project.json và chạy tts.py như tiến trình con.
const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("path");
const { createPathGuard } = require("./guard.cjs");
const { sanitizeName, timestampName, uniqueName, validOutputRoot } = require("./projects.cjs");
const fs = require("fs");
const os = require("os");
const { spawn } = require("child_process");
const updater = require("./updater.cjs");
const logger = require("./logger.cjs");
const { friendlyPythonError } = require("./python-errors.cjs");
const { resolvePython, buildChildEnv } = require("./runtime.cjs");
const { buildMenu } = require("./menu.cjs");
const { startEngine, stopEngine } = require("./voicevox-engine.cjs");

logger.installCrashHandlers();

// Khi đóng gói, tts.py và core/ nằm trong resources/engine (xem "build.extraResources" trong package.json).
const REPO_ROOT = app.isPackaged
  ? path.join(process.resourcesPath, "engine")
  : path.resolve(__dirname, "..", "..");
const TTS_CLI = path.join(REPO_ROOT, "tts.py");
// Bản đóng gói trên Windows dùng Python và ffmpeg đi kèm (xem runtime.cjs); chạy dev dùng Python hệ thống.
const runtimeOpts = {
  isPackaged: app.isPackaged,
  resourcesPath: process.resourcesPath,
  platform: process.platform,
  exists: fs.existsSync,
};
const PYTHON = resolvePython({ env: process.env, ...runtimeOpts });
const CHILD_ENV = buildChildEnv({ env: process.env, ...runtimeOpts });

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.webContents.on("render-process-gone", (_e, details) => {
    logger.log("ERROR", `Trình kết xuất dừng bất ngờ: ${details.reason} (mã ${details.exitCode})`);
  });
  if (!app.isPackaged) {
    win.loadURL("http://localhost:5173"); // vite dev server (npm run dev)
  } else {
    win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
  return win;
}

// Kiểm tra cập nhật bấm tay từ thanh công cụ.
let mainWindow = null;
function sendUpdateLog(text) {
  logger.log("INFO", `[cập nhật] ${text}`);
  mainWindow?.webContents.send("tts:log", `${text}\n`);
}

ipcMain.handle("update:check", async (evt) => {
  const win = BrowserWindow.fromWebContents(evt.sender);
  return updater.checkNow((text) => sendUpdateLog(text));
});

// Chỉ cho phép đọc/ghi trong thư mục của các project đã mở qua hộp thoại.
// Renderer không được chỉ định đường dẫn tùy ý (xem electron/guard.cjs).
const { allowDirOf, assertAllowed } = createPathGuard();
const AUDIO_EXTS = new Set([".mp3", ".wav"]);

ipcMain.handle("project:open", async () => {
  const res = await dialog.showOpenDialog({
    title: "Mở dự án (project.json)",
    filters: [{ name: "Dự án", extensions: ["json"] }],
    properties: ["openFile"],
  });
  if (res.canceled || res.filePaths.length === 0) return null;
  const filePath = res.filePaths[0];
  allowDirOf(filePath);
  return { filePath, data: JSON.parse(fs.readFileSync(filePath, "utf-8")) };
});

// Thư mục xuất do người dùng chọn, lưu trong thư mục dữ liệu của ứng dụng.
// Main process giữ giá trị này: renderer không gửi đường dẫn thư mục xuất lên nữa.
function configFile() {
  return path.join(app.getPath("userData"), "config.json");
}

function readOutputRoot() {
  try {
    const raw = JSON.parse(fs.readFileSync(configFile(), "utf-8")).outputRoot;
    return validOutputRoot(raw, (p) => fs.existsSync(p) && fs.statSync(p).isDirectory());
  } catch {
    return "";
  }
}

function writeOutputRoot(root) {
  fs.mkdirSync(path.dirname(configFile()), { recursive: true });
  fs.writeFileSync(configFile(), JSON.stringify({ outputRoot: root }, null, 2), "utf-8");
}

// Phân tích kịch bản và tạo thư mục dự án mới trong thư mục xuất:
// <thư mục xuất>/<tên dự án>/<tên dự án>.json (+ các file đầu ra sẽ nằm cạnh đó).
async function createProjectFromScript({ scriptPath, text }) {
  const outputRoot = readOutputRoot();
  if (!outputRoot) {
    return { error: "Chưa chọn thư mục xuất. Bấm \"Đổi…\" để chọn." };
  }
  const base = text !== undefined ? timestampName() : sanitizeName(path.parse(scriptPath).name);
  const name = uniqueName(base, (n) => fs.existsSync(path.join(outputRoot, n)));
  const projectDir = path.join(outputRoot, name);
  fs.mkdirSync(projectDir);
  const filePath = path.join(projectDir, `${name}.json`);
  let source = scriptPath;
  if (text !== undefined) {
    source = path.join(projectDir, `${name}.txt`);
    fs.writeFileSync(source, text, "utf-8");
  }

  const result = await new Promise((resolve) => {
    const args = [TTS_CLI, source, "--save-project", filePath, "--dry-run", "--resolve-sfx"];
    const child = spawn(PYTHON, args, { cwd: REPO_ROOT, env: CHILD_ENV });
    let log = "";
    child.stdout.on("data", (c) => (log += c));
    child.stderr.on("data", (c) => (log += c));
    child.on("error", (err) => resolve({ code: -1, log: spawnErrorText(err) }));
    child.on("close", (code) => resolve({ code, log }));
  });
  if (result.code !== 0) {
    fs.rmSync(projectDir, { recursive: true, force: true }); // dự án chưa hợp lệ thì bỏ thư mục vừa tạo
    logger.log("ERROR", `Phân tích kịch bản thất bại (mã ${result.code}): ${result.log.trim().slice(0, 2000)}`);
    return { error: friendlyPythonError(result.log, PYTHON) || "Không phân tích được kịch bản" };
  }
  allowDirOf(filePath);
  return { filePath, projectDir, data: JSON.parse(fs.readFileSync(filePath, "utf-8")) };
}

// Chọn kịch bản .txt bằng hộp thoại, rồi tạo dự án mới trong thư mục xuất.
ipcMain.handle("script:open", async () => {
  const picked = await dialog.showOpenDialog({
    title: "Mở kịch bản .txt",
    filters: [{ name: "Kịch bản", extensions: ["txt"] }],
    properties: ["openFile"],
  });
  if (picked.canceled || picked.filePaths.length === 0) return null;
  return createProjectFromScript({ scriptPath: path.resolve(picked.filePaths[0]) });
});

// Chọn nhiều kịch bản .txt một lần (xử lý hàng loạt): mỗi file thành một dự án trong thư mục xuất.
// Trả về [{ script, filePath, data } | { script, error }] theo thứ tự đã chọn, hoặc null nếu hủy.
ipcMain.handle("script:openMany", async () => {
  const picked = await dialog.showOpenDialog({
    title: "Chọn nhiều kịch bản .txt để xử lý hàng loạt",
    filters: [{ name: "Kịch bản", extensions: ["txt"] }],
    properties: ["openFile", "multiSelections"],
  });
  if (picked.canceled || picked.filePaths.length === 0) return null;
  const results = [];
  for (const file of picked.filePaths) {
    const script = path.basename(file);
    const res = await createProjectFromScript({ scriptPath: path.resolve(file) });
    results.push({ script, ...res });
  }
  return results;
});

// Kịch bản dán trực tiếp từ giao diện.
ipcMain.handle("script:importText", async (_evt, { text }) => {
  if (typeof text !== "string" || !text.trim()) return { error: "Kịch bản trống" };
  return createProjectFromScript({ text });
});

// Thư mục xuất hiện tại ("" nếu chưa chọn).
ipcMain.handle("outputRoot:get", async () => readOutputRoot());

// Chọn thư mục xuất (thư mục gốc chứa các dự án) và ghi nhớ lại.
ipcMain.handle("outputRoot:pick", async () => {
  const res = await dialog.showOpenDialog({
    title: "Chọn thư mục xuất",
    properties: ["openDirectory", "createDirectory"],
  });
  if (res.canceled || res.filePaths.length === 0) return "";
  const root = path.resolve(res.filePaths[0]);
  writeOutputRoot(root);
  return root;
});

// Mở thư mục của dự án trong trình quản lý file.
ipcMain.handle("folder:open", async (_evt, { projectPath }) => {
  const proj = assertAllowed(projectPath, new Set([".json"]));
  const err = await shell.openPath(path.dirname(proj));
  return err ? { error: err } : { ok: true };
});

ipcMain.handle("project:save", async (_evt, { filePath, data }) => {
  // Giao diện chờ { ok: true } (hoặc { ok: false, error }) — trả về `true` trần
  // khiến mọi lần lưu bị coi là lỗi và chặn luôn "Nghe thử"/"Tạo âm thanh".
  try {
    const target = assertAllowed(filePath, new Set([".json"]));
    fs.writeFileSync(target, JSON.stringify(data, null, 2) + "\n", "utf-8");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
});

// Chạy tts.py --project <file> -o <out>. Trả về mã thoát và log.
ipcMain.handle("tts:generate", async (evt, { projectPath, outputPath, options = {} }) => {
  const proj = assertAllowed(projectPath, new Set([".json"]));
  const out = assertAllowed(outputPath, AUDIO_EXTS);
  // Tùy chọn xuất từ giao diện; chỉ nhận đúng các cờ đã biết.
  const args = [TTS_CLI, "--project", proj, "-o", out];
  if (options.lufs !== null && options.lufs !== undefined && String(options.lufs).trim() !== "" && Number.isFinite(Number(options.lufs))) {
    args.push("--lufs", String(Number(options.lufs)));
  }
  if (options.slow) args.push("--slow");
  if (options.srt) args.push("--srt");
  if (options.rolePlay && String(options.rolePlay).trim()) {
    args.push("--role-play", String(options.rolePlay).trim());
  }
  if (options.shadow) {
    args.push("--shadow");
    if (options.shadowGap && Number.isFinite(Number(options.shadowGap))) {
      args.push("--shadow-gap", String(Number(options.shadowGap)));
    }
  }
  if (options.exportLines) {
    args.push("--export-lines", path.join(path.dirname(proj), "lines"));
  }
  if (options.worksheet) {
    args.push("--worksheet", proj.replace(/\.json$/, ".html"));
  }
  if (options.bgmPath && typeof options.bgmPath === "string" && fs.existsSync(options.bgmPath)) {
    args.push("--bgm", options.bgmPath);
    if (options.bgmDb !== undefined && Number.isFinite(Number(options.bgmDb))) {
      args.push("--bgm-db", String(Number(options.bgmDb)));
    }
  }
  return new Promise((resolve) => {
    const child = spawn(PYTHON, args, { cwd: REPO_ROOT, env: CHILD_ENV });
    let log = "";
    const send = (chunk) => {
      const text = chunk.toString("utf-8");
      log += text;
      evt.sender.send("tts:log", text);
    };
    child.stdout.on("data", send);
    child.stderr.on("data", send);
    child.on("error", (err) => resolve({ code: -1, log: spawnErrorText(err) }));
    child.on("close", (code) => {
      logger.log(code === 0 ? "INFO" : "ERROR", `Tạo âm thanh kết thúc (mã ${code}), project: ${path.basename(proj)}`);
      if (code !== 0) logger.log("ERROR", log.trim().slice(-2000));
      resolve({ code, log });
    });
  });
});

// Chọn file âm thanh (nhạc nền BGM hoặc hiệu ứng SFX).
ipcMain.handle("file:pickAudio", async () => {
  const res = await dialog.showOpenDialog({
    title: "Chọn file âm thanh",
    filters: [{ name: "Âm thanh", extensions: ["mp3", "wav", "ogg", "m4a"] }],
    properties: ["openFile"],
  });
  if (res.canceled || res.filePaths.length === 0) return "";
  return path.resolve(res.filePaths[0]);
});

// --- Ngân hàng âm thanh (gói CC0 của textts + thư viện cá nhân) ---
const soundLib = require("./sound-library.cjs");
const SOUND_PACK = require("./sound-pack.json");
const SOUND_LIB_DIR = path.join(app.getPath("userData"), "sound-library");
const soundLibArgs = () => ({ libDir: SOUND_LIB_DIR, manifest: SOUND_PACK });

ipcMain.handle("soundlib:list", async () => soundLib.listLibrary(soundLibArgs()));

ipcMain.handle("soundlib:download", async (evt, { ids } = {}) => {
  try {
    const count = await soundLib.downloadPack({
      ...soundLibArgs(),
      ids: Array.isArray(ids) ? ids.filter((i) => typeof i === "string") : undefined,
      log: (text) => evt.sender.send("tts:log", `${text}\n`),
    });
    return { ok: true, count, ...soundLib.listLibrary(soundLibArgs()) };
  } catch (err) {
    logger.log("ERROR", `Tải gói âm thanh: ${err.message}`);
    return { ok: false, error: `Không tải được âm thanh: ${err.message}` };
  }
});

ipcMain.handle("soundlib:import", async (_evt, { kind } = {}) => {
  const res = await dialog.showOpenDialog({
    title: kind === "bgm" ? "Thêm nhạc/âm nền vào thư viện" : "Thêm hiệu ứng vào thư viện",
    filters: [{ name: "Âm thanh", extensions: ["mp3", "wav", "ogg", "m4a"] }],
    properties: ["openFile", "multiSelections"],
  });
  if (res.canceled) return { ok: true, added: [], ...soundLib.listLibrary(soundLibArgs()) };
  const added = soundLib.importToMine({ libDir: SOUND_LIB_DIR, kind, files: res.filePaths });
  return { ok: true, added, ...soundLib.listLibrary(soundLibArgs()) };
});

ipcMain.handle("soundlib:remove", async (_evt, { file }) => {
  soundLib.removeMine({ libDir: SOUND_LIB_DIR, file });
  return soundLib.listLibrary(soundLibArgs());
});

ipcMain.handle("soundlib:read", async (_evt, { file }) => soundLib.readAsDataUrl({ libDir: SOUND_LIB_DIR, file }));

// Mở phiếu in HTML bằng trình duyệt mặc định.
ipcMain.handle("worksheet:open", async (_evt, { projectPath }) => {
  const proj = assertAllowed(projectPath, new Set([".json"]));
  const htmlPath = proj.replace(/\.json$/, ".html");
  if (!fs.existsSync(htmlPath)) return { error: "Chưa có file phiếu học tập" };
  const err = await shell.openPath(htmlPath);
  return err ? { error: err } : { ok: true };
});

// Kiểm tra sự tồn tại của file phiếu học tập.
ipcMain.handle("worksheet:exists", async (_evt, { projectPath }) => {
  const proj = assertAllowed(projectPath, new Set([".json"]));
  const htmlPath = proj.replace(/\.json$/, ".html");
  return fs.existsSync(htmlPath);
});

// Đọc từ điển cách đọc readings.yaml
ipcMain.handle("readings:load", async (_evt, { projectPath } = {}) => {
  const custom = projectPath ? path.join(path.dirname(projectPath), "readings.yaml") : null;
  const target = custom && fs.existsSync(custom) ? custom : path.join(REPO_ROOT, "readings.yaml");
  if (!fs.existsSync(target)) return {};
  try {
    const raw = fs.readFileSync(target, "utf-8");
    const dict = {};
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes(":")) continue;
      const [k, v] = trimmed.split(":", 2);
      if (k && v) dict[k.trim()] = v.trim();
    }
    return dict;
  } catch {
    return {};
  }
});

// Lưu từ điển cách đọc readings.yaml
ipcMain.handle("readings:save", async (_evt, { projectPath, readings }) => {
  const custom = projectPath ? path.join(path.dirname(projectPath), "readings.yaml") : null;
  const target = custom || path.join(REPO_ROOT, "readings.yaml");
  const lines = Object.entries(readings || {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([w, k]) => `${w}: ${k}`);
  fs.writeFileSync(target, lines.join("\n") + "\n", "utf-8");
  return { ok: true, path: target };
});

// Quản lý bộ nhớ đệm (cache)
ipcMain.handle("cache:info", async () => {
  const cacheDir = path.join(REPO_ROOT, "cache");
  if (!fs.existsSync(cacheDir)) return { count: 0, sizeMb: 0 };
  const files = fs.readdirSync(cacheDir).map((f) => path.join(cacheDir, f)).filter((f) => fs.statSync(f).isFile());
  const bytes = files.reduce((sum, f) => sum + fs.statSync(f).size, 0);
  return { count: files.length, sizeMb: Math.round((bytes / 1_000_000) * 10) / 10 };
});

ipcMain.handle("cache:clear", async () => {
  const cacheDir = path.join(REPO_ROOT, "cache");
  if (!fs.existsSync(cacheDir)) return { ok: true, cleared: 0 };
  const files = fs.readdirSync(cacheDir).map((f) => path.join(cacheDir, f)).filter((f) => fs.statSync(f).isFile());
  files.forEach((f) => {
    try { fs.unlinkSync(f); } catch {}
  });
  return { ok: true, cleared: files.length };
});

function presetsFile() {
  return path.join(app.getPath("userData"), "presets.json");
}

ipcMain.handle("presets:load", async () => {
  try {
    const data = JSON.parse(fs.readFileSync(presetsFile(), "utf-8"));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
});

ipcMain.handle("presets:save", async (_evt, { presets }) => {
  if (!Array.isArray(presets)) throw new Error("Danh sách mẫu không hợp lệ");
  fs.mkdirSync(path.dirname(presetsFile()), { recursive: true });
  fs.writeFileSync(presetsFile(), JSON.stringify(presets, null, 2), "utf-8");
  return true;
});

// Danh sách giọng của engine (tts.py --list-voices). Trả về mảng {value, label} hoặc [] nếu lỗi.
ipcMain.handle("voices:list", async (_evt, { engine } = {}) => {
  const eng = engine || "edge";
  return new Promise((resolve) => {
    const child = spawn(PYTHON, [TTS_CLI, "--list-voices", eng], { cwd: REPO_ROOT, env: CHILD_ENV });
    let out = "";
    child.stdout.on("data", (c) => (out += c));
    child.on("error", () => resolve([]));
    child.on("close", (code) => {
      try {
        resolve(code === 0 ? JSON.parse(out) : []);
      } catch {
        resolve([]);
      }
    });
  });
});

// Kiểm tra kịch bản đã lưu (tts.py --lint): trả về [{id, level, message}].
ipcMain.handle("lint:check", async (_evt, { projectPath }) => {
  try {
    const proj = assertAllowed(projectPath, new Set([".json"]));
    return new Promise((resolve) => {
      const child = spawn(PYTHON, [TTS_CLI, "--project", proj, "--lint"], { cwd: REPO_ROOT, env: CHILD_ENV });
      let out = "";
      child.stdout.on("data", (c) => (out += c));
      child.on("error", () => resolve([]));
      child.on("close", (code) => {
        try {
          resolve(code === 0 ? JSON.parse(out) : []);
        } catch {
          resolve([]);
        }
      });
    });
  } catch {
    return [];
  }
});

// Lưu bản ghi âm mẫu của một vai vào recordings/<tên project>/ cạnh project.json.
ipcMain.handle("recording:save", async (_evt, { projectPath, roleId, base64 }) => {
  try {
    const proj = assertAllowed(projectPath, new Set([".json"]));
    if (!/^\d+$/.test(String(roleId))) throw new Error(`Mã vai không hợp lệ: ${roleId}`);
    const stem = path.parse(proj).name;
    const dir = path.join(path.dirname(proj), "recordings", stem);
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `role${roleId}-${Date.now()}.webm`);
    fs.writeFileSync(file, Buffer.from(base64, "base64"));
    return { ok: true, path: file };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
});

// Nghe thử một câu: chạy tts.py --preview <ID> rồi trả về audio dạng data URL.
ipcMain.handle("tts:preview", async (_evt, { projectPath, lineId }) => {
  const proj = assertAllowed(projectPath, new Set([".json"]));
  if (!/^L\d+$/.test(String(lineId))) throw new Error(`Mã câu không hợp lệ: ${lineId}`);
  const outPath = path.join(os.tmpdir(), `textts-preview-${lineId}-${Date.now()}.mp3`);
  const args = [TTS_CLI, "--project", proj, "--preview", lineId, "-o", outPath];
  const result = await new Promise((resolve) => {
    const child = spawn(PYTHON, args, { cwd: REPO_ROOT, env: CHILD_ENV });
    let log = "";
    child.stdout.on("data", (c) => (log += c));
    child.stderr.on("data", (c) => (log += c));
    child.on("error", (err) => resolve({ code: -1, log: spawnErrorText(err) }));
    child.on("close", (code) => resolve({ code, log }));
  });
  if (result.code !== 0 || !fs.existsSync(outPath)) {
    logger.log("ERROR", `Nghe thử ${lineId} thất bại (mã ${result.code}): ${result.log.trim().slice(0, 2000)}`);
    return { ok: false, error: result.log.trim() || "Không tạo được bản nghe thử" };
  }
  const b64 = fs.readFileSync(outPath).toString("base64");
  fs.rmSync(outPath, { force: true });
  return { ok: true, dataUrl: `data:audio/mpeg;base64,${b64}` };
});

// Cấu hình MCP cho Claude Desktop: chạy ai_tools/mcp_server.py bằng đúng Python mà textts đang dùng.
ipcMain.handle("mcp:config", async () => {
  const config = {
    mcpServers: {
      textts: {
        command: PYTHON,
        args: [path.join(REPO_ROOT, "ai_tools", "mcp_server.py")],
      },
    },
  };
  return JSON.stringify(config, null, 2);
});

// Nghe thử một giọng (chọn nhanh giọng cho vai): tts.py --sample <engine> --voice ... đọc một câu mẫu ngắn.
const SAMPLE_ENGINES = new Set(["edge", "voicevox", "aivis"]);
const SAMPLE_EMOTIONS = new Set(["neutral", "happy", "sad", "angry", "surprised"]);
const SAMPLE_SPEEDS = new Set(["slow", "normal", "fast"]);

ipcMain.handle("voice:sample", async (_evt, { engine, voice, emotion = "neutral", speed = "normal", pitch = 0 } = {}) => {
  if (!SAMPLE_ENGINES.has(engine)) return { ok: false, error: `Engine không hỗ trợ: ${engine}` };
  if (typeof voice !== "string" || !voice.trim() || voice.length > 200 || /[\x00-\x1f]/.test(voice)) {
    return { ok: false, error: "Giọng không hợp lệ" };
  }
  const args = [
    TTS_CLI, "--sample", engine, "--voice", voice,
    "--emotion", SAMPLE_EMOTIONS.has(emotion) ? emotion : "neutral",
    "--speed", SAMPLE_SPEEDS.has(speed) ? speed : "normal",
    "--pitch", String(Math.max(-50, Math.min(50, Math.round(Number(pitch) || 0)))),
  ];
  const outPath = path.join(os.tmpdir(), `textts-sample-${Date.now()}-${Math.random().toString(36).slice(2)}.mp3`);
  args.push("-o", outPath);
  const result = await new Promise((resolve) => {
    const child = spawn(PYTHON, args, { cwd: REPO_ROOT, env: CHILD_ENV });
    let log = "";
    child.stdout.on("data", (c) => (log += c));
    child.stderr.on("data", (c) => (log += c));
    child.on("error", (err) => resolve({ code: -1, log: spawnErrorText(err) }));
    child.on("close", (code) => resolve({ code, log }));
  });
  if (result.code !== 0 || !fs.existsSync(outPath)) {
    logger.log("ERROR", `Nghe thử giọng ${engine}/${voice} thất bại (mã ${result.code}): ${result.log.trim().slice(0, 2000)}`);
    const lines = result.log.trim().split(/\r?\n/).filter(Boolean);
    return { ok: false, error: lines[lines.length - 1] || "Không đọc thử được giọng này" };
  }
  const b64 = fs.readFileSync(outPath).toString("base64");
  fs.rmSync(outPath, { force: true });
  return { ok: true, dataUrl: `data:audio/mpeg;base64,${b64}` };
});

// Lỗi khi không chạy được tiến trình Python: hiển thị bằng tiếng Việt thay vì thông báo gốc của Node.
function spawnErrorText(err) {
  logger.log("ERROR", `Không chạy được tiến trình (${PYTHON}): ${err?.code ?? ""} ${err?.message ?? err}`);
  if (err && err.code === "ENOENT") {
    return `Không tìm thấy Python (${PYTHON}). Hãy cài Python hoặc đặt biến môi trường TEXTTS_PYTHON.`;
  }
  return `Không chạy được tiến trình xử lý: ${err?.message ?? err}`;
}

// Gợi ý cách đọc kanji cho nhiều câu cùng lúc: core.normalize đọc JSON từ stdin.
ipcMain.handle("reading:suggest", async (_evt, { texts }) => {
  return new Promise((resolve) => {
    const child = spawn(PYTHON, ["-m", "core.normalize"], { cwd: REPO_ROOT, env: CHILD_ENV });
    let out = "";
    let err = "";
    child.stdout.on("data", (c) => (out += c));
    child.stderr.on("data", (c) => (err += c));
    child.on("error", (e) => resolve({ ok: false, error: spawnErrorText(e) }));
    child.on("close", (code) => {
      if (code !== 0) return resolve({ ok: false, error: friendlyPythonError(err, PYTHON) });
      try {
        resolve({ ok: true, items: JSON.parse(out) });
      } catch (e) {
        resolve({ ok: false, error: "Không đọc được kết quả gợi ý cách đọc." });
      }
    });
    child.stdin.end(JSON.stringify(texts));
  });
});

// Đọc kết quả sau khi tạo âm thanh: file audio (data URL) và timeline cạnh nó.
ipcMain.handle("output:load", async (_evt, { audioPath }) => {
  assertAllowed(audioPath, AUDIO_EXTS);
  if (!fs.existsSync(audioPath)) return null;
  const base = audioPath.replace(/\.[^./\\]+$/, "");
  const timelinePath = `${base}.timeline.json`;
  if (!fs.existsSync(timelinePath)) return null;
  const timeline = JSON.parse(fs.readFileSync(timelinePath, "utf-8"));
  const ext = path.extname(audioPath).slice(1).toLowerCase();
  const mime = ext === "wav" ? "audio/wav" : "audio/mpeg";
  const dataUrl = `data:${mime};base64,${fs.readFileSync(audioPath).toString("base64")}`;
  return { timeline, dataUrl };
});

// --- Quản lý API Server & VOICEVOX ---
let apiServerProcess = null;
const API_PORT = 8000;
const API_URL = `http://127.0.0.1:${API_PORT}`;
const VOICEVOX_URL = process.env.VOICEVOX_URL || "http://127.0.0.1:50021";

async function pingUrl(url, timeoutMs = 1500) {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(id);
    return res.ok;
  } catch {
    return false;
  }
}

// --- VOICEVOX: tải theo yêu cầu (không đóng gói trong bộ cài, xem voicevox-install.cjs) ---
const voicevoxCfg = require("./voicevox-config.cjs");
const { voicevoxInstalled, installVoicevox } = require("./voicevox-install.cjs");
const { findFile } = require("./aivis-install.cjs");
const VOICEVOX_DIR = path.join(app.getPath("userData"), "voicevox");
const VOICEVOX_DOWNLOAD_DIR = path.join(app.getPath("userData"), "voicevox-download");
// 7za.exe đi kèm bộ cài để giải nén engine tải theo yêu cầu. TEXTTS_7Z chỉ dùng khi chạy từ mã nguồn.
const SEVEN_ZIP = process.env.TEXTTS_7Z || path.join(process.resourcesPath, "7z", "7za.exe");
let voicevoxEngine = null;
let voicevoxBoot = null;
let voicevoxBusy = false;

// Nếu VOICEVOX đã được cài trước đó thì tự khởi động khi mở app; chưa cài thì chỉ kiểm tra cổng.
function bootVoicevox() {
  const exe = findFile(VOICEVOX_DIR, "run.exe");
  voicevoxBoot = startEngine({
    url: VOICEVOX_URL,
    exe,
    ping: (u) => pingUrl(u),
    spawn,
    log: (level, msg) => logger.log(level, msg),
    onSpawn: (child) => {
      voicevoxEngine = { ready: false, managed: true, child };
    },
  })
    .then((engine) => {
      voicevoxEngine = engine;
      return engine.ready;
    })
    .catch((err) => {
      logger.log("ERROR", `[VOICEVOX] Khởi động thất bại: ${err?.stack ?? err}`);
      return false;
    });
  return voicevoxBoot;
}

async function voicevoxState() {
  const ok = await pingUrl(`${VOICEVOX_URL}/version`);
  return {
    ok,
    running: ok,
    configured: true,
    installed: voicevoxInstalled(VOICEVOX_DIR),
    url: VOICEVOX_URL,
    managed: Boolean(voicevoxEngine?.managed),
    busy: voicevoxBusy,
    version: voicevoxCfg.version,
  };
}

ipcMain.handle("voicevox:status", async () => {
  if (voicevoxBoot) await voicevoxBoot;
  return voicevoxState();
});

ipcMain.handle("voicevox:install", async () => {
  if (voicevoxBusy) return { ok: false, error: "Đang tải, vui lòng chờ" };
  voicevoxBusy = true;
  try {
    await installVoicevox({
      cfg: voicevoxCfg,
      installDir: VOICEVOX_DIR,
      downloadDir: VOICEVOX_DOWNLOAD_DIR,
      sevenZip: SEVEN_ZIP,
      spawnFn: spawn,
      log: (level, msg) => logger.log(level, msg),
    });
    return { ok: true, state: await voicevoxState() };
  } catch (err) {
    logger.log("ERROR", `[VOICEVOX] Cài đặt thất bại: ${err?.message ?? err}`);
    return { ok: false, error: err?.message ?? String(err) };
  } finally {
    voicevoxBusy = false;
  }
});

ipcMain.handle("voicevox:start", async () => {
  if (await pingUrl(`${VOICEVOX_URL}/version`)) return { ok: true, state: await voicevoxState() };
  const exe = findFile(VOICEVOX_DIR, "run.exe");
  if (!exe) return { ok: false, error: "Chưa tải VOICEVOX" };
  if (voicevoxBoot) await voicevoxBoot; // lần tự khởi động khi mở app có thể chưa xong
  if (await pingUrl(`${VOICEVOX_URL}/version`)) return { ok: true, state: await voicevoxState() };
  voicevoxEngine = await startEngine({
    url: VOICEVOX_URL,
    exe,
    ping: (u) => pingUrl(u),
    spawn,
    log: (level, msg) => logger.log(level, msg),
    onSpawn: (child) => {
      voicevoxEngine = { ready: false, managed: true, child };
    },
  });
  return { ok: voicevoxEngine.ready, error: engineError(voicevoxEngine), state: await voicevoxState() };
});

// Engine do textts khởi động và tiến trình vẫn còn chạy.
function engineAlive(engine) {
  const child = engine?.child;
  return Boolean(engine?.managed && child && child.exitCode === null && child.signalCode === null);
}

// Chờ một tiến trình engine đã chạy trả lời /version.
async function waitEngineReady(url, child, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) return false;
    if (await pingUrl(`${url}/version`)) return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

// Thông báo lỗi kèm vài dòng log cuối của engine (nếu có).
function engineError(result) {
  if (result.ready) return undefined;
  const tail = (result.lastLines ?? []).slice(-3).join(" | ");
  return [result.error ?? "engine chưa phản hồi", tail].filter(Boolean).join(" — ");
}

// --- AivisSpeech: tải theo yêu cầu (không đóng gói), chạy engine khi cần ---
const aivisCfg = require("./aivis-config.cjs");
const aivisInstall = require("./aivis-install.cjs");
const AIVIS_DIR = path.join(app.getPath("userData"), "aivis");
const AIVIS_DOWNLOAD_DIR = path.join(app.getPath("userData"), "aivis-download");
// Thư mục Models mà AivisSpeech Engine đọc mặc định trên Windows.
const AIVIS_MODELS_DIR = path.join(app.getPath("appData"), "AivisSpeech-Engine", "Models");
let aivisEngine = null;
let aivisBusy = false;

async function aivisState() {
  const status = aivisInstall.aivisStatus({ cfg: aivisCfg, installDir: AIVIS_DIR, modelsDir: AIVIS_MODELS_DIR });
  const running = await pingUrl(`${aivisCfg.AIVIS_URL}/version`);
  return {
    ...status,
    installed: status.engineInstalled && status.modelCount > 0,
    running,
    managed: Boolean(aivisEngine?.managed),
    url: aivisCfg.AIVIS_URL,
    busy: aivisBusy,
  };
}

ipcMain.handle("aivis:status", async () => aivisState());

ipcMain.handle("aivis:install", async () => {
  if (aivisBusy) return { ok: false, error: "Đang tải, vui lòng chờ" };
  aivisBusy = true;
  try {
    await aivisInstall.installAivis({
      cfg: aivisCfg,
      installDir: AIVIS_DIR,
      modelsDir: AIVIS_MODELS_DIR,
      downloadDir: AIVIS_DOWNLOAD_DIR,
      sevenZip: SEVEN_ZIP,
      spawnFn: spawn,
      log: (level, msg) => logger.log(level, msg),
    });
    return { ok: true, state: await aivisState() };
  } catch (err) {
    logger.log("ERROR", `[AivisSpeech] Cài đặt thất bại: ${err?.message ?? err}`);
    return { ok: false, error: err?.message ?? String(err) };
  } finally {
    aivisBusy = false;
  }
});

// AivisSpeech nạp BERT và các model .aivmx khi khởi động: lần đầu có thể mất vài phút.
const AIVIS_READY_TIMEOUT_MS = 5 * 60_000;
let aivisStarting = null;

ipcMain.handle("aivis:start", async () => {
  if (await pingUrl(`${aivisCfg.AIVIS_URL}/version`)) return { ok: true, state: await aivisState() };
  const exe = aivisInstall.findFile(AIVIS_DIR, "run.exe");
  if (!exe) return { ok: false, error: "Chưa cài AivisSpeech" };
  // Đang khởi động (lần bấm trước chưa xong, hoặc đã quá thời gian chờ nhưng tiến trình vẫn chạy):
  // chờ tiếp tiến trình đó thay vì chạy thêm một bản tranh cổng.
  if (!aivisStarting && engineAlive(aivisEngine)) {
    aivisStarting = waitEngineReady(aivisCfg.AIVIS_URL, aivisEngine.child, AIVIS_READY_TIMEOUT_MS).then((ready) => ({
      ...aivisEngine,
      ready,
      error: ready ? undefined : "AivisSpeech vẫn chưa phản hồi; xem log trong Nhật ký ứng dụng",
    }));
  }
  if (!aivisStarting) {
    aivisStarting = startEngine({
      url: aivisCfg.AIVIS_URL,
      exe,
      name: "AivisSpeech",
      timeoutMs: AIVIS_READY_TIMEOUT_MS,
      ping: (u) => pingUrl(u),
      spawn,
      log: (level, msg) => logger.log(level, msg),
      onSpawn: (child) => {
        aivisEngine = { ready: false, managed: true, child };
      },
    });
  }
  try {
    const result = await aivisStarting;
    if (result.child || !aivisEngine) aivisEngine = result;
    return { ok: Boolean(result.ready), error: engineError(result), state: await aivisState() };
  } finally {
    aivisStarting = null;
  }
});

ipcMain.handle("apiServer:status", async () => {
  const isHealthy = await pingUrl(`${API_URL}/api/v1/health`);
  return {
    running: Boolean(apiServerProcess) || isHealthy,
    port: API_PORT,
    url: API_URL,
    docsUrl: `${API_URL}/docs`,
  };
});

ipcMain.handle("apiServer:toggle", async () => {
  if (apiServerProcess) {
    apiServerProcess.kill();
    apiServerProcess = null;
    logger.log("INFO", "API Server đã dừng");
    return { running: false, port: API_PORT, url: API_URL };
  }

  const serverScript = path.join(REPO_ROOT, "server.py");
  apiServerProcess = spawn(PYTHON, [serverScript, "--port", String(API_PORT)], {
    cwd: REPO_ROOT,
    env: CHILD_ENV,
  });

  apiServerProcess.stdout.on("data", (chunk) => {
    logger.log("INFO", `[API] ${chunk.toString().trim()}`);
  });
  apiServerProcess.stderr.on("data", (chunk) => {
    logger.log("ERROR", `[API] ${chunk.toString().trim()}`);
  });
  apiServerProcess.on("close", (code) => {
    logger.log("INFO", `[API] Tiến trình kết thúc (mã ${code})`);
    apiServerProcess = null;
  });
  apiServerProcess.on("error", (err) => {
    logger.log("ERROR", `[API] Lỗi khởi động: ${err.message}`);
    apiServerProcess = null;
  });

  await new Promise((r) => setTimeout(r, 800));
  const isHealthy = await pingUrl(`${API_URL}/api/v1/health`);
  return { running: isHealthy || Boolean(apiServerProcess), port: API_PORT, url: API_URL, docsUrl: `${API_URL}/docs` };
});

ipcMain.handle("url:openExternal", async (_evt, { url }) => {
  if (typeof url === "string" && (url.startsWith("http://") || url.startsWith("https://"))) {
    await shell.openExternal(url);
    return true;
  }
  return false;
});

app.on("before-quit", () => {
  if (apiServerProcess) {
    try {
      apiServerProcess.kill();
    } catch {
      // Bỏ qua lỗi dọn dẹp khi thoát
    }
    apiServerProcess = null;
  }
  // Chỉ tắt VOICEVOX do textts khởi động; engine người dùng tự mở từ trước được giữ nguyên.
  stopEngine(voicevoxEngine);
  voicevoxEngine = null;
  stopEngine(aivisEngine);
  aivisEngine = null;
});

app.whenReady().then(() => {
  logger.log("INFO", `Khởi động textts ${app.getVersion()} trên ${process.platform}`);
  bootVoicevox();
  const win = createWindow();
  mainWindow = win;
  buildMenu({
    getWindow: () => mainWindow,
    onCheckUpdates: () => updater.checkNow((text) => sendUpdateLog(text)).then((r) => sendUpdateLog(r.message)),
  });
  // Tự kiểm tra bản mới khi mở app; thông báo lỗi (nếu có) đưa vào nhật ký giao diện.
  updater.setupUpdater(win, (text) => sendUpdateLog(text));
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
