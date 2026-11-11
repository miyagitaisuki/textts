// Cài engine từ một hoặc nhiều phần archive (.7z.001, .7z.002, ...).
// Quy trình: tải từng phần -> kiểm tra SHA-256 -> nối các phần thành một .7z -> giải nén bằng 7za.exe đi kèm app.
// (Giống cách AivisSpeech làm: nối phần trước rồi mới giải nén, vì 7z không đọc được từ stdin.)
// Mọi phụ thuộc (fetch, spawn) được truyền vào để kiểm thử.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Readable } = require("stream");
const { pipeline } = require("stream/promises");
const { spawn: defaultSpawn } = require("child_process");

function sha256File(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(file);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

// Tải một file về dest và kiểm tra SHA-256. Hash sai thì xóa file và ném lỗi.
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

// Nối các file theo thứ tự thành một file (nối các phần .7z.00N cho ra đúng archive gốc).
async function concatFiles(files, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  await pipeline(
    async function* () {
      for (const f of files) {
        for await (const chunk of fs.createReadStream(f)) yield chunk;
      }
    },
    fs.createWriteStream(dest)
  );
  return dest;
}

// Giải nén bằng 7za.exe. Ném lỗi nếu 7za không chạy được hoặc trả về mã lỗi.
function extractWith7z({ sevenZip, archive, dest, spawnFn = defaultSpawn }) {
  if (!sevenZip) throw new Error("Thiếu 7za.exe để giải nén");
  fs.mkdirSync(dest, { recursive: true });
  return new Promise((resolve, reject) => {
    const child = spawnFn(sevenZip, ["x", archive, `-o${dest}`, "-y"], { windowsHide: true });
    let stderr = "";
    child.stderr?.on("data", (c) => (stderr += c.toString()));
    child.stdout?.on("data", () => {});
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve(dest);
      else reject(new Error(`Giải nén thất bại (mã ${code}): ${stderr.trim().slice(0, 300)}`));
    });
  });
}

// Cài một bộ phần archive vào installDir. parts: [{ name, url, sha256 }] theo đúng thứ tự .001, .002, ...
// Mọi file tạm trong downloadDir đều bị xóa sau khi xong (kể cả khi lỗi).
async function installArchiveParts({ parts, installDir, downloadDir, sevenZip, fetchImpl, spawnFn, log = () => {} }) {
  if (!Array.isArray(parts) || parts.length === 0) throw new Error("Chưa cấu hình các phần archive");
  fs.mkdirSync(downloadDir, { recursive: true });
  const partFiles = [];
  const joined = path.join(downloadDir, "engine-archive.7z");
  try {
    for (const part of parts) {
      const dest = path.join(downloadDir, part.name);
      log("INFO", `Đang tải ${part.name}`);
      await downloadVerified({ url: part.url, sha256: part.sha256, dest, fetchImpl });
      partFiles.push(dest);
    }
    await concatFiles(partFiles, joined);
    log("INFO", "Đang giải nén");
    await extractWith7z({ sevenZip, archive: joined, dest: installDir, spawnFn });
    return installDir;
  } finally {
    for (const f of [...partFiles, joined]) fs.rmSync(f, { force: true });
  }
}

module.exports = {
  sha256File,
  downloadVerified,
  concatFiles,
  extractWith7z,
  installArchiveParts,
};
