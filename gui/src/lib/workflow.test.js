import { describe, expect, it } from "vitest";
import { generateBlockReason, getWorkflowStep, stepGuidance, WORKFLOW_STEPS } from "./workflow.js";

describe("getWorkflowStep", () => {
  it("starts at import when no project or no lines", () => {
    expect(getWorkflowStep({ hasProject: false })).toBe(1);
    expect(getWorkflowStep({ hasProject: true, lineCount: 0 })).toBe(1);
  });

  it("is edit when lines exist but nothing generated yet", () => {
    expect(getWorkflowStep({ hasProject: true, lineCount: 3 })).toBe(2);
  });

  it("asks to regenerate when output is stale", () => {
    expect(getWorkflowStep({ hasProject: true, lineCount: 3, hasOutput: true, outputStale: true })).toBe(3);
  });

  it("is listen when output is fresh", () => {
    expect(getWorkflowStep({ hasProject: true, lineCount: 3, hasOutput: true, outputStale: false })).toBe(4);
  });

  it("has one label per step", () => {
    expect(WORKFLOW_STEPS).toHaveLength(4);
  });
});

describe("generateBlockReason", () => {
  it("is empty when generation is allowed", () => {
    expect(generateBlockReason({ hasProject: true, lineCount: 2, busy: false })).toBe("");
  });

  it("explains why generation is blocked, most urgent first", () => {
    expect(generateBlockReason({ hasProject: true, lineCount: 2, busy: true })).toContain("Đang xử lý");
    expect(generateBlockReason({ hasProject: false, lineCount: 0 })).toContain("mở hoặc nhập kịch bản");
    expect(generateBlockReason({ hasProject: true, lineCount: 0 })).toContain("chưa có câu thoại");
  });
});

describe("stepGuidance", () => {
  it("warns about unsaved changes on the edit step", () => {
    expect(stepGuidance(2, { dirty: true })).toContain("chưa lưu");
    expect(stepGuidance(2, { dirty: false })).not.toContain("chưa lưu");
  });

  it("returns a non-empty hint for every step", () => {
    for (const step of [1, 2, 3, 4]) expect(stepGuidance(step).length).toBeGreaterThan(0);
  });
});
