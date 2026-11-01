// Bảng câu thoại: sửa chữ, vai, cảm xúc/tốc độ riêng của câu; thêm, xóa, đổi thứ tự, nghe thử.
import { EMOTIONS, SPEEDS } from "./RolePanel.jsx";

const ROLE_IDS = ["1", "2", "3"];

export default function LineTable({
  items, selectedId, onSelect, onPatch, onMove, onDelete, onPreview, suggestions, onApply, disabled,
  errorIds = [], issues = [],
}) {
  // Gộp các cảnh báo/lỗi kiểm tra theo mã câu: mức nặng nhất thắng.
  const issueOf = {};
  for (const i of issues) {
    const prev = issueOf[i.id];
    if (!prev || i.level === "error") issueOf[i.id] = i;
    else if (prev.level === "warning" && i.level === "warning") issueOf[i.id] = { ...prev, message: `${prev.message}; ${i.message}` };
  }
  return (
    <table className="lines">
      <thead>
        <tr>
          <th>ID</th>
          <th>Vai</th>
          <th>Câu thoại (漢字{"{かな}"} để ép cách đọc)</th>
          <th>Gợi ý đọc</th>
          <th>Cảm xúc</th>
          <th>Tốc độ</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {items.map((it, idx) =>
          it.type === "sfx" ? (
            <tr key={it.id} className="sfx">
              <td>{it.id}</td>
              <td colSpan={5}>Hiệu ứng: <code>{it.path}</code></td>
              <td>
                <RowActions idx={idx} total={items.length} id={it.id}
                  onMove={onMove} onDelete={onDelete} disabled={disabled} />
              </td>
            </tr>
          ) : it.type === "pause" ? (
            <tr key={it.id} className="pause">
              <td>{it.id}</td>
              <td colSpan={2}>
                Nghỉ{" "}
                <input type="number" min={0} value={it.ms} disabled={disabled}
                  onChange={(e) => onPatch(it.id, { ms: Number(e.target.value) })} /> ms
              </td>
              <td colSpan={4}>
                <RowActions idx={idx} total={items.length} id={it.id}
                  onMove={onMove} onDelete={onDelete} disabled={disabled} />
              </td>
            </tr>
          ) : (
            <tr key={it.id} id={`row-${it.id}`} title={issueOf[it.id]?.message ?? ""}
              className={[
                selectedId === it.id ? "selected" : "",
                errorIds.includes(it.id) || issueOf[it.id]?.level === "error" ? "error" : "",
                !errorIds.includes(it.id) && issueOf[it.id]?.level === "warning" ? "warn" : "",
              ].join(" ").trim()}
              onClick={() => onSelect(it.id)}>
              <td>{it.id}</td>
              <td>
                <select className={`role-${it.role}`} value={it.role} disabled={disabled}
                  onChange={(e) => onPatch(it.id, { role: e.target.value })}>
                  {ROLE_IDS.map((r) => <option key={r} value={r}>[{r}]</option>)}
                </select>
              </td>
              <td>
                <input className="text" value={it.display} disabled={disabled}
                  onChange={(e) => onPatch(it.id, { display: e.target.value })} />
              </td>
              <td className="reading">
                <SuggestionCell
                  suggestion={suggestions?.[it.id]}
                  display={it.display}
                  disabled={disabled}
                  onApply={() => onApply(it.id)} />
              </td>
              <td>
                <select value={it.attrs?.emotion ?? ""} disabled={disabled}
                  onChange={(e) => onPatch(it.id, { attrs: patchAttr(it, "emotion", e.target.value) })}>
                  <option value="">theo vai</option>
                  {EMOTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              </td>
              <td>
                <select value={it.attrs?.speed ?? ""} disabled={disabled}
                  onChange={(e) => onPatch(it.id, { attrs: patchAttr(it, "speed", e.target.value) })}>
                  <option value="">theo vai</option>
                  {SPEEDS.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              </td>
              <td>
                <button className="ghost" disabled={disabled}
                  onClick={(e) => { e.stopPropagation(); onPreview(it.id); }}>▶ Nghe</button>
                <RowActions idx={idx} total={items.length} id={it.id}
                  onMove={onMove} onDelete={onDelete} disabled={disabled} />
              </td>
            </tr>
          )
        )}
      </tbody>
    </table>
  );
}

function SuggestionCell({ suggestion, display, disabled, onApply }) {
  if (!suggestion) return <span className="muted">—</span>;
  const canApply = suggestion.annotated !== display;
  return (
    <span className="suggest" onClick={(e) => e.stopPropagation()}>
      <span className="muted">{suggestion.reading}</span>
      {canApply && (
        <button className="ghost" disabled={disabled} onClick={onApply} title={suggestion.annotated}>
          Áp dụng
        </button>
      )}
    </span>
  );
}

function patchAttr(item, key, value) {
  const attrs = { ...(item.attrs || {}) };
  if (value === "") delete attrs[key];
  else attrs[key] = value;
  return attrs;
}

function RowActions({ idx, total, id, onMove, onDelete, disabled }) {
  return (
    <span className="row-actions" onClick={(e) => e.stopPropagation()}>
      <button className="ghost" disabled={disabled || idx === 0} onClick={() => onMove(id, -1)}>↑</button>
      <button className="ghost" disabled={disabled || idx === total - 1} onClick={() => onMove(id, 1)}>↓</button>
      <button className="ghost danger" disabled={disabled} onClick={() => onDelete(id)}>✕</button>
    </span>
  );
}
