// Nút AivisSpeech trên thanh điều hướng: tải theo yêu cầu, rồi bật/tắt trạng thái engine.
import { useEffect, useState } from "react";

export default function AivisButton() {
  const [state, setState] = useState(null);
  const [message, setMessage] = useState("");

  function refresh() {
    window.textts?.getAivisStatus?.().then((s) => s && setState(s));
  }

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, []);

  if (!window.textts?.getAivisStatus || !state) return null;

  async function onClick() {
    if (!state.configured || state.busy) return;
    if (!state.engineInstalled || state.modelCount === 0) {
      const ok = window.confirm(
        "Tải AivisSpeech Engine và bộ giọng JVNV (dung lượng lớn, cần mạng). Tiếp tục?"
      );
      if (!ok) return;
      setMessage("Đang tải AivisSpeech…");
      const res = await window.textts.installAivis();
      setMessage(res?.ok ? "" : `Lỗi: ${res?.error ?? "không rõ"}`);
    } else if (!state.running) {
      setMessage("Đang bật AivisSpeech…");
      const res = await window.textts.startAivis();
      setMessage(res?.ok ? "" : `Không bật được: ${res?.error ?? "engine chưa phản hồi"}`);
    }
    refresh();
  }

  let label;
  let title;
  let disabled = false;
  if (state.busy) {
    label = "AivisSpeech: đang tải…";
    title = "Đang tải AivisSpeech, vui lòng chờ";
    disabled = true;
  } else if (!state.configured) {
    label = "AivisSpeech (chưa cấu hình)";
    title = "Chưa có nguồn tải AivisSpeech trong bản build này";
    disabled = true;
  } else if (!state.engineInstalled || state.modelCount === 0) {
    label = "Tải thêm AivisSpeech";
    title = "Tải AivisSpeech Engine và bộ giọng JVNV về máy (lần đầu, cần mạng)";
  } else if (!state.running) {
    label = "Bật AivisSpeech";
    title = `AivisSpeech đã cài nhưng chưa chạy (${state.url})`;
  } else {
    label = "AivisSpeech ●";
    title = `AivisSpeech đang chạy (${state.url})`;
    disabled = true;
  }

  return (
    <button className="nav-btn ghost" onClick={onClick} disabled={disabled} title={title}>
      <span>{label}</span>
      {message && <span className="muted" style={{ marginLeft: 6 }}>{message}</span>}
    </button>
  );
}
