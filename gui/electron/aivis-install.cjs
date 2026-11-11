// Tải AivisSpeech Engine và toàn bộ giọng công khai trên AivisHub theo yêu cầu của người dùng (không nằm trong bộ cài).
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

const AIVIS_API = "https://api.aivis-project.com/v1";
const UUID_RE = /aivm-models\/([0-9a-f-]{36})\//i;

// Danh mục mọi model công khai trên AivisHub (bản AIVMX mà engine dùng), kèm SHA-256 và dung lượng từ API.
async function fetchCatalog({ fetchImpl = fetch, apiBase = AIVIS_API, pageSize = 30 } = {}) {
  const models = [];
  for (let page = 1; page < 1000; page += 1) {
    const res = await fetchImpl(`${apiBase}/aivm-models/search?limit=${pageSize}&page=${page}`);
    if (!res.ok) throw new Error(`AivisHub trả về HTTP ${res.status}`);
    const data = await res.json();
    const batch = data.aivm_models ?? [];
    models.push(...batch);
    if (batch.length === 0 || models.length >= (data.total ?? 0)) break;
  }
  return models.flatMap((m) => {
    const file = (m.model_files ?? [])
      .filter((f) => f.model_type === "AIVMX" && /^[0-9a-f]{64}$/i.test(f.checksum ?? ""))
      .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))[0];
    if (!file) return [];
    return [{
      uuid: m.aivm_model_uuid,
      name: `${m.aivm_model_uuid}.aivmx`,
      url: `${apiBase}/aivm-models/${m.aivm_model_uuid}/download?model_type=AIVMX`,
      sha256: file.checksum,
      size: file.file_size,
      title: m.name,
      author: m.user?.name ?? "",
      license: file.license_type ?? "",
    }];
  });
}

function uuidOf(file) {
  return file.uuid ?? file.url?.match(UUID_RE)?.[1]?.toLowerCase() ?? null;
}

// Gộp danh sách ghim sẵn trong cấu hình với danh mục AivisHub, bỏ trùng theo UUID model.
function mergeModels(pinned, catalog) {
  const seen = new Set();
  const out = [];
  for (const f of [...pinned, ...catalog]) {
    const id = uuidOf(f) ?? f.name;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(f);
  }
  return out;
}

function freeBytes(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const st = fs.statfsSync(dir);
    return st.bavail * st.bsize;
  } catch {
    return Infinity; // Không đo được thì không chặn.
  }
}

function writeLicenseList(modelsDir, models) {
  const lines = [
    "Giấy phép các giọng AivisSpeech do textts tải về (nguồn: AivisHub).",
    "Kiểm tra điều khoản trước khi dùng âm thanh ngoài lớp học; ACML-NC là phi thương mại, Custom là điều khoản riêng của tác giả.",
    "",
    ...models.map((m) => `${m.title ?? m.name}\t${m.license ?? "xem cấu hình"}\t${m.author ?? ""}\thttps://hub.aivis-project.com/aivm-models/${uuidOf(m) ?? ""}`),
  ];
  fs.writeFileSync(path.join(path.dirname(modelsDir), "textts-giay-phep-giong.txt"), lines.join("\n") + "\n", "utf-8");
}

// Cài đặt đầy đủ: engine (nếu chưa có) vào installDir, rồi mọi model (cấu hình ghim + toàn bộ AivisHub)
// tải thẳng vào thư mục Models mà engine đọc. Chạy lại để tải tiếp phần còn thiếu hoặc giọng mới.
async function installAivis({
  cfg, installDir, modelsDir, downloadDir, sevenZip, fetchImpl, spawnFn, log = () => {},
  catalog = () => fetchCatalog({ fetchImpl }), diskFree = freeBytes,
}) {
  if (!isConfigured(cfg)) throw new Error("Chưa cấu hình nguồn tải AivisSpeech");

  if (findFile(installDir, "run.exe")) {
    log("INFO", "[AivisSpeech] Engine đã có, bỏ qua bước tải engine");
  } else {
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
  }

  let hub = [];
  try {
    hub = await catalog();
    log("INFO", `[AivisSpeech] AivisHub có ${hub.length} giọng`);
  } catch (err) {
    log("WARN", `[AivisSpeech] Không lấy được danh mục AivisHub (${err?.message ?? err}); chỉ tải các giọng ghim sẵn`);
  }
  const models = mergeModels(cfg.models.files, hub);
  fs.mkdirSync(modelsDir, { recursive: true });
  writeLicenseList(modelsDir, models);

  const missing = models.filter((f) => !fs.existsSync(path.join(modelsDir, f.name)));
  const need = missing.reduce((sum, f) => sum + (f.size ?? 300e6), 0);
  const free = diskFree(modelsDir);
  if (free < need * 1.05) {
    throw new Error(
      `Không đủ dung lượng: cần khoảng ${(need / 1e9).toFixed(1)} GB cho ${missing.length} giọng, ổ đĩa còn ${(free / 1e9).toFixed(1)} GB`
    );
  }

  log("INFO", `[AivisSpeech] Cần tải ${missing.length}/${models.length} giọng (~${(need / 1e9).toFixed(1)} GB)`);
  const modelDl = path.join(downloadDir, "models");
  const failed = [];
  for (const [i, file] of missing.entries()) {
    const label = file.title ?? file.name;
    log("INFO", `[AivisSpeech] Giọng ${i + 1}/${missing.length}: ${label}`);
    const dest = path.join(modelDl, file.name);
    try {
      await downloadVerified({ url: file.url, sha256: file.sha256, dest, fetchImpl });
      fs.copyFileSync(dest, path.join(modelsDir, file.name));
    } catch (err) {
      failed.push(label);
      log("WARN", `[AivisSpeech] Bỏ qua ${label}: ${err?.message ?? err}`);
    } finally {
      fs.rmSync(dest, { force: true });
    }
  }
  fs.rmSync(modelDl, { recursive: true, force: true });

  log("INFO", failed.length ? `[AivisSpeech] Xong, ${failed.length} giọng lỗi (bấm tải lại để thử tiếp)` : "[AivisSpeech] Cài đặt xong");
  return { ...aivisStatus({ cfg, installDir, modelsDir }), failed };
}

module.exports = {
  isConfigured,
  findFile,
  countModels,
  aivisStatus,
  installAivis,
  fetchCatalog,
  mergeModels,
};
