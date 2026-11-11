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

test("fetchCatalog pages through AivisHub and keeps the newest AIVMX file of each model", async () => {
  const sum = "a".repeat(64);
  const page = (models, total) => new Response(JSON.stringify({ total, aivm_models: models }), { status: 200 });
  const model = (uuid, files) => ({ aivm_model_uuid: uuid, name: `m-${uuid}`, user: { name: "u" }, model_files: files });
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    return url.includes("page=1")
      ? page([model("11111111-1111-1111-1111-111111111111", [
          { model_type: "AIVM", checksum: sum, updated_at: "2026" },
          { model_type: "AIVMX", checksum: "b".repeat(64), file_size: 5, license_type: "CC0", updated_at: "2025" },
          { model_type: "AIVMX", checksum: sum, file_size: 7, license_type: "ACML 1.0", updated_at: "2026" },
        ])], 2)
      : page([model("22222222-2222-2222-2222-222222222222", [{ model_type: "AIVM", checksum: sum }])], 2);
  };
  const list = await aivis.fetchCatalog({ fetchImpl, apiBase: "https://api.test/v1", pageSize: 1 });
  assert.equal(calls.length, 2);
  assert.equal(list.length, 1);
  assert.deepEqual(
    { name: list[0].name, sha256: list[0].sha256, size: list[0].size, license: list[0].license },
    { name: "11111111-1111-1111-1111-111111111111.aivmx", sha256: sum, size: 7, license: "ACML 1.0" }
  );
  assert.equal(list[0].url, "https://api.test/v1/aivm-models/11111111-1111-1111-1111-111111111111/download?model_type=AIVMX");
});

test("mergeModels drops catalog entries already pinned under another file name", () => {
  const pinned = [{ name: "jvnv.aivmx", url: "https://api.test/v1/aivm-models/6acf95e8-11a9-414e-aa9c-6dbebf9113ca/download" }];
  const hub = [
    { uuid: "6acf95e8-11a9-414e-aa9c-6dbebf9113ca", name: "6acf95e8-11a9-414e-aa9c-6dbebf9113ca.aivmx" },
    { uuid: "33333333-3333-3333-3333-333333333333", name: "33333333-3333-3333-3333-333333333333.aivmx" },
  ];
  assert.deepEqual(aivis.mergeModels(pinned, hub).map((m) => m.name), ["jvnv.aivmx", "33333333-3333-3333-3333-333333333333.aivmx"]);
});

test("installAivis adds the whole catalog, skips what is installed and keeps going past a bad model", async () => {
  const root = tmp();
  try {
    const installDir = path.join(root, "aivis");
    fs.mkdirSync(path.join(installDir, "x"), { recursive: true });
    fs.writeFileSync(path.join(installDir, "x", "run.exe"), "exe"); // engine đã có: không tải lại
    const modelsDir = path.join(root, "Models");
    fs.mkdirSync(modelsDir, { recursive: true });
    fs.writeFileSync(path.join(modelsDir, "a.aivmx"), MODEL_A); // đã có: không tải lại
    const MODEL_C = Buffer.from("aivmx-model-c");
    const urls = [];
    const fetchImpl = async (url) => {
      urls.push(url);
      return fakeFetch({ ...FETCH, "https://example.test/c": MODEL_C, "https://example.test/bad": Buffer.from("x") })(url);
    };
    const status = await aivis.installAivis({
      cfg: cfgWith(),
      installDir,
      modelsDir,
      downloadDir: path.join(root, "dl"),
      sevenZip: "7za.exe",
      fetchImpl,
      catalog: async () => [
        { name: "c.aivmx", url: "https://example.test/c", sha256: sha(MODEL_C), size: 13, title: "C", license: "CC0" },
        { name: "bad.aivmx", url: "https://example.test/bad", sha256: sha(Buffer.from("other")), size: 1, title: "Bad" },
      ],
      diskFree: () => 1e12,
    });
    assert.deepEqual(urls, ["https://example.test/b", "https://example.test/c", "https://example.test/bad"]);
    assert.equal(status.modelCount, 3);
    assert.deepEqual(status.failed, ["Bad"]);
    assert.match(fs.readFileSync(path.join(root, "textts-giay-phep-giong.txt"), "utf-8"), /C\tCC0/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("installAivis stops before downloading when the disk is too small", async () => {
  const root = tmp();
  try {
    fs.mkdirSync(path.join(root, "aivis"), { recursive: true });
    fs.writeFileSync(path.join(root, "aivis", "run.exe"), "exe");
    await assert.rejects(
      aivis.installAivis({
        cfg: cfgWith(),
        installDir: path.join(root, "aivis"),
        modelsDir: path.join(root, "Models"),
        downloadDir: path.join(root, "dl"),
        sevenZip: "7za.exe",
        fetchImpl: async () => assert.fail("không được tải"),
        catalog: async () => [{ name: "big.aivmx", url: "u", sha256: "0".repeat(64), size: 20e9 }],
        diskFree: () => 5e9,
      }),
      /Không đủ dung lượng/
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
