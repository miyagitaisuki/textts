// Trình soạn thảo kịch bản trực quan dạng Card/Block chuyên nghiệp (Script Editor)
import { EMOTIONS, SPEEDS, EMOTION_LABELS, SPEED_LABELS } from "./RolePanel.jsx";

// Hiệu ứng giọng theo câu ({fx=...} trong kịch bản)
export const FX_LABELS = {
  phone: "Qua điện thoại",
  whisper: "Thì thầm",
  far: "Ở xa / phòng bên",
  radio: "Loa thông báo",
  echo: "Phòng vang",
};
import { splitRuby, hasRuby } from "../lib/ruby.js";
import { indexIssues } from "../lib/library.js";
import {
  PlayIcon,
  PlusIcon,
  TrashIcon,
  CopyIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  SparklesIcon,
  ClockIcon,
  MusicIcon,
} from "./Icons.jsx";

const DEFAULT_ROLE_IDS = ["1", "2", "3"];

export default function LineTable({
  items = [],
  selectedId,
  roles = {},
  onSelect,
  onPatch,
  onMove,
  onDelete,
  onDuplicate,
  onInsertBelow,
  onPreview,
  suggestions = {},
  onApply,
  disabled,
  errorIds = [],
  issues = [],
}) {
  const issueOf = indexIssues(issues);
  const roleIds = Object.keys(roles).length ? Object.keys(roles) : DEFAULT_ROLE_IDS;

  if (!items.length) {
    return (
      <div className="script-empty-container">
        <p>Kịch bản đang trống. Hãy thêm câu thoại đầu tiên!</p>
      </div>
    );
  }

  return (
    <div className="script-blocks-container" role="feed" aria-label="Danh sách câu thoại">
      {items.map((it, idx) => {
        const isSelected = selectedId === it.id;
        const hasError = errorIds.includes(it.id) || issueOf[it.id]?.level === "error";
        const hasWarn = !hasError && issueOf[it.id]?.level === "warning";
        const tooltip = issueOf[it.id]?.message || it.id;

        if (it.type === "sfx") {
          return (
            <div
              key={it.id}
              id={`row-${it.id}`}
              title={tooltip}
              className={`script-card sfx-card ${isSelected ? "selected" : ""} ${
                hasError ? "error" : ""
              } ${hasWarn ? "warn" : ""}`}
              onClick={() => onSelect(it.id)}
            >
              <div className="card-badge sfx-badge">
                <MusicIcon size={14} />
                <span>SFX</span>
              </div>
              <div className="card-body sfx-body">
                <span className="sfx-label">Hiệu ứng âm thanh:</span>
                <code className="sfx-path">{it.path}</code>
                <label className="sfx-overlay" title="Phát chồng lên câu kế tiếp (vd. chuông reo khi đang nói), không chờ hết tiếng" onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" checked={Boolean(it.overlay)} disabled={disabled} onChange={(e) => onPatch(it.id, { overlay: e.target.checked })} />
                  Chồng lên câu sau
                </label>
              </div>
              <div className="card-actions">
                <CardActions
                  idx={idx}
                  total={items.length}
                  id={it.id}
                  onMove={onMove}
                  onDelete={onDelete}
                  onDuplicate={onDuplicate}
                  onInsertBelow={onInsertBelow}
                  disabled={disabled}
                />
              </div>
            </div>
          );
        }

        if (it.type === "bgm") {
          return (
            <div
              key={it.id}
              id={`row-${it.id}`}
              title={tooltip}
              className={`script-card sfx-card scene-card ${isSelected ? "selected" : ""} ${hasError ? "error" : ""} ${hasWarn ? "warn" : ""}`}
              onClick={() => onSelect(it.id)}
            >
              <div className="card-badge sfx-badge">
                <MusicIcon size={14} />
                <span>Cảnh</span>
              </div>
              <div className="card-body sfx-body">
                <span className="sfx-label">Âm nền từ đây:</span>
                {it.layers?.length ? (
                  it.layers.map((l) => (
                    <code key={l} className="sfx-path">
                      {l}
                    </code>
                  ))
                ) : (
                  <span className="muted">tắt âm nền</span>
                )}
              </div>
              <div className="card-actions">
                <CardActions
                  idx={idx}
                  total={items.length}
                  id={it.id}
                  onMove={onMove}
                  onDelete={onDelete}
                  onDuplicate={onDuplicate}
                  onInsertBelow={onInsertBelow}
                  disabled={disabled}
                />
              </div>
            </div>
          );
        }

        if (it.type === "pause") {
          return (
            <div
              key={it.id}
              id={`row-${it.id}`}
              title={tooltip}
              className={`script-card pause-card ${isSelected ? "selected" : ""} ${
                hasError ? "error" : ""
              } ${hasWarn ? "warn" : ""}`}
              onClick={() => onSelect(it.id)}
            >
              <div className="card-badge pause-badge">
                <ClockIcon size={14} />
                <span>Nghỉ</span>
              </div>
              <div className="card-body pause-body">
                <span>Khoảng lặng:</span>
                <div className="pause-input-group">
                  <input
                    type="number"
                    min={0}
                    step={100}
                    value={it.ms}
                    disabled={disabled}
                    onChange={(e) => onPatch(it.id, { ms: Number(e.target.value) })}
                  />
                  <span>ms</span>
                </div>
              </div>
              <div className="card-actions">
                <CardActions
                  idx={idx}
                  total={items.length}
                  id={it.id}
                  onMove={onMove}
                  onDelete={onDelete}
                  onDuplicate={onDuplicate}
                  onInsertBelow={onInsertBelow}
                  disabled={disabled}
                />
              </div>
            </div>
          );
        }

        // Dòng câu thoại (Speech line)
        const role = roles[it.role] || {};
        const roleName = role.name ? role.name : `Vai ${it.role}`;
        const suggestion = suggestions?.[it.id];

        return (
          <div
            key={it.id}
            id={`row-${it.id}`}
            title={tooltip}
            className={`script-card line-card role-border-${it.role} ${
              isSelected ? "selected" : ""
            } ${hasError ? "error" : ""} ${hasWarn ? "warn" : ""}`}
            onClick={() => onSelect(it.id)}
          >
            {/* Header câu thoại: Role Selector, ID, Emotion, Speed, Listen */}
            <div className="card-header">
              <div className="card-header-left">
                <span className="line-number-pill">{idx + 1}</span>
                <select
                  className={`role-select role-${it.role}`}
                  value={it.role}
                  disabled={disabled}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => onPatch(it.id, { role: e.target.value })}
                >
                  {roleIds.map((r) => (
                    <option key={r} value={r}>
                      [{r}] {roles[r]?.name ? roles[r].name : `Vai ${r}`}
                    </option>
                  ))}
                </select>

                <div className="card-tags">
                  <select
                    className={`tag-select ${it.attrs?.emotion ? "overridden" : "inherit"}`}
                    value={it.attrs?.emotion ?? ""}
                    disabled={disabled}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) =>
                      onPatch(it.id, { attrs: patchAttr(it, "emotion", e.target.value) })
                    }
                  >
                    <option value="">Cảm xúc: Mặc định</option>
                    {EMOTIONS.map((v) => (
                      <option key={v} value={v}>
                        {EMOTION_LABELS[v]}
                      </option>
                    ))}
                  </select>

                  <select
                    className={`tag-select ${it.attrs?.speed ? "overridden" : "inherit"}`}
                    value={it.attrs?.speed ?? ""}
                    disabled={disabled}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) =>
                      onPatch(it.id, { attrs: patchAttr(it, "speed", e.target.value) })
                    }
                  >
                    <option value="">Tốc độ: Mặc định</option>
                    {SPEEDS.map((v) => (
                      <option key={v} value={v}>
                        {SPEED_LABELS[v]}
                      </option>
                    ))}
                  </select>

                  <select
                    className={`tag-select ${it.attrs?.fx ? "overridden" : "inherit"}`}
                    value={it.attrs?.fx ?? ""}
                    disabled={disabled}
                    title="Hiệu ứng giọng của câu này"
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => onPatch(it.id, { attrs: patchAttr(it, "fx", e.target.value) })}
                  >
                    <option value="">Giọng: Bình thường</option>
                    {Object.entries(FX_LABELS).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>

                  <select
                    className={`tag-select ${it.attrs?.overlap ? "overridden" : "inherit"}`}
                    value={it.attrs?.overlap ?? ""}
                    disabled={disabled || idx === 0}
                    title="Nói chen: bắt đầu trước khi câu trước kết thúc"
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => onPatch(it.id, { attrs: patchAttr(it, "overlap", e.target.value) })}
                  >
                    <option value="">Nói chen: Không</option>
                    {[200, 400, 700, 1000].map((v) => (
                      <option key={v} value={String(v)}>
                        Chen {v} ms
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="card-header-right">
                <button
                  type="button"
                  className="preview-btn"
                  disabled={disabled}
                  onClick={(e) => {
                    e.stopPropagation();
                    onPreview(it.id);
                  }}
                  title="Nghe thử câu này"
                >
                  <PlayIcon size={12} />
                  <span>Nghe thử</span>
                </button>

                <CardActions
                  idx={idx}
                  total={items.length}
                  id={it.id}
                  onMove={onMove}
                  onDelete={onDelete}
                  onDuplicate={onDuplicate}
                  onInsertBelow={onInsertBelow}
                  disabled={disabled}
                />
              </div>
            </div>

            {/* Nội dung câu thoại */}
            <div className="card-content-area">
              {/* Hiển thị Furigana trực quan nếu có chú âm */}
              {hasRuby(it.display) && (
                <div className="furigana-live-badge">
                  {renderRubyElements(it.display)}
                </div>
              )}

              <div className="text-input-wrap">
                {hasError && <span className="flag error-flag" title={tooltip}>✕</span>}
                {hasWarn && <span className="flag warn-flag" title={tooltip}>⚠</span>}
                {/* Ô nhiều dòng tự giãn theo nội dung để soạn đoạn văn dài; vẫn là MỘT câu thoại nên không cho xuống dòng. */}
                <textarea
                  className="speech-text-input"
                  rows={1}
                  value={it.display}
                  disabled={disabled}
                  placeholder="Nhập câu thoại tiếng Nhật (ví dụ: すみません、駅{えき}はどこですか)..."
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.preventDefault();
                  }}
                  onChange={(e) => onPatch(it.id, { display: e.target.value.replace(/[\r\n]+/g, "") })}
                />
              </div>

              {/* Bản dịch: dùng cho bản song ngữ (đọc sau câu) và cột Dịch trên phiếu học tập */}
              <input
                className="translation-input"
                value={it.translation || ""}
                disabled={disabled}
                placeholder="Bản dịch tiếng Việt (không bắt buộc, dùng cho bản song ngữ và phiếu học tập)"
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => onPatch(it.id, { translation: e.target.value })}
                aria-label={`Bản dịch câu ${it.id}`}
              />

              {/* Gợi ý Furigana từ OpenJTalk */}
              {suggestion && (
                <div className="suggestion-banner">
                  <span className="suggestion-label">
                    <SparklesIcon size={13} /> Gợi ý Furigana:
                  </span>
                  <span className="suggestion-text">{suggestion.annotated}</span>
                  {suggestion.annotated !== it.display && (
                    <button
                      type="button"
                      className="apply-suggestion-btn"
                      disabled={disabled}
                      onClick={(e) => {
                        e.stopPropagation();
                        onApply(it.id);
                      }}
                      title="Áp dụng cách đọc này vào câu thoại"
                    >
                      Áp dụng
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CardActions({ idx, total, id, onMove, onDelete, onDuplicate, onInsertBelow, disabled }) {
  return (
    <div className="card-action-bar" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        className="icon-action-btn"
        disabled={disabled || idx === 0}
        onClick={() => onMove(id, -1)}
        title="Di chuyển lên trên"
      >
        <ArrowUpIcon size={14} />
      </button>
      <button
        type="button"
        className="icon-action-btn"
        disabled={disabled || idx >= total - 1}
        onClick={() => onMove(id, 1)}
        title="Di chuyển xuống dưới"
      >
        <ArrowDownIcon size={14} />
      </button>
      <button
        type="button"
        className="icon-action-btn"
        disabled={disabled}
        onClick={() => onDuplicate?.(id)}
        title="Nhân bản câu này"
      >
        <CopyIcon size={14} />
      </button>
      <button
        type="button"
        className="icon-action-btn add-below-btn"
        disabled={disabled}
        onClick={() => onInsertBelow?.(id)}
        title="Chèn câu mới phía dưới"
      >
        <PlusIcon size={14} />
      </button>
      <button
        type="button"
        className="icon-action-btn delete-btn"
        disabled={disabled}
        onClick={() => onDelete(id)}
        title="Xóa câu này"
      >
        <TrashIcon size={14} />
      </button>
    </div>
  );
}

function patchAttr(it, key, value) {
  const next = { ...(it.attrs || {}) };
  if (!value) delete next[key];
  else next[key] = value;
  return next;
}

function renderRubyElements(text = "") {
  return splitRuby(text).map((p) =>
    typeof p === "string" ? p : (
      <ruby key={p.index}>
        {p.base}
        <rt>{p.reading}</rt>
      </ruby>
    ),
  );
}
