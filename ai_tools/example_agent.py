"""Ví dụ code Python để AI Agent hoặc script tự động gọi textts API tạo audio bài học."""
import json
import urllib.request

API_BASE = "http://127.0.0.1:8000"


def generate_lesson_dialogue(title: str, script: str, engine: str = "voicevox"):
    """Gửi kịch bản tới textts API và nhận trọn bộ tài liệu bài học."""
    payload = {
        "title": title,
        "script": script,
        "engine": engine,
        "options": {
            "format": "mp3",
            "slow": True,
            "srt": True,
            "worksheet": True,
        },
    }

    req = urllib.request.Request(
        f"{API_BASE}/api/v1/dialogue",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )

    with urllib.request.urlopen(req) as response:
        result = json.loads(response.read().decode("utf-8"))
        return result


if __name__ == "__main__":
    kịch_bản = """
[1] すみません、日本語の辞書{じしょ}はどこですか。
[2] あそこですよ。
[pause=1000]
[1] ありがとうございます。
"""
    print("Đang gửi yêu cầu tạo bài học tới textts API...")
    try:
        data = generate_lesson_dialogue("Bai_Mau_AI", kịch_bản, engine="edge")  # test bằng edge nếu chưa bật voicevox
        print("\n🎉 Tạo bài học thành công!")
        print(f"- Thời lượng: {data['duration_s']} giây")
        print(f"- File Audio: {data['files']['audio_url']}")
        print(f"- File Bản chậm 0.8x: {data['files']['slow_url']}")
        print(f"- Phụ đề SRT: {data['files']['srt_url']}")
        print(f"- Phiếu in Furigana HTML: {data['files']['worksheet_url']}")
    except Exception as e:
        print(f"Lỗi: {e}")
