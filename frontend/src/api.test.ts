import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { loadSession, updateSession } from "./api";

function response(body: unknown): Response {
  return {
    ok: true,
    json: async () => body,
  } as Response;
}

function session(language: "hi" | "en") {
  return {
    session_id: "session-1",
    language,
    section: "home",
    messages: [],
    conversation_state: "not_started",
    current_slot: null,
    current_prompt: null,
    awaiting_confirmation: null,
    slots: {},
    finance_result: null,
    screen_explanation: null,
    latest_speech: [],
    speech_error: null,
  };
}

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, String(value)),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
  };
}

describe("language preference persistence", () => {
  beforeEach(() => {
    vi.stubGlobal("sessionStorage", storage());
    vi.stubGlobal("localStorage", storage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("restores the selected interface language when the backend session is recreated", async () => {
    localStorage.setItem("kuberket-language", "en");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(session("hi")))
      .mockResolvedValueOnce(response(session("en")));
    vi.stubGlobal("fetch", fetchMock);

    const loaded = await loadSession();

    expect(loaded.language).toBe("en");
    expect(sessionStorage.getItem("kuberket-session-id")).toBe("session-1");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body as string)).toEqual({ language: "en" });
  });

  it("stores a language choice after the backend accepts it", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(session("en"))));

    await updateSession("session-1", { language: "en" });

    expect(localStorage.getItem("kuberket-language")).toBe("en");
  });
});
