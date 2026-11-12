const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const vb = require("../electron/voice-bank.cjs");
const { fillAivisVoiceBank, baseName } = require("../electron/aivis-voicebank-fill.cjs");

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "aivis-fill-"));

const CATALOG = [
  { title: "まお", voiceTimbre: "YouthfulFemale", tags: ["いたずらっ子"], description: "小悪魔ボイス" },
  { title: "阿井田 茂", voiceTimbre: "MiddleAgedMale", tags: ["朗らかおじさん"], description: "バリトンボイス" },
];

test("baseName strips the trailing style suffix added to the engine's label", () => {
  assert.equal(baseName("まお (ノーマル)"), "まお");
  assert.equal(baseName("コハク"), "コハク");
  assert.equal(baseName("まお（ノーマル）"), "まお");
});

test("fills gender/age/personality/description only for voices matched in the catalog", async () => {
  const dir = tmp();
  try {
    vb.rememberLabels(dir, "aivis", [
      { value: "1", label: "まお (ノーマル)" },
      { value: "2", label: "阿井田 茂" },
      { value: "3", label: "Không rõ giọng" },
    ]);
    const { filled, unmatched } = await fillAivisVoiceBank({ dir, catalog: async () => CATALOG });
    assert.equal(filled, 2);
    assert.deepEqual(unmatched, ["Không rõ giọng"]);
    const bank = vb.readBank(dir);
    assert.equal(bank.voices["aivis:1"].gender, "nữ");
    assert.equal(bank.voices["aivis:1"].age, 20);
    assert.deepEqual(bank.voices["aivis:1"].personality, ["いたずらっ子"]);
    assert.equal(bank.voices["aivis:1"].description, "小悪魔ボイス");
    assert.equal(bank.voices["aivis:2"].gender, "nam");
    assert.equal(bank.voices["aivis:2"].age, 45);
    assert.equal(bank.voices["aivis:3"].gender, "");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("does not overwrite a teacher's own notes unless overwrite is set", async () => {
  const dir = tmp();
  try {
    vb.rememberLabels(dir, "aivis", [{ value: "1", label: "まお (ノーマル)" }]);
    vb.setVoice(dir, { engine: "aivis", voice: "1", meta: { gender: "nam", age: 8, description: "Ghi chú riêng" } });
    await fillAivisVoiceBank({ dir, catalog: async () => CATALOG });
    let bank = vb.readBank(dir);
    assert.equal(bank.voices["aivis:1"].gender, "nam");
    assert.equal(bank.voices["aivis:1"].age, 8);
    assert.equal(bank.voices["aivis:1"].description, "Ghi chú riêng");

    await fillAivisVoiceBank({ dir, catalog: async () => CATALOG, overwrite: true });
    bank = vb.readBank(dir);
    assert.equal(bank.voices["aivis:1"].gender, "nữ");
    assert.equal(bank.voices["aivis:1"].age, 20);
    assert.equal(bank.voices["aivis:1"].description, "小悪魔ボイス");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
