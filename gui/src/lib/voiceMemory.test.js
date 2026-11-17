import { describe, expect, it } from "vitest";
import { applyMemory, emptyMemory, fillMissingVoices, loadMemory, rememberProject, saveMemory } from "./voiceMemory.js";

const role = (name, voice) => ({ name, voice, emotion: "neutral", speed: "normal", pitch: 0, gain_db: 0 });

describe("voiceMemory", () => {
  it("remembers voices per engine by character name and role id", () => {
    const m = rememberProject(emptyMemory(), { engine: "aivis", roles: { 1: role("学生", "1431611904"), 2: role("", "1937616896") } });
    expect(m.engine).toBe("aivis");
    expect(m.roles.aivis["name:学生"].voice).toBe("1431611904");
    expect(m.roles.aivis["#1"].voice).toBe("1431611904");
    expect(m.roles.aivis["#2"].voice).toBe("1937616896");
  });

  it("applies by name first, then by role id, and keeps gain", () => {
    let m = rememberProject(emptyMemory(), { engine: "aivis", roles: { 1: role("学生", "1431611904"), 2: role("駅員", "1937616896") } });
    const imported = { engine: "aivis", roles: { 1: role("駅員", "111"), 3: role("田中", "222") } };
    const { project, applied } = applyMemory(imported, m);
    expect(project.engine).toBe("aivis");
    expect(project.roles[1].voice).toBe("1937616896"); // tên 駅員 thắng mã vai #1
    expect(project.roles[3].voice).toBe("222"); // chưa nhớ
    expect(applied).toEqual(["1"]);
  });

  it("fills voices the engine does not have, preferring unused ones", () => {
    const p = fillMissingVoices({ roles: { 1: role("A", "8"), 2: role("B", "ja-JP-KeitaNeural") } }, ["3", "8", "10"]);
    expect(p.roles[1].voice).toBe("8");
    expect(p.roles[2].voice).toBe("3");
    const q = fillMissingVoices({ roles: { 1: role("A", "x"), 2: role("B", "y"), 3: role("C", "z") } }, ["3", "8"]);
    expect([q.roles[1].voice, q.roles[2].voice, q.roles[3].voice]).toEqual(["3", "8", "3"]);
  });

  it("survives broken storage", () => {
    const store = { data: {}, getItem(k) { return this.data[k] ?? null; }, setItem(k, v) { this.data[k] = v; } };
    store.setItem("textts.voiceMemory", "{oops");
    expect(loadMemory(store)).toEqual(emptyMemory());
    saveMemory(store, { engine: "aivis", roles: {} });
    expect(loadMemory(store).engine).toBe("aivis");
  });
});
