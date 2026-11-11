const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { EventEmitter } = require("node:events");
const { concatFiles, downloadVerified, installArchiveParts } = require("../electron/archive-install.cjs");

const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "archive-test-"));

function fakeFetch(map) {
  return async (url) => {
    const body = map[url];
    if (!body) return new Response("nope", { status: 404 });
    return new Response(body, { status: 200 });
  };
}

// 7za giả: đọc archive, gọi onArchive(archivePath, bytes) để lấy danh sách file cần "giải nén".
function fake7z(onArchive) {
  return (cmd, args) => {
    assert.match(cmd, /7za\.exe$/);
    assert.equal(args[0], "x");
    const archive = args[1];
    const dest = args[2].slice(2); // -o<dest>
    const child = new EventEmitter();
    child.stderr = new EventEmitter();
    child.stdout = new EventEmitter();
    queueMicrotask(() => {
      try {
        const files = onArchive(archive, fs.readFileSync(archive));
        for (const [rel, content] of Object.entries(files)) {
          const full = path.join(dest, rel);
          fs.mkdirSync(path.dirname(full), { recursive: true });
          fs.writeFileSync(full, content);
        }
        child.emit("exit", 0);
      } catch (err) {
        child.stderr.emit("data", Buffer.from(err.message));
        child.emit("exit", 2);
      }
    });
    return child;
  };
}

test("concatFiles joins parts in order into one archive", async () => {
  const dir = tmp();
  try {
    const a = path.join(dir, "x.7z.001");
    const b = path.join(dir, "x.7z.002");
    fs.writeFileSync(a, "AAA");
    fs.writeFileSync(b, "BBB");
    const out = path.join(dir, "joined.7z");
    await concatFiles([a, b], out);
    assert.equal(fs.readFileSync(out, "utf8"), "AAABBB");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("downloadVerified rejects a part whose SHA-256 does not match and deletes it", async () => {
  const dir = tmp();
  try {
    const dest = path.join(dir, "p.001");
    await assert.rejects(
      downloadVerified({
        url: "https://example.test/p.001",
        sha256: "0".repeat(64),
        dest,
        fetchImpl: fakeFetch({ "https://example.test/p.001": Buffer.from("data") }),
      }),
      /SHA-256 không khớp/
    );
    assert.equal(fs.existsSync(dest), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("installArchiveParts verifies every part, concatenates in order, extracts, and cleans up", async () => {
  const root = tmp();
  try {
    const p1 = Buffer.from("first-");
    const p2 = Buffer.from("second");
    const parts = [
      { name: "e.7z.001", url: "https://example.test/1", sha256: sha(p1) },
      { name: "e.7z.002", url: "https://example.test/2", sha256: sha(p2) },
    ];
    const seen = [];
    const installDir = path.join(root, "out");
    const downloadDir = path.join(root, "dl");
    await installArchiveParts({
      parts,
      installDir,
      downloadDir,
      sevenZip: "C:/app/7z/7za.exe",
      fetchImpl: fakeFetch({ "https://example.test/1": p1, "https://example.test/2": p2 }),
      spawnFn: fake7z((archive, bytes) => {
        seen.push(bytes.toString());
        return { "run.exe": "ok" };
      }),
    });
    assert.deepEqual(seen, ["first-second"]);
    assert.equal(fs.readFileSync(path.join(installDir, "run.exe"), "utf8"), "ok");
    // Không còn file tạm nào trong thư mục tải.
    assert.deepEqual(fs.readdirSync(downloadDir), []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("installArchiveParts refuses an empty parts list", async () => {
  await assert.rejects(
    installArchiveParts({ parts: [], installDir: "a", downloadDir: "b", sevenZip: "7za.exe" }),
    /Chưa cấu hình/
  );
});

test("installArchiveParts removes temp files when extraction fails", async () => {
  const root = tmp();
  try {
    const p1 = Buffer.from("only-part");
    const downloadDir = path.join(root, "dl");
    await assert.rejects(
      installArchiveParts({
        parts: [{ name: "v.7z.001", url: "https://example.test/v", sha256: sha(p1) }],
        installDir: path.join(root, "out"),
        downloadDir,
        sevenZip: "7za.exe",
        fetchImpl: fakeFetch({ "https://example.test/v": p1 }),
        spawnFn: fake7z(() => {
          throw new Error("corrupt archive");
        }),
      }),
      /Giải nén thất bại \(mã 2\)/
    );
    assert.deepEqual(fs.readdirSync(downloadDir), []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("extraction requires a 7za path", async () => {
  const root = tmp();
  try {
    const p1 = Buffer.from("x");
    await assert.rejects(
      installArchiveParts({
        parts: [{ name: "v.7z.001", url: "https://example.test/v", sha256: sha(p1) }],
        installDir: path.join(root, "out"),
        downloadDir: path.join(root, "dl"),
        sevenZip: undefined,
        fetchImpl: fakeFetch({ "https://example.test/v": p1 }),
      }),
      /Thiếu 7za\.exe/
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
