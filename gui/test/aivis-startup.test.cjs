const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  REG_KEY,
  REG_VALUE,
  readStartupEnabled,
  buildVbsContent,
  setStartup,
  syncStartupOnBoot,
} = require("../electron/aivis-startup.cjs");

test("readStartupEnabled defaults to true when no config exists", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aivis-startup-"));
  assert.equal(readStartupEnabled(dir), true);
});

test("buildVbsContent launches run.exe hidden on port 10101", () => {
  const vbs = buildVbsContent("C:\\Aivis\\run.exe", 10101);
  assert.match(vbs, /WScript\.Shell/);
  assert.match(vbs, /--host 127\.0\.0\.1 --port 10101/);
  assert.match(vbs, /, 0, False/);
});

test("setStartup persists preference and calls reg add/delete on win32", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aivis-startup-"));
  const exe = path.join(dir, "run.exe");
  fs.writeFileSync(exe, "");
  const calls = [];
  const fakeReg = (cmd, args) => calls.push([cmd, args]);

  if (process.platform === "win32") {
    const resOn = setStartup({ userDataDir: dir, exePath: exe, port: 10101, enabled: true, runReg: fakeReg });
    assert.equal(resOn.ok, true);
    assert.equal(resOn.enabled, true);
    assert.equal(readStartupEnabled(dir), true);
    assert.equal(calls[0][0], "reg");
    assert.deepEqual(calls[0][1].slice(0, 4), ["add", REG_KEY, "/v", REG_VALUE]);

    const resOff = setStartup({ userDataDir: dir, exePath: exe, port: 10101, enabled: false, runReg: fakeReg });
    assert.equal(resOff.ok, true);
    assert.equal(resOff.enabled, false);
    assert.equal(readStartupEnabled(dir), false);
    assert.deepEqual(calls[1][1].slice(0, 4), ["delete", REG_KEY, "/v", REG_VALUE]);
  }
});

test("syncStartupOnBoot skips registry when exe is not installed yet", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aivis-startup-"));
  const calls = [];
  const res = syncStartupOnBoot({ userDataDir: dir, exePath: path.join(dir, "missing.exe"), runReg: () => calls.push(1) });
  assert.equal(res.ok, true);
  assert.equal(calls.length, 0);
});
