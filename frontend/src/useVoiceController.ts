import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";

import {
  explainDocument as postDocumentExplanation,
  explainChart as postChartExplanation,
  sendMessage as postMessage,
  startConversation as postStart,
  transcribeAudio,
} from "./api";
import type { ChartContextSnapshot, SessionSnapshot, SpeechClip } from "./api";

export type VoiceStatus =
  | "idle"
  | "listening"
  | "processing"
  | "transcript_review"
  | "speaking"
  | "error";

type Props = {
  session: SessionSnapshot | null;
  setSession: Dispatch<SetStateAction<SessionSnapshot | null>>;
  /** True when the app is waiting for the farmer's answer, so the mic can open by itself after KuberKet speaks. */
  listenAfterSpeech?: boolean;
};

/** Level (0 to 1) above which we treat the microphone as hearing speech, and how long a pause ends the answer. */
const SPEECH_LEVEL = 0.12;
const SILENCE_MS = 1700;
const NO_SPEECH_MS = 9000;

/** Every status and error line of the voice controller, in both app languages. */
export const voiceText = {
  hi: {
    replyPreparing: "जवाब तैयार किया जा रहा है…",
    replyFailed: "जवाब नहीं मिल पाया। कृपया फिर कोशिश करें।",
    starting: "बातचीत शुरू की जा रही है…",
    startFailed: "बातचीत शुरू नहीं हो पाई। कृपया फिर कोशिश करें।",
    notReady: "सेवा तैयार नहीं है। कृपया फिर कोशिश करें।",
    transcribing: "आपकी बात लिखी जा रही है…",
    unclear: "बात साफ़ सुनाई नहीं दी। कृपया फिर बोलें या लिखें।",
    notUnderstood: "रिकॉर्डिंग समझ नहीं आई। कृपया फिर बोलें या लिखें।",
    releasingMic: "माइक की अनुमति रद्द हो रही है…",
    noRecorder: "इस ब्राउज़र में माइक रिकॉर्डिंग उपलब्ध नहीं है।",
    waitingMic: "माइक की अनुमति का इंतज़ार है…",
    recordFailed: "रिकॉर्डिंग नहीं हो पाई। कृपया फिर कोशिश करें।",
    understanding: "आपकी बात समझी जा रही है…",
    unreadable: "रिकॉर्डिंग पढ़ी नहीं जा सकी। कृपया फिर कोशिश करें।",
    micDenied: "माइक की अनुमति नहीं मिली। ब्राउज़र सेटिंग में अनुमति दें या लिखकर बताइए।",
    micFailed: "माइक शुरू नहीं हो पाया। दोबारा कोशिश करें या लिखकर बताइए।",
    decodeFailed: "इस ब्राउज़र की रिकॉर्डिंग पढ़ नहीं पाई। कृपया फिर से बोलें।",
    tooLong: "रिकॉर्डिंग तीस सेकंड से लंबी है। कृपया छोटी रिकॉर्डिंग करें।",
  },
  en: {
    replyPreparing: "Preparing the reply…",
    replyFailed: "No reply came back. Please try again.",
    starting: "Starting the conversation…",
    startFailed: "The conversation could not start. Please try again.",
    notReady: "The service is not ready. Please try again.",
    transcribing: "Writing down what you said…",
    unclear: "Your words were not clear. Please speak again or type.",
    notUnderstood: "The recording was not understood. Please speak again or type.",
    releasingMic: "Releasing the microphone…",
    noRecorder: "This browser cannot record from the microphone.",
    waitingMic: "Waiting for microphone permission…",
    recordFailed: "Recording failed. Please try again.",
    understanding: "Understanding what you said…",
    unreadable: "The recording could not be read. Please try again.",
    micDenied: "Microphone permission was denied. Allow it in your browser settings or type instead.",
    micFailed: "The microphone could not start. Try again or type instead.",
    decodeFailed: "This browser's recording could not be read. Please speak again.",
    tooLong: "The recording is longer than thirty seconds. Please keep it shorter.",
  },
} as const;

type VoiceTextKey = keyof typeof voiceText.hi;

