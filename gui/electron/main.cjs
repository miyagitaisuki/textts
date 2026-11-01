// Tiến trình chính Electron: đọc/ghi project.json và chạy tts.py như tiến trình con.
const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("path");
const { createPathGuard } = require("./guard.cjs");
const { sanitizeName, timestampName, uniqueName, validOutputRoot } = require("./projects.cjs");
const fs = require("fs");
const os = require("os");
const { spawn } = require("child_process");

// Khi đóng gói, tts.py và core/ nằm trong resources/engine (xem "build.extraResources" trong package.json).
const REPO_ROOT = app.isPackaged
  ? path.join(process.resourcesPath, "engine")
  : path.resolve(__dirname, "..", "..");
const TTS_CLI = path.join(REPO_ROOT, "tts.py");
const PYTHON = process.env.TEXTTS_PYTHON || "python3";

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
  if (!app.isPackaged) {
    win.loadURL("http://localhost:5173"); // vite dev server (npm run dev)
  } else {
    win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

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
    const child = spawn(PYTHON, args, { cwd: REPO_ROOT });
    let log = "";
    child.stdout.on("data", (c) => (log += c));
    child.stderr.on("data", (c) => (log += c));
    child.on("error", (err) => resolve({ code: -1, log: spawnErrorText(err) }));
    child.on("close", (code) => resolve({ code, log }));
  });
  if (result.code !== 0) {
    fs.rmSync(projectDir, { recursive: true, force: true }); // dự án chưa hợp lệ thì bỏ thư mục vừa tạo
    return { error: result.log.trim() || "Không phân tích được kịch bản" };
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
  const target = assertAllowed(filePath, new Set([".json"]));
  fs.writeFileSync(target, JSON.stringify(data, null, 2) + "\n", "utf-8");
  return true;
});

// Chạy tts.py --project <file> -o <out>. Trả về mã thoát và log.
ipcMain.handle("tts:generate", async (evt, { projectPath, outputPath, options = {} }) => {
  const proj = assertAllowed(projectPath, new Set([".json"]));
  const out = assertAllowed(outputPath, AUDIO_EXTS);
  // Tùy chọn xuất từ giao diện; chỉ nhận đúng các cờ đã biết.
  const args = [TTS_CLI, "--project", proj, "-o", out];
  if (options.lufs !== null && options.lufs !== undefined && Number.isFinite(Number(options.lufs))) {
    args.push("--lufs", String(Number(options.lufs)));
  }
  if (options.slow) args.push("--slow");
  if (options.srt) args.push("--srt");
  return new Promise((resolve) => {
    const child = spawn(PYTHON, args, { cwd: REPO_ROOT });
    let log = "";
    const send = (chunk) => {
      const text = chunk.toString("utf-8");
      log += text;
      evt.sender.send("tts:log", text);
    };
    child.stdout.on("data", send);
    child.stderr.on("data", send);
    child.on("error", (err) => resolve({ code: -1, log: spawnErrorText(err) }));
    child.on("close", (code) => resolve({ code, log }));
  });
});

// Nghe thử một câu: chạy tts.py --preview <ID> rồi trả về audio dạng data URL.
ipcMain.handle("tts:preview", async (_evt, { projectPath, lineId }) => {
  const proj = assertAllowed(projectPath, new Set([".json"]));
  if (!/^L\d+$/.test(String(lineId))) throw new Error(`Mã câu không hợp lệ: ${lineId}`);
  const outPath = path.join(os.tmpdir(), `textts-preview-${lineId}-${Date.now()}.mp3`);
  const args = [TTS_CLI, "--project", proj, "--preview", lineId, "-o", outPath];
  const result = await new Promise((resolve) => {
    const child = spawn(PYTHON, args, { cwd: REPO_ROOT });
    let log = "";
    child.stdout.on("data", (c) => (log += c));
    child.stderr.on("data", (c) => (log += c));
    child.on("error", (err) => resolve({ code: -1, log: spawnErrorText(err) }));
    child.on("close", (code) => resolve({ code, log }));
  });
  if (result.code !== 0 || !fs.existsSync(outPath)) {
    return { ok: false, error: result.log.trim() || "Không tạo được bản nghe thử" };
  }
  const b64 = fs.readFileSync(outPath).toString("base64");
  fs.rmSync(outPath, { force: true });
  return { ok: true, dataUrl: `data:audio/mpeg;base64,${b64}` };
});

// Lỗi khi không chạy được tiến trình Python: hiển thị bằng tiếng Việt thay vì thông báo gốc của Node.
function spawnErrorText(err) {
  if (err && err.code === "ENOENT") {
    return `Không tìm thấy Python (${PYTHON}). Hãy cài Python hoặc đặt biến môi trường TEXTTS_PYTHON.`;
  }
  return `Không chạy được tiến trình xử lý: ${err?.message ?? err}`;
}

// Gợi ý cách đọc kanji cho nhiều câu cùng lúc: core.normalize đọc JSON từ stdin.
ipcMain.handle("reading:suggest", async (_evt, { texts }) => {
  return new Promise((resolve) => {
    const child = spawn(PYTHON, ["-m", "core.normalize"], { cwd: REPO_ROOT });
    let out = "";
    let err = "";
    child.stdout.on("data", (c) => (out += c));
    child.stderr.on("data", (c) => (err += c));
    child.on("error", (e) => resolve({ ok: false, error: spawnErrorText(e) }));
    child.on("close", (code) => {
      if (code !== 0) return resolve({ ok: false, error: err.trim() });
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

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
