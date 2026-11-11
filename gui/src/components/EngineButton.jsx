// Nút quản lý một engine TTS tải theo yêu cầu (VOICEVOX, AivisSpeech):
// chưa cấu hình -> tải thêm -> bật -> đang chạy.
import { useEffect, useState } from "react";

export default function EngineButton({ name, api, confirmText }) {
  const [state, setState] = useState(null);
  const [message, setMessage] = useState("");

  function refresh() {
    api.status().then((s) => s && setState(s));
  }

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, []);

  if (!state) return null;

  async function onClick() {
    if (state.configured === false || state.busy) return;
    if (!state.installed) {
      if (!window.confirm(confirmText)) return;
      setMessage(`Đang tải ${name}…`);
      const res = await api.install();
      setMessage(res?.ok ? "" : `Lỗi: ${res?.error ?? "không rõ"}`);
    } else if (!state.running) {
      setMessage(`Đang bật ${name}…`);
      const res = await api.start();
      setMessage(res?.ok ? "" : `Không bật được: ${res?.error ?? "engine chưa phản hồi"}`);
    }
    refresh();
  }

  let label;
  let title;
  let disabled = false;
  if (state.busy) {
    label = `${name}: đang tải…`;
    title = `Đang tải ${name}, vui lòng chờ`;
    disabled = true;
  } else if (state.configured === false) {
    label = `${name} (chưa cấu hình)`;
    title = `Chưa có nguồn tải ${name} trong bản build này`;
    disabled = true;
  } else if (!state.installed) {
    label = `Tải thêm ${name}`;
    title = `Tải ${name} về máy (lần đầu, cần mạng)`;
  } else if (!state.running) {
    label = `Bật ${name}`;
    title = `${name} đã cài nhưng chưa chạy (${state.url})`;
  } else {
    label = `${name} ●`;
    title = `${name} đang chạy (${state.url})`;
    disabled = true;
  }

  return (
    <button className="nav-btn ghost" onClick={onClick} disabled={disabled} title={title}>
      <span>{label}</span>
      {message && <span className="muted" style={{ marginLeft: 6 }}>{message}</span>}
    </button>
  );
}
