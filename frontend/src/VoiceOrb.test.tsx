import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import VoiceOrb from "./VoiceOrb";

const baseProps = {
  level: 0.62,
  error: "",
  activityLabel: "",
  language: "hi" as const,
  onStart: vi.fn(),
  onStopRecording: vi.fn(),
  onCancelRecording: vi.fn(),
  onInterrupt: vi.fn(),
};

describe("VoiceOrb", () => {
  it("uses the listening state and measured input level from its controller", () => {
    const { container } = render(<VoiceOrb {...baseProps} status="listening" />);
    const stage = container.querySelector(".orb-stage");

    expect(stage?.classList.contains("orb-listening")).toBe(true);
    expect(stage?.getAttribute("style")).toContain("--level: 0.62");
    fireEvent.click(screen.getByRole("button", { name: "रिकॉर्डिंग रोकें" }));
    fireEvent.click(screen.getByRole("button", { name: "रिकॉर्डिंग रद्द करें" }));
    expect(baseProps.onStopRecording).toHaveBeenCalledOnce();
    expect(baseProps.onCancelRecording).toHaveBeenCalledOnce();
  });

  it("shows a real processing label and prevents another recording", () => {
    render(
      <VoiceOrb
        {...baseProps}
        status="processing"
        activityLabel="आपकी बात लिखी जा रही है…"
      />,
    );

    const orb = screen.getByRole("button", { name: "काम चल रहा है" });
    expect((orb as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("आपकी बात लिखी जा रही है…")).not.toBeNull();
    expect(baseProps.onStart).not.toHaveBeenCalled();
  });

  it("uses the shared speaking state for interruption", () => {
    render(<VoiceOrb {...baseProps} status="speaking" />);
    fireEvent.click(screen.getByRole("button", { name: "आवाज़ रोकें" }));
    expect(baseProps.onInterrupt).toHaveBeenCalledOnce();
  });

  it("blocks voice input while selected chart data is stale", () => {
    render(<VoiceOrb {...baseProps} status="idle" blocked />);
    const orb = screen.getByRole("button", { name: "नया हिसाब आने तक आवाज़ बंद है" });
    expect((orb as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("नया हिसाब आने के बाद बोलें")).not.toBeNull();
    expect(baseProps.onStart).not.toHaveBeenCalled();
  });

  it("renders an actionable error state", () => {
    render(
      <VoiceOrb
        {...baseProps}
        status="error"
        error="माइक की अनुमति नहीं मिली।"
      />,
    );
    expect(screen.getByRole("alert").textContent).toContain("माइक की अनुमति नहीं मिली");
    fireEvent.click(screen.getByRole("button", { name: "फिर कोशिश करें" }));
    expect(baseProps.onStart).toHaveBeenCalledOnce();
  });
});
