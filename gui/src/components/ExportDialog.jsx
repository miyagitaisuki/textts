// Hộp thoại tùy chọn xuất: định dạng, chuẩn hóa LUFS, bản chậm, phụ đề,
// và các chế độ lớp học: Role-play, Shadowing, Xuất từng câu riêng, Phiếu in HTML, Nhạc nền BGM.
import { useEffect } from "react";

const fileStem = (p = "") => String(p).split(/[\\/]/).pop().replace(/\.[^.]+$/, "");

export default function ExportDialog({
  opts,
  onChange,
  roles = {},
  onPickAudio,
  onOpenWorksheet,
  hasWorksheet = false,
  disabled,
  onClose,
  inline = false, // nhúng trong panel Xuất bản thay vì hộp thoại
}) {
  useEffect(() => {
    if (inline) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, inline]);

  const set = (patch) => onChange({ ...opts, ...patch });
  const roleEntries = Object.entries(roles);

  const layers = Array.isArray(opts.bgmLayers) ? opts.bgmLayers : [];
  const setLayers = (next) => set({ bgmLayers: next });

  async function addLayer() {
    if (!onPickAudio) return;
    const file = await onPickAudio();
    // Lớp thứ hai trở đi mặc định nhỏ hơn để không lấn lớp chính.
    if (file) setLayers([...layers, { path: file, db: layers.length ? -26 : -18 }]);
  }
  const patchLayer = (i, patch) => setLayers(layers.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const removeLayer = (i) => setLayers(layers.filter((_, j) => j !== i));

  const grid = (
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

            <label title="Chỉnh tốc độ đọc và khoảng nghỉ theo trình độ người học">
              Trình độ người học
              <select value={opts.level || ""} disabled={disabled} onChange={(e) => set({ level: e.target.value })}>
                <option value="">Theo “Nhịp đọc” của dự án</option>
                <option value="N5">N5 — chậm, nghỉ lâu</option>
                <option value="N4">N4</option>
                <option value="N3">N3 — tự nhiên vừa</option>
                <option value="N2">N2</option>
                <option value="N1">N1 — gần người bản xứ</option>
              </select>
            </label>

            <label className="check" title="Đọc bản dịch tiếng Việt (ô dưới mỗi câu) ngay sau câu đó; cần Internet">
              <input type="checkbox" checked={Boolean(opts.bilingual)} disabled={disabled} onChange={(e) => set({ bilingual: e.target.checked })} />
              Bản song ngữ (đọc bản dịch sau mỗi câu)
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

            {/* Nhiều lớp nhạc/âm nền phát chồng nhau suốt bài, mỗi lớp một âm lượng (vd. mưa + xe cộ) */}
            <div className="bgm-layers">
              <div className="bgm-layers-head">
                <span>Nhạc / âm nền ({layers.length} lớp)</span>
                <button type="button" className="ghost" onClick={addLayer} disabled={disabled}>
                  ＋ Thêm lớp từ thư viện…
                </button>
              </div>
              {layers.length === 0 && <p className="muted">Chưa có. Có thể chồng nhiều lớp, ví dụ tiếng mưa + tiếng xe cộ.</p>}
              {layers.map((l, i) => (
                <div className="bgm-layer" key={`${l.path}-${i}`}>
                  <span className="bgm-layer-name" title={l.path}>
                    {fileStem(l.path)}
                  </span>
                  <input
                    type="range"
                    min={-40}
                    max={-6}
                    step={1}
                    value={l.db ?? -18}
                    disabled={disabled}
                    aria-label={`Âm lượng lớp ${fileStem(l.path)}`}
                    onChange={(e) => patchLayer(i, { db: Number(e.target.value) })}
                  />
                  <span className="bgm-layer-db">{l.db ?? -18} dB</span>
                  <button type="button" className="ghost danger" title="Bỏ lớp này" onClick={() => removeLayer(i)} disabled={disabled}>
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </fieldset>
        </div>
  );

  if (inline) {
    return (
      <div className="modal export-inline">
        <p className="muted">Tùy chọn được nhớ làm mặc định. Tên file nhập ở ô cạnh nút “Tạo & lưu”.</p>
        {grid}
      </div>
    );
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

        {grid}

        <div className="modal-actions">
          <button onClick={onClose} autoFocus>
            Xong
          </button>
        </div>
      </div>
    </div>
  );
}
