const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { EventEmitter } = require("node:events");
const { voicevoxInstalled, installVoicevox } = require("../electron/voicevox-install.cjs");

const ARCHIVE = Buffer.from("voicevox-7z-bytes");
const URL_ = "https://example.test/voicevox.7z.001";
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "vv-install-test-"));
}

function fakeFetch(bytes, status = 200) {
  return async () => new Response(bytes, { status });
}

// tar giả: ghi các file mẫu vào thư mục đích (không kiểm tra định dạng thật).
function fakeTar(files) {
  return (cmd, args) => {
    assert.equal(cmd, "tar");
    const dest = args[3];
    const child = new EventEmitter();
    child.stderr = new EventEmitter();
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

test("installVoicevox refuses without a source URL and hash", async () => {
  await assert.rejects(
    installVoicevox({ cfg: { url: "", sha256: "" }, installDir: "a", downloadDir: "b" }),
    /Chưa cấu hình/
  );
});

test("installVoicevox downloads, verifies, extracts, and removes the archive", async () => {
  const root = tmp();
  try {
    const installDir = path.join(root, "voicevox");
    const downloadDir = path.join(root, "dl");
    const result = await installVoicevox({
      cfg: { version: "0.26.1", url: URL_, sha256: sha(ARCHIVE) },
      installDir,
      downloadDir,
      fetchImpl: fakeFetch(ARCHIVE),
      spawnFn: fakeTar({ "voicevox-engine-windows-cpu-0.26.1/run.exe": "exe" }),
    });
    assert.deepEqual(result, { installed: true });
    assert.equal(voicevoxInstalled(installDir), true);
    assert.equal(fs.existsSync(path.join(downloadDir, "voicevox-engine.7z")), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("installVoicevox rejects an archive whose SHA-256 does not match", async () => {
  const root = tmp();
  try {
    const installDir = path.join(root, "voicevox");
    await assert.rejects(
      installVoicevox({
        cfg: { version: "0.26.1", url: URL_, sha256: "0".repeat(64) },
        installDir,
        downloadDir: path.join(root, "dl"),
        fetchImpl: fakeFetch(ARCHIVE),
        spawnFn: fakeTar({ "run.exe": "exe" }),
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
        cfg: { version: "0.26.1", url: URL_, sha256: sha(ARCHIVE) },
        installDir: path.join(root, "voicevox"),
        downloadDir: path.join(root, "dl"),
        fetchImpl: fakeFetch(ARCHIVE),
        spawnFn: fakeTar({ "readme.txt": "no engine here" }),
      }),
      /Không tìm thấy run\.exe/
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("installVoicevox removes the archive when extraction fails", async () => {
  const root = tmp();
  try {
    const downloadDir = path.join(root, "dl");
    const failingTar = () => {
      const child = new EventEmitter();
      child.stderr = new EventEmitter();
      queueMicrotask(() => child.emit("exit", 1));
      return child;
    };
    await assert.rejects(
      installVoicevox({
        cfg: { version: "0.26.1", url: URL_, sha256: sha(ARCHIVE) },
        installDir: path.join(root, "voicevox"),
        downloadDir,
        fetchImpl: fakeFetch(ARCHIVE),
        spawnFn: failingTar,
      }),
      /Giải nén thất bại/
    );
    assert.equal(fs.existsSync(path.join(downloadDir, "voicevox-engine.7z")), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
