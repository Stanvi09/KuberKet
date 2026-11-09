import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { FinanceResultSnapshot, SessionSnapshot } from "./api";
import {
  calculateNumbers,
  invalidateChartContext,
  selectChartContext,
  updateExplanationPreferences,
} from "./api";
import MyNumbers from "./MyNumbers";

vi.mock("./api", () => ({
  calculateNumbers: vi.fn(),
  invalidateChartContext: vi.fn(),
  selectChartContext: vi.fn(),
  updateExplanationPreferences: vi.fn(),
}));

const calculateMock = vi.mocked(calculateNumbers);
const invalidateChartContextMock = vi.mocked(invalidateChartContext);
const selectChartContextMock = vi.mocked(selectChartContext);
const preferencesMock = vi.mocked(updateExplanationPreferences);
const voice = {
  status: "idle" as const,
  error: "",
  activityLabel: "",
  transcript: "",
  speechClips: [],
  speechError: null,
  playingClip: null,
  playbackProgress: 0,
  playbackComplete: false,
  hasPausedSpeech: false,
  sendTyped: vi.fn(async () => true),
  explainChart: vi.fn(async () => true),
  submitTranscript: vi.fn(async () => true),
  editTranscript: vi.fn(),
  cancelTranscript: vi.fn(),
  cancelRecording: vi.fn(),
  stopRecording: vi.fn(),
  startRecording: vi.fn(async () => undefined),
  interruptAndListen: vi.fn(),
  replaySpeech: vi.fn(),
  stopSpeech: vi.fn(),
  continuePreviousSpeech: vi.fn(),
  clearSpeech: vi.fn(),
};

const result: FinanceResultSnapshot = {
  asset_price: 500_000,
  down_payment: 0,
  loan_amount: 500_000,
  yearly_interest_rate_percent: 10,
  tenure_years: 5,
  monthly_kist: 10_624,
  total_repayment: 637_440,
  total_interest: 137_440,
  scenarios: [
    {
      name: "normal",
      income_drop_percent: 0,
      affordability: {
        yearly_money_left: 17_372,
        yearly_status: "positive",
        monthly_money_left: 1_448,
        monthly_status: "positive",
      },
    },
    {
      name: "income_down_25_percent",
      income_drop_percent: 25,
      affordability: {
        yearly_money_left: -132_628,
        yearly_status: "negative",
        monthly_money_left: -11_052,
        monthly_status: "negative",
      },
    },
    {
      name: "income_down_40_percent",
      income_drop_percent: 40,
      affordability: {
        yearly_money_left: -222_628,
        yearly_status: "negative",
        monthly_money_left: -18_552,
        monthly_status: "negative",
      },
    },
  ],
  buy_rent_comparison: null,
  assumptions: ["The yearly interest rate is fixed and divided into monthly periods."],
};

function makeSession(overrides: Partial<SessionSnapshot> = {}): SessionSnapshot {
  return {
    session_id: "session-1",
    language: "hi",
    section: "numbers",
    messages: [{ role: "farmer", text: "ट्रैक्टर लोन देखना है।" }],
    conversation_state: "collecting",
    current_prompt: "ट्रैक्टर की कीमत कितनी है?",
    slots: {},
    finance_result: result,
    screen_explanation: null,
    latest_speech: [],
    speech_error: null,
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
    numbers_result: result,
    numbers_income_drop_percent: 25,
    numbers_workspace_active: false,
    chart_context_stale: false,
    ...overrides,
  };
}

function StatefulNumbers() {
  const [session, setSession] = useState(makeSession());
  return <MyNumbers session={session} language="hi" setSession={setSession} voice={voice} />;
}

beforeEach(() => {
  vi.clearAllMocks();
  invalidateChartContextMock.mockResolvedValue(
    makeSession({ chart_context: null, chart_context_stale: true }),
  );
  selectChartContextMock.mockImplementation(async (_sessionId, chartId, scenario, point, mode, speed) =>
    makeSession({
      chart_context: {
        chart_id: chartId,
        title: chartId === "repayment_breakdown" ? "उधार और ब्याज" : "कमाई के अलग हाल",
        description: "इंजन का असली हिसाब",
        units: "INR",
        labels: [],
        data: [],
        input_statuses: {},
        selected_scenario: scenario,
        methodology: "घटते कर्ज़ पर तय मासिक किस्त।",
        limitations: ["फीस शामिल नहीं है।"],
        selected_point: point,
        explanation_mode: mode,
        speech_speed: speed,
      },
    }),
  );
  preferencesMock.mockImplementation(async (_sessionId, mode, speed) =>
    makeSession({ explanation_mode: mode, speech_speed: speed }),
  );
  calculateMock.mockImplementation(async (sessionId, inputs, inputStatuses, inputSources, incomeDrop) =>
    makeSession({
      session_id: sessionId,
      numbers_inputs: Object.fromEntries(
        Object.entries(inputs).map(([name, value]) => [
          name,
          { value, status: inputStatuses[name], source: inputSources[name] },
        ]),
      ),
      numbers_income_drop_percent: incomeDrop,
      numbers_workspace_active: true,
      numbers_result: {
        ...result,
        monthly_kist: incomeDrop === 30 ? 11_000 : 10_900,
        scenarios: [
          ...result.scenarios,
          ...(incomeDrop === 30
            ? [{
                name: "income_down_30_percent",
                income_drop_percent: 30,
                affordability: {
                  yearly_money_left: -162_628,
                  yearly_status: "negative",
                  monthly_money_left: -13_552,
                  monthly_status: "negative",
                },
              }]
            : []),
        ],
      },
    }),
  );
});

