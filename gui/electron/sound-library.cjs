// Ngân hàng âm thanh: gói CC0 của textts (tải về khi cần) + thư viện cá nhân của giáo viên.
// Cấu trúc trên đĩa (trong userData/sound-library):
//   pack/<version>/<file>      file của gói textts đã tải
//   my/sfx/<file>, my/bgm/<file>  file giáo viên tự thêm
// Không dùng Electron ở đây: mọi phụ thuộc (fetch) được truyền vào để kiểm thử.
const fs = require("fs");
const path = require("path");
const { downloadVerified } = require("./archive-install.cjs");

const KINDS = new Set(["sfx", "bgm"]);
const AUDIO_EXTS = new Set([".mp3", ".wav", ".ogg", ".m4a"]);

function packDir(libDir, manifest) {
  return path.join(libDir, "pack", manifest.version);
}

function myDir(libDir, kind) {
  if (!KINDS.has(kind)) throw new Error(`Loại âm không hợp lệ: ${kind}`);
  return path.join(libDir, "my", kind);
}

function listPack({ libDir, manifest }) {
  const dir = packDir(libDir, manifest);
  return manifest.items.map((it) => {
    const file = path.join(dir, it.file);
    const downloaded = fs.existsSync(file) && fs.statSync(file).size === it.bytes;
    return { ...it, source: "pack", path: downloaded ? file : null, downloaded };
  });
}

// Mô tả do giáo viên ghi cho âm cá nhân (để AI đọc mà không cần nghe): my/index.json
// { "bgm/ten.mp3": { description, tags: [], related: [], credit } }
function indexPath(libDir) {
  return path.join(libDir, "my", "index.json");
}

function readIndex(libDir) {
  try {
    const data = JSON.parse(fs.readFileSync(indexPath(libDir), "utf-8"));
    return data && typeof data === "object" && !Array.isArray(data) ? data : {};
  } catch {
    return {};
  }
}

function writeIndex(libDir, index) {
  fs.mkdirSync(path.dirname(indexPath(libDir)), { recursive: true });
  fs.writeFileSync(indexPath(libDir), JSON.stringify(index, null, 2) + "\n", "utf-8");
}

function relKey(libDir, file) {
  return path.relative(path.join(libDir, "my"), path.resolve(file)).split(path.sep).join("/");
}

const list = (v) =>
  (Array.isArray(v) ? v : String(v ?? "").split(/[,、，]/))
    .map((x) => String(x).trim())
    .filter(Boolean);

function setMeta({ libDir, file, description = "", tags = [], related = [], credit = "" }) {
  if (!isInside(libDir, file, "my")) throw new Error("Chỉ ghi mô tả cho âm trong thư viện cá nhân");
  const index = readIndex(libDir);
  index[relKey(libDir, file)] = {
    description: String(description).trim(),
    tags: list(tags),
    related: list(related),
    credit: String(credit).trim(),
  };
  writeIndex(libDir, index);
  writeCatalog(libDir);
}

function listMine({ libDir }) {
  const out = [];
  const index = readIndex(libDir);
  for (const kind of KINDS) {
    const dir = myDir(libDir, kind);
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir).sort((a, b) => a.localeCompare(b))) {
      if (!AUDIO_EXTS.has(path.extname(name).toLowerCase())) continue;
      const file = path.join(dir, name);
      const meta = index[`${kind}/${name}`] || {};
      out.push({
        id: `my-${kind}-${name}`,
        kind,
        name: path.basename(name, path.extname(name)),
        category: "Của tôi",
        source: "mine",
        path: file,
        downloaded: true,
        bytes: fs.statSync(file).size,
        description: meta.description || "",
        tags: list(meta.tags),
        related: list(meta.related),
        credit: meta.credit || "",
      });
    }
  }
  return out;
}

function listLibrary({ libDir, manifest }) {
  return { license: manifest.license, items: [...listPack({ libDir, manifest }), ...listMine({ libDir })] };
}

// Tải các âm của gói theo id (bỏ qua âm đã có). Trả về số âm đã tải mới.
async function downloadPack({ libDir, manifest, ids, fetchImpl = fetch, log = () => {} }) {
  const wanted = ids ? new Set(ids) : null;
  const dir = packDir(libDir, manifest);
  let count = 0;
  for (const it of manifest.items) {
    if (wanted && !wanted.has(it.id)) continue;
    const dest = path.join(dir, it.file);
    if (fs.existsSync(dest) && fs.statSync(dest).size === it.bytes) continue;
    log(`Đang tải ${it.name}…`);
    await downloadVerified({ url: manifest.baseUrl + it.file, sha256: it.sha256, dest, fetchImpl });
    count += 1;
  }
  return count;
}

