import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SessionSnapshot } from "./api";
import { makeInfo, makeResult } from "./schemes/testFixtures";
import { makeReport } from "./year/testFixtures";

const api = vi.hoisted(() => ({
  calculateNumbers: vi.fn(),
  evaluateSchemes: vi.fn(),
  getCashflow: vi.fn(),
  getDemoYear: vi.fn(),
  getSchemesInfo: vi.fn(),
  getVoiceStatus: vi.fn(),
  checkVoice: vi.fn(),
  resetConversation: vi.fn(),
  speakCashflow: vi.fn(),
  loadSession: vi.fn(),
  sendMessage: vi.fn(),
  startConversation: vi.fn(),
  transcribeAudio: vi.fn(),
  updateSession: vi.fn(),
}));

vi.mock("./api", () => api);

import App from "./App";

const makeSession = (overrides: Partial<SessionSnapshot> = {}): SessionSnapshot => ({
  session_id: "session-1",
  language: "hi",
  section: "home",
  messages: [],
  conversation_state: "not_started",
  current_slot: null,
  awaiting_confirmation: null,
  current_prompt: null,
  slots: {},
  finance_result: null,
  screen_explanation: null,
  latest_speech: [],
  speech_error: null,
  ...overrides,
});

const NativeBlob = Blob;

class TestBlob extends NativeBlob {
  async arrayBuffer() {
    return new ArrayBuffer(4);
  }
}

class MockRecorder {
  state = "inactive";
  mimeType = "audio/webm";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;

  start() {
    this.state = "recording";
  }

  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["browser audio"]) });
    this.onstop?.();
  }
}

class MockAudioContext {
  state = "running";

  createAnalyser() {
    return {
      fftSize: 8,
      getByteTimeDomainData: (samples: Uint8Array) => samples.fill(140),
    };
  }

  createMediaStreamSource() {
    return { connect: vi.fn() };
  }

  async decodeAudioData() {
    return { duration: 0.1 } as unknown as AudioBuffer;
  }

  async close() {
    this.state = "closed";
  }
}

