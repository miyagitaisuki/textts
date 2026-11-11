// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import VoiceBankDialog from "./VoiceBankDialog.jsx";

afterEach(cleanup);

const BANK = { voices: { "voicevox:3": { nickname: "Zunda", gender: "nữ", age: 10, styles: ["trẻ con"], favorite: true } } };

function makeApi() {
  return {
    getVoiceBank: vi.fn().mockResolvedValue({
      engine: "voicevox",
      online: true,
      voices: [{ value: "3", label: "ずんだもん" }, { value: "2", label: "四国めたん" }],
      bank: BANK,
    }),
    // app trả lại cả ngân hàng sau khi lưu
    setVoiceBank: vi.fn().mockResolvedValue({ voices: { ...BANK.voices, "voicevox:2": { nickname: "Chị Metan" } } }),
  };
}

describe("VoiceBankDialog", () => {
  it("saves a nickname when leaving the field and filters by notes", async () => {
    const api = makeApi();
    const onChanged = vi.fn();
    render(<VoiceBankDialog api={api} initialEngine="voicevox" onClose={() => {}} onChanged={onChanged} />);
    const nick = await screen.findByLabelText("Biệt danh 四国めたん");
    fireEvent.change(nick, { target: { value: "Chị Metan" } });
    fireEvent.blur(nick);
    await waitFor(() =>
      expect(api.setVoiceBank).toHaveBeenCalledWith(
        expect.objectContaining({ engine: "voicevox", voice: "2", label: "四国めたん", meta: expect.objectContaining({ nickname: "Chị Metan" }) })
      )
    );
    expect(onChanged).toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Tìm giọng"), { target: { value: "tre con" } });
    expect(screen.queryByLabelText("Biệt danh 四国めたん")).toBeNull();
    expect(screen.getByLabelText("Biệt danh ずんだもん")).toBeTruthy();
  });
});

describe("VoiceBankDialog dropdowns", () => {
  it("adds a personality with the ＋ menu and sets age from a dropdown", async () => {
    const api = makeApi();
    render(<VoiceBankDialog api={api} initialEngine="voicevox" onClose={() => {}} />);
    const add = await screen.findAllByLabelText("Thêm Tính cách / cảm xúc");
    fireEvent.change(add[1], { target: { value: "hiền lành" } }); // hàng thứ 2: 四国めたん
    await waitFor(() =>
      expect(api.setVoiceBank).toHaveBeenCalledWith(expect.objectContaining({ voice: "2", meta: expect.objectContaining({ personality: ["hiền lành"] }) }))
    );
    fireEvent.change(screen.getByLabelText("Độ tuổi 四国めたん"), { target: { value: "72" } });
    await waitFor(() => expect(api.setVoiceBank).toHaveBeenLastCalledWith(expect.objectContaining({ meta: expect.objectContaining({ age: 72 }) })));
  });
});
