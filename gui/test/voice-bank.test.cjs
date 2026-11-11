const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const vb = require("../electron/voice-bank.cjs");

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "voicebank-"));

test("notes per voice are cleaned, saved and listed in GIONG.md", () => {
  const dir = tmp();
  vb.rememberLabels(dir, "aivis", [{ value: "888753760", label: "まお (ノーマル)" }, { value: "1", label: "コハク" }]);
  vb.setVoice(dir, {
    engine: "aivis", voice: "888753760",
    meta: { nickname: "Bé Mao", gender: "nữ", age: "8", styles: "trẻ con, vui tươi", description: "Giọng bé gái tinh nghịch", favorite: true },
  });
  vb.setVoice(dir, { engine: "aivis", voice: "1", meta: { hidden: true, gender: "khác lạ", age: 999 } });
  const bank = vb.readBank(dir);
  assert.deepEqual(bank.voices["aivis:888753760"], {
    label: "まお (ノーマル)", nickname: "Bé Mao", gender: "nữ", age: 8, styles: ["trẻ con", "vui tươi"],
    description: "Giọng bé gái tinh nghịch", favorite: true, hidden: false,
  });
  assert.equal(bank.voices["aivis:1"].gender, "");
  assert.equal(bank.voices["aivis:1"].age, null);
  const md = fs.readFileSync(path.join(dir, "GIONG.md"), "utf-8");
  assert.match(md, /\| 888753760 \| ★ Bé Mao \| まお \(ノーマル\) \| nữ \| 8 \| trẻ con, vui tươi \|/);
  assert.doesNotMatch(md, /コハク/); // giọng ẩn không đưa cho AI
  assert.throws(() => vb.setVoice(dir, { engine: "x", voice: "1", meta: {} }), /Engine/);
});

test("voice dropdown shows nicknames, favourites first, hides hidden voices", () => {
  const bank = { voices: {
    "voicevox:3": { nickname: "Zunda", gender: "nữ", age: 10, styles: ["vui"], favorite: true },
    "voicevox:2": { hidden: true },
  } };
  const opts = vb.decorateOptions("voicevox", [
    { value: "1", label: "四国めたん" }, { value: "2", label: "X" }, { value: "3", label: "ずんだもん" },
  ], bank);
  assert.deepEqual(opts.map((o) => o.label), ["★ Zunda — ずんだもん (nữ, 10 tuổi, vui)", "四国めたん"]);
});
