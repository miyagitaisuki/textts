// Nút AivisSpeech trên thanh điều hướng (tải theo yêu cầu + tự mở cùng Windows).
import { useEffect, useState } from "react";
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
  const [startup, setStartup] = useState(true);

  useEffect(() => {
    window.textts?.getAivisStartup?.().then((res) => {
      if (typeof res?.enabled === "boolean") setStartup(res.enabled);
    });
  }, []);

  async function toggleStartup(e) {
    const next = e.target.checked;
    setStartup(next);
    await window.textts?.setAivisStartup?.(next);
  }

  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
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
      <label
        style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, cursor: "pointer" }}
        title="Tự mở AivisSpeech Engine ở chế độ nền khi bật máy Windows"
      >
        <input type="checkbox" checked={startup} onChange={toggleStartup} />
        <span>Mở cùng Windows</span>
      </label>
    </div>
  );
}
