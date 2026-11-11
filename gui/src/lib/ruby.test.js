import { describe, expect, it } from "vitest";
import { hasRuby, splitRuby, toTtsText } from "./ruby.js";

describe("ruby", () => {
  it("reads parenthesised furigana", () => {
    expect(toTtsText("素晴(すば)らしい意欲(いよく)ですね")).toBe("すばらしいいよくですね");
    expect(toTtsText("貴社（きしゃ）が")).toBe("きしゃが");
    expect(toTtsText("駅{えき}はどこ")).toBe("えきはどこ");
  });

  it("keeps ordinary parentheses", () => {
    expect(toTtsText("はい(笑)")).toBe("はい(笑)");
    expect(hasRuby("AI(エーアイ)")).toBe(false);
  });

  it("splits into text and ruby parts", () => {
    expect(splitRuby("誠(まこと)に")).toEqual([{ base: "誠", reading: "まこと", index: 0 }, "に"]);
  });
});
