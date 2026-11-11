import { useState } from "react";

// Thẻ cấu hình từng vai: giọng, cảm xúc mặc định, tốc độ, cao độ.
export const VOICES = ["ja-JP-KeitaNeural", "ja-JP-NanamiNeural"];
export const EMOTIONS = ["neutral", "happy", "sad", "angry", "surprised"];
export const SPEEDS = ["slow", "normal", "fast"];
export const EMOTION_LABELS = { neutral: "Trung tính", happy: "Vui", sad: "Buồn", angry: "Giận", surprised: "Ngạc nhiên" };
export const SPEED_LABELS = { slow: "Chậm", normal: "Thường", fast: "Nhanh" };

// Nhóm nút chọn một giá trị (thay cho dropdown): dễ bấm, thấy ngay lựa chọn hiện tại.
function Segmented({ label, options, labels, value, disabled, onChange }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      <span className="segmented-label">{label}</span>
      <div className="segmented-buttons">
        {options.map((v) => (
          <button key={v} type="button" aria-pressed={value === v} disabled={disabled}
            className={value === v ? "on" : ""} onClick={() => onChange(v)}>
            {labels[v]}
          </button>
        ))}
      </div>
    </div>
  );
}

// Khối thư viện mẫu của một vai: áp mẫu có sẵn, hoặc lưu cấu hình hiện tại thành mẫu mới.
function PresetBar({ roleId, role, presets, onApply, onSave, onRemove, disabled }) {
  const [name, setName] = useState("");
  const [choice, setChoice] = useState("");
  const [error, setError] = useState("");
  const selected = presets.find((p) => p.name === choice);
  return (
    <div className="preset-bar">
      <div className="preset-row">
        <select value={choice} disabled={disabled} onChange={(e) => setChoice(e.target.value)}>
          <option value="">— chọn mẫu —</option>
          {presets.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
        </select>
        <button className="ghost" disabled={disabled || !selected}
          onClick={() => onApply(roleId, selected)}>Áp</button>
        <button className="ghost" disabled={disabled || !selected}
          onClick={() => { onRemove(choice); setChoice(""); }}>Xóa</button>
      </div>
      <div className="preset-row">
        <input placeholder="Tên mẫu mới" value={name} disabled={disabled}
          onChange={(e) => setName(e.target.value)} />
        <button className="ghost" disabled={disabled}
          onClick={() => {
            try {
              onSave(name, role);
              setName("");
              setError("");
            } catch (err) {
              setError(err.message);
            }
          }}>Lưu mẫu</button>
      </div>
      {error && <div className="preset-error">{error}</div>}
    </div>
  );
}

export const ENGINES = [
  { value: "edge", label: "Edge TTS (online)" },
  { value: "voicevox", label: "VOICEVOX" },
  { value: "aivis", label: "AivisSpeech" },
];

// voices: [{value, label}] từ engine hiện tại; rỗng thì dùng danh sách Edge mặc định (chỉ với engine Edge).
export default function RolePanel({
  roles,
  onChange,
  onAddRole,
  onDeleteRole,
  disabled,
  voices = [],
  engine = "edge",
  onChangeEngine,
  recorder,
  library,
}) {
  const isEdge = !engine || engine === "edge";
  const options = voices.length ? voices : isEdge ? VOICES.map((v) => ({ value: v, label: v })) : [];
  return (
    <section className="roles">
      <div className="section-head" style={{ marginBottom: 8 }}>
        <h2>Vai</h2>
        {onAddRole && (
          <button
            className="ghost"
            onClick={onAddRole}
            disabled={disabled}
            title="Thêm một vai nhân vật mới"
          >
            + Thêm vai
          </button>
        )}
      </div>
      {onChangeEngine && (
        <label className="engine-picker">
          Engine đọc
          <select value={engine || "edge"} disabled={disabled} onChange={(e) => onChangeEngine(e.target.value)}>
            {ENGINES.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
          </select>
        </label>
      )}
      {!isEdge && !voices.length && (
        <div className="preset-error">
          Chưa lấy được danh sách giọng của {ENGINES.find((e) => e.value === engine)?.label ?? engine}. Hãy bật engine
          trên thanh trên cùng; danh sách sẽ tự tải lại khi engine chạy.
        </div>
      )}
      <div className="role-grid">
        {Object.entries(roles).map(([id, role]) => (
          <div key={id} className={`role-card role-${id}`}>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <div className="role-title">[{id}]</div>
              <input
                style={{ flex: 1 }}
                placeholder="Tên nhân vật (ví dụ: Tanaka)"
                value={role.name || ""}
                disabled={disabled}
                onChange={(e) => onChange(id, { name: e.target.value })}
              />
              {onDeleteRole && Object.keys(roles).length > 1 && (
                <button
                  type="button"
                  className="ghost danger"
                  disabled={disabled}
                  onClick={() => onDeleteRole(id)}
                  title="Xóa vai này"
                >
                  ✕
                </button>
              )}
            </div>
            <label>
              Giọng
              <select value={role.voice} disabled={disabled}
                onChange={(e) => onChange(id, { voice: e.target.value })}>
                {options.some((o) => o.value === role.voice) ? null : (
                  <option value={role.voice}>{role.voice}</option>
                )}
                {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
            <Segmented label="Cảm xúc" options={EMOTIONS} labels={EMOTION_LABELS} value={role.emotion}
              disabled={disabled} onChange={(v) => onChange(id, { emotion: v })} />
            <Segmented label="Tốc độ" options={SPEEDS} labels={SPEED_LABELS} value={role.speed}
              disabled={disabled} onChange={(v) => onChange(id, { speed: v })} />
            {recorder?.(id)}
            {library && (
              <details className="preset-details">
                <summary>Mẫu cấu hình</summary>
                <PresetBar roleId={id} role={role} presets={library.presets} disabled={disabled}
                  onApply={library.onApply} onSave={library.onSave} onRemove={library.onRemove} />
              </details>
            )}
            <label>
              Cao độ: {role.pitch} Hz
              <input type="range" min={-50} max={50} value={role.pitch} disabled={disabled}
                onChange={(e) => onChange(id, { pitch: Number(e.target.value) })} />
            </label>
          </div>
        ))}
      </div>
    </section>
  );
}
