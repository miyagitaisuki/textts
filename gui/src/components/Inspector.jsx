import { useState } from "react";
import { splitRuby, toTtsText } from "../lib/ruby.js";
import TimingPanel from "./TimingPanel.jsx";
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
  engine,
  onChangeEngine,
  onSampleVoice,
  sampling,
  timing,
  onChangeTiming,
  recorder,
  library,
  output,
  tab,
  onTabChange,
  exportPanel = null,
  onOpenVoiceBank,
}) {
  // Tab có thể do workspace điều khiển (tab/onTabChange); không truyền thì tự giữ trạng thái.
  const [ownTab, setOwnTab] = useState("roles"); // "roles" | "mixer" | "line" | "export"
  const activeTab = tab ?? ownTab;
  const setActiveTab = (t) => (onTabChange ? onTabChange(t) : setOwnTab(t));

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
          <span>Vai ({roleList.length})</span>
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
        {exportPanel && (
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "export"}
            className={`inspector-tab ${activeTab === "export" ? "active" : ""}`}
            onClick={() => setActiveTab("export")}
            title="Tùy chọn xuất file"
          >
            <span>Xuất bản</span>
          </button>
        )}
      </div>

      <div className="inspector-content">
        {activeTab === "export" && exportPanel && <div className="tab-pane">{exportPanel}</div>}

        {activeTab === "roles" && (
          <div className="tab-pane">
            <RolePanel
              roles={roles}
              onChange={onChangeRole}
              onAddRole={onAddRole}
              onDeleteRole={onDeleteRole}
              disabled={disabled}
              voices={voices}
              engine={engine}
              onChangeEngine={onChangeEngine}
              onSampleVoice={onSampleVoice}
              sampling={sampling}
              recorder={recorder}
              library={library}
              onOpenVoiceBank={onOpenVoiceBank}
            />
          </div>
        )}

        {activeTab === "mixer" && (
          <div className="tab-pane">
            <Mixer roles={roles} onChange={onChangeRole} disabled={disabled} />
            {onChangeTiming && <TimingPanel timing={timing} onChange={onChangeTiming} disabled={disabled} />}
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

                {selectedItem.display && (
                  <div className="field-group">
                    <label>Chuỗi đọc gửi sang engine (Kana/TTS Text):</label>
                    <div className="tts-text-preview">{toTtsText(selectedItem.display)}</div>
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
  return splitRuby(text).map((p) =>
    typeof p === "string" ? p : (
      <ruby key={p.index}>
        {p.base}
        <rt>{p.reading}</rt>
      </ruby>
    ),
  );
}
