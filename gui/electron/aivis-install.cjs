// Tải AivisSpeech Engine và bộ giọng JVNV theo yêu cầu của người dùng (không nằm trong bộ cài).
// Mỗi phần tải về đều được kiểm tra SHA-256; giải nén bằng 7za.exe (xem archive-install.cjs).
const fs = require("fs");
const path = require("path");
const { installArchiveParts, downloadVerified } = require("./archive-install.cjs");

// Cấu hình đủ nguồn để tải: engine là các phần archive đã ghim SHA-256;
// models là danh sách file .aivmx đã ghim SHA-256 (mỗi file tải trực tiếp, không giải nén).
function isConfigured(cfg) {
  const okParts = (list) => Array.isArray(list) && list.length > 0 && list.every((p) => p?.url && p?.sha256 && p?.name);
  return okParts(cfg?.engine?.parts) && okParts(cfg?.models?.files);
}

// Tìm file theo tên trong cây thư mục (archive có thể có thư mục gốc bao quanh). Trả về đường dẫn hoặc null.
function findFile(dir, name) {
  if (!fs.existsSync(dir)) return null;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isFile() && entry.name.toLowerCase() === name.toLowerCase()) return full;
    if (entry.isDirectory()) {
      const found = findFile(full, name);
      if (found) return found;
    }
  }
  return null;
}

// Đếm model .aivmx đã có trong thư mục Models.
function countModels(modelsDir) {
  if (!fs.existsSync(modelsDir)) return 0;
  return fs.readdirSync(modelsDir).filter((f) => f.toLowerCase().endsWith(".aivmx")).length;
}

// Trạng thái hiện tại để giao diện hiển thị đúng nút.
function aivisStatus({ cfg, installDir, modelsDir }) {
  return {
    configured: isConfigured(cfg),
    engineInstalled: Boolean(findFile(installDir, "run.exe")),
    modelCount: countModels(modelsDir),
  };
}

// Cài đặt đầy đủ: engine vào installDir, rồi bộ model JVNV được giải nén vào thư mục tạm
// và các file .aivmx được chép vào thư mục Models mà engine đọc.
async function installAivis({ cfg, installDir, modelsDir, downloadDir, sevenZip, fetchImpl, spawnFn, log = () => {} }) {
  if (!isConfigured(cfg)) throw new Error("Chưa cấu hình nguồn tải AivisSpeech");

  log("INFO", "[AivisSpeech] Đang tải engine");
  await installArchiveParts({
    parts: cfg.engine.parts,
    installDir,
    downloadDir: path.join(downloadDir, "engine"),
    sevenZip,
    fetchImpl,
    spawnFn,
    log,
  });

  // Model .aivmx tải trực tiếp, kiểm tra SHA-256 rồi chép vào thư mục Models của engine.
  log("INFO", "[AivisSpeech] Đang tải bộ giọng");
  fs.mkdirSync(modelsDir, { recursive: true });
  const modelDl = path.join(downloadDir, "models");
  for (const file of cfg.models.files) {
    const dest = path.join(modelDl, file.name);
    await downloadVerified({ url: file.url, sha256: file.sha256, dest, fetchImpl });
    fs.copyFileSync(dest, path.join(modelsDir, file.name));
    fs.rmSync(dest, { force: true });
  }
  fs.rmSync(modelDl, { recursive: true, force: true });

  log("INFO", "[AivisSpeech] Cài đặt xong");
  return aivisStatus({ cfg, installDir, modelsDir });
}

module.exports = {
  isConfigured,
  findFile,
  countModels,
  aivisStatus,
  installAivis,
};
