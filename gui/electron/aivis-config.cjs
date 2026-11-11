// Nguồn tải AivisSpeech Engine và bộ giọng JVNV (không đóng gói trong bộ cài).
// Điền URL và SHA-256 của file .zip/.7z đã kiểm chứng. Khi còn để trống, nút tải trong app bị vô hiệu hóa.
// Lưu ý: giải nén bằng tar.exe (Windows 10+). Nếu file là .7z nhiều phần (.7z.001...) thì không dùng được cấu hình này.
module.exports = {
  AIVIS_URL: process.env.AIVIS_URL || "http://127.0.0.1:10101",
  AIVIS_PORT: 10101,
  engine: {
    url: "",     // ví dụ: https://github.com/.../AivisSpeech-Engine-Windows-CPU.zip
    sha256: "",  // SHA-256 chữ thường, 64 ký tự
  },
  models: {
    url: "",     // file .zip chứa các file .aivmx của JVNV (jvnv-F1, F2, M1, M2)
    sha256: "",
  },
};
