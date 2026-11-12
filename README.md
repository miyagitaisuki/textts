# textts — TTS hội thoại tiếng Nhật cho lớp học

Biến kịch bản hội thoại (`[1] ...`, `[2] ...`) thành một file âm thanh liền mạch,
có khoảng nghỉ giữa các lượt nói và phụ đề `.srt` tùy chọn.

Thiết kế đầy đủ: xem kế hoạch kiến trúc (Phần 1–4). Trạng thái hiện tại:

- **Giai đoạn 1 và 2 (xong):** CLI, cache theo hash, `project.json` có kiểm tra bằng pydantic, thử lại khi lỗi tạm thời, cú pháp `漢字{かな}` và `[pause=ms]`.
- **Giai đoạn 4 (xong):** VOICEVOX & AivisSpeech offline, bản chậm 0.8×, xuất từng câu riêng, chuẩn hóa LUFS, nhạc nền, hiệu ứng `[sfx=...]`, timeline có sóng âm trong giao diện.
- **Engine AivisSpeech & Bộ model JVNV:** hỗ trợ engine AivisSpeech (port 10101, CPU) với các giọng chất lượng cao JVNV (F1, F2, M1, M2), tự động chọn style theo 5 cảm xúc (neutral/happy/sad/angry/surprised).
- **Mixer và chỉnh timeline (xong):** fader dọc theo từng vai (dB, áp dụng khi tạo âm thanh); kéo câu trên timeline để dời về phía sau (`delay_ms`). VU meter theo từng vai đã có (xem bên dưới).
- **Giai đoạn 3 (xong):** giao diện **Electron + React** trong `gui/`, gọi CLI Python ở bên dưới. Có: mở/lưu `project.json`, sửa câu thoại (chữ, vai, cảm xúc, tốc độ), thêm/xóa/đổi thứ tự câu và khoảng nghỉ, cấu hình từng vai, nghe thử một câu, tạo âm thanh, và cột **gợi ý cách đọc** kèm nút "Áp dụng" để ghi `漢字{かな}`.

**Phạm vi sử dụng:** dùng cá nhân, không kinh doanh. Chỉ dùng engine miễn phí, mã mở. Không tích hợp dịch vụ trả phí (Gemini, OpenAI, ElevenLabs, Azure...).

**Tác giả:** ThS. Nguyễn Thanh Quang — Giảng viên chuyên ngành Nhật Bản học, Trường Đại học Quy Nhơn.

## Cài đặt

```bash
pip install -r requirements.txt
# ffmpeg phải có trên PATH (pydub dùng để đọc/ghi mp3)
ffmpeg -version
```

Bản GUI (`textts-<phiên bản>-setup.exe`) đã đi kèm Python embeddable, các thư viện trong `requirements.txt` và `ffmpeg.exe`, nên người dùng chỉ cần chạy bộ cài, không cần cài Python hay pip. Khi build bộ cài trên Windows, `npm run dist:win` tự chạy `gui/scripts/bundle-python.ps1` để chuẩn bị phần này (cần kết nối mạng). Khi chạy dev (`npm run dev`), app dùng Python hệ thống hoặc biến `TEXTTS_PYTHON`.

## Hướng dẫn chạy riêng lẻ bằng dòng lệnh (CLI)

Bạn có thể tự động hóa toàn bộ quy trình tổng hợp bài học tiếng Nhật bằng cách gọi trực tiếp lệnh `tts.py` từ Terminal hoặc file batch mà không cần mở giao diện GUI.

### Các lệnh cơ bản

```bash
# 1. Xem kế hoạch đọc (Dry-run không tốn thời gian gọi API): kiểm tra vai, giọng, cảm xúc, chú âm kana
python tts.py examples/minna_bai10_hoi_duong.txt --dry-run

# 2. Tạo file âm thanh MP3 hoàn chỉnh kèm phụ đề .srt:
python tts.py examples/minna_bai10_hoi_duong.txt -o output/bai10.mp3 --srt

# 3. Lưu kết quả phân tích ra project.json, rồi tạo âm thanh từ file đó:
python tts.py examples/minna_bai10_hoi_duong.txt --save-project projects/bai10.json
python tts.py --project projects/bai10.json -o output/bai10.mp3
```

### Bảng tham số CLI đầy đủ (`tts.py`)

