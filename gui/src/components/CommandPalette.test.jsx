// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import CommandPalette, { filterCommands } from "./CommandPalette.jsx";

afterEach(cleanup);

const cmds = [
  { id: "gen", group: "Âm thanh", label: "Tạo & lưu âm thanh", shortcut: "Ctrl+G", run: vi.fn() },
  { id: "prev", group: "Âm thanh", label: "Nghe thử toàn bài", run: vi.fn() },
  { id: "theme", group: "Giao diện", label: "Chế độ sáng", keywords: "theme light", run: vi.fn() },
];

describe("CommandPalette", () => {
  it("matches without Vietnamese diacritics and across words", () => {
    expect(filterCommands(cmds, "nghe thu").map((c) => c.id)).toEqual(["prev"]);
    expect(filterCommands(cmds, "am thanh tao").map((c) => c.id)).toEqual(["gen"]);
    expect(filterCommands(cmds, "light").map((c) => c.id)).toEqual(["theme"]);
    expect(filterCommands(cmds, "").length).toBe(3);
  });

  it("runs the highlighted command with the keyboard", async () => {
    const onClose = vi.fn();
    render(<CommandPalette commands={cmds} onClose={onClose} />);
    const input = screen.getByLabelText("Tìm thao tác");
    fireEvent.change(input, { target: { value: "am thanh" } });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onClose).toHaveBeenCalled();
    await new Promise((r) => setTimeout(r, 0));
    expect(cmds[1].run).toHaveBeenCalled();
  });
});
