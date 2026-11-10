import { useState } from "react";
import RolePanel from "./RolePanel.jsx";
import Mixer from "./Mixer.jsx";
import { UsersIcon, SlidersIcon, InfoIcon, ClockIcon } from "./Icons.jsx";

export default function Inspector({
  roles = {},
  selectedItem = null,
  onChangeRole,
  onAddRole,
  onDeleteRole,
  onPatchSelectedItem,
  disabled,
  voices = [],
  recorder,
  library,
  output,
}) {
  const [activeTab, setActiveTab] = useState("roles"); // "roles" | "mixer" | "line"

  const roleList = Object.keys(roles);

  return (
    <aside className="studio-inspector">
      <div className="inspector-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "roles"}
          className={`inspector-tab ${activeTab === "roles" ? "active" : ""}`}
          onClick={() => setActiveTab("roles")}
          title="Quản lý nhân vật và giọng nói"
        >
          <UsersIcon size={14} />
          <span>Nhân vật ({roleList.length})</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "mixer"}
          className={`inspector-tab ${activeTab === "mixer" ? "active" : ""}`}
          onClick={() => setActiveTab("mixer")}
          title="Bộ trộn âm thanh & VU Meter"
        >
          <SlidersIcon size={14} />
          <span>Mixer</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "line"}
          className={`inspector-tab ${activeTab === "line" ? "active" : ""}`}
          onClick={() => setActiveTab("line")}
          title="Chi tiết câu thoại đang chọn"
        >
          <InfoIcon size={14} />
          <span>Chi tiết {selectedItem ? `[${selectedItem.id}]` : ""}</span>
        </button>
      </div>

      <div className="inspector-content">
        {activeTab === "roles" && (
          <div className="tab-pane">
            <RolePanel
              roles={roles}
              onChange={onChangeRole}
              onAddRole={onAddRole}
              onDeleteRole={onDeleteRole}
              disabled={disabled}
              voices={voices}
              recorder={recorder}
              library={library}
            />
          </div>
        )}

        {activeTab === "mixer" && (
          <div className="tab-pane">
            <Mixer roles={roles} onChange={onChangeRole} disabled={disabled} />
            {output?.timeline?.duration_ms && (
              <div className="mixer-meta">
                <div className="meta-row">
                  <span>Tổng thời lượng:</span>
                  <strong>{(output.timeline.duration_ms / 1000).toFixed(2)}s</strong>
                </div>
                <div className="meta-row">
                  <span>Số đoạn âm:</span>
                  <strong>{output.timeline.items?.length || 0} mục</strong>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "line" && (
          <div className="tab-pane line-inspector-pane">
            {!selectedItem ? (
              <div className="inspector-empty">
                <p>Nhấp chọn một câu thoại trong kịch bản để xem và chỉnh sửa thông số chi tiết.</p>
              </div>
            ) : selectedItem.type === "pause" ? (
              <div className="line-details-card">
                <h3>Khoảng nghỉ [{selectedItem.id}]</h3>
                <div className="field-group">
                  <label>Thời lượng nghỉ (ms):</label>
                  <input
                    type="number"
                    min={0}
                    step={100}
                    value={selectedItem.ms || 0}
                    disabled={disabled}
                    onChange={(e) => onPatchSelectedItem({ ms: Number(e.target.value) })}
                  />
                </div>
              </div>
            ) : selectedItem.type === "sfx" ? (
              <div className="line-details-card">
                <h3>Hiệu ứng âm thanh SFX [{selectedItem.id}]</h3>
                <div className="field-group">
                  <label>Đường dẫn file:</label>
                  <code>{selectedItem.path}</code>
                </div>
              </div>
            ) : (
              <div className="line-details-card">
                <div className="line-card-header">
                  <h3>Câu thoại [{selectedItem.id}]</h3>
                  <span className={`badge-role role-${selectedItem.role}`}>
                    [{selectedItem.role}] {roles[selectedItem.role]?.name || `Vai ${selectedItem.role}`}
                  </span>
                </div>

                <div className="field-group">
                  <label>Văn bản hiển thị:</label>
                  <div className="ruby-preview-box">
                    {renderFuriganaHtml(selectedItem.display)}
                  </div>
                </div>

                <div className="field-group">
                  <label>Chờ thêm trước câu (Delay ms):</label>
                  <input
                    type="number"
                    min={0}
                    step={50}
                    placeholder="0"
                    value={selectedItem.delay_ms || 0}
                    disabled={disabled}
                    onChange={(e) =>
                      onPatchSelectedItem({ delay_ms: Math.max(0, Number(e.target.value)) })
                    }
                  />
                  <small className="hint">Chèn khoảng lặng riêng trước khi bắt đầu nói câu này.</small>
                </div>

                {selectedItem.tts_text && (
                  <div className="field-group">
                    <label>Chuỗi đọc gửi sang engine (Kana/TTS Text):</label>
                    <div className="tts-text-preview">{selectedItem.tts_text}</div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

function renderFuriganaHtml(text = "") {
  if (!text) return <span className="muted">— trống —</span>;
  // Parse ruby regex
  const parts = [];
  const RUBY_RE = /([一-鿿々]+)\{([぀-ヿー]+)\}/g;
  let last = 0;
  let match;
  while ((match = RUBY_RE.exec(text)) !== null) {
    if (match.index > last) {
      parts.push(text.slice(last, match.index));
    }
    parts.push(
      <ruby key={match.index}>
        {match[1]}
        <rt>{match[2]}</rt>
      </ruby>
    );
    last = RUBY_RE.lastIndex;
  }
  if (last < text.length) {
    parts.push(text.slice(last));
  }
  return parts;
}
