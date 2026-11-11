const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { EventEmitter } = require("node:events");
const aivis = require("../electron/aivis-install.cjs");

const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "aivis-test-"));

function fakeFetch(map) {
  return async (url) => {
    const body = map[url];
    if (!body) return new Response("nope", { status: 404 });
    return new Response(body, { status: 200 });
  };
}

// 7za giả: theo tên archive để quyết định file cần "giải nén".
function fake7z(layoutByDir) {
  return (cmd, args) => {
    const archive = args[1];
    const dest = args[2].slice(2);
    const child = new EventEmitter();
    child.stderr = new EventEmitter();
    child.stdout = new EventEmitter();
    queueMicrotask(() => {
      const files = layoutByDir(path.basename(path.dirname(archive)));
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

const ENGINE = [Buffer.from("engine-part-1"), Buffer.from("engine-part-2")];
const MODEL_A = Buffer.from("aivmx-model-a");
const MODEL_B = Buffer.from("aivmx-model-b");
const cfgWith = () => ({
  engine: {
    parts: [
      { name: "e.7z.001", url: "https://example.test/e1", sha256: sha(ENGINE[0]) },
      { name: "e.7z.002", url: "https://example.test/e2", sha256: sha(ENGINE[1]) },
    ],
  },
  models: {
    files: [
      { name: "a.aivmx", url: "https://example.test/a", sha256: sha(MODEL_A) },
      { name: "b.aivmx", url: "https://example.test/b", sha256: sha(MODEL_B) },
    ],
  },
});
const FETCH = {
  "https://example.test/e1": ENGINE[0],
  "https://example.test/e2": ENGINE[1],
  "https://example.test/a": MODEL_A,
  "https://example.test/b": MODEL_B,
};

test("isConfigured requires hashed engine parts and hashed model files", () => {
  assert.equal(aivis.isConfigured({ engine: { parts: [] }, models: { files: [] } }), false);
  assert.equal(
    aivis.isConfigured({ engine: { parts: [{ name: "e", url: "u", sha256: "h" }] }, models: { files: [{ name: "m", url: "u" }] } }),
    false
  );
  assert.equal(aivis.isConfigured(cfgWith()), true);
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

test("installAivis refuses to run without configured parts", async () => {
  await assert.rejects(
    aivis.installAivis({
      cfg: { engine: { parts: [] }, models: { parts: [] } },
      installDir: "x",
      modelsDir: "y",
      downloadDir: "z",
      sevenZip: "7za.exe",
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
    const status = await aivis.installAivis({
      cfg: cfgWith(),
      installDir,
      modelsDir,
      downloadDir,
      sevenZip: "7za.exe",
      fetchImpl: fakeFetch(FETCH),
      spawnFn: fake7z(() => ({ "Windows-x64/run.exe": "exe" })),
    });
    assert.equal(status.engineInstalled, true);
    assert.equal(status.modelCount, 2);
    assert.equal(aivis.countModels(modelsDir), 2);
    // Không để lại file tạm.
    assert.equal(fs.existsSync(path.join(downloadDir, "models")), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
