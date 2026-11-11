// Bảng "Nhịp đọc": khoảng lặng tự động giữa các câu thoại và ngắt nghỉ trong một câu.
// Giá trị lưu ở project.timing (xem core/models.py Timing).

// Mức đề xuất: gần hội thoại tự nhiên; chỗ chờ cho học viên dùng chế độ shadow (khớp với mặc định trong core/models.py).
export const RECOMMENDED_TIMING = {
  lead_in_ms: 2000,
  turn_gap_ms: 600,
  same_speaker_gap_ms: 400,
  question_gap_ms: 200,
  sentence_pause_ms: 500,
  comma_pause_scale: 1.5,
  tail_ms: 2000,
};

const FIELDS = [
  { key: "turn_gap_ms", label: "Đổi người nói", hint: "Lặng giữa hai câu thoại của hai người khác nhau" },
  { key: "same_speaker_gap_ms", label: "Cùng người nói", hint: "Lặng giữa hai câu thoại liên tiếp của cùng một người" },
  { key: "question_gap_ms", label: "Chờ thêm sau câu hỏi", hint: "Cộng thêm sau câu kết thúc bằng ？" },
  { key: "sentence_pause_ms", label: "Trong câu: sau 。！？", hint: "Dừng giữa các câu trong cùng một câu thoại (0 = đọc liền)" },
  { key: "lead_in_ms", label: "Lặng đầu bài", hint: "Khoảng lặng trước câu đầu tiên" },
  { key: "tail_ms", label: "Lặng cuối bài", hint: "Khoảng lặng sau câu cuối cùng" },
];

export default function TimingPanel({ timing = {}, onChange, disabled }) {
  const t = { ...RECOMMENDED_TIMING, ...timing };
  const isRecommended = Object.keys(RECOMMENDED_TIMING).every((k) => Number(t[k]) === RECOMMENDED_TIMING[k]);
  return (
    <section className="timing-panel">
      <div className="section-head">
        <h2>Nhịp đọc</h2>
        <button
          type="button"
          className="ghost"
          disabled={disabled || isRecommended}
          onClick={() => onChange({ ...RECOMMENDED_TIMING })}
          title="Đặt lại toàn bộ khoảng lặng về mức đề xuất"
        >
          Mức đề xuất
        </button>
      </div>
      <p className="hint">Khoảng lặng được chèn tự động khi tạo âm thanh, không cần tự thêm "Khoảng nghỉ".</p>
      {FIELDS.map((f) => (
        <label key={f.key} className="timing-row" title={f.hint}>
          <span>{f.label}</span>
          <span className="timing-input">
            <input
              type="number"
              min={0}
              max={5000}
              step={50}
              value={t[f.key]}
              disabled={disabled}
              aria-label={f.label}
              onChange={(e) => onChange({ ...t, [f.key]: Math.max(0, Math.round(Number(e.target.value) || 0)) })}
            />
            <small>ms</small>
          </span>
        </label>
      ))}
      <label className="timing-row" title="Kéo dài chỗ ngắt ở dấu 、 (chỉ VOICEVOX/AivisSpeech; 1.0 = như engine)">
        <span>Ngắt ở 、 (VOICEVOX/Aivis)</span>
        <span className="timing-input">
          <input
            type="number"
            min={0}
            max={3}
            step={0.1}
            value={t.comma_pause_scale}
            disabled={disabled}
            aria-label="Ngắt ở 、"
            onChange={(e) =>
              onChange({ ...t, comma_pause_scale: Math.min(3, Math.max(0, Number(e.target.value) || 0)) })
            }
          />
          <small>×</small>
        </span>
      </label>
    </section>
  );
}
