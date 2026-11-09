import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { explainDocument, sendMessage, transcribeAudio } from "./api";
import type { SessionSnapshot } from "./api";

vi.mock("./api", () => ({
  explainDocument: vi.fn(),
  explainChart: vi.fn(),
  sendMessage: vi.fn(),
  startConversation: vi.fn(),
  transcribeAudio: vi.fn(),
  updateSession: vi.fn(),
}));

import useVoiceController from "./useVoiceController";

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
const sendMessageMock = vi.mocked(sendMessage);
const explainDocumentMock = vi.mocked(explainDocument);
const transcribeAudioMock = vi.mocked(transcribeAudio);

const makeSession = (overrides: Partial<SessionSnapshot> = {}): SessionSnapshot => ({
  session_id: "session-1",
  language: "hi",
  section: "home",
  messages: [],
  conversation_state: "collecting",
  current_prompt: null,
  slots: {},
  finance_result: null,
  screen_explanation: null,
  latest_speech: clips,
  speech_error: null,
  ...overrides,
});

const audioInstances: FakeAudio[] = [];
let rejectNextPlay = false;

class FakeAudio {
  onplaying: (() => void) | null = null;
  ontimeupdate: (() => void) | null = null;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  currentTime = 0;
  duration = 10;
  play = vi.fn(() => {
    if (rejectNextPlay) {
      rejectNextPlay = false;
      return Promise.reject(new Error("browser detail"));
    }
    return Promise.resolve();
  });
  pause = vi.fn();

  constructor(readonly src: string) {
    audioInstances.push(this);
  }
}

const createObjectURLDescriptor = Object.getOwnPropertyDescriptor(URL, "createObjectURL");
const revokeObjectURLDescriptor = Object.getOwnPropertyDescriptor(URL, "revokeObjectURL");
const mediaDevicesDescriptor = Object.getOwnPropertyDescriptor(navigator, "mediaDevices");

beforeEach(() => {
  vi.clearAllMocks();
  audioInstances.length = 0;
  rejectNextPlay = false;
  vi.stubGlobal("Audio", FakeAudio);
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => "blob:reply"),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  if (createObjectURLDescriptor) {
    Object.defineProperty(URL, "createObjectURL", createObjectURLDescriptor);
  } else {
    delete (URL as Partial<typeof URL>).createObjectURL;
  }
  if (revokeObjectURLDescriptor) {
    Object.defineProperty(URL, "revokeObjectURL", revokeObjectURLDescriptor);
  } else {
    delete (URL as Partial<typeof URL>).revokeObjectURL;
  }
  if (mediaDevicesDescriptor) {
    Object.defineProperty(navigator, "mediaDevices", mediaDevicesDescriptor);
  } else {
    Reflect.deleteProperty(navigator, "mediaDevices");
  }
});

