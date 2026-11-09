import type { SpeechClip } from "./api";
import type { VoiceStatus } from "./useVoiceController";

type Props = {
  clips: SpeechClip[];
  status: VoiceStatus;
  playingClip: number | null;
  progress: number;
  complete: boolean;
  error: string | null;
  language: "hi" | "en";
  onPlay: () => void;
  onStop: () => void;
  onContinue?: () => void;
  hasPausedSpeech?: boolean;
  onInterruptAndListen?: () => void;
};

export default function SpeechPlayer({
  clips,
  status,
  playingClip,
  progress,
  complete,
  error,
  language,
  onPlay,
  onStop,
  onContinue = () => undefined,
  hasPausedSpeech = false,
  onInterruptAndListen = () => undefined,
}: Props) {
  if (clips.length === 0 && !error) return null;

  const activeClip = playingClip ?? 0;
  const isPlaying = status === "speaking";

  return (
    <div className="speech-player" aria-label={language === "hi" ? "बोला गया जवाब" : "Spoken reply"}>
      {clips.length > 0 && (
        <>
          <div className="speech-player-heading">
            <span className={`speech-equalizer ${isPlaying ? "active" : ""}`} aria-hidden="true">
              <i /><i /><i />
            </span>
            <span>{clips[activeClip]?.label ?? (language === "hi" ? "कुबेरकेत का जवाब" : "KuberKet reply")}</span>
            <span className="speech-counter">
              {activeClip + 1}/{clips.length}
            </span>
          </div>
          <p className="speech-clip-text">{clips[activeClip]?.text}</p>
          <div
            className="speech-progress"
            role="progressbar"
            aria-label={language === "hi" ? "आवाज़ की प्रगति" : "Audio progress"}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
          >
            <span style={{ transform: `scaleX(${progress})` }} />
          </div>
          <div className="speech-player-actions">
            <button type="button" onClick={onPlay} disabled={status === "processing" || status === "listening"}>
              {isPlaying
                ? language === "hi" ? "फिर सुनें" : "Replay"
                : complete
                  ? language === "hi" ? "फिर सुनें" : "Replay"
                  : language === "hi" ? "जवाब सुनें" : "Listen to reply"}
            </button>
            {isPlaying && (
              <>
                <button type="button" onClick={onStop}>
                  {language === "hi" ? "रोकें" : "Stop"}
                </button>
                <button type="button" onClick={onInterruptAndListen}>
                  {language === "hi" ? "रोकें और बोलें" : "Interrupt and ask"}
                </button>
              </>
            )}
            {hasPausedSpeech && !isPlaying && (
              <button type="button" onClick={onContinue}>
                {language === "hi" ? "पहले वाला जवाब जारी रखें" : "Continue earlier reply"}
              </button>
            )}
          </div>
          {complete && (
            <p className="playback-ended" role="status">
              {language === "hi" ? "जवाब पूरा हुआ" : "Reply finished"}
            </p>
          )}
        </>
      )}
      {error && <p className="speech-error" role="status">{error}</p>}
      <span className="sr-only" aria-live="polite">
        {isPlaying
          ? language === "hi" ? "बोला जा रहा है" : "Speaking"
          : complete
            ? language === "hi" ? "जवाब पूरा हुआ" : "Reply finished"
            : ""}
      </span>
    </div>
  );
}
