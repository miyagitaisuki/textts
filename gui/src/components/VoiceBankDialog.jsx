// Ngân hàng giọng: xem mọi giọng của từng engine, nghe thử, đặt biệt danh, giới tính, tuổi, chất giọng
// (vui, buồn, trẻ con, trầm...), mô tả, ★ yêu thích hoặc ẩn. Ghi chú này hiện trong ô chọn giọng của vai
// và được AI đọc (GIONG.md / API) để chọn giọng hợp vai.
import { useEffect, useMemo, useRef, useState } from "react";
import { normalize } from "./CommandPalette.jsx";
import { AGE_GROUPS, GENDERS, MULTI_FIELDS, ageGroupOf } from "../lib/voiceOptions.js";

// Chọn nhiều giá trị: các chip đã chọn (bấm × để bỏ) + menu "＋" để thêm, có "Khác…" để tự gõ.
export function MultiPick({ label, options, values = [], onChange, disabled }) {
  const rest = options.filter((o) => !values.includes(o));
  return (
    <div className="vb-multi" role="group" aria-label={label}>
      <span className="vb-multi-label">{label}</span>
      {values.map((v) => (
        <span key={v} className="vb-chip">
          {v}
          <button type="button" aria-label={`Bỏ ${v}`} title="Bỏ" disabled={disabled} onClick={() => onChange(values.filter((x) => x !== v))}>
            ×
          </button>
        </span>
      ))}
      <select
        className="vb-add"
        value=""
        disabled={disabled}
        aria-label={`Thêm ${label}`}
        title={`Thêm ${label.toLowerCase()}`}
        onChange={(e) => {
          let v = e.target.value;
          if (v === "__other") v = (window.prompt(`${label}: nhập giá trị khác`) || "").trim();
          if (v && !values.includes(v)) onChange([...values, v]);
        }}
      >
        <option value="">＋</option>
        {rest.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
        <option value="__other">Khác…</option>
      </select>
    </div>
  );
}

const ENGINES = [
  ["voicevox", "VOICEVOX"],
  ["aivis", "AivisSpeech"],
  ["edge", "Edge TTS"],
];

function rowsFor(engine, data) {
  if (!data) return [];
  const bank = data.bank?.voices || {};
  const voices = data.voices?.length
    ? data.voices
    : Object.entries(bank)
        .filter(([k]) => k.startsWith(`${engine}:`))
        .map(([k, m]) => ({ value: k.slice(engine.length + 1), label: m.label || k }));
  return voices.map((v) => ({ ...v, meta: bank[`${engine}:${v.value}`] || {} }));
}

export default function VoiceBankDialog({ api = window.textts, initialEngine = "voicevox", onClose, onChanged }) {
  const [engine, setEngine] = useState(initialEngine);
  const [data, setData] = useState(null);
  const [query, setQuery] = useState("");
  const [onlyFav, setOnlyFav] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [drafts, setDrafts] = useState({}); // value -> meta đang sửa
  const [playing, setPlaying] = useState(null);
  const audioRef = useRef(null);

  useEffect(() => {
    let alive = true;
    setData(null);
    setDrafts({});
    api?.getVoiceBank?.(engine).then((d) => alive && setData(d));
    return () => {
      alive = false;
    };
  }, [engine, api]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      audioRef.current?.pause();
    };
  }, [onClose]);

  const rows = useMemo(() => {
    const words = normalize(query).split(/\s+/).filter(Boolean);
    return rowsFor(engine, data)
      .map((r) => ({ ...r, meta: { ...r.meta, ...(drafts[r.value] || {}) } }))
      .filter((r) => (showHidden || !r.meta.hidden) && (!onlyFav || r.meta.favorite))
      .filter((r) => {
        if (!words.length) return true;
        const m = r.meta;
        const hay = normalize(
          [r.label, r.value, m.nickname, m.gender, ageGroupOf(m.age).label, ...(m.styles || []), ...(m.tone || []), ...(m.personality || []), ...(m.suits || []), m.description].join(" ")
        );
        return words.every((w) => hay.includes(w));
      })
      .sort((a, b) => Number(Boolean(b.meta.favorite)) - Number(Boolean(a.meta.favorite)));
  }, [engine, data, drafts, query, onlyFav, showHidden]);

  function edit(value, patch) {
    setDrafts((d) => ({ ...d, [value]: { ...(d[value] || {}), ...patch } }));
  }

  async function save(row, patch = {}) {
    const meta = { ...row.meta, ...(drafts[row.value] || {}), ...patch };
    const bank = await api.setVoiceBank({ engine, voice: row.value, label: row.label, meta });
    setData((d) => ({ ...d, bank }));
    setDrafts((d) => {
      const next = { ...d };
      delete next[row.value];
      return next;
    });
    onChanged?.();
  }

  async function play(row) {
    audioRef.current?.pause();
    if (playing === row.value) return setPlaying(null);
    setPlaying(row.value);
    const res = await api.sampleVoice?.({ engine, voice: String(row.value), emotion: "neutral", speed: "normal", pitch: 0 });
    if (!res?.ok) return setPlaying(null);
    const a = new Audio(res.dataUrl);
    a.onended = () => setPlaying(null);
    audioRef.current = a;
    a.play().catch(() => setPlaying(null));
  }

  const total = rowsFor(engine, data).length;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal voice-bank-modal" role="dialog" aria-modal="true" aria-label="Ngân hàng giọng" onClick={(e) => e.stopPropagation()}>
        <h2>Ngân hàng giọng</h2>
        <p className="muted">
          Chọn giới tính, độ tuổi từ menu; chất giọng, tính cách, vai phù hợp bấm ＋ để thêm nhiều giá trị. AI đọc các
          ghi chú này (file GIONG.md và API) để tự chọn giọng hợp vai. Mọi thay đổi được lưu ngay.
        </p>
        <div className="vb-toolbar">
          <div className="sound-tabs" role="tablist">
            {ENGINES.map(([id, label]) => (
              <button key={id} role="tab" aria-selected={engine === id} className={engine === id ? "active" : "ghost"} onClick={() => setEngine(id)}>
                {label}
              </button>
            ))}
          </div>
          <input className="vb-search" placeholder="Tìm: nữ, trẻ con, trầm, 8 tuổi…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Tìm giọng" />
          <label className="check">
            <input type="checkbox" checked={onlyFav} onChange={(e) => setOnlyFav(e.target.checked)} /> ★ Yêu thích
          </label>
          <label className="check">
            <input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} /> Hiện giọng ẩn
          </label>
        </div>

        {data && !data.online && (
          <p className="vb-note">
            {total ? "Engine đang tắt: hiển thị các giọng đã ghi nhớ. Bật engine để nghe thử và thấy giọng mới." : "Engine đang tắt hoặc chưa cài. Bật engine để xem danh sách giọng."}
          </p>
        )}
        {!data && <p className="muted">Đang lấy danh sách giọng…</p>}

        <div className="vb-list" aria-label="Danh sách giọng">
          {rows.map((r) => {
            const m = r.meta;
            // dữ liệu cũ chỉ có styles gõ tay: hiện ở Tính cách
            const groupVals = (k) =>
              Array.isArray(m[k]) ? m[k] : k === "personality" && !m.tone && !m.suits && Array.isArray(m.styles) ? m.styles : [];
            return (
              <div key={r.value} className={`vb-card ${m.hidden ? "is-hidden" : ""}`}>
                <div className="vb-main">
                  <span className="vb-actions">
                    <button type="button" className="ghost" title="Nghe thử" aria-label={`Nghe thử ${r.label}`} onClick={() => play(r)} disabled={data && !data.online}>
                      {playing === r.value ? "■" : "▶"}
                    </button>
                    <button type="button" className={`ghost vb-star ${m.favorite ? "on" : ""}`} title="Yêu thích (lên đầu danh sách chọn giọng)" aria-pressed={Boolean(m.favorite)} onClick={() => save(r, { favorite: !m.favorite })}>
                      ★
                    </button>
                  </span>
                  <span className="vb-label" title={`Mã giọng: ${r.value}`}>
                    {r.label}
                    <small>{r.value}</small>
                  </span>
                  <label className="vb-field">
                    Biệt danh
                    <input value={m.nickname || ""} placeholder="vd. Bé Mai" onChange={(e) => edit(r.value, { nickname: e.target.value })} onBlur={() => drafts[r.value] && save(r)} aria-label={`Biệt danh ${r.label}`} />
                  </label>
                  <label className="vb-field">
                    Giới tính
                    <select value={m.gender || ""} onChange={(e) => save(r, { gender: e.target.value })} aria-label={`Giới tính ${r.label}`}>
                      {GENDERS.map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="vb-field">
                    Độ tuổi
                    <select
                      value={ageGroupOf(m.age).age ?? ""}
                      onChange={(e) => save(r, { age: e.target.value === "" ? null : Number(e.target.value) })}
                      aria-label={`Độ tuổi ${r.label}`}
                    >
                      {AGE_GROUPS.map((g) => (
                        <option key={g.label} value={g.age ?? ""}>
                          {g.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button type="button" className="ghost vb-hide" title={m.hidden ? "Bỏ ẩn" : "Ẩn khỏi ô chọn giọng và khỏi gợi ý của AI"} onClick={() => save(r, { hidden: !m.hidden })}>
                    {m.hidden ? "Hiện" : "Ẩn"}
                  </button>
                </div>
                <div className="vb-extra">
                  {MULTI_FIELDS.map((f) => (
                    <MultiPick key={f.key} label={f.label} options={f.options} values={groupVals(f.key)} onChange={(vals) => save(r, { [f.key]: vals })} />
                  ))}
                  <label className="vb-field vb-desc">
                    Ghi chú thêm (không bắt buộc)
                    <input value={m.description || ""} placeholder="vd. bé gái tinh nghịch, hợp vai con" onChange={(e) => edit(r.value, { description: e.target.value })} onBlur={() => drafts[r.value] && save(r)} aria-label={`Mô tả ${r.label}`} />
                  </label>
                </div>
              </div>
            );
          })}
          {data && rows.length === 0 && total > 0 && <p className="muted">Không có giọng nào khớp bộ lọc.</p>}
        </div>

        <div className="modal-actions">
          <button onClick={onClose}>Đóng</button>
        </div>
      </div>
    </div>
  );
}
