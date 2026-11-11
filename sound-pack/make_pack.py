"""Tổng hợp gói âm thanh CC0 của textts (sfx + âm nền) hoàn toàn bằng code.

Mọi âm thanh do script này tạo ra (không dùng bản ghi của bên thứ ba), phát hành CC0.
Chạy:  python sound-pack/make_pack.py
Ghi file vào sound-pack/v1/ và danh mục vào gui/electron/sound-pack.json.
Không sửa file trong v1/ sau khi đã phát hành: app kiểm tra sha256. Muốn đổi thì tạo v2/.
"""
from __future__ import annotations

import hashlib
import json
import subprocess
import tempfile
import wave
from pathlib import Path

import numpy as np

SR = 44100
VERSION = "v1"
ROOT = Path(__file__).resolve().parent
OUT = ROOT / VERSION
MANIFEST = ROOT.parent / "gui" / "electron" / "sound-pack.json"
BASE_URL = f"https://raw.githubusercontent.com/miyagitaisuki/textts/main/sound-pack/{VERSION}/"
rng = np.random.default_rng(20261111)


# ---------- khối dựng ----------
def t(sec: float) -> np.ndarray:
    return np.arange(int(sec * SR)) / SR


def env(n: int, attack: float = 0.005, decay: float = 1.0) -> np.ndarray:
    x = np.arange(n) / SR
    a = np.clip(x / max(attack, 1e-4), 0, 1)
    return a * np.exp(-x / decay)


def bell(freq: float, sec: float, decay: float = 0.8, partials=((1, 1), (2.76, 0.4), (5.4, 0.2), (8.9, 0.08))) -> np.ndarray:
    x = t(sec)
    s = sum(a * np.sin(2 * np.pi * freq * r * x) * np.exp(-x * r / decay) for r, a in partials)
    return s * env(len(x), 0.002, 10)


def tone(freq: float, sec: float, harmonics=(1.0, 0.3, 0.1), decay: float = 0.6) -> np.ndarray:
    x = t(sec)
    s = sum(a * np.sin(2 * np.pi * freq * (i + 1) * x) for i, a in enumerate(harmonics))
    return s * env(len(x), 0.004, decay)


def noise(sec: float) -> np.ndarray:
    return rng.standard_normal(int(sec * SR))


