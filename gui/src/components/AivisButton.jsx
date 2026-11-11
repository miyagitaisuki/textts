// Nút AivisSpeech trên thanh điều hướng (tải theo yêu cầu).
import EngineButton from "./EngineButton.jsx";

const api = {
  status: () => window.textts?.getAivisStatus?.() ?? Promise.resolve(null),
  install: () => window.textts?.installAivis?.() ?? Promise.resolve({ ok: false, error: "Không có cầu nối" }),
  start: () => window.textts?.startAivis?.() ?? Promise.resolve({ ok: false, error: "Không có cầu nối" }),
};

export default function AivisButton() {
  return (
    <EngineButton
      name="AivisSpeech"
      api={api}
      confirmText="Tải AivisSpeech Engine và bộ giọng JVNV (dung lượng lớn, cần mạng). Tiếp tục?"
      startHint="(lần đầu có thể mất vài phút)"
    />
  );
}
