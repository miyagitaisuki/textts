// Nút AivisSpeech trên thanh điều hướng (tải theo yêu cầu).
import EngineButton from "./EngineButton.jsx";

const api = {
  status: () => window.textts?.getAivisStatus?.() ?? Promise.resolve(null),
  install: () => window.textts?.installAivis?.() ?? Promise.resolve({ ok: false, error: "Không có cầu nối" }),
  start: () => window.textts?.startAivis?.() ?? Promise.resolve({ ok: false, error: "Không có cầu nối" }),
};

const CONFIRM =
  "Tải AivisSpeech Engine và TOÀN BỘ giọng công khai trên AivisHub (hiện ~77 giọng, khoảng 20 GB, cần mạng ổn định; " +
  "giọng đã có sẽ được bỏ qua).\n\nMột số giọng có giấy phép riêng hoặc phi thương mại: xem file textts-giay-phep-giong.txt " +
  "trong thư mục AivisSpeech-Engine. Tiếp tục?";

export default function AivisButton() {
  return (
    <EngineButton
      name="AivisSpeech"
      api={api}
      confirmText={CONFIRM}
      startHint="(lần đầu có thể mất vài phút)"
      extra={{
        label: "⟳ Giọng Aivis",
        title: "Tải các giọng AivisSpeech còn thiếu hoặc mới có trên AivisHub",
        confirmText: CONFIRM,
        run: api.install,
      }}
    />
  );
}
