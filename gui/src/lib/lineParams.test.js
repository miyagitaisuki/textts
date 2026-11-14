import { describe, expect, it } from "vitest";
import {
  LINE_PARAMS, accentSpec, clampParam, paramSupported, parseAccentSpec, pitchPattern, readParam, toggleAccent, writeParam,
} from "./lineParams.js";

const P = Object.fromEntries(LINE_PARAMS.map((p) => [p.key, p]));

describe("lineParams", () => {
  it("có đủ tempo, vol, pre, post với khoảng khớp parser", () => {
    expect(Object.keys(P)).toEqual(["tempo", "vol", "pre", "post"]);
    expect([P.tempo.min, P.tempo.max]).toEqual([0.5, 2]);
  });

  it("chỉ tempo phụ thuộc engine", () => {
    expect(paramSupported(P.tempo, "aivis")).toBe(true);
    expect(paramSupported(P.tempo, "edge")).toBe(false);
    expect(paramSupported(P.vol, "edge")).toBe(true);
  });

  it("writeParam ghi chuỗi, về mặc định thì xoá khoá", () => {
    const a = writeParam({ fx: "phone" }, P.tempo, 1.2);
    expect(a).toEqual({ fx: "phone", tempo: "1.2" });
    expect(writeParam(a, P.tempo, 1)).toEqual({ fx: "phone" });
  });

  it("kẹp giá trị và làm tròn theo số chữ số", () => {
    expect(clampParam(P.tempo, 9)).toBe(2);
    expect(clampParam(P.pre, -5)).toBe(0);
    expect(clampParam(P.pre, 123.7)).toBe(124);
    expect(readParam({ post: "500" }, P.post)).toBe(500);
    expect(readParam({}, P.vol)).toBe(0);
  });

  it("accent spec hai chiều", () => {
    expect(parseAccentSpec("2/0")).toEqual([2, 0]);
    expect(parseAccentSpec("x")).toBeNull();
    expect(parseAccentSpec(undefined)).toBeNull();
    expect(accentSpec([1, 0, 3])).toBe("1/0/3");
  });

  it("bấm mora đặt accent sau mora đó, bấm lại về 0", () => {
    expect(toggleAccent(0, 1)).toBe(2);
    expect(toggleAccent(2, 1)).toBe(0);
  });

  it("đường cao độ kiểu Tokyo", () => {
    expect(pitchPattern(4, 0)).toEqual([false, true, true, true]);
    expect(pitchPattern(3, 1)).toEqual([true, false, false]);
    expect(pitchPattern(4, 3)).toEqual([false, true, true, false]);
  });
});
