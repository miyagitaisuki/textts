// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import SoundLibraryDialog from "./SoundLibraryDialog.jsx";

afterEach(cleanup);

const items = [
  { id: "sfx-a", kind: "sfx", source: "pack", name: "Chuông cửa", category: "Nhà cửa", downloaded: false, path: null, duration: 2.1 },
  { id: "bgm-b", kind: "bgm", source: "pack", name: "Mưa", category: "Thiên nhiên", downloaded: true, path: "/lib/pack/v1/bgm-b.mp3" },
  { id: "my-sfx-c", kind: "sfx", source: "mine", name: "của tôi", category: "Của tôi", downloaded: true, path: "/lib/my/sfx/c.mp3", description: "", tags: [], related: [], credit: "" },
];

function makeApi() {
  return {
    listSounds: vi.fn().mockResolvedValue({ items }),
    downloadSounds: vi.fn().mockResolvedValue({
      ok: true,
      items: items.map((i) => (i.id === "sfx-a" ? { ...i, downloaded: true, path: "/lib/pack/v1/sfx-a.mp3" } : i)),
    }),
    importSounds: vi.fn(),
    removeSound: vi.fn(),
    describeSound: vi.fn().mockResolvedValue({ items }),
    readSound: vi.fn(),
    pickAudioFile: vi.fn().mockResolvedValue("/other.wav"),
  };
}

describe("SoundLibraryDialog", () => {
  it("shows only the requested kind and downloads a pack sound before picking it", async () => {
    const api = makeApi();
    const onPick = vi.fn();
    const onClose = vi.fn();
    render(<SoundLibraryDialog kind="sfx" api={api} onPick={onPick} onClose={onClose} />);
    await screen.findByText("Chuông cửa");
    expect(screen.queryByText("Mưa")).toBeNull();
    fireEvent.click(screen.getByText("Chọn"));
    await waitFor(() => expect(onPick).toHaveBeenCalledWith("/lib/pack/v1/sfx-a.mp3"));
    expect(api.downloadSounds).toHaveBeenCalledWith(["sfx-a"]);
    expect(onClose).toHaveBeenCalled();
  });

  it("lists personal sounds on the second tab", async () => {
    render(<SoundLibraryDialog kind="sfx" api={makeApi()} onPick={() => {}} onClose={() => {}} />);
    await screen.findByText("Chuông cửa");
    fireEvent.click(screen.getByText("Thư viện của tôi"));
    expect(screen.getByText("của tôi")).toBeTruthy();
    expect(screen.queryByText("Chuông cửa")).toBeNull();
  });

  it("falls back to any file on disk", async () => {
    const onPick = vi.fn();
    render(<SoundLibraryDialog kind="bgm" api={makeApi()} onPick={onPick} onClose={() => {}} />);
    fireEvent.click(screen.getByText("Chọn file khác trên máy…"));
    await waitFor(() => expect(onPick).toHaveBeenCalledWith("/other.wav"));
  });
});

describe("SoundLibraryDialog descriptions", () => {
  it("lets the teacher describe a personal sound for the AI", async () => {
    const api = makeApi();
    render(<SoundLibraryDialog kind="sfx" api={api} onPick={() => {}} onClose={() => {}} />);
    await screen.findByText("Chuông cửa");
    fireEvent.click(screen.getByText("Thư viện của tôi"));
    fireEvent.click(screen.getByTitle("Ghi mô tả, từ khóa để AI hiểu âm này"));
    fireEvent.change(screen.getByPlaceholderText("vd. Tiếng sấm rền xa, mưa giông"), { target: { value: "Tiếng sấm" } });
    fireEvent.change(screen.getByPlaceholderText("sấm, giông, 雷"), { target: { value: "sấm, 雷" } });
    fireEvent.click(screen.getByText("Lưu mô tả"));
    await waitFor(() =>
      expect(api.describeSound).toHaveBeenCalledWith(
        expect.objectContaining({ file: "/lib/my/sfx/c.mp3", description: "Tiếng sấm", tags: "sấm, 雷" })
      )
    );
  });
});
