# textts — TTS hội thoại tiếng Nhật cho lớp học

Biến kịch bản hội thoại (`[1] ...`, `[2] ...`) thành một file âm thanh liền mạch,
có khoảng nghỉ giữa các lượt nói và phụ đề `.srt` tùy chọn.

Thiết kế đầy đủ: xem kế hoạch kiến trúc (Phần 1–4). Trạng thái hiện tại:

- **Giai đoạn 1 và 2 (xong):** CLI, cache theo hash, `project.json` có kiểm tra bằng pydantic, thử lại khi lỗi tạm thời, cú pháp `漢字{かな}` và `[pause=ms]`.
- **Giai đoạn 4 (xong):** VOICEVOX offline, bản chậm 0.8×, xuất từng câu riêng, chuẩn hóa LUFS, nhạc nền, hiệu ứng `[sfx=...]`, timeline có sóng âm trong giao diện.
- **Mixer và chỉnh timeline (xong):** fader dọc theo từng vai (dB, áp dụng khi tạo âm thanh); kéo câu trên timeline để dời về phía sau (`delay_ms`). VU meter theo từng vai đã có (xem bên dưới).
- **Giai đoạn 3 (xong):** giao diện **Electron + React** trong `gui/`, gọi CLI Python ở bên dưới. Có: mở/lưu `project.json`, sửa câu thoại (chữ, vai, cảm xúc, tốc độ), thêm/xóa/đổi thứ tự câu và khoảng nghỉ, cấu hình từng vai, nghe thử một câu, tạo âm thanh, và cột **gợi ý cách đọc** kèm nút "Áp dụng" để ghi `漢字{かな}`.

**Phạm vi sử dụng:** dùng cá nhân, không kinh doanh. Chỉ dùng engine miễn phí, mã mở. Không tích hợp dịch vụ trả phí (Gemini, OpenAI, ElevenLabs, Azure...).

## Cài đặt

```bash
pip install -r requirements.txt
# ffmpeg phải có trên PATH (pydub dùng để đọc/ghi mp3)
ffmpeg -version
```

## Dùng

```bash
# Xem kế hoạch đọc (không gọi API): vai, giọng, cảm xúc, cách đọc kana
python tts.py examples/minna_bai10_hoi_duong.txt --dry-run

# Tạo MP3 + phụ đề
python tts.py examples/minna_bai10_hoi_duong.txt -o output/bai10.mp3 --srt

# Lưu kết quả phân tích ra project.json, rồi tạo âm thanh từ file đó
python tts.py examples/minna_bai10_hoi_duong.txt --save-project projects/bai10.json
python tts.py --project projects/bai10.json -o output/bai10.mp3

# Chạy kiểm thử
python -m pytest -q
```

Câu nào lỗi sẽ được báo kèm số dòng và **không** xuất file, để tránh nghe nửa vời.
Kết quả tổng hợp được cache trong `cache/` theo hash. Sửa một câu (đổi cảm xúc, tốc độ, cách đọc...) chỉ tạo lại đúng câu đó. Lỗi tạm thời được thử lại tối đa 3 lần.

`project.json` là file lưu dự án: cấu hình vai, khoảng nghỉ và danh sách câu đã phân tích, kèm `version` để kiểm tra tương thích. Có thể sửa tay file này rồi chạy lại với `--project`.

## Giao diện (Electron + React)

Quyết định: **Electron + React**, thay cho Streamlit trong bản kế hoạch ban đầu. Lý do: bố cục giống mockup (bảng câu thoại, thẻ vai, timeline sóng âm ở giai đoạn 4) khó làm với Streamlit, và Electron cho một ứng dụng desktop đóng gói được.

Kiến trúc:
- **Renderer (React):** soạn kịch bản, bảng câu thoại, thẻ vai, nút hành động.
- **Main process (Electron):** đọc/ghi `project.json`, chạy `tts.py` như tiến trình con, chuyển tiến trình và lỗi về giao diện.
- Logic tạo âm thanh chỉ nằm ở Python, giao diện không gọi API TTS trực tiếp.

Các thao tác chính:
- **Vai:** chọn giọng, cảm xúc mặc định, tốc độ, cao độ cho từng vai.
- **Câu thoại:** sửa chữ (dùng `漢字{かな}` để ép cách đọc), chọn vai, cảm xúc/tốc độ riêng. Chọn `theo vai` để dùng giá trị của vai.
- **Gợi ý đọc:** cột "Gợi ý đọc" hiển thị cách đọc hiragana dự đoán của câu, để giáo viên đối chiếu trước khi tạo âm thanh. "Áp dụng" ghi chú âm `{かな}` cho các từ toàn chữ Hán. Từ lẫn Hán-kana (ví dụ `久しぶり`) không tự động, cần sửa tay.
- **Nghe thử:** `▶ Nghe` tổng hợp đúng một câu (dùng cache) và phát ngay. Trước khi nghe thử hoặc tạo âm thanh, giao diện tự lưu file.
- **Tạo âm thanh:** chạy `tts.py --project`, xuất `.mp3` cạnh file project, log hiển thị bên dưới.

Chạy phát triển:

