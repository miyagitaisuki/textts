const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const lib = require("../electron/sound-library.cjs");
const realManifest = require("../electron/sound-pack.json");

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "soundlib-"));
const bytes = Buffer.from("ID3-fake-mp3");
const manifest = {
  version: "v1",
  license: "CC0-1.0",
  baseUrl: "https://example.test/pack/",
  items: [
    { id: "sfx-a", kind: "sfx", name: "A", category: "X", file: "sfx-a.mp3", bytes: bytes.length,
      sha256: crypto.createHash("sha256").update(bytes).digest("hex") },
  ],
};
const fakeFetch = (calls) => async (url) => {
  calls.push(url);
  return new Response(bytes, { status: 200 });
};

test("bundled manifest is well formed", () => {
  assert.strictEqual(realManifest.license, "CC0-1.0");
  assert.ok(realManifest.baseUrl.endsWith(`/${realManifest.version}/`));
  for (const it of realManifest.items) {
    assert.match(it.sha256, /^[0-9a-f]{64}$/);
    assert.ok(["sfx", "bgm"].includes(it.kind));
    assert.ok(it.file.startsWith(`${it.kind}-`) && it.bytes > 0);
  }
  assert.strictEqual(new Set(realManifest.items.map((i) => i.id)).size, realManifest.items.length);
});

test("pack items download once, verified, then are listed with a path", async () => {
  const libDir = tmp();
  let items = lib.listLibrary({ libDir, manifest }).items;
  assert.strictEqual(items[0].downloaded, false);
  assert.strictEqual(items[0].path, null);
  const calls = [];
  assert.strictEqual(await lib.downloadPack({ libDir, manifest, fetchImpl: fakeFetch(calls) }), 1);
  assert.deepStrictEqual(calls, ["https://example.test/pack/sfx-a.mp3"]);
  assert.strictEqual(await lib.downloadPack({ libDir, manifest, fetchImpl: fakeFetch(calls) }), 0);
  items = lib.listLibrary({ libDir, manifest }).items;
  assert.ok(items[0].downloaded && fs.existsSync(items[0].path));
});

test("a tampered download is rejected", async () => {
  const libDir = tmp();
  const bad = async () => new Response(Buffer.from("evil-bytes!!"), { status: 200 });
  await assert.rejects(lib.downloadPack({ libDir, manifest, fetchImpl: bad }), /SHA-256/);
  assert.strictEqual(lib.listLibrary({ libDir, manifest }).items[0].downloaded, false);
});

test("personal library imports, renames duplicates, lists and removes", () => {
  const libDir = tmp();
  const src = path.join(tmp(), "chuong.mp3");
  fs.writeFileSync(src, bytes);
  fs.writeFileSync(path.join(path.dirname(src), "note.txt"), "x");
  const [a] = lib.importToMine({ libDir, kind: "sfx", files: [src, path.join(path.dirname(src), "note.txt")] });
  const [b] = lib.importToMine({ libDir, kind: "sfx", files: [src] });
  assert.strictEqual(path.basename(b), "chuong (2).mp3");
  const mine = lib.listLibrary({ libDir, manifest }).items.filter((i) => i.source === "mine");
  assert.deepStrictEqual(new Set(mine.map((i) => i.name)), new Set(["chuong", "chuong (2)"]));
  lib.removeMine({ libDir, file: a });
  assert.ok(!fs.existsSync(a));
  assert.throws(() => lib.removeMine({ libDir, file: src }), /thư viện cá nhân/);
  assert.throws(() => lib.importToMine({ libDir, kind: "video", files: [src] }), /không hợp lệ/);
});

test("only files inside the library can be read", () => {
  const libDir = tmp();
  const [f] = lib.importToMine({ libDir, kind: "bgm", files: [(() => { const p = path.join(tmp(), "m.mp3"); fs.writeFileSync(p, bytes); return p; })()] });
  assert.match(lib.readAsDataUrl({ libDir, file: f }), /^data:audio\/mpeg;base64,/);
  assert.throws(() => lib.readAsDataUrl({ libDir, file: path.join(libDir, "..", "x.mp3") }));
  assert.throws(() => lib.readAsDataUrl({ libDir, file: path.join(libDir, "my", "bgm", "..", "..", "..", "etc.mp3") }));
});

test("teacher descriptions, credits and the MUC_LUC.md catalog", () => {
  const libDir = tmp();
  const srcDir = tmp();
  fs.mkdirSync(path.join(srcDir, "sub"));
  fs.writeFileSync(path.join(srcDir, "Wind_Chimes01.mp3"), bytes);
  fs.writeFileSync(path.join(srcDir, "sub", "Thunder01.wav"), bytes);
  fs.writeFileSync(path.join(srcDir, "readme.txt"), "x");
  const files = lib.audioFilesIn(srcDir);
  assert.strictEqual(files.length, 2);
  const added = lib.importToMine({ libDir, kind: "sfx", files, credit: "OtoLogic (CC BY 4.0)" });
  lib.setMeta({ libDir, file: added[0], description: "Chuông gió leng keng", tags: "chuông gió, 風鈴", related: "", credit: "OtoLogic (CC BY 4.0)" });
  const mine = lib.listLibrary({ libDir, manifest }).items.filter((i) => i.source === "mine");
  const chime = mine.find((m) => m.name === "Wind_Chimes01");
  assert.deepStrictEqual(chime.tags, ["chuông gió", "風鈴"]);
  assert.strictEqual(mine.find((m) => m.name === "Thunder01").credit, "OtoLogic (CC BY 4.0)");
  const catalog = fs.readFileSync(path.join(libDir, "MUC_LUC.md"), "utf-8");
  assert.match(catalog, /\| Wind_Chimes01 \| Chuông gió leng keng \| chuông gió, 風鈴 \|/);
  assert.match(catalog, /Thunder01 \| \(chưa có mô tả\)/);
  lib.removeMine({ libDir, file: added[0] });
  assert.doesNotMatch(fs.readFileSync(path.join(libDir, "MUC_LUC.md"), "utf-8"), /Wind_Chimes01/);
  assert.throws(() => lib.setMeta({ libDir, file: path.join(srcDir, "x.mp3") }), /thư viện cá nhân/);
});
