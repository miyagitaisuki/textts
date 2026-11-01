// Kiểm tra đường dẫn gửi từ renderer: chỉ chấp nhận file nằm trực tiếp trong thư mục
// của một project đã mở qua hộp thoại, và đúng đuôi cho phép.
const path = require("path");

function createPathGuard() {
  const allowedDirs = new Set();

  function allowDirOf(filePath) {
    allowedDirs.add(path.dirname(path.resolve(filePath)));
  }

  function isAllowed(filePath, exts) {
    if (typeof filePath !== "string" || !filePath) return false;
    const resolved = path.resolve(filePath);
    if (exts && !exts.has(path.extname(resolved).toLowerCase())) return false;
    return allowedDirs.has(path.dirname(resolved));
  }

  function assertAllowed(filePath, exts) {
    if (!isAllowed(filePath, exts)) {
      throw new Error(`Đường dẫn không được phép: ${filePath}`);
    }
    return path.resolve(filePath);
  }

  return { allowDirOf, isAllowed, assertAllowed };
}

module.exports = { createPathGuard };
