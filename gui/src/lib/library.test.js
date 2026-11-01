import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS, indexIssues, loadSettings, patchFromPreset, presetFromRole, removePreset,
  saveSettings, upsertPreset,
} from "./library.js";

const ROLE = { name: "Cô giáo", voice: "ja-JP-NanamiNeural", emotion: "happy", speed: "slow", pitch: 5, gain_db: 0 };

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
  };
}

describe("presets", () => {
  it("keeps only the preset fields from a role", () => {
    expect(presetFromRole(ROLE)).toEqual({
      voice: "ja-JP-NanamiNeural", emotion: "happy", speed: "slow", pitch: 5,
    });
  });

  it("adds presets sorted by name and replaces one with the same name", () => {
    let list = upsertPreset([], "Vui", ROLE);
    list = upsertPreset(list, "  An toàn ", { ...ROLE, pitch: -3 });
    expect(list.map((p) => p.name)).toEqual(["An toàn", "Vui"]);
    list = upsertPreset(list, "Vui", { ...ROLE, emotion: "sad" });
    expect(list).toHaveLength(2);
    expect(list.find((p) => p.name === "Vui").emotion).toBe("sad");
  });

  it("rejects an empty name", () => {
    expect(() => upsertPreset([], "   ", ROLE)).toThrow(/không được để trống/);
  });

  it("removes a preset by name", () => {
    const list = upsertPreset(upsertPreset([], "A", ROLE), "B", ROLE);
    expect(removePreset(list, "A").map((p) => p.name)).toEqual(["B"]);
  });

  it("applies only the known preset fields", () => {
    expect(patchFromPreset({ voice: "3", emotion: "angry", speed: "fast", pitch: 0, name: "x" }))
      .toEqual({ voice: "3", emotion: "angry", speed: "fast", pitch: 0 });
  });
});

describe("settings", () => {
  it("returns defaults when nothing is stored", () => {
    expect(loadSettings(memoryStorage())).toEqual(DEFAULT_SETTINGS);
  });

  it("round-trips saved settings", () => {
    const storage = memoryStorage();
    const saved = { format: "wav", lufs: "-16", slow: true, srt: false, outputRoot: "/home/u/lop" };
    saveSettings(storage, saved);
    expect(loadSettings(storage)).toEqual(saved);
  });

  it("falls back to defaults when stored data is corrupt", () => {
    expect(loadSettings(memoryStorage({ "textts.settings": "{not json" }))).toEqual(DEFAULT_SETTINGS);
  });
});

describe("indexIssues", () => {
  it("lets an error win over warnings for the same line", () => {
    const byId = indexIssues([
      { id: "L001", level: "warning", message: "chữ Hán" },
      { id: "L001", level: "error", message: "file thiếu" },
    ]);
    expect(byId.L001.level).toBe("error");
  });

  it("joins warning messages for the same line", () => {
    const byId = indexIssues([
      { id: "L002", level: "warning", message: "a" },
      { id: "L002", level: "warning", message: "b" },
    ]);
    expect(byId.L002).toEqual({ id: "L002", level: "warning", message: "a; b" });
  });
});
