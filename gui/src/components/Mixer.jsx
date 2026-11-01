// Mixer: fader dọc cho từng vai (độ lệch dB). Áp dụng khi tạo âm thanh.
// project.json cũ có thể chưa có gain_db: coi như 0 dB.
const FADER_MIN = -30;
const FADER_MAX = 12;
const DB_TICKS = [12, 0, -10, -20, -30];

export default function Mixer({ roles, onChange, disabled }) {
  return (
    <section className="mixer">
      <h2>Mixer</h2>
      <div className="faders">
        <div className="fader-scale" aria-hidden="true">
          {DB_TICKS.map((v) => (
            <span key={v} style={{ top: `${((FADER_MAX - v) / (FADER_MAX - FADER_MIN)) * 100}%` }}>
              {v > 0 ? "+" : ""}{v}
            </span>
          ))}
        </div>
        {Object.entries(roles).map(([id, role]) => {
          const gain = role.gain_db ?? 0;
          return (
          <div key={id} className={`fader role-${id}`}>
            <span className="db">{gain > 0 ? "+" : ""}{gain.toFixed(1)} dB</span>
            <input
              type="range"
              className="vertical"
              min={FADER_MIN}
              max={FADER_MAX}
              step={0.5}
              value={gain}
              disabled={disabled}
              onChange={(e) => onChange(id, { gain_db: Number(e.target.value) })}
              onDoubleClick={() => onChange(id, { gain_db: 0 })}
              title="Kéo để chỉnh; nhấp đúp để về 0 dB"
            />
            <span className="fader-label">[{id}]</span>
          </div>
          );
        })}
      </div>
    </section>
  );
}
