// Tải AivisSpeech Engine và bộ giọng JVNV theo yêu cầu của người dùng (không nằm trong bộ cài).
// Mỗi file tải về đều được kiểm tra SHA-256 trước khi giải nén. Mọi phụ thuộc (fetch, spawn) được truyền vào để kiểm thử.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Readable } = require("stream");
const { pipeline } = require("stream/promises");
const { spawn: defaultSpawn } = require("child_process");

// Đã cấu hình đủ nguồn để tải chưa.
function isConfigured(cfg) {
  return Boolean(cfg?.engine?.url && cfg?.engine?.sha256 && cfg?.models?.url && cfg?.models?.sha256);
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

function sha256File(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(file);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

// Tải file về dest rồi kiểm tra SHA-256. Ném lỗi nếu mạng lỗi hoặc hash không khớp (và xóa file hỏng).
async function downloadVerified({ url, sha256, dest, fetchImpl = fetch }) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const res = await fetchImpl(url, { redirect: "follow" });
  if (!res.ok || !res.body) throw new Error(`Tải thất bại (HTTP ${res.status})`);
  await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(dest));
  const actual = await sha256File(dest);
  if (actual !== sha256.toLowerCase()) {
    fs.rmSync(dest, { force: true });
    throw new Error(`SHA-256 không khớp (nhận ${actual})`);
  }
  return dest;
}

// Giải nén .zip bằng tar.exe có sẵn trên Windows 10+.
function extractArchive({ archive, dest, spawnFn = defaultSpawn }) {
  fs.mkdirSync(dest, { recursive: true });
  return new Promise((resolve, reject) => {
    const child = spawnFn("tar", ["-xf", archive, "-C", dest], { windowsHide: true });
    let stderr = "";
    child.stderr?.on("data", (c) => (stderr += c.toString()));
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve(dest);
      else reject(new Error(`Giải nén thất bại (mã ${code}): ${stderr.trim().slice(0, 300)}`));
    });
  });
}

// Trạng thái hiện tại để giao diện hiển thị đúng nút.
function aivisStatus({ cfg, installDir, modelsDir }) {
  return {
    configured: isConfigured(cfg),
    engineInstalled: Boolean(findFile(installDir, "run.exe")),
    modelCount: countModels(modelsDir),
  };
}

// Cài đặt đầy đủ: tải + kiểm tra + giải nén engine, rồi tải + kiểm tra + giải nén model vào thư mục Models của engine.
async function installAivis({ cfg, installDir, modelsDir, downloadDir, fetchImpl, spawnFn, log = () => {} }) {
  if (!isConfigured(cfg)) throw new Error("Chưa cấu hình nguồn tải AivisSpeech");
  fs.mkdirSync(downloadDir, { recursive: true });

  log("INFO", "[AivisSpeech] Đang tải engine");
  const engineZip = path.join(downloadDir, "aivis-engine.zip");
  await downloadVerified({ url: cfg.engine.url, sha256: cfg.engine.sha256, dest: engineZip, fetchImpl });
  await extractArchive({ archive: engineZip, dest: installDir, spawnFn });
  fs.rmSync(engineZip, { force: true });

  log("INFO", "[AivisSpeech] Đang tải bộ giọng JVNV");
  const modelsZip = path.join(downloadDir, "aivis-models.zip");
  await downloadVerified({ url: cfg.models.url, sha256: cfg.models.sha256, dest: modelsZip, fetchImpl });
  await extractArchive({ archive: modelsZip, dest: downloadDir, spawnFn });
  fs.rmSync(modelsZip, { force: true });
  // Chép file .aivmx (kể cả trong thư mục con) vào thư mục Models mà engine đọc.
  fs.mkdirSync(modelsDir, { recursive: true });
  copyAivmx(downloadDir, modelsDir);

  log("INFO", "[AivisSpeech] Cài đặt xong");
  return aivisStatus({ cfg, installDir, modelsDir });
}

function copyAivmx(srcDir, destDir) {
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
  sha256File,
  downloadVerified,
  extractArchive,
  aivisStatus,
  installAivis,
};
