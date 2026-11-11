// Nguồn tải AivisSpeech Engine và bộ giọng JVNV (không đóng gói trong bộ cài).
// - engine: danh sách phần archive theo đúng thứ tự, mỗi phần có tên, URL và SHA-256 (đã kiểm tra).
// - models: danh sách file .aivmx tải trực tiếp, mỗi file có tên, URL và SHA-256 (đã kiểm tra, khớp checksum của AivisHub API).
// Khi thiếu một trong hai, nút tải trong app bị vô hiệu hóa.
// Bộ JVNV (jvnv-F1-jp, F2-jp, M1-jp, M2-jp) phát hành theo CC BY-SA 4.0: cần ghi nguồn khi chia sẻ âm thanh.
module.exports = {
  AIVIS_URL: process.env.AIVIS_URL || "http://127.0.0.1:10101",
  AIVIS_PORT: 10101,
  engine: {
    // AivisSpeech Engine 1.2.0, bản Windows-x64, một phần (manifest .7z.txt liệt kê đúng tên này).
    parts: [
      {
        name: "AivisSpeech-Engine-Windows-x64-1.2.0.7z.001",
        url: "https://github.com/Aivis-Project/AivisSpeech-Engine/releases/download/1.2.0/AivisSpeech-Engine-Windows-x64-1.2.0.7z.001",
        sha256: "bfbceba2e14dc7f23c7f3695f9ac0381baf91b15d6544e98384574eaadd271f3",
      },
    ],
  },
  models: {
    files: [
      {
        name: "jvnv-F1-jp.aivmx",
        url: "https://api.aivis-project.com/v1/aivm-models/6acf95e8-11a9-414e-aa9c-6dbebf9113ca/download?model_type=AIVMX",
        sha256: "d5e7f6e64c5b1395597e12f6a5e70e0befe3691cec29c659a60b08fbfa60c885",
      },
      {
        name: "jvnv-F2-jp.aivmx",
        url: "https://api.aivis-project.com/v1/aivm-models/25b39db7-5757-47ef-9fe4-2b7aff328a18/download?model_type=AIVMX",
        sha256: "0a89c36cc3cd535703d6092022c6d6fab43251b9529c9d004ccc312070ca5aa2",
      },
      {
        name: "jvnv-M1-jp.aivmx",
        url: "https://api.aivis-project.com/v1/aivm-models/d7255c2c-ddd0-425a-808c-662cd94c7f41/download?model_type=AIVMX",
        sha256: "6b53d8f44fab893c035146acec6b1653029cecbcaea0315cac9f27889f59261f",
      },
      {
        name: "jvnv-M2-jp.aivmx",
        url: "https://api.aivis-project.com/v1/aivm-models/d1a7446f-230d-4077-afdf-923eddabe53c/download?model_type=AIVMX",
        sha256: "8ad58d2b85791f73bbc51216618100db5debfe574373ee28b71549b50bc50278",
      },
    ],
  },
};
