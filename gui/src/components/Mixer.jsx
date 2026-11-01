// Mixer: fader dọc cho từng vai (độ lệch dB). Áp dụng khi tạo âm thanh.
// project.json cũ có thể chưa có gain_db: coi như 0 dB.
export default function Mixer({ roles, onChange, disabled }) {
  return (
    <section className="mixer">
      <h2>Mixer</h2>
      <div className="faders">
        {Object.entries(roles).map(([id, role]) => {
          const gain = role.gain_db ?? 0;
          return (
          <div key={id} className={`fader role-${id}`}>
            <span className="db">{gain > 0 ? "+" : ""}{gain.toFixed(1)} dB</span>
            <input
              type="range"
              className="vertical"
              min={-30}
              max={12}
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
