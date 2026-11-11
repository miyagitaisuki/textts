const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { EventEmitter } = require("node:events");
const aivis = require("../electron/aivis-install.cjs");

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "aivis-test-"));
}
const sha = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

// Fetch giả: trả về nội dung cố định theo URL.
function fakeFetch(map) {
  return async (url) => {
    const entry = map[url];
    if (!entry) return new Response("nope", { status: 404 });
    return new Response(entry, { status: 200 });
  };
}

// Spawn giả cho tar: "giải nén" bằng cách ghi file mẫu vào thư mục đích.
function fakeTar(layout) {
  return (cmd, args) => {
    assert.equal(cmd, "tar");
    const archive = args[1];
    const dest = args[3];
    const child = new EventEmitter();
    child.stderr = new EventEmitter();
    const files = layout[path.basename(archive)];
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

const ENGINE_ZIP = Buffer.from("engine-archive-bytes");
const MODELS_ZIP = Buffer.from("models-archive-bytes");
const URLS = {
  engine: "https://example.test/engine.zip",
  models: "https://example.test/models.zip",
};
const goodCfg = () => ({
  engine: { url: URLS.engine, sha256: sha(ENGINE_ZIP) },
  models: { url: URLS.models, sha256: sha(MODELS_ZIP) },
});

test("isConfigured requires both engine and models sources", () => {
  assert.equal(aivis.isConfigured({ engine: { url: "", sha256: "" }, models: { url: "", sha256: "" } }), false);
  assert.equal(aivis.isConfigured({ engine: { url: "u", sha256: "h" }, models: { url: "u" } }), false);
  assert.equal(aivis.isConfigured(goodCfg()), true);
});

test("findFile searches nested folders and countModels counts only .aivmx", () => {
  const dir = tmp();
  try {
    fs.mkdirSync(path.join(dir, "AivisSpeech-Engine"));
    fs.writeFileSync(path.join(dir, "AivisSpeech-Engine", "run.exe"), "");
    assert.equal(aivis.findFile(dir, "run.exe"), path.join(dir, "AivisSpeech-Engine", "run.exe"));
    assert.equal(aivis.findFile(dir, "missing.exe"), null);
    fs.writeFileSync(path.join(dir, "jvnv-F1.aivmx"), "");
    fs.writeFileSync(path.join(dir, "readme.txt"), "");
    assert.equal(aivis.countModels(dir), 1);
    assert.equal(aivis.countModels(path.join(dir, "nope")), 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("downloadVerified keeps a file whose SHA-256 matches", async () => {
  const dir = tmp();
  try {
    const dest = path.join(dir, "f.zip");
    await aivis.downloadVerified({
      url: URLS.engine,
      sha256: sha(ENGINE_ZIP),
      dest,
      fetchImpl: fakeFetch({ [URLS.engine]: ENGINE_ZIP }),
    });
    assert.deepEqual(fs.readFileSync(dest), ENGINE_ZIP);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("downloadVerified deletes the file and throws when SHA-256 does not match", async () => {
  const dir = tmp();
  try {
    const dest = path.join(dir, "f.zip");
    await assert.rejects(
      aivis.downloadVerified({
        url: URLS.engine,
        sha256: "0".repeat(64),
        dest,
        fetchImpl: fakeFetch({ [URLS.engine]: ENGINE_ZIP }),
      }),
      /SHA-256 không khớp/
    );
    assert.equal(fs.existsSync(dest), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("downloadVerified throws on HTTP errors", async () => {
  const dir = tmp();
  try {
    await assert.rejects(
      aivis.downloadVerified({
        url: "https://example.test/missing.zip",
        sha256: "0".repeat(64),
        dest: path.join(dir, "f.zip"),
        fetchImpl: fakeFetch({}),
      }),
      /HTTP 404/
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("installAivis refuses to run without configured sources", async () => {
  await assert.rejects(
    aivis.installAivis({
      cfg: { engine: { url: "", sha256: "" }, models: { url: "", sha256: "" } },
      installDir: "x",
      modelsDir: "y",
      downloadDir: "z",
    }),
    /Chưa cấu hình/
  );
});

test("installAivis installs the engine and copies .aivmx models into the engine Models folder", async () => {
  const root = tmp();
  try {
    const installDir = path.join(root, "aivis");
    const modelsDir = path.join(root, "AppData", "AivisSpeech-Engine", "Models");
    const downloadDir = path.join(root, "dl");
    const cfg = goodCfg();
    const spawnFn = fakeTar({
      "aivis-engine.zip": { "AivisSpeech-Engine/run.exe": "exe" },
      "aivis-models.zip": { "jvnv/jvnv-F1.aivmx": "m1", "jvnv/jvnv-F2.aivmx": "m2" },
    });
    const status = await aivis.installAivis({
      cfg,
      installDir,
      modelsDir,
      downloadDir,
      fetchImpl: fakeFetch({ [URLS.engine]: ENGINE_ZIP, [URLS.models]: MODELS_ZIP }),
      spawnFn,
    });
    assert.equal(status.engineInstalled, true);
    assert.equal(status.modelCount, 2);
    assert.equal(aivis.countModels(modelsDir), 2);
    // Archive tạm đã được dọn dẹp.
    assert.equal(fs.existsSync(path.join(downloadDir, "aivis-engine.zip")), false);
    assert.equal(fs.existsSync(path.join(downloadDir, "aivis-models.zip")), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("installAivis surfaces an extraction failure", async () => {
  const root = tmp();
  try {
    const failingTar = () => {
      const child = new EventEmitter();
      child.stderr = new EventEmitter();
      queueMicrotask(() => {
        child.stderr.emit("data", Buffer.from("bad archive"));
        child.emit("exit", 2);
      });
      return child;
    };
    await assert.rejects(
      aivis.installAivis({
        cfg: goodCfg(),
        installDir: path.join(root, "a"),
        modelsDir: path.join(root, "m"),
        downloadDir: path.join(root, "dl"),
        fetchImpl: fakeFetch({ [URLS.engine]: ENGINE_ZIP, [URLS.models]: MODELS_ZIP }),
        spawnFn: failingTar,
      }),
      /Giải nén thất bại \(mã 2\)/
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
