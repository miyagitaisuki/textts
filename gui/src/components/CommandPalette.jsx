// Bảng lệnh (Ctrl+K): gõ để tìm mọi thao tác, kèm phím tắt — giống Command Palette / Quick Actions của Adobe.
import { useEffect, useMemo, useRef, useState } from "react";

// So khớp không dấu, không phân biệt hoa thường; mọi từ trong truy vấn phải có mặt.
export function normalize(s) {
  return String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
}

export function filterCommands(commands, query) {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (!words.length) return commands;
  return commands.filter((c) => {
    const hay = normalize(`${c.group} ${c.label} ${c.keywords || ""}`);
    return words.every((w) => hay.includes(w));
  });
}

export default function CommandPalette({ commands, onClose }) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const listRef = useRef(null);
  const shown = useMemo(() => filterCommands(commands, query), [commands, query]);

  useEffect(() => setIndex(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector(".palette-item.active")?.scrollIntoView?.({ block: "nearest" });
  }, [index]);

  function run(cmd) {
    if (!cmd || cmd.disabled) return;
    onClose();
    setTimeout(() => cmd.run(), 0);
  }

  function onKeyDown(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setIndex((i) => Math.min(shown.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIndex((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      run(shown[index]);
    }
  }

  let lastGroup = null;
  return (
    <div className="palette-backdrop" onPointerDown={onClose}>
      <div className="palette" role="dialog" aria-label="Bảng lệnh" onPointerDown={(e) => e.stopPropagation()}>
        <input
          autoFocus
          placeholder="Gõ để tìm thao tác… (vd. tạo, nghe thử, timeline, sáng)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          aria-label="Tìm thao tác"
        />
        <div className="palette-list" ref={listRef} role="listbox">
          {shown.length === 0 && <div className="palette-empty">Không có thao tác nào khớp “{query}”.</div>}
          {shown.map((c, i) => {
            const header = c.group !== lastGroup ? <div className="palette-group">{c.group}</div> : null;
            lastGroup = c.group;
            return (
              <div key={c.id}>
                {header}
                <button
                  type="button"
                  role="option"
                  aria-selected={i === index}
                  className={`palette-item ${i === index ? "active" : ""}`}
                  disabled={c.disabled}
                  onMouseEnter={() => setIndex(i)}
                  onClick={() => run(c)}
                >
                  {c.label}
                  {c.shortcut && <kbd>{c.shortcut}</kbd>}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