afterEach(cleanup);

describe("My Numbers workspace", () => {
  it("carries Home values and labels their confirmation status", () => {
    render(<MyNumbers session={makeSession()} language="hi" setSession={vi.fn()} voice={voice} />);

    expect((screen.getByLabelText("खरीद की कीमत (₹)") as HTMLInputElement).value).toBe("500000");
    expect(screen.getAllByText("आपने बताया").length).toBeGreaterThan(0);
    expect(screen.getByText("₹10,624")).toBeTruthy();
    expect(screen.getAllByText("₹6,37,440").length).toBeGreaterThan(1);
    expect(screen.getByText("कर्ज़ और ब्याज का हिस्सा")).toBeTruthy();
  });

  it("requests a spoken explanation for the selected chart through the shared voice controller", async () => {
    render(<MyNumbers session={makeSession()} language="hi" setSession={vi.fn()} voice={voice} />);

    fireEvent.click(screen.getAllByRole("button", { name: "इस चार्ट के बारे में कुबेरकेत से पूछें" })[0]);

    await waitFor(() => {
      expect(voice.explainChart).toHaveBeenCalledWith(
        "cash_flow",
        null,
        null,
        "simple",
        1,
      );
    });
  });

  it("debounces a changed input and updates results using the backend response", async () => {
    const setSession = vi.fn();
    render(<MyNumbers session={makeSession()} language="hi" setSession={setSession} voice={voice} />);
    fireEvent.change(screen.getByLabelText("सालाना ब्याज दर (% प्रति साल)"), {
      target: { value: "12" },
    });

    await waitFor(() => expect(calculateMock).toHaveBeenCalledOnce());
    expect(calculateMock).toHaveBeenCalledWith(
      "session-1",
      expect.objectContaining({ yearly_interest_rate_percent: 12 }),
      expect.objectContaining({ yearly_interest_rate_percent: "assumed" }),
      expect.objectContaining({ yearly_interest_rate_percent: "manual" }),
      25,
    );
    await waitFor(() => expect(screen.getByText("₹10,900")).toBeTruthy());
    expect(setSession).toHaveBeenCalledOnce();
    expect(screen.getAllByText("अनुमान").length).toBeGreaterThan(0);
  });

  it("does not calculate an invalid amount or display a stale result", async () => {
    render(<MyNumbers session={makeSession()} language="hi" setSession={vi.fn()} voice={voice} />);
    fireEvent.change(screen.getByLabelText("खरीद की कीमत (₹)"), {
      target: { value: "0" },
    });

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(calculateMock).not.toHaveBeenCalled();
    expect(screen.queryByText("₹10,624")).toBeNull();
    expect(screen.getByText("नतीजा अभी नहीं बना")).toBeTruthy();
  });

  it("recalculates the selected income-drop scenario through the backend", async () => {
    render(<MyNumbers session={makeSession()} language="hi" setSession={vi.fn()} voice={voice} />);
    fireEvent.change(screen.getByLabelText("खेती की कमाई में कमी"), {
      target: { value: "30" },
    });

    await waitFor(() => expect(calculateMock).toHaveBeenCalledOnce());
    expect(calculateMock).toHaveBeenCalledWith(
      "session-1",
      expect.any(Object),
      expect.any(Object),
      expect.any(Object),
      30,
    );
    expect(await screen.findByText("कमाई 30% कम")).toBeTruthy();
  });

  it("passes the selected chart and actual scenario into the shared conversation", async () => {
    render(<StatefulNumbers />);

    fireEvent.click(screen.getAllByRole("button", { name: "इस चार्ट के बारे में कुबेरकेत से पूछें" })[2]);
    await waitFor(() => expect(voice.explainChart).toHaveBeenCalledOnce());
    expect(voice.explainChart).toHaveBeenCalledWith(
      "income_scenarios",
      25,
      null,
      "simple",
      1,
    );
  });

  it("selects an individual chart value and saves explanation accessibility preferences", async () => {
    render(<StatefulNumbers />);

    fireEvent.click(screen.getByRole("button", { name: "उधार की रकम: ₹5,00,000" }));
    await waitFor(() => expect(selectChartContextMock).toHaveBeenCalledWith(
      "session-1",
      "repayment_breakdown",
      null,
      "loan_amount",
      "simple",
      1,
    ));

    fireEvent.click(screen.getByRole("button", { name: "थोड़ा विस्तार" }));
    fireEvent.change(screen.getByRole("slider", { name: "बोलने की गति" }), {
      target: { value: "0.9" },
    });
    await waitFor(() => expect(preferencesMock).toHaveBeenCalledWith(
      "session-1",
      "detailed",
      0.9,
    ));
    fireEvent.click(screen.getByRole("button", { name: "बड़ा अक्षर" }));
    expect(screen.getByRole("button", { name: "बड़ा अक्षर" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("refreshes selected chart context after a financial input is recalculated", async () => {
    render(<StatefulNumbers />);

    fireEvent.click(screen.getAllByRole("button", { name: "इस चार्ट के बारे में कुबेरकेत से पूछें" })[1]);
    await waitFor(() => expect(voice.explainChart).toHaveBeenCalledOnce());
    fireEvent.change(screen.getByLabelText("सालाना ब्याज दर (% प्रति साल)"), {
      target: { value: "12" },
    });
    await waitFor(() => expect(invalidateChartContextMock).toHaveBeenCalledOnce());
    await waitFor(() => expect(calculateMock).toHaveBeenCalledOnce());
    await waitFor(() => expect(selectChartContextMock).toHaveBeenCalledOnce());
    expect(selectChartContextMock).toHaveBeenLastCalledWith(
      "session-1",
      "repayment_breakdown",
      null,
      null,
      "simple",
      1,
    );
    expect(voice.clearSpeech).toHaveBeenCalled();
  });

  it("does not allow a slower old calculation to replace the newer result", async () => {
    let resolveFirst!: (snapshot: SessionSnapshot) => void;
    calculateMock
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
      .mockImplementationOnce(async () =>
        makeSession({
          numbers_workspace_active: true,
          numbers_result: { ...result, monthly_kist: 10_900 },
        }),
      );
    render(<MyNumbers session={makeSession()} language="hi" setSession={vi.fn()} voice={voice} />);
    const rate = screen.getByLabelText("सालाना ब्याज दर (% प्रति साल)");
    fireEvent.change(rate, { target: { value: "11" } });
    await waitFor(() => expect(calculateMock).toHaveBeenCalledTimes(1));

    fireEvent.change(rate, { target: { value: "12" } });
    await waitFor(() => expect(calculateMock).toHaveBeenCalledTimes(2));
    resolveFirst(makeSession({
      numbers_workspace_active: true,
      numbers_result: { ...result, monthly_kist: 99_999 },
    }));

    expect(await screen.findByText("₹10,900")).toBeTruthy();
    expect(screen.queryByText("₹99,999")).toBeNull();
  });

  it("shows a calculation error instead of a successful-looking result", async () => {
    calculateMock.mockRejectedValueOnce(new Error("Loan tenure must be a whole number of years."));
    render(<MyNumbers session={makeSession()} language="hi" setSession={vi.fn()} voice={voice} />);
    fireEvent.change(screen.getByLabelText("सालाना ब्याज दर (% प्रति साल)"), {
      target: { value: "12" },
    });

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByText("₹10,624")).toBeNull();
    expect(screen.getByText("नतीजा अभी नहीं बना")).toBeTruthy();
  });

  it("does not treat blank required fields as zero", () => {
    const incomplete = makeSession({
      finance_result: null,
      numbers_result: null,
      numbers_inputs: {
        asset_price: { value: null, status: "missing" },
        down_payment: { value: null, status: "missing" },
        yearly_interest_rate_percent: { value: null, status: "missing" },
        tenure_years: { value: null, status: "missing" },
        yearly_farm_income: { value: null, status: "missing" },
        monthly_costs: { value: null, status: "missing" },
        monthly_existing_loan_payments: { value: null, status: "missing" },
        yearly_hiring_spend: { value: null, status: "missing" },
      },
    });
    render(<MyNumbers session={incomplete} language="hi" setSession={vi.fn()} voice={voice} />);

    expect(screen.getByText("नतीजा अभी नहीं बना")).toBeTruthy();
    expect(screen.getAllByText("बाकी").length).toBeGreaterThan(0);
    expect(calculateMock).not.toHaveBeenCalled();
  });
});
