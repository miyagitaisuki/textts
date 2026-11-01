const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const https = require("https");

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

// Tải file theo chuyển hướng của GitHub (302 tới objects.githubusercontent.com).
function download(url, dest, onProgress, redirects = 5) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("http:") ? http : https; // ứng dụng thật chỉ gọi https tới GitHub
    client.get(url, { headers: { "User-Agent": "textts-updater" } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
        res.resume();
        return resolve(download(new URL(res.headers.location, url).toString(), dest, onProgress, redirects - 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const total = Number(res.headers["content-length"]) || 0;
      let got = 0;
      const file = fs.createWriteStream(dest);
      let lastStep = -1;
      res.on("data", (c) => {
        got += c.length;
        if (!total) return;
        const step = Math.floor((got / total) * 4) * 25; // báo mỗi 25%
        if (step !== lastStep) {
          lastStep = step;
          onProgress?.(step);
        }
      });
      res.pipe(file);
      file.on("finish", () => file.close(() => resolve(dest)));
      file.on("error", reject);
      res.on("error", reject);
    }).on("error", reject);
  });
}


module.exports = { updateErrorText, compareVersions, writeSwapScript, download };
