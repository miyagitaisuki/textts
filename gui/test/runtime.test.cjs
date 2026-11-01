// Kiểm thử chọn Python đóng gói sẵn và PATH ffmpeg (không cần Electron).
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { resolvePython, buildChildEnv } = require("../electron/runtime.cjs");

const RES = path.join("C:", "app", "resources");
const bundledPy = path.join(RES, "python", "python.exe");
const ffmpegDir = path.join(RES, "ffmpeg");
const present = (...files) => (p) => files.includes(p);

test("bản đóng gói trên Windows dùng python.exe đi kèm", () => {
  const py = resolvePython({ env: {}, isPackaged: true, resourcesPath: RES, platform: "win32", exists: present(bundledPy) });
  assert.equal(py, bundledPy);
});

test("TEXTTS_PYTHON luôn được ưu tiên", () => {
  const py = resolvePython({ env: { TEXTTS_PYTHON: "D:\\py\\python.exe" }, isPackaged: true, resourcesPath: RES, platform: "win32", exists: present(bundledPy) });
  assert.equal(py, "D:\\py\\python.exe");
});

test("thiếu python đi kèm thì quay về lệnh hệ thống", () => {
  const py = resolvePython({ env: {}, isPackaged: true, resourcesPath: RES, platform: "win32", exists: present() });
  assert.equal(py, "python");
});

test("chạy dev không dùng bản đi kèm", () => {
  const py = resolvePython({ env: {}, isPackaged: false, resourcesPath: RES, platform: "win32", exists: present(bundledPy) });
  assert.equal(py, "python");
  const linux = resolvePython({ env: {}, isPackaged: false, resourcesPath: RES, platform: "linux", exists: present() });
  assert.equal(linux, "python3");
});

test("ffmpeg đi kèm được thêm lên đầu PATH", () => {
  const env = buildChildEnv({ env: { PATH: "C:\\Windows" }, isPackaged: true, resourcesPath: RES, platform: "win32", exists: present(path.join(ffmpegDir, "ffmpeg.exe")) });
  assert.equal(env.PATH, ffmpegDir + ";C:\\Windows");
});

test("không có ffmpeg đi kèm thì giữ nguyên env", () => {
  const base = { PATH: "C:\\Windows", FOO: "1" };
  const env = buildChildEnv({ env: base, isPackaged: true, resourcesPath: RES, platform: "win32", exists: present() });
  assert.deepEqual(env, base);
});
