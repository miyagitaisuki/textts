import { useState } from "react";
import { LINE_PARAMS, paramSupported, readParam, writeParam, clampParam } from "../lib/lineParams.js";

// Slider chỉnh tempo / âm lượng / lặng trước-sau cho câu đang chọn (bố cục học từ AivisSpeech):
// nhãn + dấu ? bên trái, giá trị bên phải (bấm để gõ số), nhấp đúp slider để về mặc định.
export default function LineSliders({ attrs = {}, engine, disabled, onChange }) {
  return (
    <div className="line-sliders">
      {LINE_PARAMS.map((p) => (
        <SliderRow
          key={p.key}
          param={p}
          value={readParam(attrs, p)}
          supported={paramSupported(p, engine)}
          disabled={disabled}
          onCommit={(v) => onChange(writeParam(attrs, p, v))}
        />
      ))}
    </div>
  );
}

function SliderRow({ param, value, supported, disabled, onCommit }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const off = disabled || !supported;
  const id = `line-param-${param.key}`;
  const shown = value.toFixed(param.digits);

  function commitDraft() {
    setEditing(false);
    if (draft.trim() !== "") onCommit(clampParam(param, draft));
  }

  return (
    <div className={`slider-row ${supported ? "" : "unsupported"} ${value !== param.def ? "changed" : ""}`}>
      <div className="slider-head">
        <label htmlFor={id}>{param.label}</label>
        <span className="slider-help" title={param.help} aria-label={param.help} role="img">?</span>
        <span className="nav-spacer" />
        {editing ? (
          <input
            className="slider-value-input"
            type="number"
            autoFocus
            min={param.min}
            max={param.max}
            step={param.step}
            value={draft}
            aria-label={`Nhập ${param.label}`}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitDraft}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitDraft();
              if (e.key === "Escape") setEditing(false);
            }}
          />
        ) : (
          <button
            type="button"
            className="slider-value"
            disabled={off}
            title="Bấm để nhập số"
            onClick={() => {
              setDraft(shown);
              setEditing(true);
            }}
          >
            {shown}
            <small>{param.unit}</small>
          </button>
        )}
      </div>
      <input
        id={id}
        type="range"
        min={param.min}
        max={param.max}
        step={param.step}
        value={value}
        disabled={off}
        title="Nhấp đúp để về mặc định"
        onChange={(e) => onCommit(Number(e.target.value))}
        onDoubleClick={() => onCommit(param.def)}
      />
      {!supported && <small className="hint">Chỉ áp dụng khi dùng AivisSpeech.</small>}
    </div>
  );
}
