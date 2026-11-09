// Bảng câu thoại: sửa chữ, vai, cảm xúc/tốc độ riêng của câu; thêm, xóa, đổi thứ tự, nghe thử.
import { EMOTIONS, SPEEDS, EMOTION_LABELS, SPEED_LABELS } from "./RolePanel.jsx";
import { indexIssues } from "../lib/library.js";

const DEFAULT_ROLE_IDS = ["1", "2", "3"];

export default function LineTable({
  items,
  selectedId,
  roles = {},
  onSelect,
  onPatch,
  onMove,
  onDelete,
  onDuplicate,
  onInsertBelow,
  onPreview,
  suggestions,
  onApply,
  disabled,
  errorIds = [],
  issues = [],
}) {
  const issueOf = indexIssues(issues);
  const roleIds = Object.keys(roles).length ? Object.keys(roles) : DEFAULT_ROLE_IDS;

  return (
    <table className="lines">
      <thead>
        <tr>
          <th title="Nhân vật nói câu này. Đổi vai để đổi giọng.">Vai</th>
          <th title={"Nội dung câu. Viết 漢字{かな} để chỉ cách đọc chữ Hán."}>Câu thoại</th>
          <th title="Cách đọc kana dự đoán. Bấm “Áp dụng” để ghi vào ô câu thoại.">Cách đọc (gợi ý)</th>
          <th title="Cảm xúc riêng cho câu này. “theo vai” = dùng cảm xúc của vai.">Cảm xúc</th>
          <th title="Tốc độ riêng cho câu này. “theo vai” = dùng tốc độ của vai.">Tốc độ</th>
          <th title="Nghe thử, sắp xếp và xóa câu">Thao tác</th>
        </tr>
      </thead>
      <tbody>
        {items.length === 0 && (
          <tr className="empty-row">
            <td colSpan={6}>Kịch bản chưa có câu nào. Bấm “+ Câu thoại” phía trên để thêm, hoặc nhập lại từ file .txt.</td>
          </tr>
        )}
        {items.map((it, idx) =>
          it.type === "sfx" ? (
            <tr key={it.id} className="sfx">
              <td colSpan={5}>
                Hiệu ứng (SFX): <code>{it.path}</code>
              </td>
              <td>
                <RowActions
                  idx={idx}
                  total={items.length}
                  id={it.id}
                  onMove={onMove}
                  onDelete={onDelete}
                  onDuplicate={onDuplicate}
                  onInsertBelow={onInsertBelow}
                  disabled={disabled}
                />
              </td>
            </tr>
          ) : it.type === "pause" ? (
            <tr key={it.id} className="pause">
              <td colSpan={2}>
                Nghỉ{" "}
                <input
                  type="number"
                  min={0}
                  step={100}
                  value={it.ms}
                  disabled={disabled}
                  onChange={(e) => onPatch(it.id, { ms: Number(e.target.value) })}
                />{" "}
                ms
              </td>
              <td colSpan={3}></td>
              <td>
                <RowActions
                  idx={idx}
                  total={items.length}
                  id={it.id}
                  onMove={onMove}
                  onDelete={onDelete}
                  onDuplicate={onDuplicate}
                  onInsertBelow={onInsertBelow}
                  disabled={disabled}
                />
              </td>
            </tr>
          ) : (
            <tr
              key={it.id}
              id={`row-${it.id}`}
              title={issueOf[it.id]?.message || it.id}
              className={[
                selectedId === it.id ? "selected" : "",
                errorIds.includes(it.id) || issueOf[it.id]?.level === "error" ? "error" : "",
                !errorIds.includes(it.id) && issueOf[it.id]?.level === "warning" ? "warn" : "",
              ]
                .join(" ")
                .trim()}
              onClick={() => onSelect(it.id)}
            >
              <td>
                <select
                  className={`role-${it.role}`}
                  value={it.role}
                  disabled={disabled}
                  onChange={(e) => onPatch(it.id, { role: e.target.value })}
                >
                  {roleIds.map((r) => (
                    <option key={r} value={r}>
                      [{r}] {roles[r]?.name ? roles[r].name : `Vai ${r}`}
                    </option>
                  ))}
                </select>
              </td>
              <td className="text-cell">
                <div className="text-field">
                  {errorIds.includes(it.id) || issueOf[it.id]?.level === "error" ? (
                    <span className="flag error-flag" aria-label="Lỗi">
                      ✕
                    </span>
                  ) : issueOf[it.id]?.level === "warning" ? (
                    <span className="flag warn-flag" aria-label="Cảnh báo">
                      ⚠
                    </span>
                  ) : null}
                  <input
                    className="text"
                    value={it.display}
                    disabled={disabled}
                    onChange={(e) => onPatch(it.id, { display: e.target.value })}
                  />
                </div>
              </td>
              <td className="reading">
                <SuggestionCell
                  suggestion={suggestions?.[it.id]}
                  display={it.display}
                  disabled={disabled}
                  onApply={() => onApply(it.id)}
                />
              </td>
              <td>
                <select
                  className={it.attrs?.emotion ? "" : "inherit"}
                  value={it.attrs?.emotion ?? ""}
                  disabled={disabled}
                  onChange={(e) =>
                    onPatch(it.id, { attrs: patchAttr(it, "emotion", e.target.value) })
                  }
                >
                  <option value="">theo vai</option>
                  {EMOTIONS.map((v) => (
                    <option key={v} value={v}>
                      {EMOTION_LABELS[v]}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <select
                  className={it.attrs?.speed ? "" : "inherit"}
                  value={it.attrs?.speed ?? ""}
                  disabled={disabled}
                  onChange={(e) => onPatch(it.id, { attrs: patchAttr(it, "speed", e.target.value) })}
                >
                  <option value="">theo vai</option>
                  {SPEEDS.map((v) => (
                    <option key={v} value={v}>
                      {SPEED_LABELS[v]}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <button
                  className="ghost"
                  disabled={disabled}
                  onClick={(e) => {
                    e.stopPropagation();
                    onPreview(it.id);
                  }}
                  title="Nghe thử câu này"
                >
                  ▶ Nghe
                </button>
                <RowActions
                  idx={idx}
                  total={items.length}
                  id={it.id}
                  onMove={onMove}
                  onDelete={onDelete}
                  onDuplicate={onDuplicate}
                  onInsertBelow={onInsertBelow}
                  disabled={disabled}
                />
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

function RowActions({ idx, total, id, onMove, onDelete, onDuplicate, onInsertBelow, disabled }) {
  return (
    <span className="row-actions" onClick={(e) => e.stopPropagation()}>
      {onInsertBelow && (
        <button
          className="ghost"
          disabled={disabled}
          onClick={() => onInsertBelow(id)}
          title="Chèn câu phía dưới"
        >
          +
        </button>
      )}
      {onDuplicate && (
        <button
          className="ghost"
          disabled={disabled}
          onClick={() => onDuplicate(id)}
          title="Nhân bản câu này"
        >
          ⧉
        </button>
      )}
      <button
        className="ghost"
        disabled={disabled || idx === 0}
        onClick={() => onMove(id, -1)}
        title="Dời lên"
      >
        ↑
      </button>
      <button
        className="ghost"
        disabled={disabled || idx === total - 1}
        onClick={() => onMove(id, 1)}
        title="Dời xuống"
      >
        ↓
      </button>
      <button
        className="ghost danger"
        disabled={disabled}
        onClick={() => onDelete(id)}
        title="Xóa dòng"
      >
        ✕
      </button>
    </span>
  );
}
