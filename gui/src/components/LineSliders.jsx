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
  const [drag, setDrag] = useState(null); // giá trị lúc đang kéo: chỉ ghi khi thả, để mỗi lần kéo là một bước undo
  const off = disabled || !supported;
  const current = drag ?? value;
  const id = `line-param-${param.key}`;
  const shown = current.toFixed(param.digits);

  function endDrag() {
    if (drag === null) return;
    setDrag(null);
    if (drag !== value) onCommit(drag);
  }

  function commitDraft() {
    setEditing(false);
    if (draft.trim() !== "") onCommit(clampParam(param, draft));
  }

  return (
    <div className={`slider-row ${supported ? "" : "unsupported"} ${current !== param.def ? "changed" : ""}`}>
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
        value={current}
        disabled={off}
        title="Nhấp đúp để về mặc định"
        onChange={(e) => setDrag(Number(e.target.value))}
        onMouseUp={endDrag}
        onTouchEnd={endDrag}
        onKeyUp={endDrag}
        onBlur={endDrag}
        onDoubleClick={() => {
          setDrag(null);
          onCommit(param.def);
        }}
      />
      {!supported && <small className="hint">Chỉ áp dụng khi dùng AivisSpeech.</small>}
    </div>
  );
}
