// Tải VOICEVOX ENGINE theo yêu cầu của người dùng (không nằm trong bộ cài).
// Dùng lại cơ chế tải có kiểm tra SHA-256 và giải nén của aivis-install.cjs.
const fs = require("fs");
const path = require("path");
const { findFile, downloadVerified, extractArchive } = require("./aivis-install.cjs");

// Trạng thái cài đặt: đã có run.exe trong thư mục cài chưa.
function voicevoxInstalled(installDir) {
  return Boolean(findFile(installDir, "run.exe"));
}

// Tải, kiểm tra SHA-256, giải nén. Archive tạm bị xóa sau khi giải nén xong.
async function installVoicevox({ cfg, installDir, downloadDir, fetchImpl, spawnFn, log = () => {} }) {
  if (!cfg?.url || !cfg?.sha256) throw new Error("Chưa cấu hình nguồn tải VOICEVOX");
  fs.mkdirSync(downloadDir, { recursive: true });
  const archive = path.join(downloadDir, "voicevox-engine.7z");
  log("INFO", `[VOICEVOX] Đang tải ${cfg.version} (khoảng 1,9 GB)`);
  await downloadVerified({ url: cfg.url, sha256: cfg.sha256, dest: archive, fetchImpl });
  log("INFO", "[VOICEVOX] Đang giải nén");
  try {
    await extractArchive({ archive, dest: installDir, spawnFn });
  } finally {
    fs.rmSync(archive, { force: true });
  }
  if (!voicevoxInstalled(installDir)) throw new Error("Không tìm thấy run.exe sau khi giải nén VOICEVOX");
  log("INFO", "[VOICEVOX] Cài đặt xong");
  return { installed: true };
}

module.exports = { voicevoxInstalled, installVoicevox };
