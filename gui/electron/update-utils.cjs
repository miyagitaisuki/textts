// Hàm thuần dùng cho bộ cập nhật: không phụ thuộc Electron nên test được trên Node thường.

// Chuyển lỗi kỹ thuật thành câu tiếng Việt cho người dùng cuối.
function updateErrorText(err) {
  const msg = err?.message ?? String(err);
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|ECONNRESET|net::|network/i.test(msg)) {
    return "Không kết nối được tới GitHub. Kiểm tra mạng rồi thử lại.";
  }
  return `Không kiểm tra được cập nhật: ${msg}`;
}

module.exports = { updateErrorText };
