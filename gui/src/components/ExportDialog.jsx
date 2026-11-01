// Hộp thoại tùy chọn xuất: định dạng, chuẩn hóa LUFS, bản chậm, phụ đề. Giá trị được nhớ trong máy (xem App).
import { useEffect } from "react";

export default function ExportDialog({ opts, onChange, disabled, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const set = (patch) => onChange({ ...opts, ...patch });

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Tùy chọn xuất"
        onClick={(e) => e.stopPropagation()}>
        <h2>Tùy chọn xuất</h2>
        <p className="muted">Các giá trị này được nhớ làm mặc định cho lần sau.</p>
        <label>Định dạng
          <select value={opts.format} disabled={disabled}
            onChange={(e) => set({ format: e.target.value })}>
            <option value="mp3">MP3</option>
            <option value="wav">WAV</option>
          </select>
        </label>
        <label>Độ to chuẩn hóa LUFS (để trống = không chuẩn hóa)
          <input type="number" step="0.5" value={opts.lufs} disabled={disabled}
            placeholder="-16"
            onChange={(e) => set({ lufs: e.target.value })} />
        </label>
        <label className="check">
          <input type="checkbox" checked={opts.slow} disabled={disabled}
            onChange={(e) => set({ slow: e.target.checked })} /> Bản chậm 0.8×
        </label>
        <label className="check">
          <input type="checkbox" checked={opts.srt} disabled={disabled}
            onChange={(e) => set({ srt: e.target.checked })} /> Phụ đề .srt
        </label>
        <div className="modal-actions">
          <button onClick={onClose} autoFocus>Xong</button>
        </div>
      </div>
    </div>
  );
}