function uniqueName(dir, name) {
  const ext = path.extname(name);
  const base = path.basename(name, ext);
  let candidate = name;
  for (let n = 2; fs.existsSync(path.join(dir, candidate)); n += 1) candidate = `${base} (${n})${ext}`;
  return candidate;
}

// File âm thanh trong một thư mục (và thư mục con, tối đa 3 cấp).
function audioFilesIn(dir, depth = 3) {
  if (depth < 0 || !fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return audioFilesIn(full, depth - 1);
    return AUDIO_EXTS.has(path.extname(e.name).toLowerCase()) ? [full] : [];
  });
}

// Chép file vào thư viện cá nhân; trả về đường dẫn mới. `credit` (vd. "OtoLogic (CC BY 4.0)") được
// ghi vào mục lục của từng file để bài xuất ra tự kèm dòng ghi nguồn.
function importToMine({ libDir, kind, files, credit = "" }) {
  const dir = myDir(libDir, kind);
  fs.mkdirSync(dir, { recursive: true });
  const added = files
    .filter((f) => AUDIO_EXTS.has(path.extname(f).toLowerCase()))
    .map((f) => {
      const dest = path.join(dir, uniqueName(dir, path.basename(f)));
      fs.copyFileSync(f, dest);
      return dest;
    });
  if (String(credit).trim() && added.length) {
    const index = readIndex(libDir);
    for (const f of added) index[relKey(libDir, f)] = { description: "", tags: [], related: [], credit: String(credit).trim() };
    writeIndex(libDir, index);
  }
  writeCatalog(libDir);
  return added;
}

// Đường dẫn có nằm trong thư viện (gói hoặc cá nhân) không — chỉ những file này được đọc/xóa qua IPC.
function isInside(libDir, file, sub = "") {
  if (typeof file !== "string" || !file) return false;
  const root = path.resolve(libDir, sub) + path.sep;
  return path.resolve(file).startsWith(root) && AUDIO_EXTS.has(path.extname(file).toLowerCase());
}

function removeMine({ libDir, file }) {
  if (!isInside(libDir, file, "my")) throw new Error("Chỉ xóa được âm trong thư viện cá nhân");
  fs.rmSync(path.resolve(file), { force: true });
  const index = readIndex(libDir);
  if (index[relKey(libDir, file)]) {
    delete index[relKey(libDir, file)];
    writeIndex(libDir, index);
  }
  writeCatalog(libDir);
}

// MUC_LUC.md: mục lục âm cá nhân dạng văn bản, để Claude hay AI khác đọc trực tiếp (không cần nghe).
// Âm của gói textts có mục lục riêng trong API (/api/v1/sounds/catalog).
function writeCatalog(libDir) {
  const mine = listMine({ libDir });
  const cell = (v) => String(v || "").replace(/\|/g, "/").replace(/\n/g, " ");
  const lines = [
    "# Mục lục âm thanh của giáo viên (textts)",
    "",
    "ref = tên dùng cho nhạc nền (bgm) hoặc dòng [sfx=<ref>] trong kịch bản.",
    "Không có âm đúng thì chọn âm có \"Dùng tạm cho\" gần nhất và báo người dùng.",
    "",
  ];
  for (const [kind, title] of [["bgm", "Nhạc / âm nền (bgm)"], ["sfx", "Hiệu ứng (sfx)"]]) {
    const group = mine.filter((m) => m.kind === kind);
    if (!group.length) continue;
    lines.push(`## ${title}`, "", "| ref | Mô tả | Từ khóa | Dùng tạm cho | Nguồn |", "|---|---|---|---|---|");
    for (const m of group) {
      lines.push(`| ${cell(m.name)} | ${cell(m.description) || "(chưa có mô tả)"} | ${cell(m.tags.join(", "))} | ${cell(m.related.join(", "))} | ${cell(m.credit) || "giáo viên"} |`);
    }
    lines.push("");
  }
  fs.mkdirSync(libDir, { recursive: true });
  fs.writeFileSync(path.join(libDir, "MUC_LUC.md"), lines.join("\n"), "utf-8");
}

const MIME = { ".mp3": "audio/mpeg", ".wav": "audio/wav", ".ogg": "audio/ogg", ".m4a": "audio/mp4" };

function readAsDataUrl({ libDir, file }) {
  if (!isInside(libDir, file)) throw new Error("Đường dẫn không thuộc thư viện âm thanh");
  const mime = MIME[path.extname(file).toLowerCase()] || "application/octet-stream";
  return `data:${mime};base64,${fs.readFileSync(path.resolve(file)).toString("base64")}`;
}

module.exports = { listLibrary, downloadPack, importToMine, removeMine, readAsDataUrl, isInside, setMeta, audioFilesIn, writeCatalog };
