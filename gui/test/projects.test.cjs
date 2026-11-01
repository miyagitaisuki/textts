const test = require("node:test");
const assert = require("node:assert/strict");
const { sanitizeName, timestampName, uniqueName, validOutputRoot } = require("../electron/projects.cjs");

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
