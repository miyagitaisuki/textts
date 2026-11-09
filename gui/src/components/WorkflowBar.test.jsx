// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import WorkflowBar from "./WorkflowBar.jsx";

afterEach(cleanup);

describe("WorkflowBar", () => {
  it("marks steps before the current one as done and the current one as current", () => {
    const { container } = render(<WorkflowBar step={2} dirty={false} disabled={false} onStepClick={() => {}} />);
    const items = container.querySelectorAll(".workflow-step");
    expect(items[0].className).toContain("done");
    expect(items[1].className).toContain("current");
    expect(items[2].className).toContain("todo");
    expect(screen.getByRole("button", { name: /Chỉnh vai & câu/ }).getAttribute("aria-current")).toBe("step");
  });

  it("reports the clicked step key", () => {
    const onStepClick = vi.fn();
    render(<WorkflowBar step={1} dirty={false} disabled={false} onStepClick={onStepClick} />);
    fireEvent.click(screen.getByRole("button", { name: /Tạo âm thanh/ }));
    expect(onStepClick).toHaveBeenCalledWith("generate");
  });
});
