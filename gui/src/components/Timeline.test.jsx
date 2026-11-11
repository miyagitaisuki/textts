// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import Timeline from "./Timeline.jsx";

afterEach(cleanup);
beforeAll(() => {
  // jsdom chưa có PointerEvent: dùng MouseEvent để clientX được truyền vào.
  if (!globalThis.PointerEvent) globalThis.PointerEvent = class extends MouseEvent {};
  globalThis.ResizeObserver = class {
    observe() {}
    disconnect() {}
  };
});

const output = {
  timeline: {
    duration_ms: 10000,
    peaks: [0.1, 0.5, 0.2],
    role_levels: {},
    items: [
      { id: "L001", role: "1", start_ms: 1000, end_ms: 3000 },
      { id: "L002", role: "2", start_ms: 4000, end_ms: 6000 },
    ],
    sfx: [{ id: "L900", type: "sfx", path: "C:/a/chuong-cua.mp3", start_ms: 3000, end_ms: 3500 }],
    bgm: null,
  },
};
const items = [
  { id: "L001", type: "line", role: "1", plain: "こんにちは", delay_ms: 0 },
  { id: "L002", type: "line", role: "2", plain: "はい", delay_ms: 200 },
];
const roles = { 1: { name: "先生" }, 2: { name: "学生" } };

function setup(extra = {}) {
  const props = { onSelect: vi.fn(), onSeek: vi.fn(), onShift: vi.fn(), onPreview: vi.fn(), ...extra };
  render(<Timeline output={output} items={items} roles={roles} {...props} />);
  return props;
}

describe("Timeline", () => {
  it("draws one track per role plus SFX, with clip text", () => {
    setup();
    expect(screen.getByText("[1] 先生")).toBeTruthy();
    expect(screen.getByText("[2] 学生")).toBeTruthy();
    expect(screen.getByText("Hiệu ứng (SFX)")).toBeTruthy();
    expect(screen.queryByText("Nhạc nền")).toBeNull(); // không có nhạc nền thì ẩn track
    expect(screen.getByText("こんにちは")).toBeTruthy();
    expect(screen.getByText("♪ chuong-cua")).toBeTruthy();
  });

  it("clicking a clip selects it and seeks to its start; double-click previews", () => {
    const p = setup();
    const clip = screen.getByText("こんにちは").closest(".mt-clip");
    fireEvent.pointerDown(clip, { clientX: 100 });
    fireEvent.pointerUp(clip, { clientX: 100 });
    expect(p.onSelect).toHaveBeenCalledWith("L001");
    expect(p.onSeek).toHaveBeenCalledWith(1);
    fireEvent.doubleClick(clip);
    expect(p.onPreview).toHaveBeenCalledWith("L001");
  });

  it("dragging a clip shifts it, but never earlier than its original position", () => {
    const p = setup();
    const clip = screen.getByText("はい").closest(".mt-clip");
    fireEvent.pointerDown(clip, { clientX: 500 });
    fireEvent.pointerMove(clip, { clientX: -5000 });
    fireEvent.pointerUp(clip, { clientX: -5000 });
    expect(p.onShift).toHaveBeenCalledWith("L002", -200); // chỉ lùi được phần delay đã có
  });
});
