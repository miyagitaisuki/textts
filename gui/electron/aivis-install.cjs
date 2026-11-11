// Tải AivisSpeech Engine và bộ giọng JVNV theo yêu cầu của người dùng (không nằm trong bộ cài).
// Mỗi phần tải về đều được kiểm tra SHA-256; giải nén bằng 7za.exe (xem archive-install.cjs).
const fs = require("fs");
const path = require("path");
const { installArchiveParts } = require("./archive-install.cjs");

// Cấu hình đủ nguồn để tải: engine và models đều phải có danh sách phần đã ghim SHA-256.
function isConfigured(cfg) {
  const okParts = (s) =>
    Array.isArray(s?.parts) && s.parts.length > 0 && s.parts.every((p) => p?.url && p?.sha256 && p?.name);
  return okParts(cfg?.engine) && okParts(cfg?.models);
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

  log("INFO", "[AivisSpeech] Đang tải bộ giọng JVNV");
  const modelStage = path.join(downloadDir, "models");
  await installArchiveParts({
    parts: cfg.models.parts,
    installDir: modelStage,
    downloadDir: path.join(downloadDir, "models-dl"),
    sevenZip,
    fetchImpl,
    spawnFn,
    log,
  });
  fs.mkdirSync(modelsDir, { recursive: true });
  copyAivmx(modelStage, modelsDir);
  fs.rmSync(modelStage, { recursive: true, force: true });

  log("INFO", "[AivisSpeech] Cài đặt xong");
  return aivisStatus({ cfg, installDir, modelsDir });
}

function copyAivmx(srcDir, destDir) {
  if (!fs.existsSync(srcDir)) return;
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const full = path.join(srcDir, entry.name);
    if (entry.isDirectory()) copyAivmx(full, destDir);
    else if (entry.name.toLowerCase().endsWith(".aivmx")) fs.copyFileSync(full, path.join(destDir, entry.name));
  }
}

module.exports = {
  isConfigured,
  findFile,
  countModels,
  aivisStatus,
  installAivis,
};
