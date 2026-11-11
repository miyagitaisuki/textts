// Hộp thoại tùy chọn xuất: định dạng, chuẩn hóa LUFS, bản chậm, phụ đề,
// và các chế độ lớp học: Role-play, Shadowing, Xuất từng câu riêng, Phiếu in HTML, Nhạc nền BGM.
import { useEffect } from "react";

export default function ExportDialog({
  opts,
  onChange,
  roles = {},
  onPickAudio,
  onOpenWorksheet,
  hasWorksheet = false,
  disabled,
  onClose,
}) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const set = (patch) => onChange({ ...opts, ...patch });
  const roleEntries = Object.entries(roles);

  async function pickBgm() {
    if (!onPickAudio) return;
    const file = await onPickAudio();
    if (file) set({ bgmPath: file });
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal export-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Tùy chọn xuất"
        onClick={(e) => e.stopPropagation()}
      >
        <h2>Tùy chọn xuất & Tài liệu lớp học</h2>
        <p className="muted">Các tùy chọn này được nhớ làm mặc định cho lần tạo tiếp theo.</p>

        <div className="export-grid">
          <fieldset>
            <legend>Âm thanh & Phụ đề</legend>
            <label>
              Định dạng
              <select
                value={opts.format || "mp3"}
                disabled={disabled}
                onChange={(e) => set({ format: e.target.value })}
              >
                <option value="mp3">MP3</option>
                <option value="wav">WAV</option>
              </select>
            </label>

            <label>
              Độ to chuẩn hóa LUFS (để trống = không chuẩn hóa)
              <input
                type="number"
                step="0.5"
                value={opts.lufs ?? ""}
                disabled={disabled}
                placeholder="-16"
                onChange={(e) => set({ lufs: e.target.value })}
              />
            </label>

            <label className="check">
              <input
                type="checkbox"
                checked={Boolean(opts.slow)}
                disabled={disabled}
                onChange={(e) => set({ slow: e.target.checked })}
              />{" "}
              Bản đọc chậm 0.8× (giữ cao độ)
            </label>

            <label className="check">
              <input
                type="checkbox"
                checked={Boolean(opts.srt)}
                disabled={disabled}
                onChange={(e) => set({ srt: e.target.checked })}
              />{" "}
              Phụ đề .srt (đồng bộ theo từng câu)
            </label>
          </fieldset>

          <fieldset>
            <legend>Chế độ luyện tập cho học viên</legend>
            <label>
              Bản luyện nói (Role-play)
              <select
                value={opts.rolePlay || ""}
                disabled={disabled}
                onChange={(e) => set({ rolePlay: e.target.value })}
              >
                <option value="">— Tắt (phát mọi vai) —</option>
                {roleEntries.map(([id, r]) => (
                  <option key={id} value={id}>
                    Chỉ giữ tiếng Vai [{id}] {r.name ? `(${r.name})` : ""}
                  </option>
                ))}
              </select>
            </label>

            <label className="check">
              <input
                type="checkbox"
                checked={Boolean(opts.shadow)}
                disabled={disabled}
                onChange={(e) => set({ shadow: e.target.checked })}
              />{" "}
              Bản Shadowing (chèn khoảng lặng nhắc lại)
            </label>
            {opts.shadow && (
              <label>
                Khoảng lặng nhắc lại (ms):
                <input
                  type="number"
                  min={500}
                  step={100}
                  value={opts.shadowGap || 1500}
                  disabled={disabled}
                  onChange={(e) => set({ shadowGap: Number(e.target.value) })}
                />
              </label>
            )}

            <label className="check">
              <input
                type="checkbox"
                checked={Boolean(opts.exportLines)}
                disabled={disabled}
                onChange={(e) => set({ exportLines: e.target.checked })}
              />{" "}
              Xuất từng câu thành file riêng (thư mục <code>lines/</code>)
            </label>
          </fieldset>

          <fieldset>
            <legend>Tài liệu in ấn & Nhạc nền</legend>
            <label className="check">
              <input
                type="checkbox"
                checked={Boolean(opts.worksheet)}
                disabled={disabled}
                onChange={(e) => set({ worksheet: e.target.checked })}
              />{" "}
              Tự động xuất phiếu học tập HTML (Furigana <code>&lt;ruby&gt;</code>)
            </label>
            {hasWorksheet && onOpenWorksheet && (
              <div style={{ marginTop: 4 }}>
                <button
                  type="button"
                  className="ghost"
                  onClick={onOpenWorksheet}
                  disabled={disabled}
                >
                  📄 Mở phiếu in HTML trên trình duyệt
                </button>
              </div>
            )}

            <label style={{ marginTop: 8 }}>
              Nhạc nền (BGM)
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input
                  style={{ flex: 1 }}
                  placeholder="Đường dẫn file .mp3 / .wav"
                  value={opts.bgmPath || ""}
                  disabled={disabled}
                  onChange={(e) => set({ bgmPath: e.target.value })}
                />
                <button type="button" className="ghost" onClick={pickBgm} disabled={disabled}>
                  🎵 Thư viện…
                </button>
                {opts.bgmPath && (
                  <button
                    type="button"
                    className="ghost danger"
                    onClick={() => set({ bgmPath: "" })}
                    title="Xóa nhạc nền"
                  >
                    ✕
                  </button>
                )}
              </div>
            </label>
            {opts.bgmPath && (
              <label>
                Âm lượng nhạc nền: {opts.bgmDb ?? -18} dB
                <input
                  type="range"
                  min={-40}
                  max={-6}
                  step={1}
                  value={opts.bgmDb ?? -18}
                  disabled={disabled}
                  onChange={(e) => set({ bgmDb: Number(e.target.value) })}
                />
              </label>
            )}
          </fieldset>
        </div>

        <div className="modal-actions">
          <button onClick={onClose} autoFocus>
            Xong
          </button>
        </div>
      </div>
    </div>
  );
}
