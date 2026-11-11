// Nguồn tải VOICEVOX ENGINE (bản CPU cho Windows), tải theo yêu cầu thay vì đóng gói trong bộ cài.
// Phiên bản và SHA-256 được ghim cứng: đổi phiên bản thì phải cập nhật cả hai.
// Bản 0.26.1 là một phần duy nhất (.7z.001), đã kiểm tra SHA-256 từ đúng URL này.
module.exports = {
  version: "0.26.1",
  parts: [
    {
      name: "voicevox_engine-windows-cpu-0.26.1.7z.001",
      url: "https://github.com/VOICEVOX/voicevox_engine/releases/download/0.26.1/voicevox_engine-windows-cpu-0.26.1.7z.001",
      sha256: "2143ab794bf7241b1f88704f88bf4fb10ea6cf453035f54e1b3a73aea2c668fc",
    },
  ],
  port: 50021,
};
