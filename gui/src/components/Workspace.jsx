// Các mảnh dựng workspace kiểu Adobe: thanh kéo giãn panel, đầu panel, thanh chọn workspace + menu Cửa sổ.
import { useEffect, useRef, useState } from "react";
import { PANELS, WORKSPACES } from "../lib/workspace.js";

// Thanh kéo giữa hai panel. vertical = kéo ngang để đổi bề rộng; horizontal = kéo dọc để đổi chiều cao.
// onResize nhận độ dời (px) tính từ lúc bắt đầu kéo; nhấp đúp để về mặc định; phím mũi tên chỉnh 16px.
export function Splitter({ direction = "vertical", onResizeStart, onResize, onReset, label }) {
  const [active, setActive] = useState(false);
  const start = useRef(null);
  const axis = direction === "vertical" ? "clientX" : "clientY";
  return (
    <div
      className={`splitter ${direction} ${active ? "active" : ""}`}
      role="separator"
      aria-orientation={direction === "vertical" ? "vertical" : "horizontal"}
      aria-label={label}
      tabIndex={0}
      title={`${label} — kéo để đổi kích thước, nhấp đúp để đặt lại`}
      onPointerDown={(e) => {
        start.current = e[axis];
        onResizeStart?.();
        setActive(true);
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => start.current !== null && onResize(e[axis] - start.current)}
      onPointerUp={() => {
        start.current = null;
        setActive(false);
      }}
      onDoubleClick={onReset}
      onKeyDown={(e) => {
        const keys = direction === "vertical" ? ["ArrowLeft", "ArrowRight"] : ["ArrowUp", "ArrowDown"];
        if (!keys.includes(e.key)) return;
        e.preventDefault();
        onResizeStart?.();
        onResize(e.key === keys[0] ? -16 : 16);
      }}
    />
  );
}

export function PanelHeader({ title, extra, children, onClose, closeTitle = "Ẩn panel" }) {
  return (
    <div className="panel-header">
      <span className="panel-title">{title}</span>
      {extra && <span className="panel-extra">{extra}</span>}
      <span className="panel-spacer" />
      {children}
      {onClose && (
        <button type="button" className="panel-btn" onClick={onClose} title={closeTitle} aria-label={closeTitle}>
          ×
        </button>
      )}
    </div>
  );
}

// Thanh chọn workspace (như Premiere: Editing / Audio / ...) + menu Cửa sổ để bật/tắt panel.
export function WorkspaceBar({ state, onSwitch, onTogglePanel, onReset, onToggleTheme, onOpenPalette }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const layout = state.layouts[state.active];
  useEffect(() => {
    if (!open) return;
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false);
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open]);

  return (
    <div className="workspace-bar">
      {Object.entries(WORKSPACES).map(([id, w], i) => (
        <button
          key={id}
          type="button"
          className={`workspace-tab ${state.active === id ? "active" : ""}`}
          onClick={() => onSwitch(id)}
          title={`${w.hint} (Alt+Shift+${i + 1})`}
        >
          {w.label}
        </button>
      ))}
      <div className="workspace-menu-wrap" ref={ref}>
        <button type="button" className="workspace-tab" onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open} title="Cửa sổ & bố cục">
          Cửa sổ ▾
        </button>
        {open && (
          <div className="workspace-menu" role="menu">
            <div className="menu-label">Panel</div>
            {PANELS.map(([key, label]) => (
              <button key={key} type="button" role="menuitemcheckbox" aria-checked={Boolean(layout[key])} onClick={() => onTogglePanel(key)}>
                <span className="check">{layout[key] ? "✓" : ""}</span>
                {label}
              </button>
            ))}
            <hr />
            <button type="button" role="menuitem" onClick={() => { onReset(); setOpen(false); }}>
              <span className="check" />
              Đặt lại bố cục “{WORKSPACES[state.active].label}”
            </button>
            <button type="button" role="menuitem" onClick={() => { onToggleTheme(); setOpen(false); }}>
              <span className="check" />
              {state.theme === "light" ? "Chế độ tối" : "Chế độ sáng"}
            </button>
            <button type="button" role="menuitem" onClick={() => { onOpenPalette(); setOpen(false); }}>
              <span className="check" />
              Bảng lệnh <kbd>Ctrl+K</kbd>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
