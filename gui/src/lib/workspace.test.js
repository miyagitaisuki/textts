import { describe, expect, it } from "vitest";
import { WORKSPACES, clampLayout, defaultState, loadWorkspace, patchLayout, resetLayout, saveWorkspace } from "./workspace.js";

const memory = () => {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) };
};

describe("workspace", () => {
  it("round-trips the active workspace, theme and per-workspace layout", () => {
    const store = memory();
    let s = { ...defaultState(), active: "audio", theme: "light" };
    s = patchLayout(s, { dockHeight: 500 });
    saveWorkspace(store, s);
    const back = loadWorkspace(store);
    expect(back.active).toBe("audio");
    expect(back.theme).toBe("light");
    expect(back.layouts.audio.dockHeight).toBe(500);
    expect(back.layouts.edit).toEqual(WORKSPACES.edit.layout);
  });

  it("clamps sizes and ignores junk", () => {
    expect(clampLayout({ inspectorWidth: 5, dockHeight: 99999 })).toEqual({ inspectorWidth: 260, dockHeight: 720 });
    const store = memory();
    store.setItem("textts.workspace.v1", "{not json");
    expect(loadWorkspace(store)).toEqual(defaultState());
    store.setItem("textts.workspace.v1", JSON.stringify({ active: "nope", theme: "pink" }));
    expect(loadWorkspace(store).active).toBe("edit");
    expect(loadWorkspace(store).theme).toBe("dark");
  });

  it("reset only touches the active workspace", () => {
    let s = patchLayout(defaultState(), { inspectorWidth: 600 });
    s = patchLayout({ ...s, active: "audio" }, { inspectorWidth: 500 });
    s = resetLayout(s);
    expect(s.layouts.audio.inspectorWidth).toBe(WORKSPACES.audio.layout.inspectorWidth);
    expect(s.layouts.edit.inspectorWidth).toBe(600);
  });
});
