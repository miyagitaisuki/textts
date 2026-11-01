const fs = require("fs");
const os = require("os");
const path = require("path");

// Hàm thuần của bộ tự cập nhật: không phụ thuộc Electron nên có thể test trên Node thường.

function updateErrorText(err) {
  const msg = err?.message ?? String(err);
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|ECONNRESET|net::|network/i.test(msg)) {
    return "Không kết nối được tới GitHub. Kiểm tra mạng rồi thử lại.";
  }
  return `Không kiểm tra được cập nhật: ${msg}`;
}

function compareVersions(a, b) {
  const pa = String(a).split(".").map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) > (pb[i] ?? 0)) return "newer";
    if ((pa[i] ?? 0) < (pb[i] ?? 0)) return "older";
  }
  return "same";
}

function writeSwapScript(newExe, targetExe, pid) {
  const script = path.join(os.tmpdir(), `textts-update-${pid}.bat`);
  fs.writeFileSync(script, [
    "@echo off",
    ":wait",
    `tasklist /FI "PID eq ${pid}" 2>nul | find "${pid}" >nul && (timeout /t 1 /nobreak >nul & goto wait)`,
    ":copy",
    `copy /Y "${newExe}" "${targetExe}" >nul 2>&1 || (timeout /t 1 /nobreak >nul & goto copy)`,
    `start "" "${targetExe}"`,
    `del "${newExe}" >nul 2>&1`,
    `del "%~f0" >nul 2>&1`,
  ].join("\r\n"));
  return script;
}

module.exports = { updateErrorText, compareVersions, writeSwapScript };
