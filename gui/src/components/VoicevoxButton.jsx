// Nút VOICEVOX trên thanh điều hướng (tải theo yêu cầu, khoảng 1,9 GB).
import EngineButton from "./EngineButton.jsx";

const api = {
  status: () => window.textts?.getVoicevoxStatus?.() ?? Promise.resolve(null),
  install: () => window.textts?.installVoicevox?.() ?? Promise.resolve({ ok: false, error: "Không có cầu nối" }),
  start: () => window.textts?.startVoicevox?.() ?? Promise.resolve({ ok: false, error: "Không có cầu nối" }),
};

export default function VoicevoxButton() {
  return (
    <EngineButton
      name="VOICEVOX"
      api={api}
      confirmText="Tải VOICEVOX ENGINE 0.26.1 (khoảng 1,9 GB, cần mạng). Tiếp tục?"
    />
  );
}
