// Ngân hàng giọng: xem mọi giọng của từng engine, nghe thử, đặt biệt danh, giới tính, tuổi, chất giọng
// (vui, buồn, trẻ con, trầm...), mô tả, ★ yêu thích hoặc ẩn. Ghi chú này hiện trong ô chọn giọng của vai
// và được AI đọc (GIONG.md / API) để chọn giọng hợp vai.
import { useEffect, useMemo, useRef, useState } from "react";
import { normalize } from "./CommandPalette.jsx";

const ENGINES = [
  ["voicevox", "VOICEVOX"],
  ["aivis", "AivisSpeech"],
  ["edge", "Edge TTS"],
];
const STYLE_HINTS = ["trẻ con", "học sinh", "thanh niên", "trung niên", "người già", "vui tươi", "buồn", "trầm", "ấm áp", "nghiêm", "dễ thương", "lạnh lùng", "thì thầm", "nhân viên", "giáo viên", "kể chuyện"];

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
        const hay = normalize([r.label, r.value, m.nickname, m.gender, m.age, (m.styles || []).join(" "), m.description].join(" "));
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
          Đặt biệt danh, giới tính, tuổi và chất giọng để chọn vai nhanh. AI đọc các ghi chú này (file GIONG.md và
          API) để tự chọn giọng hợp vai. Ghi chú được lưu ngay khi rời ô.
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

        <div className="vb-table" role="table" aria-label="Danh sách giọng">
          <div className="vb-row vb-head" role="row">
            <span />
            <span>Giọng gốc</span>
            <span>Biệt danh</span>
            <span>Giới tính</span>
            <span>Tuổi</span>
            <span>Chất giọng (phẩy ngăn cách)</span>
            <span>Mô tả cho AI</span>
            <span />
          </div>
          {rows.map((r) => {
            const m = r.meta;
            return (
              <div key={r.value} className={`vb-row ${m.hidden ? "is-hidden" : ""}`} role="row">
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
                <input value={m.nickname || ""} placeholder="vd. Bé Mai" onChange={(e) => edit(r.value, { nickname: e.target.value })} onBlur={() => drafts[r.value] && save(r)} aria-label={`Biệt danh ${r.label}`} />
                <select value={m.gender || ""} onChange={(e) => save(r, { gender: e.target.value })} aria-label={`Giới tính ${r.label}`}>
                  <option value="">—</option>
                  <option value="nam">nam</option>
                  <option value="nữ">nữ</option>
                </select>
                <input type="number" min={0} max={120} value={m.age ?? ""} placeholder="?" onChange={(e) => edit(r.value, { age: e.target.value })} onBlur={() => drafts[r.value] && save(r)} aria-label={`Tuổi ${r.label}`} />
                <input
                  list="vb-style-hints"
                  value={Array.isArray(m.styles) ? m.styles.join(", ") : m.styles || ""}
                  placeholder="trẻ con, vui tươi"
                  onChange={(e) => edit(r.value, { styles: e.target.value })}
                  onBlur={() => drafts[r.value] && save(r)}
                  aria-label={`Chất giọng ${r.label}`}
                />
                <input value={m.description || ""} placeholder="vd. bé gái tinh nghịch, hợp vai con" onChange={(e) => edit(r.value, { description: e.target.value })} onBlur={() => drafts[r.value] && save(r)} aria-label={`Mô tả ${r.label}`} />
                <button type="button" className="ghost" title={m.hidden ? "Bỏ ẩn" : "Ẩn khỏi ô chọn giọng và khỏi gợi ý của AI"} onClick={() => save(r, { hidden: !m.hidden })}>
                  {m.hidden ? "Hiện" : "Ẩn"}
                </button>
              </div>
            );
          })}
          {data && rows.length === 0 && total > 0 && <p className="muted">Không có giọng nào khớp bộ lọc.</p>}
        </div>
        <datalist id="vb-style-hints">
          {STYLE_HINTS.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>

        <div className="modal-actions">
          <button onClick={onClose}>Đóng</button>
        </div>
      </div>
    </div>
  );
}