| Tham số | Ý nghĩa & Cách dùng |
| --- | --- |
| `script.txt` / `--project FILE.json` | Đường dẫn file kịch bản nguồn (`.txt`) hoặc file dự án (`.json`). |
| `-o, --output FILE` | Đường dẫn file âm thanh đầu ra (`.mp3` hoặc `.wav`). Mặc định tự đặt tên theo kịch bản. |
| `--dry-run` | Chỉ in kế hoạch đọc (vai, cảm xúc, tốc độ, văn bản kanji + kana), không gọi engine TTS. |
| `--srt` | Tự động xuất file phụ đề `.srt` đồng bộ thời gian chính xác theo từng câu thoại. |
| `--slow` | Tạo thêm một bản đọc chậm tốc độ 0.8× (giữ nguyên cao độ) và phụ đề tương ứng `_slow.srt` để học viên luyện nghe. |
| `--role-play <VAI>` | Chế độ luyện nói nhập vai: chỉ phát lời thoại của vai chỉ định, các vai khác biến thành khoảng lặng có cùng độ dài để học viên đóng vai và nói vào. |
| `--shadow [--shadow-gap MS]` | Chế độ Shadowing: sau mỗi câu thoại tự động chèn khoảng lặng (mặc định 1500ms) để học viên nhại lại. |
| `--worksheet <FILE.html>` | Xuất phiếu học tập HTML có chú âm Furigana chuẩn (thẻ `<ruby>`) dùng để in ra phát cho học viên. |
| `--export-lines <THƯ_MỤC>` | Tách và xuất từng câu thoại thành từng file riêng biệt (ví dụ `L001_vai1.mp3`). |
| `--preview <MÃ_CÂU>` | Chỉ tổng hợp và nghe thử riêng 1 câu (ví dụ `--preview L002 -o test.mp3`). |
| `--lufs <MỨC>` | Chuẩn hóa độ to tích hợp theo tiêu chuẩn phát thanh (khuyên dùng `--lufs -16`). |
| `--bgm <FILE> --bgm-db <DB>` | Lặp và trộn nhạc nền dưới giọng nói với âm lượng nhỏ hơn lời thoại (ví dụ `--bgm-db -18`). |
| `--batch <THƯ_MỤC> --outdir <THƯ_MỤC>` | Xử lý hàng loạt toàn bộ file kịch bản `.txt` trong một thư mục ra thư mục đầu ra. |
| `--lint` | Quét kiểm tra lỗi kịch bản: câu trống, file sfx thiếu, và cảnh báo Hán tự chưa có chú âm `{かな}`. |
| `--list-voices {edge,voicevox,aivis}` | Xuất danh sách giọng đọc khả dụng của từng engine dưới dạng JSON. |
| `--readings <FILE.yaml>` | Chỉ định file từ điển cách đọc Hán tự riêng (mặc định nạp `readings.yaml` nếu tồn tại). |
| `--cache-info` / `--clear-cache` | Xem dung lượng bộ nhớ cache âm thanh hoặc dọn dẹp toàn bộ cache. |

### Ví dụ lệnh xuất trọn gói bài học

```bash
python tts.py examples/minna_bai10_hoi_duong.txt \
  -o output/bai10.mp3 \
  --srt \
  --slow \
  --lufs -16 \
  --worksheet output/bai10_phieu_in.html
```

---

## Kết nối và tự động hóa với AI (REST API, ChatGPT & Claude)

`textts` tích hợp sẵn một REST API server chuẩn FastAPI (kèm OpenAPI schema và Swagger UI), cho phép ChatGPT, Claude, các trợ lý AI hoặc agent tự động hóa quy trình soạn bài, gợi ý furigana và tổng hợp audio tiếng Nhật.

### 1. Khởi động API Server

Bạn có thể bấm nút **"API: Bật/Tắt"** trên thanh công cụ của app GUI, hoặc chạy dòng lệnh:

```bash
# Khởi chạy server ở cổng 8000
python server.py --host 127.0.0.1 --port 8000
```