def onepole_lp(x: np.ndarray, cutoff: float) -> np.ndarray:
    a = np.exp(-2 * np.pi * cutoff / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i, v in enumerate(x):
        acc = (1 - a) * v + a * acc
        y[i] = acc
    return y


def fft_band(x: np.ndarray, lo: float, hi: float) -> np.ndarray:
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    X[(f < lo) | (f > hi)] = 0
    return np.fft.irfft(X, len(x))


def place(buf: np.ndarray, snd: np.ndarray, at: float, gain: float = 1.0) -> None:
    i = int(at * SR)
    j = min(len(buf), i + len(snd))
    if i < len(buf):
        buf[i:j] += gain * snd[: j - i]


def silence(sec: float) -> np.ndarray:
    return np.zeros(int(sec * SR))


def loopable(x: np.ndarray, xfade: float = 1.5) -> np.ndarray:
    """Nối đuôi vào đầu bằng crossfade để phát lặp không bị gờ."""
    n = int(xfade * SR)
    head, tail = x[:n], x[-n:]
    ramp = np.linspace(0, 1, n)
    out = x[n:-n].copy() if len(x) > 2 * n else x.copy()
    return np.concatenate([tail * (1 - ramp) + head * ramp, out])


def norm(x: np.ndarray, peak_db: float = -3.0) -> np.ndarray:
    m = np.max(np.abs(x)) or 1.0
    return x / m * 10 ** (peak_db / 20)


def fade(x: np.ndarray, fin: float = 0.005, fout: float = 0.05) -> np.ndarray:
    x = x.copy()
    a, b = int(fin * SR), int(fout * SR)
    if a:
        x[:a] *= np.linspace(0, 1, a)
    if b:
        x[-b:] *= np.linspace(1, 0, b)
    return x


# ---------- hiệu ứng (sfx) ----------
def doorbell():
    return np.concatenate([bell(784, 0.55, 0.5), bell(622, 1.6, 0.9)])


def school_chime():
    notes = [(659, 0), (523, 0), (587, 0), (392, 0.4), (392, 0), (587, 0), (659, 0), (523, 0.4)]
    out, at = silence(8.5), 0.0
    for f, extra in notes:
        place(out, bell(f, 2.5, 1.0), at, 0.6)
        at += 0.85 + extra
    return out


def station_chime(rev: bool = False):
    notes = [523, 659, 784, 1047]
    if rev:
        notes = notes[::-1]
    out = silence(2.6)
    for i, f in enumerate(notes):
        place(out, bell(f, 1.6, 0.6), i * 0.32, 0.7)
    return out


def phone_ring():
    x = t(1.0)
    burst = (np.sin(2 * np.pi * 400 * x) + 0.4 * np.sin(2 * np.pi * 800 * x)) * (0.5 + 0.5 * np.sign(np.sin(2 * np.pi * 16 * x)))
    burst = fade(burst, 0.01, 0.02)
    return np.concatenate([burst, silence(2.0), burst, silence(1.0)])


def knock():
    out = silence(1.6)
    for i, at in enumerate([0.05, 0.3, 0.55]):
        x = t(0.12)
        thud = np.sin(2 * np.pi * 180 * x * (1 - 0.3 * x / 0.12)) * np.exp(-x * 45)
        click = fft_band(noise(0.12), 800, 4000) * np.exp(-x * 120) * 0.25
        place(out, thud + click, at, 1.0 - i * 0.05)
    return out


def correct():
    out = silence(1.0)
    place(out, tone(1047, 0.8, (1, 0.2), 0.3), 0)
    place(out, tone(1319, 0.9, (1, 0.2), 0.35), 0.13)
    return out


def wrong():
    x = t(0.7)
    saw = 2 * ((110 * x) % 1) - 1 + 0.6 * (2 * ((165 * x) % 1) - 1)
    return fade(onepole_lp(saw, 1800), 0.01, 0.08)


def notify():
    out = silence(0.8)
    place(out, bell(1568, 0.6, 0.25, ((1, 1), (2, 0.2))), 0)
    place(out, bell(2093, 0.6, 0.25, ((1, 1), (2, 0.2))), 0.09, 0.8)
    return out


def applause(sec: float = 4.0):
    out = silence(sec)
    for _ in range(int(sec * 70)):
        at = rng.uniform(0, sec - 0.05)
        clap = fft_band(noise(0.04), 600, 6000) * np.exp(-t(0.04) * 90)
        place(out, clap, at, rng.uniform(0.3, 1.0))
    ramp = np.minimum(1, np.minimum(t(sec) / 0.4, (sec - t(sec)) / 1.2))
    return out * ramp


def footsteps(n: int = 8):
    out = silence(n * 0.5 + 0.4)
    for i in range(n):
        x = t(0.15)
        step = fft_band(noise(0.15), 80, 1500) * np.exp(-x * 30) + 0.5 * np.sin(2 * np.pi * 90 * x) * np.exp(-x * 40)
        place(out, step, 0.1 + i * 0.5 + rng.uniform(-0.02, 0.02), 0.8 if i % 2 else 1.0)
    return out


def camera():
    out = silence(0.4)
    for at in (0.0, 0.09):
        place(out, fft_band(noise(0.03), 1500, 8000) * np.exp(-t(0.03) * 150), at)
    return out


def page_turn():
    x = t(0.6)
    s = fft_band(noise(0.6), 1000, 7000) * np.sin(np.pi * x / 0.6) ** 2
    return s * (0.6 + 0.4 * np.sin(2 * np.pi * 7 * x))


def cup_clink():
    return bell(2637, 0.8, 0.25, ((1, 1), (2.3, 0.5), (4.1, 0.2)))


# ---------- âm nền / nhạc nền (lặp được) ----------
LOOP = 32.0


def rain():
    base = fft_band(noise(LOOP), 400, 9000) * 0.25
    for _ in range(int(LOOP * 60)):
        drop = fft_band(noise(0.02), 2000, 9000) * np.exp(-t(0.02) * 250)
        place(base, drop, rng.uniform(0, LOOP - 0.05), rng.uniform(0.1, 0.6))
    return loopable(base)


def wind():
    n = noise(LOOP)
    lfo = 0.55 + 0.45 * np.sin(2 * np.pi * t(LOOP) / 8) * np.sin(2 * np.pi * t(LOOP) / 3.3 + 1)
    return loopable(fft_band(n, 80, 900) * lfo)


def waves():
    x = t(LOOP)
    swell = np.clip(np.sin(2 * np.pi * x / 8.0), 0, None) ** 1.5
    return loopable(fft_band(noise(LOOP), 150, 6000) * (0.15 + swell))


def murmur(clinks: bool = True):
    """Tiếng rì rầm của đám đông: nhiều 'giọng' nhiễu dải tiếng nói, nhịp âm tiết ngẫu nhiên."""
    x = t(LOOP)
    out = np.zeros_like(x)
    for _ in range(14):
        rate = rng.uniform(3, 6)
        syll = np.clip(np.sin(2 * np.pi * rate * x + rng.uniform(0, 6)), 0, None)
        phrase = (np.sin(2 * np.pi * x / rng.uniform(2, 5) + rng.uniform(0, 6)) > -0.2).astype(float)
        lo = rng.uniform(250, 500)
        out += fft_band(noise(LOOP), lo, lo + rng.uniform(1200, 2500)) * syll * onepole_lp(phrase, 8)
    out = out / np.std(out) * 0.1  # mức rì rầm cố định để tiếng cốc không lấn át
    if clinks:
        for _ in range(10):
            place(out, cup_clink(), rng.uniform(0, LOOP - 1), rng.uniform(0.08, 0.18))
    return loopable(out)


def birds():
    x = t(LOOP)
    out = fft_band(noise(LOOP), 200, 3000) * 0.05  # gió nhẹ
    for _ in range(40):
        f0 = rng.uniform(2500, 4500)
        n = rng.integers(2, 6)
        at = rng.uniform(0, LOOP - 2)
        for k in range(n):
            d = rng.uniform(0.06, 0.14)
            xc = t(d)
            sweep = f0 * (1 + rng.uniform(-0.3, 0.3) * xc / d)
            chirp = np.sin(2 * np.pi * np.cumsum(sweep) / SR) * np.sin(np.pi * xc / d)
            place(out, chirp, at + k * (d + 0.05), rng.uniform(0.2, 0.6))
    return loopable(out)


def street():
    """Đường phố: tiếng ù xe cộ nền + xe chạy ngang (to dần rồi nhỏ, đổi cao độ) + thỉnh thoảng còi."""
    x = t(LOOP)
    out = fft_band(noise(LOOP), 40, 400) * 0.35 * (0.8 + 0.2 * np.sin(2 * np.pi * x / 11))
    for _ in range(9):
        at, dur = rng.uniform(0, LOOP - 6), rng.uniform(3.0, 5.5)
        xc = t(dur)
        swell = np.exp(-(((xc - dur / 2) / (dur / 5)) ** 2))
        whoosh = fft_band(noise(dur), 120, 2500) * swell
        f0 = rng.uniform(70, 110)
        doppler = f0 * (1 + 0.08 * np.tanh((dur / 2 - xc) * 2))  # cao độ hạ xuống khi xe đi qua
        engine = np.sin(2 * np.pi * np.cumsum(doppler) / SR) * swell * 0.6
        place(out, whoosh + engine, at, rng.uniform(0.5, 1.0))
    for _ in range(2):
        at = rng.uniform(2, LOOP - 3)
        xh = t(0.45)
        horn = (np.sign(np.sin(2 * np.pi * 400 * xh)) + np.sign(np.sin(2 * np.pi * 500 * xh))) * 0.25
        place(out, onepole_lp(horn, 2500) * np.minimum(1, np.minimum(xh / 0.02, (0.45 - xh) / 0.05)), at, 0.6)
    return loopable(out)


CHORDS_SOFT = [(261.6, 329.6, 392.0), (220.0, 261.6, 329.6), (174.6, 220.0, 261.6), (196.0, 246.9, 293.7)]


def soft_music():
    """Nhạc nền nhẹ: rải hợp âm C - Am - F - G kiểu piano."""
    bar = 2.0
    out = silence(bar * 16 + 3)
    for b in range(16):
        ch = CHORDS_SOFT[b % 4]
        place(out, tone(ch[0] / 2, 3.0, (1, 0.4, 0.15), 1.2), b * bar, 0.5)
        for i, f in enumerate([ch[0], ch[1], ch[2], ch[1] * 2, ch[2], ch[1]]):
            place(out, tone(f * 2, 1.6, (1, 0.3, 0.08), 0.5), b * bar + i * bar / 6, 0.32)
    return loopable(out[: int(bar * 16 * SR) + int(1.5 * SR)], 1.5)


def happy_music():
    """Nhạc vui: marimba nhịp nhanh, F - G - Em - Am."""
    chords = [(349.2, 440.0, 523.3), (392.0, 493.9, 587.3), (329.6, 392.0, 493.9), (440.0, 523.3, 659.3)]
    beat = 0.25
    out = silence(beat * 128 + 2)
    pattern = [0, 1, 2, 1, 0, 2, 1, 2]
    for b in range(16):
        ch = chords[b % 4]
        place(out, tone(ch[0] / 2, 0.5, (1, 0.5), 0.25), b * 8 * beat, 0.6)
        place(out, tone(ch[0] / 2, 0.5, (1, 0.5), 0.25), (b * 8 + 4) * beat, 0.45)
        for i, k in enumerate(pattern):
            place(out, bell(ch[k] * 2, 0.5, 0.18, ((1, 1), (4, 0.25), (9.9, 0.05))), (b * 8 + i) * beat, 0.35)
    return loopable(out[: int(beat * 128 * SR) + int(1.0 * SR)], 1.0)


# ---------- danh mục ----------
SFX = [
    ("chuong-cua", "Chuông cửa (ピンポーン)", "Nhà cửa", doorbell),
    ("go-cua", "Gõ cửa 3 tiếng", "Nhà cửa", knock),
    ("dien-thoai-reo", "Điện thoại reo", "Nhà cửa", phone_ring),
    ("tin-nhan", "Báo tin nhắn", "Nhà cửa", notify),
    ("chuong-truong", "Chuông trường (キーンコーン)", "Trường học", school_chime),
    ("thong-bao-bat-dau", "Thông báo nhà ga (bắt đầu)", "Nhà ga / Công cộng", lambda: station_chime(False)),
    ("thong-bao-ket-thuc", "Thông báo nhà ga (kết thúc)", "Nhà ga / Công cộng", lambda: station_chime(True)),
    ("dung", "Trả lời đúng (ピンポン)", "Lớp học / Quiz", correct),
    ("sai", "Trả lời sai (ブー)", "Lớp học / Quiz", wrong),
    ("vo-tay", "Vỗ tay", "Lớp học / Quiz", applause),
    ("lat-trang", "Lật trang sách", "Lớp học / Quiz", page_turn),
    ("buoc-chan", "Tiếng bước chân", "Đời sống", footsteps),
    ("chup-anh", "Chụp ảnh", "Đời sống", camera),
    ("cham-coc", "Chạm cốc", "Đời sống", cup_clink),
]
BGM = [
    ("quan-ca-phe", "Quán cà phê (rì rầm + tiếng cốc)", "Âm nền", lambda: murmur(True)),
    ("dam-dong", "Đám đông / sảnh chờ", "Âm nền", lambda: murmur(False)),
    ("mua", "Mưa", "Thiên nhiên", rain),
    ("gio", "Gió", "Thiên nhiên", wind),
    ("song-bien", "Sóng biển", "Thiên nhiên", waves),
    ("cong-vien", "Công viên (chim hót)", "Thiên nhiên", birds),
    ("nhac-nhe", "Nhạc nền nhẹ nhàng", "Nhạc", soft_music),
    ("nhac-vui", "Nhạc nền vui tươi", "Nhạc", happy_music),
    ("duong-pho", "Đường phố / xe cộ (ô tô chạy qua, còi)", "Âm nền", street),
]


# Mục lục cho AI đọc (không cần nghe): mô tả, từ khóa, và "dùng tạm cho" những âm gần giống.
META = {
    "sfx-chuong-cua": ("Chuông cửa nhà kiểu Nhật ピンポーン, hai nốt", "chuông cửa, khách đến, nhà, インターホン", "chuông, có người đến, interphone"),
    "sfx-go-cua": ("Ba tiếng gõ cửa gỗ", "gõ cửa, cửa, ノック", "khách đến, vào phòng"),
    "sfx-dien-thoai-reo": ("Điện thoại bàn reo hai hồi", "điện thoại, reo, gọi điện, 電話", "chuông điện thoại di động, cuộc gọi"),
    "sfx-tin-nhan": ("Tiếng báo tin nhắn/thông báo điện thoại ngắn", "tin nhắn, thông báo, điện thoại di động, LINE", "email, nhắc lịch"),
    "sfx-chuong-truong": ("Chuông trường Nhật キーンコーンカーンコーン, báo giờ học", "chuông trường, giờ học, tan học, trường học", "chuông nhà thờ, chuông báo giờ"),
    "sfx-thong-bao-bat-dau": ("Chuông bốn nốt đi lên trước thông báo ở nhà ga/sân bay/siêu thị", "thông báo, nhà ga, sân bay, loa", "bắt đầu, phát thanh"),
    "sfx-thong-bao-ket-thuc": ("Chuông bốn nốt đi xuống sau thông báo", "kết thúc thông báo, nhà ga, loa", "hết giờ, kết thúc"),
    "sfx-dung": ("Âm 'đúng rồi' ピンポン cho câu đố", "đúng, chính xác, quiz", "thành công, chọn đúng"),
    "sfx-sai": ("Âm 'sai rồi' ブー cho câu đố", "sai, quiz, buzzer", "lỗi, thất bại"),
    "sfx-vo-tay": ("Tràng vỗ tay của nhóm người, khoảng 4 giây", "vỗ tay, khen, chúc mừng", "hoan hô, khán giả, kết thúc buổi"),
    "sfx-lat-trang": ("Tiếng lật trang sách/giấy", "lật trang, sách, giấy", "thư viện, đọc sách, tài liệu"),
    "sfx-buoc-chan": ("Tiếng bước chân đi bộ trên sàn cứng", "bước chân, đi bộ, đến gần", "người đi vào, hành lang"),
    "sfx-chup-anh": ("Tiếng màn trập máy ảnh", "chụp ảnh, máy ảnh, camera", "điện thoại chụp hình"),
    "sfx-cham-coc": ("Tiếng cốc thủy tinh chạm nhau", "chạm cốc, cụng ly, 乾杯", "nhà hàng, tiệc, quán nhậu, bát đĩa"),
    "bgm-quan-ca-phe": ("Quán cà phê: người nói rì rầm, thỉnh thoảng tiếng cốc", "quán cà phê, quán ăn, rì rầm, cốc", "nhà hàng, căn tin, quán nhậu, sảnh khách sạn"),
    "bgm-dam-dong": ("Đám đông nói chuyện rì rầm, không có tiếng cốc", "đám đông, sảnh chờ, rì rầm", "nhà ga, sân bay, bệnh viện, văn phòng, siêu thị, lớp học giờ ra chơi"),
    "bgm-mua": ("Mưa rơi đều, hạt mưa lộp độp", "mưa, trời mưa, 雨", "sấm, bão, giông, mưa phùn, mái hiên"),
    "bgm-gio": ("Gió thổi từng đợt", "gió, ngoài trời, lạnh", "bão, mùa đông, đồi núi, tuyết"),
    "bgm-song-bien": ("Sóng biển vỗ bờ từng đợt", "biển, sóng, bãi biển", "hồ, sông, cảng, du lịch biển"),
    "bgm-cong-vien": ("Công viên: chim hót, gió nhẹ", "công viên, chim hót, thiên nhiên, buổi sáng", "vườn, rừng, dã ngoại, sân trường, ngoại ô"),
    "bgm-nhac-nhe": ("Nhạc nền nhẹ nhàng kiểu piano, chậm", "nhạc nền, nhẹ nhàng, thư giãn", "mở đầu bài, kể chuyện, cảm động"),
    "bgm-nhac-vui": ("Nhạc nền vui tươi kiểu marimba, nhịp nhanh", "nhạc nền, vui, sôi động", "trò chơi, lễ hội, quảng cáo, trẻ em"),
    "bgm-duong-pho": ("Đường phố: tiếng xe ù nền, ô tô chạy ngang, thỉnh thoảng còi", "đường phố, xe cộ, ô tô, giao thông, còi", "ngã tư, bến xe buýt, thành phố, taxi"),
}


def write_mp3(x: np.ndarray, path: Path, bitrate: str) -> None:
    pcm = (np.clip(x, -1, 1) * 32767).astype(np.int16)
    with tempfile.TemporaryDirectory() as tmp:
        wav = Path(tmp) / "a.wav"
        with wave.open(str(wav), "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(SR)
            w.writeframes(pcm.tobytes())
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(wav), "-b:a", bitrate,
                        "-map_metadata", "-1", "-fflags", "+bitexact", "-flags:a", "+bitexact", str(path)], check=True)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    items = []
    for kind, table, bitrate, peak in (("sfx", SFX, "96k", -3.0), ("bgm", BGM, "80k", -6.0)):
        for slug, name, category, fn in table:
            x = norm(fade(fn(), 0.003, 0.03 if kind == "sfx" else 0.0), peak)
            file = f"{kind}-{slug}.mp3"
            write_mp3(x, OUT / file, bitrate)
            data = (OUT / file).read_bytes()
            items.append({
                "id": f"{kind}-{slug}", "kind": kind, "name": name, "category": category, "file": file,
                "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest(),
                "duration": round(len(x) / SR, 2),
                "description": META[f"{kind}-{slug}"][0],
                "tags": [w.strip() for w in META[f"{kind}-{slug}"][1].split(",")],
                "related": [w.strip() for w in META[f"{kind}-{slug}"][2].split(",")],
            })
            print(f"{file:32s} {len(x) / SR:5.1f}s {len(data) / 1024:6.0f} KB")
    MANIFEST.write_text(json.dumps({
        "version": VERSION, "license": "CC0-1.0", "baseUrl": BASE_URL, "items": items,
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Tổng {sum(i['bytes'] for i in items) / 1024 / 1024:.1f} MB, {len(items)} âm → {MANIFEST}")


if __name__ == "__main__":
    main()
