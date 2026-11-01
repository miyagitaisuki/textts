// Kiểm thử hàm thuần của bộ cập nhật (không cần Electron chạy thật).
const test = require("node:test");
const assert = require("node:assert/strict");
const { updateErrorText } = require("../electron/update-utils.cjs");

test("lỗi mạng hiển thị bằng tiếng Việt", () => {
  assert.match(updateErrorText(new Error("getaddrinfo ENOTFOUND github.com")), /Không kết nối/);
  assert.match(updateErrorText(new Error("bad yaml")), /Không kiểm tra được cập nhật: bad yaml/);
});