export default function useVoiceController({ session, setSession, listenAfterSpeech = false }: Props) {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [error, setError] = useState("");
  const [activityLabel, setActivityLabel] = useState("");
  const [transcript, setTranscript] = useState("");
  const [diagnosticAudio, setDiagnosticAudio] = useState<Blob | null>(null);
  const [speechClips, setSpeechClips] = useState<SpeechClip[]>([]);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [playingClip, setPlayingClip] = useState<number | null>(null);
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const [playbackComplete, setPlaybackComplete] = useState(false);
  const [hasPausedSpeech, setHasPausedSpeech] = useState(false);
  const sessionRef = useRef(session);
  const say = (key: VoiceTextKey): string => voiceText[sessionRef.current?.language === "en" ? "en" : "hi"][key];
  const statusRef = useRef(status);
  const mountedRef = useRef(true);
  const operationRef = useRef(false);
  const cancelRecordingRef = useRef(false);
  const recorderFailedRef = useRef(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const frameRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlsRef = useRef<string[]>([]);
  const playbackGenerationRef = useRef(0);
  const interruptedSpeechRef = useRef<{
    clips: SpeechClip[];
    nextClipIndex: number;
    offsetSeconds: number;
  } | null>(null);
  const initializedSessionRef = useRef(false);
  const speechSignatureRef = useRef<string | null>(null);
  const shouldAutoPlayRef = useRef(false);
  const lastLevelUpdateRef = useRef(0);
  const [microphoneLevel, setMicrophoneLevel] = useState(0);
  const [notice, setNotice] = useState("");
  const playEndRef = useRef<number | null>(null);
  const suppressAutoListenRef = useRef(false);
  const listenAfterSpeechRef = useRef(listenAfterSpeech);
  const autoStopRef = useRef(false);
  const speechStartedRef = useRef(false);
  const lastLoudRef = useRef(0);
  const listenStartedAtRef = useRef(0);
  listenAfterSpeechRef.current = listenAfterSpeech;
  const audioMode = () => (sessionRef.current?.input_mode ?? "audio") === "audio";

  sessionRef.current = session;
  const speechClipsRef = useRef(speechClips);
  const playingClipRef = useRef(playingClip);
  speechClipsRef.current = speechClips;
  playingClipRef.current = playingClip;

  const transition = useCallback((next: VoiceStatus, label = "") => {
    statusRef.current = next;
    setStatus(next);
    setActivityLabel(label);
  }, []);

  const releaseMicrophone = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    frameRef.current = null;
    timerRef.current = null;
    analyserRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    const context = contextRef.current;
    contextRef.current = null;
    if (context && context.state !== "closed") void context.close();
    if (mountedRef.current) setMicrophoneLevel(0);
  }, []);

  const stopCurrentAudio = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.onplaying = null;
      audio.onloadedmetadata = null;
      audio.ontimeupdate = null;
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
      audio.currentTime = 0;
      audioRef.current = null;
    }
  }, []);

  const revokeAudioUrls = useCallback(() => {
    audioUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    audioUrlsRef.current = [];
  }, []);

  const stopSpeech = useCallback(() => {
    const audio = audioRef.current;
    if (
      statusRef.current === "speaking" &&
      audio &&
      playingClipRef.current !== null &&
      speechClipsRef.current.length > 0
    ) {
      interruptedSpeechRef.current = {
        clips: speechClipsRef.current,
        nextClipIndex: playingClipRef.current,
        offsetSeconds: Number.isFinite(audio.currentTime) ? audio.currentTime : 0,
      };
      setHasPausedSpeech(true);
    }
    playbackGenerationRef.current += 1;
    stopCurrentAudio();
    setPlayingClip(null);
    setPlaybackProgress(0);
    if (statusRef.current === "speaking") transition("idle");
  }, [stopCurrentAudio, transition]);

  const installSpeech = useCallback(
    (next: SessionSnapshot) => {
      playbackGenerationRef.current += 1;
      stopCurrentAudio();
      revokeAudioUrls();
      setPlayingClip(null);
      setPlaybackProgress(0);
      setPlaybackComplete(false);
      setSpeechClips(next.latest_speech);
      setSpeechError(next.speech_error);
      speechSignatureRef.current = speechSignature(next.latest_speech);
    },
    [revokeAudioUrls, stopCurrentAudio],
  );

  const acceptSession = useCallback(
    (next: SessionSnapshot) => {
      setSession(next);
      installSpeech(next);
    },
    [installSpeech, setSession],
  );

  const fail = useCallback(
    (caught: unknown, fallback: string) => {
      setError(caught instanceof Error ? caught.message : fallback);
      transition("error");
    },
    [transition],
  );

  useEffect(() => {
    if (!session) return;
    const signature = speechSignature(session.latest_speech);
    if (!initializedSessionRef.current) {
      initializedSessionRef.current = true;
      speechSignatureRef.current = signature;
      setSpeechClips(session.latest_speech);
      setSpeechError(session.speech_error);
      return;
    }
    if (speechSignatureRef.current === signature) return;
    playbackGenerationRef.current += 1;
    stopCurrentAudio();
    revokeAudioUrls();
    interruptedSpeechRef.current = null;
    setHasPausedSpeech(false);
    setPlayingClip(null);
    setPlaybackProgress(0);
    setPlaybackComplete(false);
    setSpeechClips(session.latest_speech);
    setSpeechError(session.speech_error);
    speechSignatureRef.current = signature;
    if (statusRef.current === "speaking") transition("idle");
  }, [revokeAudioUrls, session, stopCurrentAudio, transition]);

  const sendTyped = useCallback(
    async (rawText: string): Promise<boolean> => {
      const current = sessionRef.current;
      const text = rawText.trim();
      if (!current || !text || operationRef.current || statusRef.current === "listening") {
        return false;
      }
      if (current.chart_context_stale) {
        setError(
          current.language === "en"
            ? "The chart is refreshing. Ask again when the new numbers appear."
            : "चार्ट का नया हिसाब बन रहा है। नया हिसाब आने के बाद फिर पूछें।",
        );
        return false;
      }

      operationRef.current = true;
      stopSpeech();
      setError("");
      setNotice("");
      setSpeechError(null);
      shouldAutoPlayRef.current = audioMode();
      suppressAutoListenRef.current = false;
      transition("processing", say("replyPreparing"));
      try {
        const next = await postMessage(current.session_id, text);
        if (!mountedRef.current) return false;
        acceptSession(next);
        transition("idle");
        return true;
      } catch (caught) {
        shouldAutoPlayRef.current = false;
        if (mountedRef.current) fail(caught, say("replyFailed"));
        return false;
      } finally {
        operationRef.current = false;
      }
    },
    [acceptSession, fail, stopSpeech, transition],
  );

  const explainChart = useCallback(
    async (
      chartId: ChartContextSnapshot["chart_id"],
      selectedScenario: number | null,
      selectedPoint: string | null,
      explanationMode: "simple" | "detailed",
      speechSpeed: number,
    ): Promise<boolean> => {
      const current = sessionRef.current;
      if (!current || operationRef.current || statusRef.current === "listening") return false;
      operationRef.current = true;
      stopSpeech();
      shouldAutoPlayRef.current = true;
      setError("");
      setSpeechError(null);
      transition("processing", current.language === "en"
        ? "Preparing the chart explanation…"
        : "चार्ट की बात तैयार हो रही है…");
      try {
        const next = await postChartExplanation(
          current.session_id,
          chartId,
          selectedScenario,
          selectedPoint,
          explanationMode,
          speechSpeed,
        );
        if (!mountedRef.current) return false;
        if (next.latest_speech.length === 0) shouldAutoPlayRef.current = false;
        acceptSession(next);
        transition("idle");
        return true;
      } catch (caught) {
        shouldAutoPlayRef.current = false;
        if (mountedRef.current) {
          fail(
            caught,
            current.language === "en"
              ? "The chart explanation could not be prepared."
              : "चार्ट की बात तैयार नहीं हो पाई।",
          );
        }
        return false;
      } finally {
        operationRef.current = false;
      }
    },
    [acceptSession, fail, stopSpeech, transition],
  );

  const explainDocument = useCallback(
    async (fieldId: string | null): Promise<boolean> => {
      const current = sessionRef.current;
      if (!current || operationRef.current || statusRef.current === "listening") return false;
      operationRef.current = true;
      stopSpeech();
      shouldAutoPlayRef.current = true;
      setError("");
      setSpeechError(null);
      transition(
        "processing",
        current.language === "en"
          ? "Preparing the document explanation…"
          : "दस्तावेज़ की बात तैयार हो रही है…",
      );
      try {
        const next = await postDocumentExplanation(current.session_id, fieldId);
        if (!mountedRef.current) return false;
        if (next.latest_speech.length === 0) shouldAutoPlayRef.current = false;
        acceptSession(next);
        transition("idle");
        return true;
      } catch (caught) {
        shouldAutoPlayRef.current = false;
        if (mountedRef.current) {
          fail(
            caught,
            current.language === "en"
              ? "The document explanation could not be prepared."
              : "दस्तावेज़ की बात तैयार नहीं हो पाई।",
          );
        }
        return false;
      } finally {
        operationRef.current = false;
      }
    },
    [acceptSession, fail, stopSpeech, transition],
  );

  const beginConversation = useCallback(async () => {
    const current = sessionRef.current;
    if (!current || operationRef.current || statusRef.current === "listening") return;
    operationRef.current = true;
    stopSpeech();
    setError("");
    setNotice("");
    shouldAutoPlayRef.current = audioMode();
    suppressAutoListenRef.current = false;
    transition("processing", say("starting"));
    try {
      const next = await postStart(current.session_id);
      if (mountedRef.current) {
        acceptSession(next);
        transition("idle");
      }
    } catch (caught) {
      if (mountedRef.current) fail(caught, say("startFailed"));
    } finally {
      operationRef.current = false;
    }
  }, [acceptSession, fail, stopSpeech, transition]);

  const submitTranscript = useCallback(async () => {
    const text = transcript.trim();
    if (!text || statusRef.current !== "transcript_review") return false;
    const submitted = await sendTyped(text);
    if (submitted) setTranscript("");
    return submitted;
  }, [sendTyped, transcript]);

  const cancelTranscript = useCallback(() => {
    setTranscript("");
    setError("");
    transition("idle");
  }, [transition]);

  const transcribeRecording = useCallback(
    async (recording: Blob) => {
      const current = sessionRef.current;
      if (!current) {
        fail(null, say("notReady"));
        return;
      }

      try {
        setActivityLabel(say("transcribing"));
        const result = await transcribeAudio(current.session_id, recording);
        if (!mountedRef.current) return;
        if (!result.transcript.trim()) {
          throw new Error(say("unclear"));
        }
        setError("");
        if (audioMode()) {
          // Speaking is a conversation: send what was heard. The reply reads each number back for confirmation.
          operationRef.current = false;
          await sendTyped(result.transcript);
          return;
        }
        setTranscript(result.transcript);
        transition("transcript_review");
      } catch (caught) {
        if (mountedRef.current) fail(caught, say("notUnderstood"));
      } finally {
        operationRef.current = false;
      }
    },
    [fail, sendTyped, transition],
  );

  const sampleMicrophone = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser || !mountedRef.current) return;
    const samples = new Uint8Array(analyser.fftSize);
    const sample = (time: number) => {
      const currentAnalyser = analyserRef.current;
      if (!currentAnalyser || !mountedRef.current) return;
      currentAnalyser.getByteTimeDomainData(samples);
      let energy = 0;
      for (const value of samples) {
        const normalized = (value - 128) / 128;
        energy += normalized * normalized;
      }
      const level = Math.min(1, Math.sqrt(energy / samples.length) * 4);
      if (time - lastLevelUpdateRef.current >= 40) {
        setMicrophoneLevel(level);
        lastLevelUpdateRef.current = time;
      }
      if (autoStopRef.current) {
        const recorder = recorderRef.current;
        if (level > SPEECH_LEVEL) {
          speechStartedRef.current = true;
          lastLoudRef.current = time;
        } else if (speechStartedRef.current && time - lastLoudRef.current > SILENCE_MS) {
          // A pause after speech means the answer is finished.
          if (recorder?.state === "recording") recorder.stop();
          return;
        } else if (!speechStartedRef.current && time - listenStartedAtRef.current > NO_SPEECH_MS) {
          cancelRecordingRef.current = true;
          setNotice(
            sessionRef.current?.language === "en"
              ? "I did not hear anything. Tap the mic when you are ready."
              : "कुछ सुनाई नहीं दिया। तैयार होकर माइक दबाएँ।",
          );
          if (recorder?.state === "recording") recorder.stop();
          return;
        }
      }
      frameRef.current = requestAnimationFrame(sample);
    };
    frameRef.current = requestAnimationFrame(sample);
  }, []);

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder?.state === "recording") recorder.stop();
  }, []);

  const cancelRecording = useCallback(() => {
    cancelRecordingRef.current = true;
    const recorder = recorderRef.current;
    if (recorder?.state === "recording") {
      recorder.stop();
    } else {
      releaseMicrophone();
      if (recorder === null) transition("processing", say("releasingMic"));
      else {
        operationRef.current = false;
        transition("idle");
      }
    }
  }, [releaseMicrophone, transition]);

  const startRecording = useCallback(async () => {
    if (operationRef.current || statusRef.current === "listening") return;
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      fail(null, say("noRecorder"));
      return;
    }

    operationRef.current = true;
    cancelRecordingRef.current = false;
    autoStopRef.current = audioMode();
    speechStartedRef.current = false;
    lastLoudRef.current = 0;
    setNotice("");
    stopSpeech();
    setTranscript("");
    setDiagnosticAudio(null);
    setError("");
    setSpeechError(null);
    transition("processing", say("waitingMic"));
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      if (!mountedRef.current) {
        releaseMicrophone();
        return;
      }
      if (cancelRecordingRef.current) {
        operationRef.current = false;
        releaseMicrophone();
        transition("idle");
        return;
      }

      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorderFailedRef.current = false;
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        recorderFailedRef.current = true;
        cancelRecordingRef.current = true;
        operationRef.current = false;
        releaseMicrophone();
        fail(null, say("recordFailed"));
      };
      recorder.onstop = () => {
        recorderRef.current = null;
        const recording = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        chunksRef.current = [];
        releaseMicrophone();
        if (!mountedRef.current) return;
        if (recorderFailedRef.current) {
          operationRef.current = false;
          return;
        }
        if (cancelRecordingRef.current) {
          operationRef.current = false;
          transition("idle");
          return;
        }
        operationRef.current = true;
        transition("processing", say("understanding"));
        void recordingToWav(recording, sessionRef.current?.language === "en" ? "en" : "hi")
          .then((wavRecording) => {
            if (mountedRef.current) setDiagnosticAudio(wavRecording);
            return transcribeRecording(wavRecording);
          })
          .catch((caught: unknown) => {
            if (mountedRef.current) {
              operationRef.current = false;
              fail(caught, say("unreadable"));
            }
          });
      };

      const context = new AudioContext();
      contextRef.current = context;
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      context.createMediaStreamSource(stream).connect(analyser);
      analyserRef.current = analyser;
      recorder.start();
      listenStartedAtRef.current = typeof performance !== "undefined" ? performance.now() : 0;
      lastLevelUpdateRef.current = 0;
      sampleMicrophone();
      operationRef.current = false;
      transition("listening");
      timerRef.current = window.setTimeout(stopRecording, 30_000);
    } catch (caught) {
      operationRef.current = false;
      releaseMicrophone();
      if (cancelRecordingRef.current) {
        transition("idle");
        return;
      }
      const denied =
        caught instanceof DOMException &&
        (caught.name === "NotAllowedError" || caught.name === "PermissionDeniedError");
      fail(
        null,
        denied
          ? say("micDenied")
          : say("micFailed"),
      );
    }
  }, [fail, releaseMicrophone, sampleMicrophone, stopRecording, stopSpeech, transcribeRecording, transition]);

  const playClip = useCallback(
    (index: number, generation: number, offsetSeconds = 0) => {
      const urls = audioUrlsRef.current;
      if (!urls[index] || generation !== playbackGenerationRef.current) return;
      const audio = new Audio(urls[index]);
      audioRef.current = audio;
      setPlaybackProgress(0);
      audio.onplaying = () => {
        if (
          audioRef.current === audio &&
          generation === playbackGenerationRef.current &&
          mountedRef.current
        ) {
          setPlayingClip(index);
          transition("speaking");
        }
      };
      audio.ontimeupdate = () => {
        if (
          audioRef.current === audio &&
          generation === playbackGenerationRef.current &&
          audio.duration > 0 &&
          mountedRef.current
        ) {
          setPlaybackProgress(audio.currentTime / audio.duration);
        }
      };
      audio.onended = () => {
        if (
          audioRef.current !== audio ||
          generation !== playbackGenerationRef.current
        ) return;
        audioRef.current = null;
        setPlayingClip(null);
        const lastIndex = playEndRef.current ?? urls.length - 1;
        if (index + 1 <= Math.min(lastIndex, urls.length - 1)) {
          transition("idle");
          playClip(index + 1, generation);
        } else {
          setPlaybackProgress(1);
          setPlaybackComplete(true);
          transition("idle");
        }
      };
      audio.onerror = () => {
        if (
          audioRef.current !== audio ||
          generation !== playbackGenerationRef.current
        ) return;
        audioRef.current = null;
        setPlayingClip(null);
        setSpeechError(
          sessionRef.current?.language === "en"
            ? "Audio could not be played. The reply remains available on screen."
            : "यह आवाज़ नहीं चल पाई। जवाब स्क्रीन पर पढ़ सकते हैं।",
        );
        transition("error");
      };
      const startPlayback = () => {
        if (
          audioRef.current !== audio ||
          generation !== playbackGenerationRef.current
        ) return;
        if (offsetSeconds > 0) audio.currentTime = offsetSeconds;
        void audio.play().catch(() => {
          if (
            audioRef.current !== audio ||
            generation !== playbackGenerationRef.current
          ) return;
          audioRef.current = null;
          setPlayingClip(null);
          setSpeechError(
            sessionRef.current?.language === "en"
              ? "Audio did not start. Press play to try again."
              : "आवाज़ शुरू नहीं हुई। चलाने के लिए फिर से दबाएँ।",
          );
          transition("error");
        });
      };
      if (offsetSeconds > 0 && audio.readyState === 0) {
        audio.onloadedmetadata = startPlayback;
      } else {
        startPlayback();
      }
    },
    [transition],
  );

  const replaySpeech = useCallback(() => {
    if (statusRef.current === "processing" || statusRef.current === "listening") return;
    playEndRef.current = null;
    suppressAutoListenRef.current = false;
    playbackGenerationRef.current += 1;
    const generation = playbackGenerationRef.current;
    stopCurrentAudio();
    if (statusRef.current === "speaking") transition("idle");
    setSpeechError(null);
    setPlaybackComplete(false);
    try {
      if (audioUrlsRef.current.length === 0) {
        audioUrlsRef.current = createAudioUrls(speechClips);
      }
      if (audioUrlsRef.current.length > 0) playClip(0, generation);
    } catch {
      setSpeechError(
        sessionRef.current?.language === "en"
          ? "Reply audio could not be prepared. Please try again."
          : "जवाब की आवाज़ तैयार नहीं हो पाई। कृपया फिर कोशिश करें।",
      );
      transition("error");
    }
  }, [playClip, speechClips, stopCurrentAudio, transition]);

  /** Plays clips from..to (inclusive) of the latest reply, for example only the explanation or only the question. */
  const playClipRange = useCallback(
    (from: number, to: number, listenAfter = false) => {
      if (statusRef.current === "processing" || statusRef.current === "listening") return;
      const clips = speechClipsRef.current;
      if (from < 0 || from >= clips.length) return;
      playbackGenerationRef.current += 1;
      const generation = playbackGenerationRef.current;
      stopCurrentAudio();
      if (statusRef.current === "speaking") transition("idle");
      setSpeechError(null);
      setPlaybackComplete(false);
      playEndRef.current = Math.min(to, clips.length - 1);
      suppressAutoListenRef.current = !listenAfter;
      try {
        if (audioUrlsRef.current.length === 0) audioUrlsRef.current = createAudioUrls(clips);
        playClip(from, generation);
      } catch {
        setSpeechError(
          sessionRef.current?.language === "en"
            ? "Reply audio could not be prepared. Please try again."
            : "जवाब की आवाज़ तैयार नहीं हो पाई। कृपया फिर कोशिश करें।",
        );
        transition("error");
      }
    },
    [playClip, stopCurrentAudio, transition],
  );

  // After KuberKet finishes speaking, open the mic by itself when an answer is expected.
  useEffect(() => {
    if (!playbackComplete || suppressAutoListenRef.current || !listenAfterSpeechRef.current) return;
    if (statusRef.current !== "idle") return;
    void startRecording();
  }, [playbackComplete, startRecording]);

  useEffect(() => {
    if (!shouldAutoPlayRef.current) return;
    shouldAutoPlayRef.current = false;
    if (speechClips.length === 0) return;
    replaySpeech();
    // The first explanation of the results stops before the teach-back question: the page walks through the
    // charts first, and asks the question when the farmer reaches the last step.
    const question = speechClips.findIndex((clip) => clip.label === "Teach-back question");
    if (speechClips[0].label === "Explanation" && question > 0) {
      playEndRef.current = question - 1;
      suppressAutoListenRef.current = true;
    }
  }, [replaySpeech, speechClips]);

  const clearSpeech = useCallback(() => {
    playbackGenerationRef.current += 1;
    stopCurrentAudio();
    revokeAudioUrls();
    interruptedSpeechRef.current = null;
    setHasPausedSpeech(false);
    setSpeechClips([]);
    setSpeechError(null);
    setPlayingClip(null);
    setPlaybackProgress(0);
    setPlaybackComplete(false);
    if (statusRef.current === "speaking") transition("idle");
  }, [revokeAudioUrls, stopCurrentAudio, transition]);

  const continuePreviousSpeech = useCallback(() => {
    const interrupted = interruptedSpeechRef.current;
    if (!interrupted || statusRef.current === "processing" || statusRef.current === "listening") return;
    playbackGenerationRef.current += 1;
    const generation = playbackGenerationRef.current;
    stopCurrentAudio();
    if (statusRef.current === "speaking") transition("idle");
    revokeAudioUrls();
    setSpeechClips(interrupted.clips);
    setSpeechError(null);
    setPlaybackComplete(false);
    setHasPausedSpeech(false);
    interruptedSpeechRef.current = null;
    try {
      audioUrlsRef.current = createAudioUrls(interrupted.clips);
      playClip(interrupted.nextClipIndex, generation, interrupted.offsetSeconds);
    } catch {
      setSpeechError(
        sessionRef.current?.language === "en"
          ? "The earlier audio could not be resumed. Press replay to start it again."
          : "पहले वाली आवाज़ फिर शुरू नहीं हुई। दोबारा सुनने के लिए चलाएँ।",
      );
      transition("error");
    }
  }, [playClip, revokeAudioUrls, stopCurrentAudio, transition]);

  const interruptAndListen = useCallback(() => {
    stopSpeech();
    startRecording();
  }, [startRecording, stopSpeech]);

  const resetToIdle = useCallback(() => {
    cancelRecording();
    stopSpeech();
    setError("");
    setTranscript("");
    transition("idle");
  }, [cancelRecording, stopSpeech, transition]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      releaseMicrophone();
      stopCurrentAudio();
      revokeAudioUrls();
    };
  }, [releaseMicrophone, revokeAudioUrls, stopCurrentAudio]);

  return {
    status,
    error,
    activityLabel,
    transcript,
    diagnosticAudio,
    speechClips,
    speechError,
    playingClip,
    playbackProgress,
    playbackComplete,
    microphoneLevel,
    notice,
    playClipRange,
    startRecording,
    stopRecording,
    cancelRecording,
    beginConversation,
    sendTyped,
    explainChart,
    explainDocument,
    editTranscript: setTranscript,
    submitTranscript,
    cancelTranscript,
    replaySpeech,
    clearSpeech,
    continuePreviousSpeech,
    interruptAndListen,
    hasPausedSpeech,
    stopSpeech,
    resetToIdle,
  };
}

