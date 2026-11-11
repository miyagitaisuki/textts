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

function listMine({ libDir }) {
  const out = [];
  for (const kind of KINDS) {
    const dir = myDir(libDir, kind);
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir).sort((a, b) => a.localeCompare(b))) {
      if (!AUDIO_EXTS.has(path.extname(name).toLowerCase())) continue;
      const file = path.join(dir, name);
      out.push({
        id: `my-${kind}-${name}`,
        kind,
        name: path.basename(name, path.extname(name)),
        category: "Của tôi",
        source: "mine",
        path: file,
        downloaded: true,
        bytes: fs.statSync(file).size,
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

// Chép file vào thư viện cá nhân; trả về đường dẫn mới.
function importToMine({ libDir, kind, files }) {
  const dir = myDir(libDir, kind);
  fs.mkdirSync(dir, { recursive: true });
  return files
    .filter((f) => AUDIO_EXTS.has(path.extname(f).toLowerCase()))
    .map((f) => {
      const dest = path.join(dir, uniqueName(dir, path.basename(f)));
      fs.copyFileSync(f, dest);
      return dest;
    });
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
}

const MIME = { ".mp3": "audio/mpeg", ".wav": "audio/wav", ".ogg": "audio/ogg", ".m4a": "audio/mp4" };

function readAsDataUrl({ libDir, file }) {
  if (!isInside(libDir, file)) throw new Error("Đường dẫn không thuộc thư viện âm thanh");
  const mime = MIME[path.extname(file).toLowerCase()] || "application/octet-stream";
  return `data:${mime};base64,${fs.readFileSync(path.resolve(file)).toString("base64")}`;
}

module.exports = { listLibrary, downloadPack, importToMine, removeMine, readAsDataUrl, isInside };
