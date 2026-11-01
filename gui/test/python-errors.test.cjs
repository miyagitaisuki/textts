// Kiểm thử gợi ý cài đặt khi Python thiếu thư viện (hàm thuần, không cần Electron).
const test = require("node:test");
const assert = require("node:assert/strict");
const { friendlyPythonError } = require("../electron/python-errors.cjs");

test("thiếu yaml: gợi ý cài requirements và gói pyyaml", () => {
  const log = "Traceback (most recent call last):\n  File \"tts.py\", line 18, in <module>\n    import yaml\nModuleNotFoundError: No module named 'yaml'\n";
  const msg = friendlyPythonError(log, "python");
  assert.match(msg, /chưa cài thư viện "yaml"/);
  assert.match(msg, /python -m pip install -r requirements\.txt/);
  assert.match(msg, /gói "pyyaml"/);
  assert.match(msg, /TEXTTS_PYTHON/);
});

test("module con (a.b) chỉ lấy tên module gốc", () => {
  const msg = friendlyPythonError("ModuleNotFoundError: No module named 'pydantic.v1'", "py");
  assert.match(msg, /thư viện "pydantic"/);
});

test("lỗi khác không bị thay đổi", () => {
  assert.equal(friendlyPythonError("  ValueError: sai dòng 3  \n", "python"), "ValueError: sai dòng 3");
  assert.equal(friendlyPythonError(undefined, "python"), "");
});
