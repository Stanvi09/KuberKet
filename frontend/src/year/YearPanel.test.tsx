import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CashflowReport, SpeechClip } from "../api";
import YearPanel from "./YearPanel";
import { makeReport } from "./testFixtures";

const clip: SpeechClip = { label: "narration", text: "x", audio_base64: btoa("RIFFfake"), mime_type: "audio/wav" };

let inFlight = 0;
let maxInFlight = 0;
const spoken: Array<[string, number, number]> = [];

function setup(options: { failVoice?: boolean } = {}) {
  const load = vi.fn(async (drop: number): Promise<CashflowReport> => makeReport(drop));
  const speak = vi.fn(async (mode: "narration" | "answer", index: number, drop: number) => {
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    spoken.push([mode, index, drop]);
    await new Promise((resolve) => setTimeout(resolve, 5));
    inFlight -= 1;
    if (options.failVoice) throw new Error("The voice service is busy. The answer remains on screen.");
    return clip;
  });
  render(<YearPanel language="en" load={load} speak={speak} />);
  return { load, speak };
}

const cash = () => document.querySelector(".yr-cash strong")?.textContent;

class FakeAudio {
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public src: string) {}
  play() {
    setTimeout(() => this.onended?.(), 20);
    return Promise.resolve();
  }
  pause() {}
}

beforeEach(() => {
  inFlight = 0;
  maxInFlight = 0;
  spoken.length = 0;
  vi.stubGlobal("Audio", FakeAudio);
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:x"), revokeObjectURL: vi.fn() }));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("YearPanel", () => {
  it("shows the chart, the risky-months sentence and the year-end cash from the engine", async () => {
    setup();

    await screen.findByRole("img", { name: /Twelve-month cash flow for Paddy/ });
    expect(screen.getByText(/Risky months: 1,2,3,4/)).toBeTruthy();
    expect(screen.getByText("Cash in hand at year end")).toBeTruthy();
    expect(cash()).toBe("₹24,000");
    expect(screen.getByText("Lowest: −₹40,000 (September)")).toBeTruthy();
  });

  it("asks the engine again when the income-drop slider moves and names the new risky months", async () => {
    const { load } = setup();
    await screen.findByText(/Risky months: 1,2,3,4$/);

    fireEvent.change(screen.getByRole("slider"), { target: { value: "25" } });

    await waitFor(() => expect(load).toHaveBeenCalledWith(25, expect.anything()));
    await screen.findByText("Risky months: 1,2,3,4,11,12");
    expect(cash()).toBe("−₹12,000");
  });

  it("walks the year month by month, one spoken sentence at a time", async () => {
    setup();
    await screen.findByRole("img");
    vi.useFakeTimers();

    fireEvent.click(screen.getByRole("button", { name: "▶ Play the year" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText("Sentence one about income.")).toBeTruthy();
    expect(screen.getByText(/Cash in hand so far · June/)).toBeTruthy();
    expect(cash()).toBe("−₹10,000");

    // Sentence three belongs to month 4, the engine's lowest month.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2400);
    });
    expect(screen.getByText("Sentence three about the tightest month.")).toBeTruthy();
    expect(screen.getByText(/Cash in hand so far · September/)).toBeTruthy();
    expect(cash()).toBe("−₹40,000");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(screen.getByRole("button", { name: "▶ Play the year" })).toBeTruthy();
    expect(screen.getByText("Cash in hand at year end")).toBeTruthy();
    expect(cash()).toBe("₹24,000");

    expect(spoken).toEqual([
      ["narration", 0, 0],
      ["narration", 1, 0],
      ["narration", 2, 0],
    ]);
    expect(maxInFlight).toBe(1);
  });

  it("can be paused, resumed and stopped", async () => {
    setup();
    await screen.findByRole("img");
    vi.useFakeTimers();

    fireEvent.click(screen.getByRole("button", { name: "▶ Play the year" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    fireEvent.click(screen.getByRole("button", { name: "⏸ Pause" }));
    expect(screen.getByRole("button", { name: "▶ Resume" })).toBeTruthy();

    const before = spoken.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(spoken.length).toBeLessThanOrEqual(before + 1); // a sentence already requested may finish, no more start

    fireEvent.click(screen.getByRole("button", { name: "■ Stop" }));
    expect(screen.getByRole("button", { name: "▶ Play the year" })).toBeTruthy();
    const after = spoken.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(spoken.length).toBe(after);
  });

  it("falls back to captions only when the voice fails, and stops calling Timbre", async () => {
    setup({ failVoice: true });
    await screen.findByRole("img");
    vi.useFakeTimers();

    fireEvent.click(screen.getByRole("button", { name: "▶ Play the year" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });

    expect(screen.getByRole("status").textContent).toContain("The voice service is busy");
    expect(screen.getByText("Sentence one about income.")).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(40_000);
    });
    expect(spoken.length).toBe(1);
    expect(screen.getByRole("button", { name: "▶ Play the year" })).toBeTruthy();
  });

  it("lets the farmer ask about the chart and listen to the engine-built answer", async () => {
    setup();
    await screen.findByRole("img");

    fireEvent.click(screen.getByRole("button", { name: "Ask about this chart" }));
    fireEvent.click(screen.getByRole("button", { name: "What if income falls?" }));
    expect(screen.getByText("Money runs short in six months.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "🔊 Listen" }));
    await waitFor(() => expect(spoken).toEqual([["answer", 1, 0]]));
  });

  it("offers a retry when the engine cannot be reached", async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error("offline")).mockImplementation(async (drop: number) => makeReport(drop));
    render(<YearPanel language="en" load={load} speak={vi.fn()} />);

    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByRole("img");
  });
});
