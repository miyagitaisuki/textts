// Hộp thoại Hướng dẫn sử dụng & Giới thiệu (About & Help Dialog)
// Hướng dẫn chi tiết về: Chạy riêng lẻ (CLI), Kết nối với AI, Cú pháp kịch bản và Thông tin phiên bản.
import { useEffect, useState } from "react";

const MCP_CONFIG_EXAMPLE = `{
  "mcpServers": {
    "textts": {
      "command": "C:\\\\Users\\\\<tên>\\\\AppData\\\\Local\\\\Programs\\\\textts-gui\\\\resources\\\\python\\\\python.exe",
      "args": ["C:\\\\Users\\\\<tên>\\\\AppData\\\\Local\\\\Programs\\\\textts-gui\\\\resources\\\\engine\\\\ai_tools\\\\mcp_server.py"]
    }
  }
}`;

export default function AboutDialog({ onClose, docsUrl, apiRunning, onToggleApi }) {
  const [activeTab, setActiveTab] = useState("cli");
  const [copiedKey, setCopiedKey] = useState("");
  // Cấu hình MCP cho Claude Desktop với đúng đường dẫn Python và mcp_server.py trên máy này.
  const [mcpConfig, setMcpConfig] = useState(MCP_CONFIG_EXAMPLE);

  useEffect(() => {
    window.textts?.getMcpConfig?.().then((cfg) => cfg && setMcpConfig(cfg));
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function copyCode(text, key) {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(""), 2000);
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal about-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Hướng dẫn & Giới thiệu textts"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="about-header">
          <div className="about-title-row">
            <h2>textts — Hướng dẫn & Giới thiệu</h2>
            <button className="ghost close-btn" onClick={onClose} aria-label="Đóng">✕</button>
          </div>
          <div className="about-tabs" role="tablist">
            <button
              className={`about-tab ${activeTab === "cli" ? "active" : ""}`}
              onClick={() => setActiveTab("cli")}
              role="tab"
              aria-selected={activeTab === "cli"}
            >
              🖥 Chạy riêng lẻ (CLI)
            </button>
            <button
              className={`about-tab ${activeTab === "ai" ? "active" : ""}`}
              onClick={() => setActiveTab("ai")}
              role="tab"
              aria-selected={activeTab === "ai"}
            >
              🤖 Kết nối với AI
            </button>
            <button
              className={`about-tab ${activeTab === "syntax" ? "active" : ""}`}
              onClick={() => setActiveTab("syntax")}
              role="tab"
              aria-selected={activeTab === "syntax"}
            >
              📝 Cú pháp & Furigana
            </button>
            <button
              className={`about-tab ${activeTab === "about" ? "active" : ""}`}
              onClick={() => setActiveTab("about")}
              role="tab"
              aria-selected={activeTab === "about"}
            >
              ℹ Về textts
            </button>
          </div>
        </div>

        <div className="about-body">
          {activeTab === "cli" && (
            <div className="tab-pane">
              <h3>Chạy textts bằng dòng lệnh (Không cần GUI)</h3>
              <p className="muted">
                Bạn có thể tự động hóa toàn bộ quy trình tổng hợp bài học tiếng Nhật bằng cách gọi trực tiếp lệnh CLI <code>tts.py</code> từ Terminal hoặc file batch.
              </p>

              <div className="guide-section">
                <h4>1. Lệnh cơ bản</h4>
                <div className="code-block">
                  <pre>
{`# 1. Kiểm tra kế hoạch đọc (Dry run không tốn thời gian gọi API):
python tts.py kịch_bản.txt --dry-run

# 2. Tạo file âm thanh MP3 hoàn chỉnh kèm phụ đề .srt:
python tts.py kịch_bản.txt -o output/bai_hoc.mp3 --srt`}
                  </pre>
                  <button
                    className="copy-btn"
                    onClick={() => copyCode("python tts.py kịch_bản.txt -o output/bai_hoc.mp3 --srt", "basic")}
                  >
                    {copiedKey === "basic" ? "✓ Đã chép" : "Sao chép"}
                  </button>
                </div>
              </div>

              <div className="guide-section">
                <h4>2. Các tùy chọn xuất tài liệu dạy học chuyên nghiệp</h4>
                <ul className="guide-list">
                  <li>
                    <code>--srt</code>: Tự động xuất file phụ đề <code>.srt</code> đồng bộ theo từng câu thoại.
                  </li>
                  <li>
                    <code>--slow</code>: Tạo thêm một bản đọc chậm tốc độ 0.8× (giữ nguyên cao độ) và phụ đề tương ứng <code>_slow.srt</code> để học viên luyện nghe.
                  </li>
                  <li>
                    <code>--role-play &lt;VAI&gt;</code>: Chế độ luyện nói nhập vai: chỉ phát lời thoại của vai chỉ định, các vai khác biến thành khoảng lặng có cùng độ dài để học viên nói vào.
                  </li>
                  <li>
                    <code>--shadow</code>: Chế độ Shadowing: sau mỗi câu thoại tự động chèn khoảng lặng bằng độ dài câu + 1.5s để học viên lặp lại.
                  </li>
                  <li>
                    <code>--worksheet &lt;file.html&gt;</code>: Xuất phiếu học tập HTML có chú âm Furigana chuẩn (thẻ <code>&lt;ruby&gt;</code>) dùng để in ra phát cho lớp.
                  </li>
                  <li>
                    <code>--export-lines &lt;thư_mục&gt;</code>: Tách và xuất từng câu thoại thành từng file riêng biệt (ví dụ <code>L001_vai1.mp3</code>).
                  </li>
                  <li>
                    <code>--preview &lt;MÃ_CÂU&gt;</code>: Chỉ tổng hợp và nghe thử riêng 1 câu (ví dụ <code>--preview L002 -o test.mp3</code>).
                  </li>
                  <li>
                    <code>--lufs &lt;MỨC&gt;</code>: Chuẩn hóa độ to tích hợp theo tiêu chuẩn phát thanh (khuyên dùng <code>--lufs -16</code>).
                  </li>
                  <li>
                    <code>--bgm &lt;file_nhạc&gt; --bgm-db -18</code>: Lặp và trộn nhạc nền dưới giọng nói với âm lượng nhỏ hơn lời thoại 18 dB.
                  </li>
                  <li>
                    <code>--batch &lt;thư_mục&gt; --outdir &lt;thư_mục&gt;</code>: Xử lý hàng loạt toàn bộ file kịch bản <code>.txt</code> trong một thư mục.
                  </li>
                </ul>
              </div>

              <div className="guide-section">
                <h4>3. Ví dụ lệnh xuất trọn gói bài học</h4>
                <div className="code-block">
                  <pre>
{`python tts.py examples/minna_bai10_hoi_duong.txt \\
  -o output/bai10.mp3 \\
  --srt \\
  --slow \\
  --lufs -16 \\
  --worksheet output/bai10_phieu_in.html`}
                  </pre>
                  <button
                    className="copy-btn"
                    onClick={() =>
                      copyCode(
                        "python tts.py examples/minna_bai10_hoi_duong.txt -o output/bai10.mp3 --srt --slow --lufs -16 --worksheet output/bai10_phieu_in.html",
                        "full"
                      )
                    }
                  >
                    {copiedKey === "full" ? "✓ Đã chép" : "Sao chép"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === "ai" && (
            <div className="tab-pane">
              <h3>Kết nối với AI (ChatGPT, Claude & AI Agents)</h3>
              <p className="muted">
                textts tích hợp sẵn một REST API server chuẩn FastAPI (OpenAPI / Swagger UI), cho phép ChatGPT, Claude, các trợ lý AI hoặc script tự động sinh bài học và audio tiếng Nhật.
              </p>

              <div className="guide-section">
                <h4>1. Kích hoạt API Server</h4>
                <p>
                  Bạn có thể bấm nút <strong>API: Bật/Tắt</strong> ngay trên thanh công cụ trên cùng của app, hoặc khởi chạy bằng dòng lệnh:
                </p>
                <div className="code-block">
                  <pre>python server.py --host 127.0.0.1 --port 8000</pre>
                  <button
                    className="copy-btn"
                    onClick={() => copyCode("python server.py --host 127.0.0.1 --port 8000", "server")}
                  >
                    {copiedKey === "server" ? "✓ Đã chép" : "Sao chép"}
                  </button>
                </div>
                <p>
                  Trang tài liệu Swagger UI tương tác trực tiếp tại:{" "}
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      window.textts?.openExternalUrl?.(docsUrl || "http://127.0.0.1:8000/docs");
                    }}
                  >
                    {docsUrl || "http://127.0.0.1:8000/docs"}
                  </a>
                </p>
                {onToggleApi && (
                  <div style={{ marginTop: 8 }}>
                    <button className={apiRunning ? "ghost" : "primary"} onClick={onToggleApi}>
                      {apiRunning ? "Dừng API Server" : "Khởi động API Server ngay"}
                    </button>
                  </div>
                )}
              </div>

              <div className="guide-section">
                <h4>2. Claude Desktop (khuyên dùng): tạo bài nghe ngay trong khung chat</h4>
                <p>
                  textts có sẵn MCP server (<code>ai_tools/mcp_server.py</code>). Sau khi khai báo, bạn chỉ cần nhắn cho Claude
                  ví dụ "Soạn hội thoại phỏng vấn xin việc 8 câu và tạo bài nghe bằng AivisSpeech": Claude tự soạn kịch bản,
                  chọn giọng và tạo file MP3, bản chậm, phụ đề, phiếu học tập. MCP server tự bật API nếu API chưa chạy.
                </p>
                <ol className="guide-steps">
                  <li>Trong Claude Desktop, mở <strong>Settings → Developer → Edit Config</strong> (file <code>claude_desktop_config.json</code>).</li>
                  <li>Dán cấu hình dưới đây (đã điền đường dẫn trên máy này). Nếu file đã có <code>mcpServers</code>, chỉ thêm mục <code>"textts"</code>.</li>
                  <li>Lưu file rồi thoát hẳn và mở lại Claude Desktop. Công cụ <strong>textts</strong> sẽ xuất hiện trong khung chat.</li>
                  <li>Bật VOICEVOX hoặc AivisSpeech trong textts nếu muốn dùng các engine này (Edge TTS chỉ cần Internet).</li>
                </ol>
                <div className="code-block">
                  <pre>{mcpConfig}</pre>
                  <button className="copy-btn" onClick={() => copyCode(mcpConfig, "mcp")}>
                    {copiedKey === "mcp" ? "✓ Đã chép" : "Sao chép"}
                  </button>
                </div>
                <p className="muted">
                  Claude Code (chạy trên máy này) không cần cấu hình: chỉ cần bật API rồi nhờ Claude gọi
                  <code> http://127.0.0.1:8000/api/v1/dialogue</code>. Mẫu code Python: <code>ai_tools/example_agent.py</code>.
                </p>
              </div>

              <div className="guide-section">
                <h4>3. ChatGPT (Custom GPT Actions)</h4>
                <p>
                  ChatGPT chạy trên máy chủ của OpenAI nên <strong>không gọi được</strong> địa chỉ <code>127.0.0.1</code> trên máy bạn.
                  Muốn dùng, phải đưa API ra Internet qua một đường hầm HTTPS (ví dụ Cloudflare Tunnel) rồi dán URL
                  <code> https://…/openapi.json</code> vào mục Actions của GPT. Không khuyên dùng: API hiện không có mật khẩu,
                  ai biết địa chỉ cũng dùng được máy bạn để tạo âm thanh.
                </p>
              </div>

              <div className="guide-section">
                <h4>4. Các Endpoint chính của textts API</h4>
                <ul className="guide-list">
                  <li>
                    <code>POST /api/v1/dialogue</code>: Nhận kịch bản tiếng Nhật và sinh trọn bộ: file audio MP3/WAV, bản chậm 0.8x, phụ đề .srt, phiếu in Furigana HTML và mốc timeline JSON.
                  </li>
                  <li>
                    <code>POST /api/v1/preview-script</code>: Phân tích kịch bản và tự động gợi ý chú âm Furigana thông minh cho giáo viên duyệt trước khi tạo audio.
                  </li>
                  <li>
                    <code>GET /api/v1/speakers?engine=voicevox|aivis|edge</code>: Lấy danh sách giọng đọc của từng engine.
                  </li>
                  <li>
                    <code>GET /api/v1/health</code>: Kiểm tra trạng thái server và kết nối VOICEVOX / AivisSpeech.
                  </li>
                </ul>
              </div>
            </div>
          )}

          {activeTab === "syntax" && (
            <div className="tab-pane">
              <h3>Quy tắc kịch bản & Chú âm Furigana</h3>

              <div className="guide-section">
                <h4>1. Cú pháp câu thoại</h4>
                <p>Mỗi câu thoại nằm trên một dòng, bắt đầu bằng mã vai số:</p>
                <div className="code-block">
                  <pre>
{`[1] すみません、駅{えき}はどこですか。
[2]{emotion=happy, speed=slow} あ、駅ですか。
    この道をまっすぐ行ってください。
[pause=1000]
1 こんにちは (dạng rút gọn không ngoặc vuông)
2: はい、どうぞ`}
                  </pre>
                </div>
              </div>

              <div className="guide-section">
                <h4>2. Quy tắc chú âm Furigana: <code>漢字&#123;かな&#125;</code></h4>
                <ul className="guide-list">
                  <li>
                    Đặt chữ kana đọc ngay sau chữ Hán trong ngoặc nhọn: <code>駅&#123;えき&#125;</code>, <code>日本語&#123;にほんご&#125;</code>.
                  </li>
                  <li>
                    textts sẽ giữ chữ Hán để hiển thị trong giao diện/phụ đề, và gửi chữ kana cho engine phát âm đúng 100%.
                  </li>
                  <li>
                    Khi có từ có Okurigana (như <code>行く</code>, <code>食べる</code>), hãy chú âm vào phần Hán tự: <code>行&#123;い&#125;きます</code>, <code>食&#123;た&#125;べます</code>.
                  </li>
                  <li>
                    Tính năng <strong>Từ điển đọc</strong> (readings.yaml) giúp lưu lại các từ đọc đặc biệt để app tự động áp dụng cho mọi kịch bản.
                  </li>
                </ul>
              </div>

              <div className="guide-section">
                <h4>3. Khoảng lặng & Hiệu ứng âm thanh (SFX)</h4>
                <ul className="guide-list">
                  <li><code>[pause=1500]</code>: Chèn khoảng lặng 1500 mili-giây (1.5 giây).</li>
                  <li><code>[sfx=sounds/bell.wav]</code>: Chèn hiệu ứng âm thanh (tiếng chuông cửa, chuông vào lớp, tiếng mở cửa...). Đường dẫn tính tương đối từ thư mục chứa kịch bản.</li>
                </ul>
              </div>
            </div>
          )}

          {activeTab === "about" && (
            <div className="tab-pane">
              <h3>Giới thiệu ứng dụng textts</h3>
              <p>
                <strong>textts</strong> là bộ công cụ mã nguồn mở hỗ trợ giáo viên và người học tiếng Nhật tự động tạo các bài nghe hội thoại tự nhiên, đồng bộ phụ đề và tài liệu in ấn cho lớp học.
              </p>

              <div className="guide-section">
                <h4>Thông số & Công nghệ</h4>
                <ul className="guide-list">
                  <li>
                    <strong>Tác giả:</strong> ThS. Nguyễn Thanh Quang — Giảng viên chuyên ngành Nhật Bản học, Trường Đại học Quy Nhơn
                  </li>
                  <li><strong>Phiên bản:</strong> 1.3.0 (workspace kiểu Adobe, ngân hàng âm thanh &amp; giọng cho AI, đạo diễn kịch bản, gói bài học, kiểm tra phát âm, tự điền giới tính/tuổi/tính cách cho giọng AivisHub)</li>
                  <li><strong>Giao diện:</strong> Electron + React + Vite</li>
                  <li><strong>Backend & Xử lý âm thanh:</strong> Python 3.11, Pydantic v2, PyDub, PyOpenJTalk (Offline NLP), PyLoudNorm (ITU-R BS.1770-4 LUFS)</li>
                  <li><strong>Hỗ trợ Engine:</strong>
                    <ul style={{ marginTop: 4 }}>
                      <li><strong>Edge-TTS:</strong> Miễn phí, trực tuyến, giọng đọc tự nhiên của Microsoft.</li>
                      <li><strong>VOICEVOX:</strong> Chạy offline hoàn toàn trên máy tính, kho giọng nhân vật phong phú (Zundamon, Shikoku Metan...).</li>
                      <li><strong>AivisSpeech:</strong> Chạy offline bằng CPU, model Style-BERT-VITS2 (bộ giọng JVNV chất lượng studio với 5 sắc thái cảm xúc).</li>
                    </ul>
                  </li>
                  <li><strong>Giấy phép:</strong> MIT License — Hoàn toàn miễn phí, dành cho giáo dục và sử dụng cá nhân phi thương mại.</li>
                </ul>
              </div>

              <div className="guide-section">
                <h4>Ghi công VOICEVOX</h4>
                <p>
                  textts có nút tải <strong>VOICEVOX ENGINE</strong> phiên bản 0.26.1 (bản CPU cho Windows, tải theo yêu cầu) và tự khởi động engine khi đã cài. Engine dùng giấy phép LGPL v3 hoặc giấy phép riêng, mã nguồn tại{" "}
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      window.textts?.openExternalUrl?.("https://github.com/VOICEVOX/voicevox_engine");
                    }}
                  >
                    github.com/VOICEVOX/voicevox_engine
                  </a>.
                </p>
                <p>
                  Khi đăng tải hoặc phát hành âm thanh do VOICEVOX tạo, hãy ghi credit theo dạng <code>VOICEVOX:&lt;tên nhân vật&gt;</code> (ví dụ <code>VOICEVOX:ずんだもん</code>) và tuân theo điều khoản sử dụng riêng của từng giọng.
                </p>
              </div>

              <div className="guide-section">
                <h4>Mã nguồn & Đóng góp</h4>
                <p>
                  Mã nguồn được lưu trữ tại GitHub:{" "}
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      window.textts?.openExternalUrl?.("https://github.com/miyagitaisuki/textts");
                    }}
                  >
                    https://github.com/miyagitaisuki/textts
                  </a>
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="modal-actions" style={{ marginTop: 12 }}>
          <button className="primary" onClick={onClose}>Đóng</button>
        </div>
      </div>
    </div>
  );
}