function speechSignature(clips: SpeechClip[]): string {
  return JSON.stringify(clips.map(({ label, text, audio_base64, mime_type }) => [
    label,
    text,
    audio_base64,
    mime_type,
  ]));
}

function createAudioUrls(clips: SpeechClip[]): string[] {
  return clips.map((clip) => {
    const binary = atob(clip.audio_base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return URL.createObjectURL(new Blob([bytes], { type: clip.mime_type }));
  });
}

async function recordingToWav(recording: Blob, language: "hi" | "en"): Promise<Blob> {
  const decoder = new AudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await decoder.decodeAudioData(await recording.arrayBuffer());
  } catch {
    throw new Error(voiceText[language].decodeFailed);
  } finally {
    if (decoder.state !== "closed") await decoder.close();
  }

  const sampleRate = 24_000;
  const frameCount = Math.ceil(decoded.duration * sampleRate);
  if (frameCount <= 0 || decoded.duration > 30.1) {
    throw new Error(voiceText[language].tooLong);
  }

  const offline = new OfflineAudioContext(1, frameCount, sampleRate);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  const mono = await offline.startRendering();
  return new Blob([encodePcmWav(mono)], { type: "audio/wav" });
}

function encodePcmWav(buffer: AudioBuffer): ArrayBuffer {
  const samples = buffer.getChannelData(0);
  const dataBytes = samples.length * 2;
  const wav = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(wav);
  const writeText = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };

  writeText(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeText(8, "WAVE");
  writeText(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(36, "data");
  view.setUint32(40, dataBytes, true);

  let offset = 44;
  for (const sample of samples) {
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += 2;
  }
  return wav;
}
