// Kiểm thử hàm thuần của bộ tự cập nhật (không cần Electron chạy thật).
const test = require("node:test");
const assert = require("node:assert/strict");
const { compareVersions, updateErrorText } = require("../electron/update-utils.cjs");

test("so sánh phiên bản theo số chính, phụ, vá", () => {
  assert.equal(compareVersions("0.2.0", "0.1.9"), "newer");
  assert.equal(compareVersions("0.1.10", "0.1.9"), "newer");
  assert.equal(compareVersions("0.1.0", "0.1.0"), "same");
  assert.equal(compareVersions("0.0.9", "0.1.0"), "older");
  assert.equal(compareVersions("1.0", "0.9.9"), "newer");
});

test("lỗi mạng hiển thị bằng tiếng Việt", () => {
  assert.match(updateErrorText(new Error("getaddrinfo ENOTFOUND github.com")), /Không kết nối/);
  assert.match(updateErrorText(new Error("bad yaml")), /Không kiểm tra được cập nhật: bad yaml/);
});

test("script thay exe đợi tiến trình cũ thoát rồi chép đè và mở lại", () => {
  const fs = require("node:fs");
  const { writeSwapScript } = require("../electron/update-utils.cjs");
  const script = writeSwapScript("C:\\tmp\\new.exe", "C:\\apps\\textts.exe", 4242);
  const text = fs.readFileSync(script, "utf-8");
  fs.rmSync(script, { force: true });
  assert.match(text, /PID eq 4242/);
  assert.match(text, /copy \/Y "C:\\tmp\\new\.exe" "C:\\apps\\textts\.exe"/);
  assert.match(text, /goto copy/);
  assert.match(text, /start "" "C:\\apps\\textts\.exe"/);
});
