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

// Nhân vật giáo trình: áp nhân vật có sẵn (giọng, cảm xúc, tốc độ, cao độ) cho vai, hoặc lưu vai hiện tại
// thành nhân vật mới để mọi bài sau (và AI) dùng lại đúng giọng.
function PresetBar({ roleId, role, presets, onApply, onSave, onRemove, disabled, engine }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [choice, setChoice] = useState("");
  const [error, setError] = useState("");
  // Chỉ nhân vật cùng engine (nhân vật cũ chưa ghi engine thì hiện ở mọi engine)
  const usable = presets.filter((p) => !p.engine || p.engine === engine);
  const selected = usable.find((p) => p.name === choice);
  return (
    <div className="preset-bar">
      <span className="preset-title">Nhân vật giáo trình</span>
      <div className="preset-row">
        <select value={choice} disabled={disabled} onChange={(e) => setChoice(e.target.value)} aria-label="Chọn nhân vật">
          <option value="">— chọn nhân vật —</option>
          {usable.map((p) => (
            <option key={p.name} value={p.name} title={p.description || ""}>
              {p.name}
              {p.description ? ` — ${p.description}` : ""}
            </option>
          ))}
        </select>
        <button className="ghost" disabled={disabled || !selected}
          onClick={() => onApply(roleId, selected)}>Áp</button>
        <button className="ghost" disabled={disabled || !selected}
          onClick={() => { onRemove(choice); setChoice(""); }}>Xóa</button>
      </div>
      <div className="preset-row">
        <input placeholder="Tên nhân vật (vd. Minh)" value={name} disabled={disabled}
          onChange={(e) => setName(e.target.value)} />
        <button className="ghost" disabled={disabled}
          onClick={() => {
            try {
              onSave(name, role, { engine, description });
              setName("");
              setDescription("");
              setError("");
            } catch (err) {
              setError(err.message);
            }
          }}>Lưu nhân vật</button>
      </div>
      <div className="preset-row">
        <input placeholder="Mô tả cho AI (vd. nam sinh viên Việt Nam 20 tuổi, vui vẻ)" value={description}
          disabled={disabled} onChange={(e) => setDescription(e.target.value)} />
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
  onSampleVoice,
  sampling = null,
  recorder,
  library,
  onOpenVoiceBank,
}) {
  const isEdge = !engine || engine === "edge";
  const options = voices.length ? voices : isEdge ? VOICES.map((v) => ({ value: v, label: v })) : [];
  return (
    <section className="roles">
      <div className="section-head" style={{ marginBottom: 8 }}>
        <h2>Vai</h2>
        {onOpenVoiceBank && (
          <button className="ghost" onClick={onOpenVoiceBank} title="Đặt biệt danh, tuổi, chất giọng cho từng giọng">
            Ngân hàng giọng…
          </button>
        )}
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
            <div className="voice-field">
              <span className="voice-label" id={`voice-label-${id}`}>Giọng</span>
              <div className="voice-row">
                <select value={role.voice} disabled={disabled} aria-labelledby={`voice-label-${id}`}
                  onChange={(e) => onChange(id, { voice: e.target.value })}>
                  {options.some((o) => o.value === role.voice) ? null : (
                    <option value={role.voice}>{role.voice}</option>
                  )}
                  {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                {onSampleVoice && (
                  <button
                    type="button"
                    className={`voice-sample ${sampling === id ? "playing" : ""}`}
                    disabled={disabled || (sampling && sampling !== id)}
                    onClick={() => onSampleVoice(id)}
                    title={sampling === id ? "Đang đọc mẫu… (bấm để dừng)" : "Nghe thử giọng này (một câu mẫu ngắn)"}
                    aria-label={`Nghe thử giọng của vai ${id}`}
                  >
                    {sampling === id ? "■" : "▶"}
                  </button>
                )}
              </div>
            </div>
            <Segmented label="Cảm xúc" options={EMOTIONS} labels={EMOTION_LABELS} value={role.emotion}
              disabled={disabled} onChange={(v) => onChange(id, { emotion: v })} />
            <Segmented label="Tốc độ" options={SPEEDS} labels={SPEED_LABELS} value={role.speed}
              disabled={disabled} onChange={(v) => onChange(id, { speed: v })} />
            {recorder?.(id)}
            {library && (
              <details className="preset-details">
                <summary>Mẫu cấu hình</summary>
                <PresetBar roleId={id} role={role} presets={library.presets} disabled={disabled} engine={engine}
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
