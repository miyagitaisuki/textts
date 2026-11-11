// Nguồn tải AivisSpeech Engine và bộ giọng JVNV (không đóng gói trong bộ cài).
// Mỗi nguồn là danh sách các phần archive theo đúng thứ tự (.7z.001, .7z.002, ...), kèm URL và SHA-256 của từng phần.
// Khi còn để trống, nút tải trong app bị vô hiệu hóa.
// Chưa có giá trị thật: tên phần và hash của bản Windows-x64 cần lấy từ release của Aivis-Project/AivisSpeech-Engine
// (release có file manifest .7z.txt liệt kê các phần).
module.exports = {
  AIVIS_URL: process.env.AIVIS_URL || "http://127.0.0.1:10101",
  AIVIS_PORT: 10101,
  engine: {
    parts: [
      // { name: "AivisSpeech-Engine-Windows-x64-<ver>.7z.001", url: "https://...", sha256: "..." },
    ],
  },
  models: {
    parts: [
      // { name: "jvnv.zip", url: "https://...", sha256: "..." },
    ],
  },
};