class MockOfflineAudioContext {
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

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.setItem("kuberket-story-seen", "1");
  api.loadSession.mockResolvedValue(makeSession());
  api.updateSession.mockImplementation(
    async (_id: string, change: Partial<SessionSnapshot>) =>
      makeSession({ ...change, section: change.section ?? "home" }),
  );
  api.startConversation.mockResolvedValue(
    makeSession({
      conversation_state: "collecting",
      current_slot: "asset_price",
      current_prompt: "ट्रैक्टर की कीमत कितनी है?",
      messages: [{ role: "assistant", text: "ट्रैक्टर की कीमत कितनी है?" }],
      slots: { asset_price: { value: null, status: "missing" } },
    }),
  );
  api.sendMessage.mockResolvedValue(makeSession());
  api.getCashflow.mockImplementation(async (_inputs: unknown, drop: number) => makeReport(drop));
  api.getVoiceStatus.mockResolvedValue({ key_configured: true });
  api.getSchemesInfo.mockResolvedValue(makeInfo());
  api.evaluateSchemes.mockResolvedValue(makeResult());
  api.transcribeAudio.mockResolvedValue({
    transcript: "मुझे tractor loan चाहिए",
    language_code: "hi-IN",
  });
  vi.stubGlobal("Blob", TestBlob);
  vi.stubGlobal("MediaRecorder", MockRecorder);
  vi.stubGlobal("AudioContext", MockAudioContext);
  vi.stubGlobal("OfflineAudioContext", MockOfflineAudioContext);
  vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: vi.fn().mockResolvedValue({
        getTracks: () => [{ stop: vi.fn() }],
      }),
    },
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Home conversation experience", () => {
  it("opens on the story, lets the farmer skip into Home, and brings the story back from the nav", async () => {
    sessionStorage.removeItem("kuberket-story-seen");
    vi.stubGlobal("scrollTo", vi.fn());
    api.getDemoYear.mockRejectedValue(new Error("offline"));
    render(<App />);

    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("किस्त समझिए");

    fireEvent.click(screen.getByRole("button", { name: "छोड़ें" }));
    await screen.findByRole("button", { name: "कहानी" });
    expect(sessionStorage.getItem("kuberket-story-seen")).toBe("1");

    fireEvent.click(screen.getByRole("button", { name: "कहानी" }));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("किस्त समझिए");
  });

  it("starts the spoken conversation after choosing 'बोलकर शुरू करें' on the story", async () => {
    sessionStorage.removeItem("kuberket-story-seen");
    vi.stubGlobal("scrollTo", vi.fn());
    render(<App />);

    fireEvent.click(screen.getAllByRole("button", { name: /बोलकर शुरू करें/ })[0]);
    await waitFor(() => expect(api.startConversation).toHaveBeenCalledTimes(1));
  });

  it("lets the farmer choose what the loan is for before starting", async () => {
    api.loadSession.mockResolvedValue(makeSession({ loan_purpose: "other" }));
    render(<App />);

    const borewell = await screen.findByRole("button", { name: "बोरवेल / सिंचाई" });
    fireEvent.click(borewell);

    await waitFor(() =>
      expect(api.updateSession).toHaveBeenCalledWith("session-1", { loan_purpose: "irrigation" }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "बोरवेल / सिंचाई" }).getAttribute("aria-pressed"),
      ).toBe("true"),
    );
  });

  it("lets the farmer pick the crop on the first page and shows its harvest months", async () => {
    api.loadSession.mockResolvedValue(makeSession());
    render(<App />);

    const paddy = await screen.findByRole("button", { name: "धान" });
    expect(paddy.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("धान: कमाई अक्टूबर और नवंबर में")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "गेहूँ" }));
    await waitFor(() => expect(api.updateSession).toHaveBeenCalledWith("session-1", { crop: "wheat" }));
    await screen.findByText("गेहूँ: कमाई मार्च और अप्रैल में");
  });

  it("opens a real Schemes page instead of a placeholder, with the chosen crop", async () => {
    api.loadSession.mockResolvedValue(makeSession({ language: "en", crop: "maize" }));
    api.updateSession.mockImplementation(async (_id: string, change: Partial<SessionSnapshot>) =>
      makeSession({ language: "en", crop: "maize", ...change }),
    );
    render(<App />);
    await screen.findByRole("heading", { name: "Understand your farm-loan numbers" });

    fireEvent.click(screen.getByRole("button", { name: "Schemes" }));

    await screen.findByRole("heading", { name: "Schemes: compared on your numbers" });
    expect(screen.queryByText("This section is not available yet.")).toBeNull();
    expect(screen.getByRole("button", { name: "Maize" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("Maize: income in September and October")).toBeTruthy();
  });

  it("shows the year story as step 2 of the results, built from the conversation's numbers and the chosen crop", async () => {
    api.loadSession.mockResolvedValue(
      makeSession({
        language: "en",
        crop: "wheat",
        input_mode: "chat",
        conversation_state: "teach_back",
        messages: [{ role: "assistant", text: "Explained.\nIf the harvest is poor, will the instalment still be due?" }],
        slots: {
          asset_price: { value: 600000, status: "given" },
          down_payment: { value: 100000, status: "given" },
          yearly_interest_rate_percent: { value: 10, status: "given" },
          tenure_years: { value: 5, status: "given" },
          yearly_farm_income: { value: 300000, status: "given" },
          monthly_costs: { value: 10000, status: "given" },
          monthly_existing_loan_payments: { value: null, status: "assumed" },
        },
        finance_result: {
          loan_amount: 500000,
          yearly_interest_rate_percent: 10,
          tenure_years: 5,
          monthly_kist: 10624,
          total_repayment: 637440,
          total_interest: 137440,
          scenarios: [
            {
              name: "normal",
              income_drop_percent: 0,
              affordability: {
                yearly_money_left: 17376,
                yearly_status: "positive",
                monthly_money_left: 1448,
                monthly_status: "positive",
              },
            },
          ],
          assumptions: [],
        },
      }),
    );
    render(<App />);

    expect(await screen.findByText("₹10,624")).toBeTruthy();
    expect(api.getCashflow).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("tab", { name: /Year story/ }));

    await screen.findByRole("img", { name: /Twelve-month cash flow/ });
    expect(api.getCashflow).toHaveBeenCalledWith(
      {
        crop: "wheat",
        yearly_income: 300000,
        monthly_costs: 10000,
        monthly_existing_loan_payments: 0,
        asset_price: 600000,
        down_payment: 100000,
        loan_rate: 10,
        tenure_years: 5,
        savings: 0,
      },
      0,
      "en",
      expect.anything(),
    );
    expect(screen.getByRole("button", { name: "▶ Play the year" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ask about this chart" })).toBeTruthy();
  });

  it("does not show a year story before the farmer has given income and costs", async () => {
    api.loadSession.mockResolvedValue(
      makeSession({ slots: { asset_price: { value: 600000, status: "given" } } }),
    );
    render(<App />);
    await screen.findByRole("button", { name: "धान" });

    expect(api.getCashflow).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /साल चलाएँ/ })).toBeNull();
  });

  it("keeps Home and My Numbers navigation without exposing Documents controls", async () => {
    api.loadSession.mockResolvedValue(makeSession({ language: "en" }));
    api.updateSession.mockImplementation(async (_id, update) =>
      makeSession({ language: "en", ...update }),
    );

    render(<App />);
    await screen.findByRole("heading", { name: "Understand your farm-loan numbers" });

    expect(screen.getByRole("navigation", { name: "Main navigation" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "My numbers" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Documents" })).toBeNull();
    expect(screen.queryByText(/upload.*pdf/i)).toBeNull();
    expect(screen.queryByLabelText(/choose a pdf/i)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "My numbers" }));
    await screen.findByRole("heading", { name: "How does one change affect the estimate?" });
    expect(screen.queryByRole("button", { name: "Documents" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Home" }));
    await screen.findByRole("heading", { name: "Understand your farm-loan numbers" });
    expect(screen.queryByText(/upload.*pdf/i)).toBeNull();
  });

  it("returns a previously selected Documents session to Home without clearing its conversation", async () => {
    const active = makeSession({
      language: "en",
      section: "documents",
      conversation_state: "collecting",
      document: {
        document_id: "doc-1",
        filename: "loan-agreement.pdf",
        page_count: 2,
        scanned_only: false,
        terms: {},
      },
      messages: [{ role: "assistant", text: "What happens if I pay late?" }],
    });
    api.loadSession.mockResolvedValue(active);
    api.updateSession.mockImplementation(async (_id, update) =>
      makeSession({ ...active, ...update, section: "home" }),
    );

    render(<App />);
    await waitFor(() => {
      expect(screen.getByText("What happens if I pay late?")).toBeTruthy();
    });
    expect(api.updateSession).toHaveBeenCalledWith("session-1", { section: "home" });
    expect(screen.queryByText("loan-agreement.pdf")).toBeNull();
    expect(screen.queryByRole("button", { name: "Documents" })).toBeNull();
  });

  it("offers only Hindi and English, and switches during a conversation without losing the transcript", async () => {
    const active = makeSession({
      conversation_state: "collecting",
      current_slot: "asset_price",
      messages: [
        { role: "farmer", text: "मुझे ट्रैक्टर का कर्ज़ समझना है।" },
        { role: "assistant", text: "ट्रैक्टर की कीमत कितनी है?" },
      ],
    });
    api.loadSession.mockResolvedValue(active);
    api.updateSession.mockImplementation(async (_id, update) =>
      makeSession({
        ...active,
        ...update,
        messages: update.language === "en"
          ? [active.messages[0], { role: "assistant", text: "What is the tractor price?" }]
          : active.messages,
      }),
    );

    render(<App />);
    const languageSelector = await screen.findByRole("combobox", { name: "भाषा" });
    const options = Array.from((languageSelector as HTMLSelectElement).options).map((option) => option.value);
    expect(options).toEqual(["hi", "en"]);
    fireEvent.change(languageSelector, { target: { value: "en" } });

    await waitFor(() => {
      expect(screen.getByText("What is the tractor price?")).toBeTruthy();
      expect(screen.getByText("मुझे ट्रैक्टर का कर्ज़ समझना है।")).toBeTruthy();
    });
    expect(screen.getByRole("combobox", { name: "Language" })).toBeTruthy();
  });

  it("replaces the chat with the three numbered result steps once the numbers are ready", async () => {
    api.loadSession.mockResolvedValue(
      makeSession({
        input_mode: "chat",
        conversation_state: "teach_back",
        messages: [
          { role: "farmer", text: "ट्रैक्टर लोन समझना है।" },
          { role: "assistant", text: "आपका हिसाब तैयार है।\nअगर फसल कम हुई, तो क्या किस्त देनी होगी?" },
        ],
        slots: {
          asset_price: { value: 600000, status: "given" },
          down_payment: { value: null, status: "missing" },
        },
        finance_result: {
          loan_amount: 500000,
          yearly_interest_rate_percent: 10,
          tenure_years: 5,
          monthly_kist: 10624,
          total_repayment: 637440,
          total_interest: 137440,
          scenarios: [
            {
              name: "normal",
              income_drop_percent: 0,
              affordability: {
                yearly_money_left: 17376,
                yearly_status: "positive",
                monthly_money_left: 1448,
                monthly_status: "positive",
              },
            },
          ],
          assumptions: [],
        },
      }),
    );

    render(<App />);

    expect(await screen.findByText("₹10,624")).toBeTruthy();
    expect(screen.getByText("₹5,00,000")).toBeTruthy();
    expect(screen.queryByText("ट्रैक्टर लोन समझना है।")).toBeNull();
    expect(screen.queryByLabelText("अपना जवाब लिखिए")).toBeNull();
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual(["1 आपके नतीजे", "2 साल की कहानी", "3 समझ की जाँच"]);
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");

    fireEvent.click(tabs[2]);
    expect(screen.getByText("अगर फसल कम हुई, तो क्या किस्त देनी होगी?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "हाँ, देनी होगी" }));
    await waitFor(() => expect(api.sendMessage).toHaveBeenCalledWith("session-1", "हाँ, देनी होगी"));
  });

  it("sends typed replies and quick confirmations through one message endpoint in chat mode", async () => {
    api.loadSession.mockResolvedValue(
      makeSession({
        input_mode: "chat",
        conversation_state: "collecting",
        current_slot: "asset_price",
        awaiting_confirmation: { slot: "asset_price", value: 600000 },
        messages: [{ role: "assistant", text: "क्या कीमत छह लाख रुपये है?" }],
        slots: { asset_price: { value: null, status: "missing" } },
      }),
    );
    api.sendMessage.mockResolvedValue(
      makeSession({
        input_mode: "chat",
        conversation_state: "collecting",
        current_slot: "down_payment",
        messages: [
          { role: "assistant", text: "क्या कीमत छह लाख रुपये है?" },
          { role: "farmer", text: "हाँ, सही है" },
          { role: "assistant", text: "आप कितनी रकम जमा करेंगे?" },
        ],
      }),
    );

    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "हाँ, सही है" }));
    await waitFor(() => expect(api.sendMessage).toHaveBeenCalledWith("session-1", "हाँ, सही है"));
    expect((await screen.findAllByText("आप कितनी रकम जमा करेंगे?")).length).toBeGreaterThan(0);

    fireEvent.change(screen.getByLabelText("अपना जवाब लिखिए"), { target: { value: "एक लाख" } });
    fireEvent.click(screen.getByRole("button", { name: "भेजें" }));
    await waitFor(() => expect(api.sendMessage).toHaveBeenLastCalledWith("session-1", "एक लाख"));
  });

  it("sends what Prisma heard straight away in audio mode, with no review step", async () => {
    api.loadSession.mockResolvedValue(
      makeSession({
        conversation_state: "collecting",
        current_slot: "asset_price",
        messages: [{ role: "assistant", text: "ट्रैक्टर की कीमत कितनी है?" }],
      }),
    );
    api.sendMessage.mockImplementation(async (_id: string, sent: string) =>
      makeSession({
        conversation_state: "collecting",
        current_slot: "down_payment",
        messages: [
          { role: "assistant", text: "ट्रैक्टर की कीमत कितनी है?" },
          { role: "farmer", text: sent },
          { role: "assistant", text: "आप कितनी रकम जमा करेंगे?" },
        ],
      }),
    );

    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "बोलने के लिए शुरू करें" }));
    fireEvent.click(await screen.findByRole("button", { name: "रिकॉर्डिंग रोकें" }));

    await waitFor(() =>
      expect(api.sendMessage).toHaveBeenCalledWith("session-1", "मुझे tractor loan चाहिए"),
    );
    expect(api.transcribeAudio).toHaveBeenCalledOnce();
    expect(screen.queryByLabelText("कुबेरकेत ने यह सुना — ज़रूरत हो तो सुधारें")).toBeNull();
    expect(await screen.findByText("आप कितनी रकम जमा करेंगे?")).toBeTruthy();
  });

  it("carries conversation numbers into My Numbers and preserves the Home timeline", async () => {
    const home = makeSession({
      conversation_state: "collecting",
      messages: [
        { role: "farmer", text: "ट्रैक्टर की कीमत पाँच लाख है।" },
        { role: "assistant", text: "ब्याज दर कितनी है?" },
      ],
      finance_result: {
        loan_amount: 500_000,
        yearly_interest_rate_percent: 10,
        tenure_years: 5,
        monthly_kist: 10_624,
        total_repayment: 637_440,
        total_interest: 137_440,
        scenarios: [],
        assumptions: [],
      },
      numbers_inputs: {
        asset_price: { value: 500_000, status: "given" },
        down_payment: { value: 0, status: "given" },
        yearly_interest_rate_percent: { value: 10, status: "given" },
        tenure_years: { value: 5, status: "given" },
        yearly_farm_income: { value: 600_000, status: "given" },
        monthly_costs: { value: 20_000, status: "given" },
        monthly_existing_loan_payments: { value: 2_000, status: "given" },
        yearly_hiring_spend: { value: null, status: "missing" },
      },
    });
    api.loadSession.mockResolvedValue(home);
    api.updateSession.mockImplementation(async (_id: string, update: Partial<SessionSnapshot>) =>
      makeSession({ ...home, ...update, section: update.section ?? home.section }),
    );

    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "मेरा हिसाब" }));

    expect(await screen.findByRole("heading", { name: "एक बदलाव से हिसाब कैसे बदलता है?" })).toBeTruthy();
    expect((screen.getByLabelText("खरीद की कीमत (₹)") as HTMLInputElement).value).toBe("500000");

    fireEvent.click(screen.getByRole("button", { name: "होम" }));
    expect(await screen.findByText("ट्रैक्टर की कीमत पाँच लाख है।")).toBeTruthy();
    expect(await screen.findByText("ब्याज दर कितनी है?")).toBeTruthy();
  });

  it("shows a recalculated My Numbers result in the shared Home session", async () => {
    let serverState = makeSession({
      conversation_state: "complete",
      messages: [
        { role: "farmer", text: "ट्रैक्टर की कीमत पाँच लाख है।" },
        { role: "assistant", text: "यह हिसाब है।" },
      ],
      finance_result: {
        loan_amount: 500_000,
        yearly_interest_rate_percent: 10,
        tenure_years: 5,
        monthly_kist: 10_624,
        total_repayment: 637_440,
        total_interest: 137_440,
        scenarios: [],
        assumptions: [],
      },
      numbers_inputs: {
        asset_price: { value: 500_000, status: "given" },
        down_payment: { value: 0, status: "given" },
        yearly_interest_rate_percent: { value: 10, status: "given" },
        tenure_years: { value: 5, status: "given" },
        yearly_farm_income: { value: 600_000, status: "given" },
        monthly_costs: { value: 20_000, status: "given" },
        monthly_existing_loan_payments: { value: 2_000, status: "given" },
        yearly_hiring_spend: { value: null, status: "missing" },
      },
    });
    api.loadSession.mockImplementation(async () => serverState);
    api.updateSession.mockImplementation(async (_id: string, update: Partial<SessionSnapshot>) => {
      serverState = { ...serverState, ...update };
      return serverState;
    });
    api.calculateNumbers.mockImplementation(async () => {
      serverState = {
        ...serverState,
        numbers_workspace_active: true,
        numbers_result: {
          ...serverState.finance_result!,
          monthly_kist: 11_200,
        },
      };
      return serverState;
    });

    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "मेरा हिसाब" }));
    fireEvent.change(await screen.findByLabelText("सालाना ब्याज दर (% प्रति साल)"), {
      target: { value: "12" },
    });

    expect(await screen.findByText("₹11,200")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "होम" }));
    expect(await screen.findByText("₹11,200")).toBeTruthy();
  });

  it("lets the farmer choose audio or chat, and speed, before starting and again at any point", async () => {
    api.loadSession.mockResolvedValue(makeSession());
    render(<App />);

    const audio = await screen.findByRole("button", { name: /बोलकर/ });
    expect(audio.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "तेज़" }));
    await waitFor(() => expect(api.updateSession).toHaveBeenCalledWith("session-1", { speech_speed: 1.15 }));
    fireEvent.click(screen.getByRole("button", { name: /लिखकर/ }));
    await waitFor(() => expect(api.updateSession).toHaveBeenCalledWith("session-1", { input_mode: "chat" }));

    fireEvent.click(screen.getByRole("button", { name: /शुरू करें/ }));
    await waitFor(() => expect(api.startConversation).toHaveBeenCalledTimes(1));
  });

  it("switches from audio to chat in the middle of the conversation and shows the typing box", async () => {
    const active = makeSession({
      conversation_state: "collecting",
      current_slot: "asset_price",
      messages: [{ role: "assistant", text: "ट्रैक्टर की कीमत कितनी है?" }],
    });
    api.loadSession.mockResolvedValue(active);
    api.updateSession.mockImplementation(async (_id: string, change: Partial<SessionSnapshot>) => ({ ...active, ...change }));
    render(<App />);
    await screen.findByRole("button", { name: "बोलने के लिए शुरू करें" });
    expect(screen.queryByLabelText("अपना जवाब लिखिए")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /लिखकर/ }));

    await screen.findByLabelText("अपना जवाब लिखिए");
    expect(api.updateSession).toHaveBeenCalledWith("session-1", { input_mode: "chat" });
    expect(screen.queryByRole("button", { name: "बोलने के लिए शुरू करें" })).toBeNull();
  });

  it("starts again from the results with the reset endpoint", async () => {
    api.loadSession.mockResolvedValue(
      makeSession({
        input_mode: "chat",
        conversation_state: "complete",
        messages: [{ role: "assistant", text: "धन्यवाद।" }],
        finance_result: {
          loan_amount: 500000,
          yearly_interest_rate_percent: 10,
          tenure_years: 5,
          monthly_kist: 10624,
          total_repayment: 637440,
          total_interest: 137440,
          scenarios: [],
          assumptions: [],
        },
      }),
    );
    api.resetConversation.mockResolvedValue(makeSession({ input_mode: "chat" }));
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "नए सिरे से शुरू करें" }));

    await waitFor(() => expect(api.resetConversation).toHaveBeenCalledWith("session-1"));
    await screen.findByRole("heading", { name: "अपने खेत के कर्ज़ का हिसाब समझें" });
  });

  it("says plainly when no Gnani key is set, and the voice check names the broken part", async () => {
    api.getVoiceStatus.mockResolvedValue({ key_configured: false });
    api.checkVoice.mockResolvedValue({
      key_configured: false,
      speech: { ok: false, message: "Timbre: no key" },
      listening: { ok: true, message: "Prisma reached" },
    });
    Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
    api.loadSession.mockResolvedValue(makeSession({ language: "en" }));
    render(<App />);

    expect((await screen.findByRole("alert", { name: "" })).textContent).toContain("GNANI_API_KEY");
    fireEvent.click(screen.getByRole("button", { name: "Check voice" }));
    expect(await screen.findByText("Timbre: no key")).toBeTruthy();
    expect(screen.getByText("Prisma reached")).toBeTruthy();
    expect(screen.getByText(/Browser microphone/)).toBeTruthy();
  });
});
