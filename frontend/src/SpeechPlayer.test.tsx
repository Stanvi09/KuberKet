import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach } from "vitest";
import { describe, expect, it, vi } from "vitest";

import SpeechPlayer from "./SpeechPlayer";

afterEach(cleanup);

const clips = [
  {
    label: "जवाब",
    text: "आपकी किस्त हर महीने होगी।",
    audio_base64: "d2F2",
    mime_type: "audio/wav" as const,
  },
  {
    label: "अगला सवाल",
    text: "क्या आप समझे?",
    audio_base64: "d2F2",
    mime_type: "audio/wav" as const,
  },
];

describe("SpeechPlayer", () => {
  it("requests playback and stop through controller actions", () => {
    const onPlay = vi.fn();
    const onStop = vi.fn();
    render(
      <SpeechPlayer
        clips={clips}
        status="idle"
        playingClip={null}
        progress={0}
        complete={false}
        error={null}
        language="hi"
        onPlay={onPlay}
        onStop={onStop}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "जवाब सुनें" }));
    expect(onPlay).toHaveBeenCalledOnce();
    expect(screen.getByText("1/2")).toBeTruthy();
  });

  it("shows playback progress and completion from actual controller state", () => {
    const { rerender } = render(
      <SpeechPlayer
        clips={clips}
        status="speaking"
        playingClip={1}
        progress={0.45}
        complete={false}
        error={null}
        language="hi"
        onPlay={vi.fn()}
        onStop={vi.fn()}
      />,
    );

    expect(screen.getByText("अगला सवाल")).toBeTruthy();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("45");
    expect(screen.getByRole("button", { name: "रोकें" })).toBeTruthy();

    rerender(
      <SpeechPlayer
        clips={clips}
        status="idle"
        playingClip={null}
        progress={1}
        complete
        error={null}
        language="hi"
        onPlay={vi.fn()}
        onStop={vi.fn()}
      />,
    );
    expect(screen.getByRole("status").textContent).toContain("जवाब पूरा हुआ");
    expect(screen.getByRole("button", { name: "फिर सुनें" })).toBeTruthy();
  });

  it("shows a clear playback error without a fake audio player", () => {
    render(
      <SpeechPlayer
        clips={[]}
        status="error"
        playingClip={null}
        progress={0}
        complete={false}
        error="यह आवाज़ नहीं चल पाई।"
        language="hi"
        onPlay={vi.fn()}
        onStop={vi.fn()}
      />,
    );

    expect(screen.getByRole("status").textContent).toContain("यह आवाज़ नहीं चल पाई");
  });

  it("offers interrupt-and-listen and continue controls from the shared controller", () => {
    const onInterruptAndListen = vi.fn();
    const onContinue = vi.fn();
    const { rerender } = render(
      <SpeechPlayer
        clips={clips}
        status="speaking"
        playingClip={0}
        progress={0.2}
        complete={false}
        error={null}
        language="hi"
        onPlay={vi.fn()}
        onStop={vi.fn()}
        onInterruptAndListen={onInterruptAndListen}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "रोकें और बोलें" }));
    expect(onInterruptAndListen).toHaveBeenCalledOnce();

    rerender(
      <SpeechPlayer
        clips={clips}
        status="idle"
        playingClip={null}
        progress={0.2}
        complete={false}
        error={null}
        language="hi"
        onPlay={vi.fn()}
        onStop={vi.fn()}
        onContinue={onContinue}
        hasPausedSpeech
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "पहले वाला जवाब जारी रखें" }));
    expect(onContinue).toHaveBeenCalledOnce();
  });
});
