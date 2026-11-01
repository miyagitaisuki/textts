const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { createPathGuard } = require("../electron/guard.cjs");

const JSON_ONLY = new Set([".json"]);
const AUDIO = new Set([".mp3", ".wav"]);

test("rejects any path before a project is opened", () => {
  const g = createPathGuard();
  assert.equal(g.isAllowed("/tmp/x/project.json", JSON_ONLY), false);
});

test("allows files directly inside an opened project's folder", () => {
  const g = createPathGuard();
  g.allowDirOf("/home/u/lop/bai10.json");
  assert.equal(g.isAllowed("/home/u/lop/bai10.json", JSON_ONLY), true);
  assert.equal(g.isAllowed("/home/u/lop/bai10.mp3", AUDIO), true);
});

test("rejects sibling directories and nested paths", () => {
  const g = createPathGuard();
  g.allowDirOf("/home/u/lop/bai10.json");
  assert.equal(g.isAllowed("/home/u/other/x.json", JSON_ONLY), false);
  assert.equal(g.isAllowed("/home/u/lop/sub/x.json", JSON_ONLY), false);
  assert.equal(g.isAllowed("/home/u/lop/../secret/x.json", JSON_ONLY), false);
});

test("rejects wrong extensions", () => {
  const g = createPathGuard();
  g.allowDirOf("/home/u/lop/bai10.json");
  assert.equal(g.isAllowed("/home/u/lop/bai10.exe", AUDIO), false);
  assert.equal(g.isAllowed("/home/u/lop/bai10.txt", JSON_ONLY), false);
});

test("rejects empty and non-string input", () => {
  const g = createPathGuard();
  g.allowDirOf("/home/u/lop/bai10.json");
  assert.equal(g.isAllowed("", JSON_ONLY), false);
  assert.equal(g.isAllowed(undefined, JSON_ONLY), false);
  assert.equal(g.isAllowed({ toString: () => "/home/u/lop/a.json" }, JSON_ONLY), false);
});

test("assertAllowed returns the resolved path or throws", () => {
  const g = createPathGuard();
  g.allowDirOf(path.join("/home/u/lop", "bai10.json"));
  assert.equal(g.assertAllowed("/home/u/lop/bai10.json", JSON_ONLY), path.resolve("/home/u/lop/bai10.json"));
  assert.throws(() => g.assertAllowed("/etc/passwd", JSON_ONLY), /không được phép/);
});
