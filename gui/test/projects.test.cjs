const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { sanitizeName, timestampName, uniqueName, validOutputRoot, saveProject } = require("../electron/projects.cjs");

test("sanitizeName removes characters invalid in paths", () => {
  assert.equal(sanitizeName('bài: 10 / "hỏi" <đường>'), "bài- 10 - -hỏi- -đường");
});

test("sanitizeName collapses spaces and trims dots and dashes", () => {
  assert.equal(sanitizeName("  ..bài   10..  "), "bài 10");
});

test("sanitizeName falls back when nothing is left", () => {
  assert.equal(sanitizeName("   "), "kich-ban");
  assert.equal(sanitizeName(undefined), "kich-ban");
});

test("sanitizeName caps length", () => {
  assert.ok(sanitizeName("a".repeat(200)).length <= 80);
});

test("timestampName formats local date and time", () => {
  assert.equal(timestampName(new Date(2026, 10, 1, 9, 5, 7)), "bai-moi-20261101-090507");
});

test("uniqueName returns the base when free", () => {
  assert.equal(uniqueName("bai10", () => false), "bai10");
});

test("uniqueName appends the first free counter", () => {
  const taken = new Set(["bai10", "bai10-2"]);
  assert.equal(uniqueName("bai10", (n) => taken.has(n)), "bai10-3");
});

test("validOutputRoot accepts only absolute existing directories", () => {
  const isDir = (p) => p === "/home/u/lop";
  assert.equal(validOutputRoot("/home/u/lop", isDir), "/home/u/lop");
  assert.equal(validOutputRoot("lop", isDir), "");
  assert.equal(validOutputRoot("/home/u/gone", isDir), "");
  assert.equal(validOutputRoot(42, isDir), "");
  assert.equal(validOutputRoot(undefined, isDir), "");
});

test("saveProject creates the project's own folder on first save", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "project-save-"));
  try {
    const target = path.join(dir, "bai-moi-20261112-095047", "bai-moi-20261112-095047.json");
    saveProject(target, { title: "Bài mới" });
    assert.deepEqual(JSON.parse(fs.readFileSync(target, "utf-8")), { title: "Bài mới" });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("saveProject overwrites an existing file without complaint", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "project-save-"));
  try {
    const target = path.join(dir, "bai.json");
    saveProject(target, { title: "A" });
    saveProject(target, { title: "B" });
    assert.deepEqual(JSON.parse(fs.readFileSync(target, "utf-8")), { title: "B" });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
