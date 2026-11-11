const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { EventEmitter } = require("node:events");
const { voicevoxInstalled, installVoicevox } = require("../electron/voicevox-install.cjs");

const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "vv-install-test-"));
const BYTES = Buffer.from("voicevox-7z-bytes");
const URL_ = "https://example.test/voicevox.7z.001";
const cfg = (overrides = {}) => ({
  version: "0.26.1",
  parts: [{ name: "voicevox.7z.001", url: URL_, sha256: sha(BYTES), ...overrides }],
});

function fakeFetch(bytes) {
  return async () => new Response(bytes, { status: 200 });
}

// 7za giả: ghi các file mẫu vào thư mục đích.
function fake7z(files) {
  return (cmd, args) => {
    const dest = args[2].slice(2);
    const child = new EventEmitter();
    child.stderr = new EventEmitter();
    child.stdout = new EventEmitter();
    queueMicrotask(() => {
      for (const [rel, content] of Object.entries(files)) {
        const full = path.join(dest, rel);
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, content);
      }
      child.emit("exit", 0);
    });
    return child;
  };
}

test("voicevoxInstalled looks for run.exe anywhere under the install folder", () => {
  const dir = tmp();
  try {
    assert.equal(voicevoxInstalled(dir), false);
    fs.mkdirSync(path.join(dir, "vv"));
    fs.writeFileSync(path.join(dir, "vv", "run.exe"), "");
    assert.equal(voicevoxInstalled(dir), true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("installVoicevox refuses without parts", async () => {
  await assert.rejects(
    installVoicevox({ cfg: { version: "0.26.1", parts: [] }, installDir: "a", downloadDir: "b", sevenZip: "7za.exe" }),
    /Chưa cấu hình/
  );
});

test("installVoicevox downloads, verifies, extracts with 7za, and removes temp files", async () => {
  const root = tmp();
  try {
    const installDir = path.join(root, "voicevox");
    const downloadDir = path.join(root, "dl");
    const result = await installVoicevox({
      cfg: cfg(),
      installDir,
      downloadDir,
      sevenZip: "C:/app/7z/7za.exe",
      fetchImpl: fakeFetch(BYTES),
      spawnFn: fake7z({ "voicevox-engine-windows-cpu-0.26.1/run.exe": "exe" }),
    });
    assert.deepEqual(result, { installed: true });
    assert.equal(voicevoxInstalled(installDir), true);
    assert.deepEqual(fs.readdirSync(downloadDir), []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("installVoicevox rejects a part whose SHA-256 does not match", async () => {
  const root = tmp();
  try {
    const installDir = path.join(root, "voicevox");
    await assert.rejects(
      installVoicevox({
        cfg: cfg({ sha256: "0".repeat(64) }),
        installDir,
        downloadDir: path.join(root, "dl"),
        sevenZip: "7za.exe",
        fetchImpl: fakeFetch(BYTES),
        spawnFn: fake7z({ "run.exe": "exe" }),
      }),
      /SHA-256 không khớp/
    );
    assert.equal(voicevoxInstalled(installDir), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("installVoicevox fails if the archive extracts without run.exe", async () => {
  const root = tmp();
  try {
    await assert.rejects(
      installVoicevox({
        cfg: cfg(),
        installDir: path.join(root, "voicevox"),
        downloadDir: path.join(root, "dl"),
        sevenZip: "7za.exe",
        fetchImpl: fakeFetch(BYTES),
        spawnFn: fake7z({ "readme.txt": "no engine here" }),
      }),
      /Không tìm thấy run\.exe/
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
