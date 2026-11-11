// Thanh ribbon kiểu Microsoft Word: một dòng tab (kèm thanh truy cập nhanh) và thân ribbon
// chia thành các nhóm có nhãn. Có thể thu gọn thân ribbon (bấm đúp vào tab hoặc nút mũi tên).
import { useEffect, useState } from "react";
import { ChevronDownIcon, ChevronUpIcon } from "./Icons.jsx";

const STORE_KEY = "textts.ribbon";

function loadPrefs() {
  try {
    return JSON.parse(window.localStorage?.getItem(STORE_KEY) ?? "{}") ?? {};
  } catch {
    return {};
  }
}

// Nút trong ribbon: size "large" (biểu tượng trên, chữ dưới) hoặc "small" (biểu tượng cạnh chữ).
export function RibbonButton({ icon, label, onClick, disabled, title, size = "large", active, primary, ...rest }) {
  const cls = ["ribbon-btn", size, active ? "active" : "", primary ? "primary" : ""].filter(Boolean).join(" ");
  return (
    <button type="button" className={cls} onClick={onClick} disabled={disabled} title={title ?? label} {...rest}>
      {icon && <span className="ribbon-btn-icon">{icon}</span>}
      <span className="ribbon-btn-label">{label}</span>
    </button>
  );
}

// Nhóm trong một tab: các nút xếp ngang, nhãn nhóm ở dưới.
export function RibbonGroup({ label, children }) {
  return (
    <div className="ribbon-group" role="group" aria-label={label}>
      <div className="ribbon-group-items">{children}</div>
      <div className="ribbon-group-label">{label}</div>
    </div>
  );
}

// tabs: [{ id, label, content }]; quickAccess / status: nội dung hiển thị cạnh dòng tab.
export default function Ribbon({ brand, quickAccess, tabs, status }) {
  const prefs = loadPrefs();
  const [active, setActive] = useState(tabs.some((t) => t.id === prefs.tab) ? prefs.tab : tabs[0]?.id);
  const [collapsed, setCollapsed] = useState(Boolean(prefs.collapsed));
  // Khi ribbon thu gọn, bấm vào tab sẽ mở tạm thân ribbon đến khi chọn lệnh hoặc bấm lại.
  const [peek, setPeek] = useState(false);

  useEffect(() => {
    try {
      window.localStorage?.setItem(STORE_KEY, JSON.stringify({ tab: active, collapsed }));
    } catch {
      // Bỏ qua nếu không lưu được
    }
  }, [active, collapsed]);

  const current = tabs.find((t) => t.id === active) ?? tabs[0];
  const showBody = !collapsed || peek;

  return (
    <header className={`ribbon ${collapsed ? "collapsed" : ""}`}>
      <div className="ribbon-bar">
        {brand}
        {quickAccess && <div className="ribbon-qat">{quickAccess}</div>}
        <nav className="ribbon-tabs" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={t.id === current?.id}
              className={`ribbon-tab ${t.id === current?.id ? "active" : ""}`}
              onClick={() => {
                if (collapsed) setPeek((p) => (t.id === current?.id ? !p : true));
                setActive(t.id);
              }}
              onDoubleClick={() => {
                setCollapsed((c) => !c);
                setPeek(false);
              }}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <span className="nav-spacer" />
        {status && <div className="ribbon-status">{status}</div>}
        <button
          type="button"
          className="ribbon-collapse"
          onClick={() => {
            setCollapsed((c) => !c);
            setPeek(false);
          }}
          title={collapsed ? "Ghim ribbon (hiện đầy đủ)" : "Thu gọn ribbon (chỉ hiện tên tab)"}
          aria-label={collapsed ? "Mở rộng ribbon" : "Thu gọn ribbon"}
        >
          {collapsed ? <ChevronDownIcon size={14} /> : <ChevronUpIcon size={14} />}
        </button>
      </div>
      {showBody && current && (
        <div
          className={`ribbon-body ${peek ? "peek" : ""}`}
          role="tabpanel"
          onClick={(e) => {
            if (peek && e.target.closest("button")) setPeek(false);
          }}
        >
          {current.content}
        </div>
      )}
    </header>
  );
}
