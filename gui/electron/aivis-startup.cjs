// Tự động mở AivisSpeech Engine ở chế độ nền khi khởi động Windows.
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const REG_KEY = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run";
const REG_VALUE = "AivisSpeechEngine";

function prefsPath(userDataDir) {
  return path.join(userDataDir, "aivis-startup.json");
}

function vbsPath(userDataDir) {
  return path.join(userDataDir, "start-aivis-hidden.vbs");
}

function readStartupEnabled(userDataDir) {
  try {
    const raw = JSON.parse(fs.readFileSync(prefsPath(userDataDir), "utf8"));
    if (typeof raw.enabled === "boolean") return raw.enabled;
  } catch {
    // Chưa có file cấu hình -> mặc định bật
  }
  return true;
}

function writeStartupEnabled(userDataDir, enabled) {
  fs.mkdirSync(userDataDir, { recursive: true });
  fs.writeFileSync(prefsPath(userDataDir), JSON.stringify({ enabled: Boolean(enabled) }, null, 2), "utf8");
}

function buildVbsContent(exePath, port = 10101) {
  const escaped = String(exePath).replace(/"/g, '""');
  return `Set sh = CreateObject("WScript.Shell")\nsh.Run """${escaped}"" --host 127.0.0.1 --port ${Number(port) || 10101}", 0, False\n`;
}

function applyWindowsStartup({ userDataDir, exePath, port = 10101, enabled, runReg = execFileSync }) {
  if (process.platform !== "win32") return { ok: true, supported: false, enabled: Boolean(enabled) };
  const script = vbsPath(userDataDir);
  if (enabled) {
    if (!exePath || !fs.existsSync(exePath)) {
      return { ok: false, supported: true, enabled: false, error: "Chưa cài AivisSpeech Engine" };
    }
    fs.mkdirSync(userDataDir, { recursive: true });
    fs.writeFileSync(script, buildVbsContent(exePath, port), "utf8");
    const cmd = `wscript.exe "${script}"`;
    runReg("reg", ["add", REG_KEY, "/v", REG_VALUE, "/t", "REG_SZ", "/d", cmd, "/f"], { windowsHide: true });
    return { ok: true, supported: true, enabled: true };
  }
  try {
    runReg("reg", ["delete", REG_KEY, "/v", REG_VALUE, "/f"], { windowsHide: true });
  } catch {
    // Đã xóa từ trước thì bỏ qua
  }
  return { ok: true, supported: true, enabled: false };
}

function setStartup({ userDataDir, exePath, port = 10101, enabled, runReg = execFileSync }) {
  writeStartupEnabled(userDataDir, enabled);
  return applyWindowsStartup({ userDataDir, exePath, port, enabled, runReg });
}

function syncStartupOnBoot({ userDataDir, exePath, port = 10101, runReg = execFileSync }) {
  const enabled = readStartupEnabled(userDataDir);
  if (!enabled) return { ok: true, supported: process.platform === "win32", enabled: false };
  if (!exePath || !fs.existsSync(exePath)) return { ok: true, supported: process.platform === "win32", enabled: true, pending: true };
  return applyWindowsStartup({ userDataDir, exePath, port, enabled: true, runReg });
}

module.exports = {
  REG_KEY,
  REG_VALUE,
  readStartupEnabled,
  writeStartupEnabled,
  buildVbsContent,
  applyWindowsStartup,
  setStartup,
  syncStartupOnBoot,
};
