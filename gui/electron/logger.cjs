// Nhật ký của tiến trình chính: ghi vào <userData>/logs/textts.log để người dùng gửi khi báo lỗi.
// Chỉ giữ file hiện tại và một file cũ (textts.log.1) để thư mục không phình ra.
const { app } = require("electron");
const fs = require("fs");
const path = require("path");

const MAX_BYTES = 1024 * 1024; // 1 MB
let logDir = null;
let logFile = null;

function getLogDir() {
  if (!logDir) logDir = path.join(app.getPath("userData"), "logs");
  return logDir;
}

function getLogFile() {
  if (!logFile) logFile = path.join(getLogDir(), "textts.log");
  return logFile;
}

function rotateIfNeeded() {
  try {
    if (fs.statSync(getLogFile()).size < MAX_BYTES) return;
    fs.renameSync(getLogFile(), `${getLogFile()}.1`);
  } catch {
    // chưa có file: không cần xoay
  }
}

// Ghi một dòng nhật ký. Không bao giờ ném lỗi: nhật ký không được làm hỏng ứng dụng.
function log(level, message) {
  try {
    fs.mkdirSync(getLogDir(), { recursive: true });
    rotateIfNeeded();
    const line = `${new Date().toISOString()} [${level}] ${message}\n`;
    fs.appendFileSync(getLogFile(), line, "utf-8");
  } catch {
    // bỏ qua
  }
}

// Ghi lỗi chưa được bắt (lỗi trong tiến trình chính, trình kết xuất bị treo/đóng bất ngờ).
function installCrashHandlers() {
  process.on("uncaughtException", (err) => log("ERROR", `uncaughtException: ${err?.stack ?? err}`));
  process.on("unhandledRejection", (reason) => log("ERROR", `unhandledRejection: ${reason?.stack ?? reason}`));
}

module.exports = { log, getLogDir, getLogFile, installCrashHandlers };
