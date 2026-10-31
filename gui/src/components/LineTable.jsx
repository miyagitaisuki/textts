// Bảng câu thoại: sửa chữ, vai, cảm xúc/tốc độ riêng của câu; thêm, xóa, đổi thứ tự, nghe thử.
import { EMOTIONS, SPEEDS } from "./RolePanel.jsx";

const ROLE_IDS = ["1", "2", "3"];

export default function LineTable({
  items, selectedId, onSelect, onPatch, onMove, onDelete, onPreview, disabled,
}) {
  return (
    <table className="lines">
      <thead>
        <tr>
          <th>ID</th>
          <th>Vai</th>
          <th>Câu thoại (漢字{"{かな}"} để ép cách đọc)</th>
          <th>Cảm xúc</th>
          <th>Tốc độ</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {items.map((it, idx) =>
          it.type === "pause" ? (
            <tr key={it.id} className="pause">
              <td>{it.id}</td>
              <td colSpan={2}>
                Nghỉ{" "}
                <input type="number" min={0} value={it.ms} disabled={disabled}
                  onChange={(e) => onPatch(it.id, { ms: Number(e.target.value) })} /> ms
              </td>
              <td colSpan={3}>
                <RowActions idx={idx} total={items.length} id={it.id}
                  onMove={onMove} onDelete={onDelete} disabled={disabled} />
              </td>
            </tr>
          ) : (
            <tr key={it.id} className={selectedId === it.id ? "selected" : ""}
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