describe("useVoiceController audio playback", () => {
  it("uses loaded reply clips and reflects actual sequential playback", async () => {
    const { result } = renderHook(() => useVoiceController({
      session: makeSession(),
      setSession: vi.fn(),
    }));

    expect(result.current.speechClips).toEqual(clips);
    act(() => result.current.replaySpeech());

    expect(audioInstances).toHaveLength(1);
    expect(audioInstances[0].play).toHaveBeenCalledOnce();
    expect(result.current.status).toBe("idle");
    expect(result.current.playingClip).toBeNull();

    act(() => audioInstances[0].onplaying?.());
    expect(result.current.status).toBe("speaking");
    expect(result.current.playingClip).toBe(0);

    act(() => {
      audioInstances[0].currentTime = 4;
      audioInstances[0].ontimeupdate?.();
    });
    expect(result.current.playbackProgress).toBe(0.4);

    act(() => audioInstances[0].onended?.());
    expect(audioInstances).toHaveLength(2);
    expect(audioInstances[1].play).toHaveBeenCalledOnce();
    expect(result.current.status).toBe("idle");
    expect(result.current.playingClip).toBeNull();

    act(() => audioInstances[1].onplaying?.());
    expect(result.current.status).toBe("speaking");
    expect(result.current.playingClip).toBe(1);

    act(() => audioInstances[1].onended?.());
    expect(result.current.status).toBe("idle");
    expect(result.current.playingClip).toBeNull();
    expect(result.current.playbackComplete).toBe(true);
  });

  it("stops active audio and returns the orb to idle", () => {
    const { result } = renderHook(() => useVoiceController({
      session: makeSession(),
      setSession: vi.fn(),
    }));

    act(() => result.current.replaySpeech());
    act(() => audioInstances[0].onplaying?.());
    expect(result.current.status).toBe("speaking");

    act(() => result.current.stopSpeech());
    expect(audioInstances[0].pause).toHaveBeenCalledOnce();
    expect(result.current.status).toBe("idle");
    expect(result.current.playingClip).toBeNull();
  });

  it("exposes the exact converted WAV blob passed to transcription", async () => {
    const NativeBlob = Blob;
    class TestBlob extends NativeBlob {
      async arrayBuffer() {
        return new ArrayBuffer(4);
      }
    }
    let recorder: {
      state: string;
      ondataavailable: ((event: { data: Blob }) => void) | null;
      onstop: (() => void) | null;
      start: () => void;
      stop: () => void;
    };
    class TestRecorder {
      state = "inactive";
      mimeType = "audio/webm";
      ondataavailable: ((event: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      constructor() {
        recorder = this;
      }
      start() {
        this.state = "recording";
      }
      stop() {
        this.state = "inactive";
        this.ondataavailable?.({ data: new Blob(["captured audio"]) });
        this.onstop?.();
      }
    }
    class TestAudioContext {
      state = "running";
      createAnalyser() {
        return {
          fftSize: 8,
          getByteTimeDomainData: (samples: Uint8Array) => samples.fill(128),
        };
      }
      createMediaStreamSource() {
        return { connect: vi.fn() };
      }
      async decodeAudioData() {
        return { duration: 0.1 } as AudioBuffer;
      }
      async close() {
        this.state = "closed";
      }
    }
    class TestOfflineAudioContext {
      readonly destination = {};
      constructor(
        _channels: number,
        private readonly frames: number,
        private readonly rate: number,
      ) {}
      createBufferSource() {
        return { buffer: null, connect: vi.fn(), start: vi.fn() };
      }
      async startRendering() {
        return {
          sampleRate: this.rate,
          getChannelData: () => new Float32Array(this.frames),
        } as unknown as AudioBuffer;
      }
    }

    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] }) },
    });
    vi.stubGlobal("Blob", TestBlob);
    vi.stubGlobal("MediaRecorder", TestRecorder);
    vi.stubGlobal("AudioContext", TestAudioContext);
    vi.stubGlobal("OfflineAudioContext", TestOfflineAudioContext);
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    transcribeAudioMock.mockResolvedValue({ transcript: "test phrase", language_code: "hi-IN" });
    const { result } = renderHook(() => useVoiceController({
      session: makeSession(),
      setSession: vi.fn(),
    }));

    await act(async () => result.current.startRecording());
    act(() => recorder.stop());
    await waitFor(() => expect(transcribeAudioMock).toHaveBeenCalledOnce());

    const sentAudio = transcribeAudioMock.mock.calls[0][1];
    expect(result.current.diagnosticAudio).toBe(sentAudio);
    expect(sentAudio.type).toBe("audio/wav");
    expect(sentAudio.size).toBeGreaterThan(44);
  });

  it("interrupts a queued multi-clip reply, answers, and resumes at the saved position", async () => {
    const newReply = {
      label: "Chart explanation",
      text: "इस चार्ट में उधार की रकम और ब्याज दिखता है।",
      audio_base64: "bmV3",
      mime_type: "audio/wav" as const,
    };
    sendMessageMock.mockResolvedValue(makeSession({ input_mode: "chat", latest_speech: [newReply] }));
    const session = makeSession({ input_mode: "chat" });
    const setSession = vi.fn();
    const { result } = renderHook(() => useVoiceController({ session, setSession }));

    act(() => result.current.replaySpeech());
    act(() => audioInstances[0].onplaying?.());
    act(() => audioInstances[0].onended?.());
    expect(result.current.status).toBe("idle");
    act(() => audioInstances[1].onplaying?.());
    act(() => {
      audioInstances[1].currentTime = 4;
      result.current.stopSpeech();
    });

    expect(result.current.status).toBe("idle");
    expect(result.current.hasPausedSpeech).toBe(true);
    let submitted = false;
    await act(async () => {
      submitted = await result.current.sendTyped("कितना ब्याज है?");
    });
    expect(submitted).toBe(true);
    expect(sendMessageMock).toHaveBeenCalledWith("session-1", "कितना ब्याज है?");
    await waitFor(() => expect(result.current.speechClips).toEqual([newReply]));
    expect(result.current.hasPausedSpeech).toBe(true);
    expect(audioInstances).toHaveLength(2);

    act(() => result.current.continuePreviousSpeech());
    expect(audioInstances).toHaveLength(3);
    expect(audioInstances[2].currentTime).toBe(4);
    expect(result.current.status).toBe("idle");
    act(() => audioInstances[2].onplaying?.());
    expect(result.current.status).toBe("speaking");
    expect(result.current.playingClip).toBe(1);
    expect(result.current.hasPausedSpeech).toBe(false);
  });

  it("speaks a document explanation, accepts a follow-up, and resumes the shared audio", async () => {
    const documentClip = {
      label: "Document term",
      text: "The document lists a ten percent interest rate.",
      audio_base64: "ZG9j",
      mime_type: "audio/wav" as const,
    };
    const followupClip = {
      label: "Document answer",
      text: "A floating rate can change under the agreement rules.",
      audio_base64: "YW5zd2Vy",
      mime_type: "audio/wav" as const,
    };
    explainDocumentMock.mockResolvedValue(
      makeSession({ section: "documents", input_mode: "chat", latest_speech: [documentClip] }),
    );
    sendMessageMock.mockResolvedValue(
      makeSession({ section: "documents", input_mode: "chat", latest_speech: [followupClip] }),
    );
    const { result } = renderHook(() => {
      const [session, setSession] = useState<SessionSnapshot | null>(
        makeSession({ section: "documents" }),
      );
      return useVoiceController({ session, setSession });
    });

    await act(async () => {
      await result.current.explainDocument("interest_rate");
    });
    await waitFor(() => expect(audioInstances).toHaveLength(1));
    act(() => audioInstances[0].onplaying?.());
    act(() => {
      audioInstances[0].currentTime = 3;
    });
    let submitted = false;
    await act(async () => {
      submitted = await result.current.sendTyped("What does floating interest mean?");
    });

    expect(submitted).toBe(true);
    expect(audioInstances[0].pause).toHaveBeenCalledOnce();
    expect(result.current.hasPausedSpeech).toBe(true);
    expect(result.current.speechClips).toEqual([followupClip]);
    act(() => result.current.continuePreviousSpeech());
    expect(audioInstances).toHaveLength(2);
    expect(audioInstances[1].currentTime).toBe(3);
    expect(explainDocumentMock).toHaveBeenCalledWith("session-1", "interest_rate");
    expect(sendMessageMock).toHaveBeenCalledWith(
      "session-1",
      "What does floating interest mean?",
    );
  });

  it("disposes old audio when the shared session receives refreshed chart data", () => {
    const initialSession = makeSession();
    const { result, rerender } = renderHook(
      ({ session }) => useVoiceController({ session, setSession: vi.fn() }),
      { initialProps: { session: initialSession } },
    );
    act(() => result.current.replaySpeech());
    act(() => audioInstances[0].onplaying?.());
    expect(result.current.status).toBe("speaking");

    rerender({ session: makeSession({ latest_speech: [] }) });

    expect(audioInstances[0].pause).toHaveBeenCalledOnce();
    expect(result.current.status).toBe("idle");
    expect(result.current.speechClips).toEqual([]);
    expect(result.current.hasPausedSpeech).toBe(false);
  });

  it("does not submit a chart question against stale session data", async () => {
    const { result } = renderHook(() => useVoiceController({
      session: makeSession({ chart_context_stale: true }),
      setSession: vi.fn(),
    }));

    let submitted = true;
    await act(async () => {
      submitted = await result.current.sendTyped("कितना ब्याज है?");
    });

    expect(submitted).toBe(false);
    expect(sendMessageMock).not.toHaveBeenCalled();
    expect(result.current.error).toContain("चार्ट का नया हिसाब");
  });

  it("reports playback rejection without leaving a false speaking state", async () => {
    const { result } = renderHook(() => useVoiceController({
      session: makeSession(),
      setSession: vi.fn(),
    }));

    rejectNextPlay = true;
    act(() => result.current.replaySpeech());
    await waitFor(() => expect(result.current.status).toBe("error"));

    expect(result.current.speechError).toContain("आवाज़ शुरू नहीं हुई");
    expect(result.current.speechError).not.toContain("browser detail");
  });

  it("keeps a pending microphone permission request locked until it is cancelled", async () => {
    let resolvePermission!: (stream: MediaStream) => void;
    const getUserMedia = vi.fn(
      () => new Promise<MediaStream>((resolve) => { resolvePermission = resolve; }),
    );
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    });
    vi.stubGlobal("MediaRecorder", class {});
    const stopTrack = vi.fn();
    const stream = { getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream;
    const { result } = renderHook(() => useVoiceController({
      session: makeSession(),
      setSession: vi.fn(),
    }));
    let starting!: Promise<void>;

    act(() => {
      starting = result.current.startRecording();
    });
    act(() => result.current.cancelRecording());
    act(() => {
      void result.current.startRecording();
    });

    expect(getUserMedia).toHaveBeenCalledOnce();
    expect(result.current.status).toBe("processing");

    await act(async () => {
      resolvePermission(stream);
      await starting;
    });

    expect(stopTrack).toHaveBeenCalledOnce();
    expect(result.current.status).toBe("idle");
  });

  it("returns to idle when permission is denied after cancellation", async () => {
    let rejectPermission!: (error: DOMException) => void;
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: () => new Promise<MediaStream>((_resolve, reject) => {
          rejectPermission = reject;
        }),
      },
    });
    vi.stubGlobal("MediaRecorder", class {});
    const { result } = renderHook(() => useVoiceController({
      session: makeSession(),
      setSession: vi.fn(),
    }));
    let starting!: Promise<void>;

    act(() => {
      starting = result.current.startRecording();
    });
    act(() => result.current.cancelRecording());

    await act(async () => {
      rejectPermission(new DOMException("Permission denied", "NotAllowedError"));
      await starting;
    });

    expect(result.current.status).toBe("idle");
    expect(result.current.error).toBe("");
  });
});
