// Thẻ cấu hình từng vai: giọng, cảm xúc mặc định, tốc độ, cao độ.
export const VOICES = ["ja-JP-KeitaNeural", "ja-JP-NanamiNeural"];
export const EMOTIONS = ["neutral", "happy", "sad", "angry", "surprised"];
export const SPEEDS = ["slow", "normal", "fast"];

export default function RolePanel({ roles, onChange, disabled }) {
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
                {VOICES.includes(role.voice) ? null : <option value={role.voice}>{role.voice}</option>}
                {VOICES.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </label>
            <label>
              Cảm xúc
              <select value={role.emotion} disabled={disabled}
                onChange={(e) => onChange(id, { emotion: e.target.value })}>
                {EMOTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </label>
            <label>
              Tốc độ
              <select value={role.speed} disabled={disabled}
                onChange={(e) => onChange(id, { speed: e.target.value })}>
                {SPEEDS.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </label>
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
