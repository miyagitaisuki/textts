import { useEffect, useRef, useState } from "react";
import { toTtsText } from "../lib/ruby.js";
import { accentSpec, parseAccentSpec, pitchPattern, toggleAccent } from "../lib/lineParams.js";
import { PanelHeader } from "./Workspace.jsx";

// Panel accent (học từ AivisSpeech): mỗi cụm là một nhóm mora, đường cao/thấp vẽ theo accent.
// Bấm một mora để accent rơi sau mora đó; bấm lại để về bằng (0). Kết quả ghi vào attrs.accent ("2/0").
export default function AccentPanel({ item, engine, speaker, disabled, onChangeAttrs, onPreview, onNotice, onClose }) {
  const [state, setState] = useState({ status: "idle", phrases: [], error: "" });
  const reqId = useRef(0);
  const isLine = item?.type === "line";
  const text = isLine ? toTtsText(item.display || "") : ""; // giống Python: cách đọc luôn suy ra từ display
  const usable = engine === "aivis" && isLine && Boolean(window.textts?.getAccentPhrases);

  useEffect(() => {
    if (!usable || !text.trim()) {
      setState({ status: "idle", phrases: [], error: "" });
      return;
    }
    const id = ++reqId.current;
    setState((s) => ({ ...s, status: "loading", error: "" }));
    window.textts.getAccentPhrases(text, speaker).then((res) => {
      if (id !== reqId.current) return; // đã chọn câu khác hoặc sửa chữ trong lúc chờ
      if (res?.ok) setState({ status: "ready", phrases: res.phrases, error: "" });
      else setState({ status: "error", phrases: [], error: res?.error || "Không lấy được accent" });
    });
  }, [usable, text, speaker]);

  const saved = isLine ? parseAccentSpec(item.attrs?.accent) : null;
  const engineAccents = state.phrases.map((p) => p.accent);
  const mismatch = state.status === "ready" && saved && saved.length !== state.phrases.length;

  // Sửa chữ làm số cụm thay đổi: xoá accent cũ để không đọc sai, và báo cho người dùng.
  useEffect(() => {
    if (!mismatch) return;
    const next = { ...(item.attrs || {}) };
    delete next.accent;
    onChangeAttrs(next);
    onNotice?.(`Đã xoá accent của câu ${item.id} vì số cụm thay đổi sau khi sửa câu`);
  }, [mismatch]); // eslint-disable-line react-hooks/exhaustive-deps

  const accents = saved && !mismatch ? saved : engineAccents;

  function setAccent(phraseIndex, moraIndex) {
    const next = [...accents];
    next[phraseIndex] = toggleAccent(next[phraseIndex], moraIndex);
    const attrs = { ...(item.attrs || {}) };
    if (next.every((a, i) => a === engineAccents[i])) delete attrs.accent; // trùng engine: khỏi ghi
    else attrs.accent = accentSpec(next);
    onChangeAttrs(attrs);
  }

  let body;
  if (engine !== "aivis") body = <p className="accent-note">Bảng accent chỉ dùng với engine AivisSpeech.</p>;
  else if (!isLine) body = <p className="accent-note">Chọn một câu thoại để chỉnh accent.</p>;
  else if (!text.trim()) body = <p className="accent-note">Câu đang trống.</p>;
  else if (state.status === "error") body = <p className="accent-note error">{state.error}</p>;
  else if (state.status !== "ready") body = <p className="accent-note">Đang lấy accent từ AivisSpeech…</p>;
  else
    body = (
      <div className="accent-phrases" role="group" aria-label="Accent từng cụm">
        {state.phrases.map((p, pi) => {
          const accent = accents[pi] ?? 0;
          const pattern = pitchPattern(p.moras.length, accent);
          return (
            <div key={pi} className={`accent-phrase ${accent !== engineAccents[pi] ? "changed" : ""}`}>
              {p.moras.map((m, mi) => (
                <button
                  key={mi}
                  type="button"
                  className={`accent-mora ${pattern[mi] ? "high" : "low"} ${accent === mi + 1 ? "nucleus" : ""}`}
                  disabled={disabled}
                  aria-pressed={accent === mi + 1}
                  title={accent === mi + 1 ? "Bấm để về bằng (0)" : `Đặt accent sau 「${m}」`}
                  onClick={() => setAccent(pi, mi)}
                >
                  <span className="accent-dot" />
                  <span className="accent-kana">{m}</span>
                </button>
              ))}
            </div>
          );
        })}
      </div>
    );

  return (
    <div className="accent-panel">
      <PanelHeader title="Accent" onClose={onClose}>
        {isLine && <span className="accent-meta">{item.id}{item.attrs?.accent ? ` · accent=${item.attrs.accent}` : ""}</span>}
        <button
          type="button"
          className="nav-btn"
          disabled={disabled || !usable || state.status !== "ready"}
          onClick={() => onPreview(item.id)}
        >
          ▶ Nghe
        </button>
      </PanelHeader>
      <div className="accent-body">{body}</div>
    </div>
  );
}
