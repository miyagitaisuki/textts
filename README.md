# textts — TTS hội thoại tiếng Nhật cho lớp học

Biến kịch bản hội thoại (`[1] ...`, `[2] ...`) thành một file âm thanh liền mạch,
có khoảng nghỉ giữa các lượt nói và phụ đề `.srt` tùy chọn.

Thiết kế đầy đủ: xem kế hoạch kiến trúc (Phần 1–4). Trạng thái hiện tại: **giai đoạn 1 (MVP dòng lệnh)** + một phần giai đoạn 2 (cache, phụ đề, thử lại, cú pháp `漢字{かな}` và `[pause=ms]`).

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

# Chạy kiểm thử parser
python -m pytest -q
```

Câu nào lỗi sẽ được báo kèm số dòng và **không** xuất file, để tránh nghe nửa vời.
Kết quả tổng hợp được cache trong `cache/` theo hash, nên chạy lại chỉ tạo các câu đã sửa.

## Cú pháp kịch bản

| Cú pháp | Ý nghĩa |
| --- | --- |
| `[1] 文` | Lời thoại của vai 1 (vai khai báo trong `roles.yaml`) |
| `[2]{emotion=happy, speed=slow} 文` | Ghi đè thuộc tính cho riêng câu này |
| `漢字{かな}` | Ép cách đọc: hiển thị `漢字`, đọc `かな` |
| `[pause=1500]` | Khoảng lặng 1500 ms (chuyển cảnh) |
| `# ...` | Ghi chú, bỏ qua |
| Dòng thụt đầu | Nối tiếp vào câu trước |

Thuộc tính: `voice`, `emotion` (`neutral`/`happy`/`sad`/`angry`/`surprised`), `speed` (`slow`/`normal`/`fast`), `pitch` (Hz).

## Cấu trúc

```
tts.py            CLI
roles.yaml        engine, giọng và cấu hình vai, khoảng nghỉ
core/parser.py    phân tích kịch bản → danh sách câu
core/builder.py   ghép âm thanh, khoảng nghỉ, xuất .srt
providers/        TTSProvider (base) và EdgeProvider
examples/         kịch bản mẫu
tests/            unit test cho parser
```

## Lưu ý

- Edge-TTS là dịch vụ không chính thức, không có SLA. Giao diện `TTSProvider` cho phép thay bằng Gemini/OpenAI/VOICEVOX sau này.
- Edge chỉ có 2 giọng ja-JP. Vai 3 trong mẫu dùng chung giọng vai 2 với pitch thấp hơn.
- Cảm xúc trên Edge chỉ là mô phỏng bằng pitch/rate.
- Luôn nghe duyệt từng câu trước khi phát cho lớp, đặc biệt các chữ Hán đọc nhiều cách.
