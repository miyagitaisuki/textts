// Tải VOICEVOX ENGINE theo yêu cầu của người dùng (không nằm trong bộ cài).
// Dùng chung cơ chế tải từng phần, kiểm tra SHA-256 và giải nén 7za.exe với AivisSpeech (archive-install.cjs).
const fs = require("fs");
const path = require("path");
const { findFile } = require("./aivis-install.cjs");
const { installArchiveParts } = require("./archive-install.cjs");

// Trạng thái cài đặt: đã có run.exe trong thư mục cài chưa.
function voicevoxInstalled(installDir) {
  return Boolean(findFile(installDir, "run.exe"));
}

// Tải từng phần, kiểm tra SHA-256, nối và giải nén vào installDir.
async function installVoicevox({ cfg, installDir, downloadDir, sevenZip, fetchImpl, spawnFn, log = () => {} }) {
  if (!Array.isArray(cfg?.parts) || cfg.parts.length === 0) throw new Error("Chưa cấu hình nguồn tải VOICEVOX");
  log("INFO", `[VOICEVOX] Đang tải ${cfg.version} (khoảng 1,9 GB)`);
  fs.mkdirSync(downloadDir, { recursive: true });
  await installArchiveParts({ parts: cfg.parts, installDir, downloadDir, sevenZip, fetchImpl, spawnFn, log });
  if (!voicevoxInstalled(installDir)) throw new Error("Không tìm thấy run.exe sau khi giải nén VOICEVOX");
  log("INFO", "[VOICEVOX] Cài đặt xong");
  return { installed: true };
}

module.exports = { voicevoxInstalled, installVoicevox };
