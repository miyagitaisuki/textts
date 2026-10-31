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

ipcMain.handle("project:open", async () => {
  const res = await dialog.showOpenDialog({
    title: "Mở project.json",
    filters: [{ name: "Project", extensions: ["json"] }],
    properties: ["openFile"],
  });
  if (res.canceled || res.filePaths.length === 0) return null;
  const filePath = res.filePaths[0];
  return { filePath, data: JSON.parse(fs.readFileSync(filePath, "utf-8")) };
});

ipcMain.handle("project:save", async (_evt, { filePath, data }) => {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
  return true;
});

// Chạy tts.py --project <file> -o <out>. Trả về mã thoát và log.
ipcMain.handle("tts:generate", async (evt, { projectPath, outputPath }) => {
  return new Promise((resolve) => {
    const args = [TTS_CLI, "--project", projectPath, "-o", outputPath];
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
  const outPath = path.join(os.tmpdir(), `textts-preview-${lineId}-${Date.now()}.mp3`);
  const args = [TTS_CLI, "--project", projectPath, "--preview", lineId, "-o", outPath];
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

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
