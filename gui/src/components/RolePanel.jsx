import { useState } from "react";

// Thẻ cấu hình từng vai: giọng, cảm xúc mặc định, tốc độ, cao độ.
export const VOICES = ["ja-JP-KeitaNeural", "ja-JP-NanamiNeural"];
export const EMOTIONS = ["neutral", "happy", "sad", "angry", "surprised"];
export const SPEEDS = ["slow", "normal", "fast"];
const EMOTION_LABELS = { neutral: "Thường", happy: "Vui", sad: "Buồn", angry: "Giận", surprised: "Ngạc nhiên" };
const SPEED_LABELS = { slow: "Chậm", normal: "Thường", fast: "Nhanh" };

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

// voices: [{value, label}] từ engine hiện tại; rỗng thì dùng danh sách Edge mặc định.
export default function RolePanel({ roles, onChange, disabled, voices = [], recorder, library }) {
  const options = voices.length ? voices : VOICES.map((v) => ({ value: v, label: v }));
  return (
    <section className="roles">
      <h2>Vai</h2>
      <div className="role-grid">
        {Object.entries(roles).map(([id, role]) => (
          <div key={id} className={`role-card role-${id}`}>
            <div className="role-title">[{id}] {role.name || ""}</div>
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
