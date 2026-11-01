// Tiến trình chính Electron: đọc/ghi project.json và chạy tts.py như tiến trình con.
const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { spawn } = require("child_process");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
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
// Renderer không được chỉ định đường dẫn tùy ý.
const allowedDirs = new Set();
const AUDIO_EXTS = new Set([".mp3", ".wav"]);

function allowDirOf(filePath) {
  allowedDirs.add(path.dirname(path.resolve(filePath)));
}

function isAllowed(filePath, exts) {
  if (typeof filePath !== "string" || !filePath) return false;
  const resolved = path.resolve(filePath);
  if (exts && !exts.has(path.extname(resolved).toLowerCase())) return false;
  const dir = path.dirname(resolved);
  return allowedDirs.has(dir);
}

function assertAllowed(filePath, exts) {
  if (!isAllowed(filePath, exts)) {
    throw new Error(`Đường dẫn không được phép: ${filePath}`);
  }
  return path.resolve(filePath);
}

ipcMain.handle("project:open", async () => {
  const res = await dialog.showOpenDialog({
    title: "Mở project.json",
    filters: [{ name: "Project", extensions: ["json"] }],
    properties: ["openFile"],
  });
  if (res.canceled || res.filePaths.length === 0) return null;
  const filePath = res.filePaths[0];
  allowDirOf(filePath);
  return { filePath, data: JSON.parse(fs.readFileSync(filePath, "utf-8")) };
});

// Mở kịch bản .txt: tts.py phân tích và lưu thành project.json (chọn nơi lưu bằng hộp thoại).
ipcMain.handle("script:open", async () => {
  const picked = await dialog.showOpenDialog({
    title: "Mở kịch bản .txt",
    filters: [{ name: "Kịch bản", extensions: ["txt"] }],
    properties: ["openFile"],
  });
  if (picked.canceled || picked.filePaths.length === 0) return null;
  const scriptPath = path.resolve(picked.filePaths[0]);
  const saved = await dialog.showSaveDialog({
    title: "Lưu project.json",
    defaultPath: path.join(path.dirname(scriptPath), `${path.parse(scriptPath).name}.json`),
    filters: [{ name: "Project", extensions: ["json"] }],
  });
  if (saved.canceled || !saved.filePath) return null;
  const filePath = path.resolve(saved.filePath);
  allowDirOf(filePath);

  const result = await new Promise((resolve) => {
    const args = [TTS_CLI, scriptPath, "--save-project", filePath, "--dry-run"];
    const child = spawn(PYTHON, args, { cwd: REPO_ROOT });
    let log = "";
    child.stdout.on("data", (c) => (log += c));
    child.stderr.on("data", (c) => (log += c));
    child.on("error", (err) => resolve({ code: -1, log: String(err) }));
    child.on("close", (code) => resolve({ code, log }));
  });
  if (result.code !== 0) return { error: result.log.trim() || "Không phân tích được kịch bản" };
  return { filePath, data: JSON.parse(fs.readFileSync(filePath, "utf-8")) };
});

// Danh sách giọng của engine (tts.py --list-voices). Trả về mảng {value, label} hoặc [] nếu lỗi.
ipcMain.handle("voices:list", async (_evt, { engine }) => {
  if (!["edge", "voicevox"].includes(engine)) return [];
  return new Promise((resolve) => {
    const child = spawn(PYTHON, [TTS_CLI, "--list-voices", engine], { cwd: REPO_ROOT });
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
  const proj = assertAllowed(projectPath, new Set([".json"]));
  return new Promise((resolve) => {
    const child = spawn(PYTHON, [TTS_CLI, "--project", proj, "--lint"], { cwd: REPO_ROOT });
    let out = "";
    child.stdout.on("data", (c) => (out += c));
    child.on("error", () => resolve([]));
    child.on("close", () => {
      try {
        resolve(JSON.parse(out));
      } catch {
        resolve([]);
      }
    });
  });
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
    return { ok: false, error: String(err.message || err) };
  }
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
    child.on("error", (err) => resolve({ code: -1, log: String(err) }));
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
    child.on("error", (err) => resolve({ code: -1, log: String(err) }));
    child.on("close", (code) => resolve({ code, log }));
  });
  if (result.code !== 0 || !fs.existsSync(outPath)) {
    return { ok: false, error: result.log.trim() || "Không tạo được bản nghe thử" };
  }
  const b64 = fs.readFileSync(outPath).toString("base64");
  fs.rmSync(outPath, { force: true });
  return { ok: true, dataUrl: `data:audio/mpeg;base64,${b64}` };
});

// Gợi ý cách đọc kanji cho nhiều câu cùng lúc: core.normalize đọc JSON từ stdin.
ipcMain.handle("reading:suggest", async (_evt, { texts }) => {
  return new Promise((resolve) => {
    const child = spawn(PYTHON, ["-m", "core.normalize"], { cwd: REPO_ROOT });
    let out = "";
    let err = "";
    child.stdout.on("data", (c) => (out += c));
    child.stderr.on("data", (c) => (err += c));
    child.on("error", (e) => resolve({ ok: false, error: String(e) }));
    child.on("close", (code) => {
      if (code !== 0) return resolve({ ok: false, error: err.trim() });
      try {
        resolve({ ok: true, items: JSON.parse(out) });
      } catch (e) {
        resolve({ ok: false, error: String(e) });
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
