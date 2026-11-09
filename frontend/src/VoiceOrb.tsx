import { memo } from "react";
import type { CSSProperties } from "react";

import type { VoiceStatus } from "./useVoiceController";

type Props = {
  status: VoiceStatus;
  level: number;
  error: string;
  activityLabel: string;
  language: "hi" | "en";
  onStart: () => void;
  onStopRecording: () => void;
  onCancelRecording: () => void;
  onInterrupt: () => void;
  blocked?: boolean;
};

type OrbStyle = CSSProperties & { "--level": number };

function VoiceOrb({
  status,
  level,
  error,
  activityLabel,
  language,
  onStart,
  onStopRecording,
  onCancelRecording,
  onInterrupt,
  blocked = false,
}: Props) {
  const visualState = status === "transcript_review" ? "idle" : status;
  const label =
    blocked
      ? language === "hi" ? "नया हिसाब आने के बाद बोलें" : "Wait for the updated numbers before speaking"
      : status === "listening"
      ? language === "hi" ? "सुन रहा है — रोकने के लिए दबाएँ" : "Listening — tap to stop"
      : status === "processing"
        ? activityLabel || (language === "hi" ? "आपकी बात समझी जा रही है…" : "Understanding your message…")
        : status === "transcript_review"
          ? language === "hi" ? "अपनी बात जाँचें" : "Review what you said"
          : status === "speaking"
            ? language === "hi" ? "कुबेरकेत बोल रहा है — रोकने के लिए दबाएँ" : "KuberKet is speaking — tap to interrupt"
            : status === "error"
              ? language === "hi" ? "फिर कोशिश करने के लिए माइक दबाएँ" : "Tap the mic to try again"
              : language === "hi" ? "बोलने के लिए माइक दबाएँ" : "Tap the mic to speak";

  const accessibleName =
    blocked
      ? language === "hi" ? "नया हिसाब आने तक आवाज़ बंद है" : "Voice is unavailable until the chart refreshes"
      : status === "listening"
      ? language === "hi" ? "रिकॉर्डिंग रोकें" : "Stop recording"
      : status === "speaking"
        ? language === "hi" ? "आवाज़ रोकें" : "Interrupt speech"
        : status === "processing"
          ? language === "hi" ? "काम चल रहा है" : "Working"
          : language === "hi" ? "बोलने के लिए शुरू करें" : "Start speaking";

  return (
    <div className="orb-wrap">
      <div
        className={`orb-stage orb-${visualState}`}
        style={{ "--level": status === "listening" ? level : 0 } as OrbStyle}
      >
        <span className="orb-aura orb-aura-back" aria-hidden="true" />
        <span className="orb-aura orb-aura-front" aria-hidden="true" />
        <button
          className="voice-orb"
          type="button"
          aria-label={accessibleName}
          aria-pressed={status === "listening"}
          aria-busy={status === "processing"}
          disabled={status === "processing" || blocked}
          onClick={() => {
            if (status === "listening") onStopRecording();
            else if (status === "speaking") onInterrupt();
            else onStart();
          }}
        >
          <span className="orb-light" aria-hidden="true" />
          <span className="orb-glyph" aria-hidden="true">
            {status === "listening" ? (
              <span className="stop-mark" />
            ) : status === "processing" ? (
              <span className="processing-mark" />
            ) : status === "speaking" ? (
              <span className="speaking-mark">♪</span>
            ) : status === "error" ? (
              <span className="error-mark">!</span>
            ) : (
              <MicrophoneIcon />
            )}
          </span>
        </button>
      </div>
      <p className="orb-instruction" aria-live="polite">{label}</p>
      {status === "listening" && (
        <button
          className="cancel-recording"
          type="button"
          onClick={onCancelRecording}
        >
          {language === "hi" ? "रिकॉर्डिंग रद्द करें" : "Cancel recording"}
        </button>
      )}
      {status === "error" && error && (
        <div className="inline-error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={onStart}>
            {language === "hi" ? "फिर कोशिश करें" : "Try again"}
          </button>
        </div>
      )}
    </div>
  );
}

function MicrophoneIcon() {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect x="11" y="4" width="10" height="17" rx="5" stroke="currentColor" strokeWidth="2" />
      <path d="M7 15v1a9 9 0 0 0 18 0v-1M16 25v4m-5 0h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export default memo(VoiceOrb);