- Trang tài liệu tương tác Swagger UI: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
- OpenAPI Specification JSON: [http://127.0.0.1:8000/openapi.json](http://127.0.0.1:8000/openapi.json)

### 2. Các Endpoint chính

| Endpoint | Phương thức | Mô tả |
| --- | --- | --- |
| `/api/v1/dialogue` | `POST` | Nhận kịch bản tiếng Nhật và sinh trọn bộ: file audio MP3/WAV, bản chậm 0.8x, phụ đề `.srt`, phiếu in Furigana HTML và mốc timeline JSON. |
| `/api/v1/preview-script` | `POST` | Phân tích kịch bản và tự động gợi ý chú âm Furigana thông minh (giữ nguyên Okurigana) cho giáo viên duyệt trước khi tạo audio. |
| `/api/v1/speakers` | `GET` | Lấy danh sách giọng đọc của engine (`edge`, `voicevox`, hoặc `aivis`). |
| `/api/v1/health` | `GET` | Kiểm tra trạng thái hoạt động của server và các engine cục bộ. |

### 3. Claude Desktop qua MCP (khuyên dùng)

**Ghép đề nghe:** `POST /api/v1/assemble` nhận danh sách đoạn theo thứ tự (`speech`: chữ để engine đọc, `audio`: file mp3/wav gửi kèm dạng base64, `pause`: khoảng lặng ms), chuẩn hóa độ to từng đoạn và xuất một file. QBank (repo demix) dùng endpoint này để xuất đề nghe cho từng mã đề.

`ai_tools/mcp_server.py` là MCP server (stdio, chỉ dùng thư viện chuẩn của Python) để Claude Desktop tự soạn kịch bản và tạo bài nghe ngay trong khung chat. Server tự khởi động `server.py` nếu API chưa chạy, và tắt nó khi Claude Desktop thoát.

Các công cụ Claude dùng được:

| Công cụ | Việc làm |
| --- | --- |
| `textts_status` | Kiểm tra API, VOICEVOX và AivisSpeech có đang chạy |
| `textts_list_voices` | Liệt kê mã giọng của một engine (`voicevox`, `aivis`, `edge`) |
| `textts_check_script` | Kiểm tra cú pháp kịch bản và gợi ý furigana `漢字{かな}` |
| `textts_create_audio` | Tạo âm thanh, bản chậm 0.8×, phụ đề SRT, phiếu học tập HTML; trả về đường dẫn file |

Cài đặt:

1. Trong app textts: **Trợ giúp → Hướng dẫn → tab Kết nối AI**, bấm **Sao chép** ở phần Claude Desktop (cấu hình đã điền sẵn đường dẫn trên máy). Mẫu: [`ai_tools/claude_desktop_config.example.json`](ai_tools/claude_desktop_config.example.json).
2. Trong Claude Desktop: **Settings → Developer → Edit Config**, dán vào `claude_desktop_config.json` (nếu đã có `mcpServers` thì chỉ thêm mục `"textts"`), lưu file rồi thoát hẳn và mở lại Claude Desktop.
3. Nhắn cho Claude, ví dụ: *"Soạn hội thoại phỏng vấn xin việc 8 câu cho 2 vai và tạo bài nghe bằng AivisSpeech."*

Chạy từ mã nguồn: `"command": "python"`, `"args": ["<đường dẫn repo>/ai_tools/mcp_server.py"]`. Biến môi trường tùy chọn: `TEXTTS_API_URL` (mặc định `http://127.0.0.1:8000`), `TEXTTS_NO_AUTOSTART=1` để không tự khởi động API.

### 4. Claude Code và AI Agent khác trên cùng máy

Claude Code chạy lệnh trên máy nên chỉ cần bật API rồi nhờ Claude gọi `POST http://127.0.0.1:8000/api/v1/dialogue`. Mẫu code: [`ai_tools/example_agent.py`](ai_tools/example_agent.py). Schema công cụ cho Tool Use: [`ai_tools/claude_tool.json`](ai_tools/claude_tool.json).

### 5. ChatGPT (Custom GPT Actions)

ChatGPT chạy trên máy chủ của OpenAI nên **không gọi được** `127.0.0.1` trên máy bạn. Muốn dùng phải đưa API ra Internet qua đường hầm HTTPS (ví dụ Cloudflare Tunnel) rồi dán `https://…/openapi.json` (hoặc nội dung [`ai_tools/openai_tool.json`](ai_tools/openai_tool.json)) vào mục **Actions** của GPT. Không khuyên dùng: API hiện không có mật khẩu, ai biết địa chỉ cũng dùng được máy bạn để tạo âm thanh.

---

## Giao diện (Electron + React)

Quyết định: **Electron + React**, thay cho Streamlit trong bản kế hoạch ban đầu. Lý do: bố cục giống mockup (bảng câu thoại, thẻ vai, timeline sóng âm ở giai đoạn 4) khó làm với Streamlit, và Electron cho một ứng dụng desktop đóng gói được.

Kiến trúc:
- **Renderer (React):** soạn kịch bản, bảng câu thoại, thẻ vai, nút hành động.
- **Main process (Electron):** đọc/ghi `project.json`, chạy `tts.py` như tiến trình con, chuyển tiến trình và lỗi về giao diện.
- Logic tạo âm thanh chỉ nằm ở Python, giao diện không gọi API TTS trực tiếp.

Các thao tác chính:
- **Vai:** chọn giọng, cảm xúc mặc định, tốc độ, cao độ cho từng vai.
- **Câu thoại:** sửa chữ (dùng `漢字{かな}` để ép cách đọc), chọn vai, cảm xúc/tốc độ riêng. Chọn `theo vai` để dùng giá trị của vai.
- **Gợi ý đọc:** cột "Gợi ý đọc" hiển thị cách đọc hiragana dự đoán của câu, để giáo viên đối chiếu trước khi tạo âm thanh. "Áp dụng" ghi chú âm `{かな}` thông minh: tự căn chỉnh phần gốc Hán tự và giữ nguyên Okurigana (ví dụ `久しぶり` thành `久{ひさ}しぶり`, `食べます` thành `食{た}べます`).
- **Từ điển cách đọc:** quản lý từ điển `readings.yaml` ngay trên GUI, hỗ trợ áp dụng hàng loạt vào dự án.
- **Tùy chọn xuất & Lớp học:** hộp thoại trực quan cho phép xuất Role-play, Shadowing, phiếu học tập HTML furigana, xuất từng câu riêng (`lines/`), và trộn nhạc nền BGM.
- **Nghe thử:** `▶ Nghe` tổng hợp đúng một câu (dùng cache) và phát ngay. Trước khi nghe thử hoặc tạo âm thanh, giao diện tự lưu file.
- **Tạo âm thanh:** chạy `tts.py --project`, xuất `.mp3` cạnh file project, log hiển thị bên dưới.

Chạy phát triển:

```bash
cd gui
npm install
npm run dev
```

## Tự cập nhật và phát hành (Windows)

Bản phát hành là bộ cài `textts-<phiên bản>-setup.exe` (NSIS, cài theo người dùng, không cần quyền admin). Bản này **không ký số**.

- Khi mở app và khi bấm **Trợ giúp → Kiểm tra cập nhật**, app kiểm tra bản mới trên GitHub Releases (`miyagitaisuki/textts`) bằng `electron-updater`.
- Bản mới được tải trong nền. Khi tải xong, app hỏi có khởi động lại để cập nhật không.
- Cấu hình nguồn: `build.publish` trong `gui/package.json`. Logic: `gui/electron/updater.cjs`.
- Chỉ hoạt động khi app đã được cài đặt (không chạy trong `npm run dev`).

Phát hành một bản mới:

1. Tăng `version` trong `gui/package.json` (ví dụ `1.1.0` → `1.1.1`, dùng `npm version 1.1.1 --no-git-tag-version` trong `gui/` để sửa cả `package-lock.json`) rồi merge vào `main`.
2. Vào **Actions → Windows build → Run workflow** trên `main`. Workflow build bộ cài rồi tự tạo **GitHub Release `v<phiên bản>`** (dạng nháp) và tải lên đủ 3 file: `textts-<phiên bản>-setup.exe`, `textts-<phiên bản>-setup.exe.blockmap` và `latest.yml`.
   - Bỏ chọn **draft** để công bố ngay; bỏ chọn **release** nếu chỉ cần bộ cài trong Artifacts.
   - Chạy lại khi Release còn là nháp sẽ thay file cũ. Release đã công bố thì workflow dừng: phải tăng phiên bản trước.
3. Mở Release nháp trên GitHub, xem lại ghi chú thay đổi rồi bấm **Publish release**. App đã cài chỉ thấy bản mới sau khi Release được công bố (thiếu `latest.yml` thì cũng không thấy).

Build thủ công trên máy Windows vẫn được: `cd gui && npm ci && npm run dist:win` tạo các file trên trong `gui/release/`.

Build trên Linux cũng được nhưng cần `wine` và `wine32` (`apt install wine64 wine32:i386`), và phải khởi tạo prefix bằng `wineboot -i`.

## Đầu ra cho lớp học

```bash
# Chuẩn hóa độ to về -16 LUFS, xuất thêm bản chậm 0.8× (giữ cao độ), phụ đề, và từng câu riêng
python tts.py --project projects/bai10.json -o output/bai10.mp3 \
  --lufs -16 --slow --srt --export-lines output/bai10_cau/
```

- `--lufs`: chuẩn hóa độ to tích hợp. Đoạn im lặng hoàn toàn được giữ nguyên.
- `--slow`: tạo `bai10_slow.mp3` và `bai10_slow.srt` (thời gian đã co giãn theo tốc độ).
- `--export-lines DIR`: mỗi câu một file, tên `L001_vai1.mp3`, để luyện nghe và nói theo.
- Mixer: mỗi vai có `gain_db` trong `roles.yaml`/`project.json` (từ -30 đến +12 dB), áp dụng khi tạo âm thanh. Lưu ý: nghe thử một câu (`▶ Nghe`) không áp dụng mixer, chỉ bản đầu ra mới có.
- Kéo thả trên timeline: kéo một câu sang phải để dời nó về phía sau, lưu vào `delay_ms` của câu. Câu sau nó cũng dịch theo. Không kéo được về trước; muốn rút ngắn khoảng nghỉ thì giảm `[pause=...]` phía trước. Sau khi kéo, giao diện báo "bản đầu ra đã cũ" cho đến khi bấm "Tạo âm thanh".
- VU meter: thanh mức của từng vai đặt trên timeline, chạy theo vị trí phát (và cập nhật khi tua). Mức được tính sẵn trong `timeline.json` (`role_levels`) từ bản đầu ra cuối cùng, nên đã gồm mixer, nhạc nền và LUFS. Thang đo từ −60 dB đến 0 dBFS.
- `--role-play VAI`: bản luyện nói. Chỉ giữ lời vai đó, các vai khác thành khoảng lặng cùng độ dài. Học viên đóng vai và nói theo.
- `--shadow [--shadow-gap MS]`: bản shadowing. Sau mỗi câu luyện tập chèn khoảng lặng (mặc định 1500 ms) để học viên nhắc lại. Kết hợp được với `--role-play`.
- `--worksheet FILE.html`: phiếu học tập có furigana (`<ruby>`), mở bằng trình duyệt rồi in. Không cần tạo âm thanh. Chữ Hán có `{かな}` dùng đúng cách đọc đó, phần còn lại chú âm tự động bằng pyopenjtalk.
- `--list-voices {edge,voicevox,aivis}`: in danh sách giọng dạng JSON (giao diện dùng để điền danh sách chọn).
- `--batch DIR --outdir DIR`: xử lý mọi `.txt` trong thư mục, mỗi file ra `<tên>.mp3`. Các tùy chọn khác (`--lufs`, `--srt`, `--bgm`...) áp dụng cho từng file. Một file lỗi không dừng batch.
- `--cache-info` / `--clear-cache`: xem hoặc xóa thư mục `cache/`.
- `--lint`: in JSON các lỗi (chặn tạo âm thanh) và cảnh báo (chữ Hán chưa có `{かな}`). Giao diện hiển thị ở cột ghi chú của từng dòng. Vai chưa khai báo bị chặn ngay khi nạp project, nên không nằm trong lint.
- `--bgm FILE --bgm-db -18`: trộn nhạc nền lặp lại dưới lời thoại, có fade vào và ra. Nhạc nền do giáo viên cung cấp, dự án không đính kèm.
- Mỗi lần xuất còn ghi `<tên>.timeline.json` (vị trí từng câu và dữ liệu sóng). Giao diện đọc file này để vẽ timeline sau khi tạo âm thanh.

## Cài đặt & Sử dụng AivisSpeech (Bộ giọng JVNV)

AivisSpeech là engine TTS mã mở chất lượng cao (Style-BERT-VITS2), tương thích API VOICEVOX, chạy trực tiếp trên máy bằng CPU (hoặc GPU DirectML/CUDA).

1. **Khởi chạy Engine:**
   - Tải và cài đặt [AivisSpeech-Engine](https://github.com/Aivis-Project/AivisSpeech-Engine).
   - Đặt 4 file model `.aivmx` của bộ JVNV (`jvnv-F1`, `jvnv-F2`, `jvnv-M1`, `jvnv-M2`) vào thư mục `Models/` của AivisSpeech.
   - Khởi động engine, mặc định chạy ở cổng `http://127.0.0.1:10101` (kiểm tra tài liệu Swagger tại `http://127.0.0.1:10101/docs`). Có thể đổi URL qua biến môi trường `AIVIS_URL`.

2. **Cấu hình kịch bản & vai (`roles.aivis.example.yaml`):**
   - Chạy lệnh lấy mã ID style `ノーマル` của các giọng:
     ```bash
     python tts.py --list-voices aivis
     ```
   - Điền mã ID vào trường `voice` của từng vai.
   - **Cảm xúc (`emotion`):** Tự động chọn style tương ứng của nhân vật (`neutral` -> `ノーマル`, `happy` -> `幸せ`, `sad` -> `悲しみ`, `angry` -> `怒り`, `surprised` -> `驚き`). Nếu nhân vật thiếu style thì engine tự động quay về giọng `ノーマル`.
   - **Lưu ý kỹ thuật:**
     - `pitchScale`: Bị bỏ qua vì điều chỉnh cao độ làm giảm chất lượng mô hình Style-BERT-VITS2; trường `pitch` trong cấu hình không ảnh hưởng đến âm thanh của Aivis.
     - `intonationScale`: Tự động áp dụng mức độ cảm xúc `1.2` cho các style diễn cảm khác `ノーマル`.
     - **Giấy phép:** AivisSpeech Engine phát hành theo giấy phép LGPL-3.0. Bộ model JVNV phát hành theo giấy phép CC BY-SA 4.0 (cần ghi nhận tác giả nếu chia sẻ âm thanh ra bên ngoài).

## Cú pháp kịch bản

| Cú pháp | Ý nghĩa |
| --- | --- |
| `[1] 文` | Lời thoại của vai 1 (vai khai báo trong `roles.yaml`) |
| `1 文` | Dạng rút gọn: số đầu dòng là vai (cũng nhận `1: 文`, `1：文`). Dòng thụt đầu vẫn là nối tiếp |
| `[2]{emotion=happy, speed=slow} 文` | Ghi đè thuộc tính cho riêng câu này |
| `漢字{かな}` | Ép cách đọc: hiển thị `漢字`, đọc `かな` |
| `[pause=1500]` | Khoảng lặng 1500 ms (chuyển cảnh) |
| `[sfx=sounds/bell.wav]` | Chèn một file hiệu ứng vào đúng vị trí. Đường dẫn tương đối tính từ thư mục chứa kịch bản (hoặc `project.json`) |
| `# ...` | Ghi chú, bỏ qua |
| Dòng thụt đầu | Nối tiếp vào câu trước |

Thuộc tính: `voice`, `emotion` (`neutral`/`happy`/`sad`/`angry`/`surprised`), `speed` (`slow`/`normal`/`fast`), `pitch` (Hz).

## Cấu trúc

```
tts.py            CLI (nguồn sự thật cho việc tạo âm thanh; --preview ID để nghe thử một câu)
roles.yaml        engine, giọng và cấu hình vai, khoảng nghỉ
gui/              giao diện Electron + React (giai đoạn 3)
core/parser.py    phân tích kịch bản → danh sách câu
core/models.py    mô hình pydantic: Config (roles.yaml), Project (project.json)
core/normalize.py gợi ý cách đọc kanji (pyopenjtalk, MIT, offline)
core/builder.py   ghép âm thanh, khoảng nghỉ, xuất .srt
providers/        TTSProvider (base), EdgeProvider, VoicevoxProvider, AivisProvider
core/audio.py     đổi tốc độ không đổi cao độ (ffmpeg atempo), chuẩn hóa LUFS
examples/         kịch bản mẫu
docs/ui/          ảnh mockup giao diện tham khảo
tests/            unit test: parser, mô hình dữ liệu, cache và thử lại
```

## Định hướng giao diện (mockup)

Ảnh tham khảo: [`docs/ui/mockup-speechvox-pro.png`](docs/ui/mockup-speechvox-pro.png).
Đây là ảnh minh họa bố cục mong muốn, **chưa phải giao diện đã làm**. Chữ trong ảnh do AI tạo nên có chỗ sai, nên chỉ dùng để tham khảo cách sắp xếp, không dùng làm nguồn nội dung.

| Vùng trong ảnh | Chức năng dự kiến | Giai đoạn |
| --- | --- | --- |
| Thanh bên: Dự án / Kịch bản / Thư viện / Cài đặt | Mở, lưu `project.json`; soạn kịch bản; kho giọng và mẫu; cấu hình engine, khoảng nghỉ | 3 |
| Khung "Script & Dialogue" | Ô nhập kịch bản `[n]`, tô màu theo vai | 3 |
| Tab Role 1 / 2 / 3 | Mỗi vai một thẻ: chọn giọng, cảm xúc (Vui/Buồn/Giận), tốc độ (Nhanh/Chậm), cao độ | 1–3 |
| Nút Preview | Nghe thử một câu hoặc cả đoạn trước khi tạo đầy đủ | 3 |
| Nút Record | Ghi âm giọng thật của giáo viên để làm mẫu | Chưa quyết định |
| Nút Generate Speech / Generate All | Tổng hợp các câu (đã có cache) | 1 (CLI), 3 (giao diện Electron) |
| Nút Export MP3/WAV | Xuất file, kèm `.srt` | 1 (CLI) |
| Timeline với sóng âm theo từng vai | Xem vị trí và sóng từng câu, click để tua, kéo để dời câu | Đã có |
| Mixing (fader theo vai, VU meter) | Chỉnh âm lượng từng vai | Đã có (fader và VU meter) |
| Settings (bật/tắt tùy chọn) | Bật `.srt`, bản chậm, chuẩn hóa âm lượng... | 2–4 (đã có qua CLI) |

Ghi chú khi triển khai:
- Giai đoạn 3 chỉ cần bảng câu thoại và các khối vai, theo Phần 3 của kế hoạch. Timeline sóng âm và mixer chỉ làm ở giai đoạn 4.
- Nút Record không nằm trong kế hoạch ban đầu. Cần quyết định có làm hay không trước khi thiết kế.
- Các nhãn tiếng Việt trong ảnh là nháp, sẽ đổi khi làm thật.

## Hướng sửa giao diện (đợt tinh chỉnh)

Danh sách việc cần sửa sau khi rà soát `gui/src`. Đánh dấu `[x]` khi xong.

**Ưu tiên cao: bố cục**
- [x] 1. Thanh công cụ quá tải: chuyển "Tùy chọn xuất" vào hộp thoại; đưa đường dẫn thư mục xuất xuống thanh trạng thái; thêm nút Hoàn tác/Làm lại.
- [x] 2. Hành động chính: thanh hành động cố định ở đáy (Nghe thử / Tạo âm thanh / Xuất), theo mockup.
- [x] 3. Trạng thái trùng: chỉ hiện "cần tạo lại" ở một chỗ.
- [x] 4. Màn hình trống: hai nút lớn "Mở kịch bản .txt" và "Tạo kịch bản mới".
- [x] 5. Bảng câu thoại: cho phép xuống dòng ở cột văn bản; ẩn cột ID; rút gọn tiêu đề; tăng vùng bấm của ↑ ↓ ✕; cột cảm xúc/tốc độ hiện chữ "theo vai" khi không ghi đè.
- [x] 6. Thẻ vai: cảm xúc và tốc độ dùng nút chọn dạng nhóm; thư viện mẫu thu vào mục mở rộng.

**Ưu tiên trung bình**
- [x] 7. Mixer: thêm vạch chia dB.
- [x] 8. Timeline: thêm thước thời gian; canvas theo `devicePixelRatio`.
- [x] 9. Nhật ký: thu gọn được.
- [x] 10. Tiến trình khi xử lý: thanh tiến trình/spinner và bước hiện tại.

**Ưu tiên thấp: đọc và truy cập**
- [x] 11. Tăng độ tương phản cho `.muted` và `.hint`.
- [x] 12. Lỗi/cảnh báo không chỉ dựa vào màu: thêm biểu tượng.
- [x] 13. Viền focus rõ cho nút và ô nhập (`:focus-visible`).
- [x] 14. Ghi phím tắt vào tooltip của nút tương ứng.

Thứ tự làm: 1–4, rồi 5–6, rồi 7–14. Mỗi đợt có kiểm thử chạy được bằng `npm test` trong `gui/`.

## Engine TTS

Chỉ liệt kê engine miễn phí, mã mở, dùng không kinh doanh.

| Engine | Trạng thái | Ghi chú |
| --- | --- | --- |
| Edge-TTS | Đã cài (mặc định) | Miễn phí, không cần key. Dịch vụ của Microsoft không chính thức, không có SLA, có thể ngừng bất cứ lúc nào. Thư viện `edge-tts` là mã mở. |
| VOICEVOX | Đã cài, chạy offline | Trên Windows, bấm nút "Tải thêm VOICEVOX" trên thanh điều hướng để tải VOICEVOX ENGINE 0.26.1 (bản CPU, khoảng 1,9 GB, cần mạng); sau đó nút "Bật VOICEVOX" khởi động engine. Engine đã cài sẽ tự bật khi mở app. Nếu VOICEVOX đã chạy sẵn ở cổng đó thì app dùng engine đó và không tắt khi thoát. Khi chạy từ mã nguồn, cần tự chạy VOICEVOX Engine (mặc định `http://127.0.0.1:50021`, đổi bằng `VOICEVOX_URL`). Trường `voice` là mã nhân vật, ví dụ `3`. Không có cảm xúc tách riêng; `emotion` bị bỏ qua. Mỗi nhân vật có điều khoản riêng, cần đọc trước khi dùng. Chưa kiểm chứng với engine thật trong môi trường phát triển (chỉ test bằng server giả). |
| AivisSpeech | Đã hỗ trợ, chạy offline | Cần chạy AivisSpeech Engine (mặc định `http://127.0.0.1:10101`, đổi bằng `AIVIS_URL`). Hỗ trợ bộ model chất lượng cao JVNV (Style-BERT-VITS2), tự động ánh xạ 5 cảm xúc (neutral/happy/sad/angry/surprised) theo style nhân vật. |

### Ghi công VOICEVOX

- VOICEVOX ENGINE (phiên bản 0.26.1) được tải theo yêu cầu từ GitHub Releases, không đóng gói trong bộ cài. Giấy phép LGPL v3 hoặc giấy phép riêng. Mã nguồn: https://github.com/VOICEVOX/voicevox_engine
- Khi đăng tải hoặc phát hành âm thanh do VOICEVOX tạo, ghi credit theo dạng `VOICEVOX:<tên nhân vật>` (ví dụ `VOICEVOX:ずんだもん`) và tuân theo điều khoản sử dụng riêng của từng giọng. Các thông tin này cũng hiển thị trong hộp thoại "Hướng dẫn & Giới thiệu" của ứng dụng.

Các engine mã mở khác cần kiểm tra trước khi đưa vào: giấy phép của mã và của model giọng, và có giọng tiếng Nhật hay không. Khi thêm engine mới, chỉ cần viết một lớp mới kế thừa `TTSProvider` trong `providers/`.

## Lưu ý

- Edge chỉ có 2 giọng ja-JP. Vai 3 trong mẫu dùng chung giọng vai 2 với pitch thấp hơn.
- Cảm xúc trên Edge chỉ là mô phỏng bằng pitch/rate.
- Thư mục `docs/ui/` chỉ chứa ảnh tham khảo, không phải giao diện đã làm.
- `--lufs` có thể làm cắt đỉnh (clipping) khi bài quá nhỏ hoặc nhạc nền quá to. Nếu thấy cảnh báo `Possible clipped samples`, giảm `--bgm-db` hoặc chọn LUFS thấp hơn.
- Luôn nghe duyệt từng câu trước khi phát cho lớp, đặc biệt các chữ Hán đọc nhiều cách.

## Dự án và thư mục xuất

- **Thư mục xuất** là thư mục gốc chứa các dự án. Lần đầu sẽ hỏi chọn; sau đó được nhớ trong máy. Đổi bằng nút "Đổi…".
- **Mở kịch bản .txt** hoặc **Tạo kịch bản mới** (nhập/dán kịch bản) tạo một dự án mới: `<thư mục xuất>/<tên dự án>/<tên dự án>.json`. Tên lấy từ tên file kịch bản (dán thì dùng `bai-moi-YYYYMMDD-HHMMSS`), nếu trùng sẽ thêm `-2`, `-3`...
- Mọi đầu ra của dự án (mp3, srt, timeline, phiếu, bản ghi âm) nằm trong thư mục đó. Nút "Mở thư mục dự án" mở thư mục này.
- Đường dẫn `[sfx=...]` được ghi thành tuyệt đối khi nhập kịch bản, nên dự án vẫn tìm được file dù nằm ở thư mục khác.

## Lộ trình đề xuất

Các đề xuất sau đến từ đợt rà soát mã nguồn. Thứ tự là thứ tự thực hiện. Trạng thái cập nhật khi làm xong.

**Sửa lỗi và hạ tầng**
1. [x] `requirements.txt` khai báo đủ `numpy` và `pyloudnorm` (PR #10, chưa merge).
2. [x] CI chạy `pytest` trên GitHub Actions (PR #10, chưa merge).
3. [x] `[sfx=...]` tìm file tương đối theo thư mục chứa kịch bản, không theo thư mục chạy lệnh.
4. [x] Giới hạn đường dẫn mà IPC của Electron được đọc và ghi (`project:save`, `output:load`).

**Giao diện biên tập**
5. [x] Mở kịch bản `.txt` trực tiếp trong giao diện.
6. [x] Hiển thị lỗi theo dòng và nhảy tới câu lỗi.
7. [x] Chọn giọng VOICEVOX từ danh sách lấy từ `/speakers`.
8. [x] Undo/Redo và phím tắt (Ctrl+S, Ctrl+Z, Enter).

**Đầu ra cho lớp học**
9. [x] Chế độ luyện nói theo vai (role-play): chỉ vai người học có tiếng, vai còn lại thành khoảng lặng.
10. [x] Chế độ shadowing: sau mỗi câu chèn khoảng lặng để học viên nhắc lại.
11. [x] Xuất phiếu học tập HTML có furigana (`<ruby>`).

**Tiện ích**
Từ điển cách đọc: `readings.yaml` ở gốc repo (mẫu: `readings.example.yaml`), tùy chọn `--readings FILE`. Áp dụng khi nhập kịch bản.
12. [x] Từ điển cách đọc do người dùng quản lý, lưu theo dự án hoặc dùng chung.
13. [x] Lệnh xem và xóa cache (`--clear-cache`).
14. [x] Xử lý hàng loạt: một thư mục kịch bản, xuất hết vào một thư mục đầu ra.
15. [x] Lint kịch bản trong giao diện: file sfx không tồn tại, câu trống, chữ Hán thiếu cách đọc (vai chưa khai báo đã bị chặn khi nạp project).

**Theo mockup, chưa làm**
16. [x] Ghi âm giọng thật làm mẫu (nút Record).
17. [x] Thư viện mẫu vai (lưu, áp, xóa mẫu, dùng chung giữa các project) và cài đặt chung (tùy chọn xuất được nhớ trong máy). Kho giọng riêng chưa làm: danh sách giọng đã có trong thẻ vai.
18. [x] Nút "Generate All" và xuất MP3/WAV trong giao diện.

**Hạ tầng bổ sung**
19. [x] Cấu hình đóng gói Electron (`electron-builder`).
20. [x] Test cho renderer (Vitest + Testing Library), logic thư viện/cài đặt và guard IPC; chạy bằng `npm test` trong `gui/`.