```bash
cd gui
npm install
npm run dev
```

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
- `--bgm FILE --bgm-db -18`: trộn nhạc nền lặp lại dưới lời thoại, có fade vào và ra. Nhạc nền do giáo viên cung cấp, dự án không đính kèm.
- Mỗi lần xuất còn ghi `<tên>.timeline.json` (vị trí từng câu và dữ liệu sóng). Giao diện đọc file này để vẽ timeline sau khi tạo âm thanh.

## Cú pháp kịch bản

| Cú pháp | Ý nghĩa |
| --- | --- |
| `[1] 文` | Lời thoại của vai 1 (vai khai báo trong `roles.yaml`) |
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
providers/        TTSProvider (base), EdgeProvider, VoicevoxProvider
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

## Engine TTS

Chỉ liệt kê engine miễn phí, mã mở, dùng không kinh doanh.

| Engine | Trạng thái | Ghi chú |
| --- | --- | --- |
| Edge-TTS | Đã cài (mặc định) | Miễn phí, không cần key. Dịch vụ của Microsoft không chính thức, không có SLA, có thể ngừng bất cứ lúc nào. Thư viện `edge-tts` là mã mở. |
| VOICEVOX | Đã cài, chạy offline | Cần chạy VOICEVOX Engine trước (mặc định `http://127.0.0.1:50021`, đổi bằng `VOICEVOX_URL`). Trường `voice` là mã nhân vật, ví dụ `3`. Không có cảm xúc tách riêng; `emotion` bị bỏ qua. Mỗi nhân vật có điều khoản riêng, cần đọc trước khi dùng. Chưa kiểm chứng với engine thật trong môi trường phát triển (chỉ test bằng server giả). |

Các engine mã mở khác cần kiểm tra trước khi đưa vào: giấy phép của mã và của model giọng, và có giọng tiếng Nhật hay không. Khi thêm engine mới, chỉ cần viết một lớp mới kế thừa `TTSProvider` trong `providers/`.

## Lưu ý

- Edge chỉ có 2 giọng ja-JP. Vai 3 trong mẫu dùng chung giọng vai 2 với pitch thấp hơn.
- Cảm xúc trên Edge chỉ là mô phỏng bằng pitch/rate.
- Thư mục `docs/ui/` chỉ chứa ảnh tham khảo, không phải giao diện đã làm.
- `--lufs` có thể làm cắt đỉnh (clipping) khi bài quá nhỏ hoặc nhạc nền quá to. Nếu thấy cảnh báo `Possible clipped samples`, giảm `--bgm-db` hoặc chọn LUFS thấp hơn.
- Luôn nghe duyệt từng câu trước khi phát cho lớp, đặc biệt các chữ Hán đọc nhiều cách.

## Lộ trình đề xuất

Các đề xuất sau đến từ đợt rà soát mã nguồn. Thứ tự là thứ tự thực hiện. Trạng thái cập nhật khi làm xong.

**Sửa lỗi và hạ tầng**
1. [ ] `requirements.txt` khai báo đủ `numpy` và `pyloudnorm` (đang ở PR #10).
2. [ ] CI chạy `pytest` trên GitHub Actions (đang ở PR #10).
3. [x] `[sfx=...]` tìm file tương đối theo thư mục chứa kịch bản, không theo thư mục chạy lệnh.
4. [ ] Giới hạn đường dẫn mà IPC của Electron được đọc và ghi (`project:save`, `output:load`).

**Giao diện biên tập**
5. [ ] Mở kịch bản `.txt` trực tiếp trong giao diện.
6. [ ] Hiển thị lỗi theo dòng và nhảy tới câu lỗi.
7. [ ] Chọn giọng VOICEVOX từ danh sách lấy từ `/speakers`.
8. [ ] Undo/Redo và phím tắt (Ctrl+S, Ctrl+Z, Enter).

**Đầu ra cho lớp học**
9. [ ] Chế độ luyện nói theo vai (role-play): chỉ vai người học có tiếng, vai còn lại thành khoảng lặng.
10. [ ] Chế độ shadowing: sau mỗi câu chèn khoảng lặng để học viên nhắc lại.
11. [ ] Xuất phiếu học tập HTML có furigana (`<ruby>`).

**Tiện ích**
12. [ ] Từ điển cách đọc do người dùng quản lý, lưu theo dự án hoặc dùng chung.
13. [ ] Lệnh xem và xóa cache (`--clear-cache`).
14. [ ] Xử lý hàng loạt: một thư mục kịch bản, xuất hết vào một thư mục đầu ra.
15. [ ] Lint kịch bản trong giao diện: vai chưa khai báo, chữ Hán thiếu cách đọc, file sfx không tồn tại.

**Theo mockup, chưa làm**
16. [ ] Ghi âm giọng thật làm mẫu (nút Record).
17. [ ] Thư viện giọng và mẫu, mục Cài đặt chung.
18. [ ] Nút "Generate All" và xuất MP3/WAV trong giao diện.

**Hạ tầng bổ sung**
19. [ ] Cấu hình đóng gói Electron (`electron-builder`).
20. [ ] Test cho renderer và IPC.
