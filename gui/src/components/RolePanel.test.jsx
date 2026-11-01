// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import RolePanel from "./RolePanel.jsx";

afterEach(cleanup);

const ROLES = {
  1: { name: "A", voice: "ja-JP-KeitaNeural", emotion: "neutral", speed: "normal", pitch: 0, gain_db: 0 },
};

function renderPanel(library, voices = []) {
  return render(
    <RolePanel roles={ROLES} onChange={() => {}} disabled={false} voices={voices} library={library} />,
  );
}

describe("RolePanel voices", () => {
  it("uses the engine voice list when provided", () => {
    renderPanel(undefined, [{ value: "3", label: "ずんだもん (ノーマル)" }]);
    expect(screen.getByRole("option", { name: "ずんだもん (ノーマル)" })).toBeTruthy();
  });

  it("falls back to the Edge voices when no list is given", () => {
    renderPanel(undefined, []);
    expect(screen.getByRole("option", { name: "ja-JP-NanamiNeural" })).toBeTruthy();
  });
});

describe("RolePanel preset library", () => {
  it("saves the current role as a named preset", () => {
    const onSave = vi.fn();
    renderPanel({ presets: [], onSave, onApply: () => {}, onRemove: () => {} });
    fireEvent.change(screen.getByPlaceholderText("Tên mẫu mới"), { target: { value: "Vui" } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu mẫu" }));
    expect(onSave).toHaveBeenCalledWith("Vui", ROLES[1]);
  });

  it("shows the validation error from an empty name", () => {
    const onSave = vi.fn(() => { throw new Error("Tên mẫu không được để trống"); });
    renderPanel({ presets: [], onSave, onApply: () => {}, onRemove: () => {} });
    fireEvent.click(screen.getByRole("button", { name: "Lưu mẫu" }));
    expect(screen.getByText("Tên mẫu không được để trống")).toBeTruthy();
  });

  it("applies the chosen preset to its role", () => {
    const preset = { name: "Chậm", voice: "ja-JP-NanamiNeural", emotion: "sad", speed: "slow", pitch: -5 };
    const onApply = vi.fn();
    const { container } = renderPanel({ presets: [preset], onSave: () => {}, onApply, onRemove: () => {} });
    const select = container.querySelector(".preset-row select");
    fireEvent.change(select, { target: { value: "Chậm" } });
    fireEvent.click(screen.getByRole("button", { name: "Áp" }));
    expect(onApply).toHaveBeenCalledWith("1", preset);
  });
});
