import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";

import {
  calculateNumbers,
  invalidateChartContext,
  selectChartContext,
  updateExplanationPreferences,
} from "./api";
import type {
  ChartContextSnapshot,
  FinancialInputStatus,
  FinanceResultSnapshot,
  Language,
  SessionSnapshot,
} from "./api";
import type { VoiceStatus } from "./useVoiceController";

type VoiceControls = {
  status: VoiceStatus;
  error: string;
  activityLabel: string;
  transcript: string;
  speechClips: SessionSnapshot["latest_speech"];
  speechError: string | null;
  playingClip: number | null;
  playbackProgress: number;
  playbackComplete: boolean;
  hasPausedSpeech: boolean;
  sendTyped: (text: string) => Promise<boolean>;
  explainChart: (
    chartId: ChartContextSnapshot["chart_id"],
    selectedScenario: number | null,
    selectedPoint: string | null,
    explanationMode: "simple" | "detailed",
    speechSpeed: number,
  ) => Promise<boolean>;
  submitTranscript: () => Promise<boolean>;
  editTranscript: (text: string) => void;
  cancelTranscript: () => void;
  cancelRecording: () => void;
  stopRecording: () => void;
  startRecording: () => Promise<void>;
  interruptAndListen: () => void;
  replaySpeech: () => void;
  stopSpeech: () => void;
  continuePreviousSpeech: () => void;
  clearSpeech: () => void;
};

type Props = {
  session: SessionSnapshot;
  language: Language;
  setSession: (
    update: SessionSnapshot | ((current: SessionSnapshot) => SessionSnapshot),
  ) => void;
  voice: VoiceControls;
};

type InputName =
  | "asset_price"
  | "down_payment"
  | "yearly_interest_rate_percent"
  | "tenure_years"
  | "yearly_farm_income"
  | "monthly_costs"
  | "monthly_existing_loan_payments"
  | "yearly_hiring_spend";

type InputState = Record<InputName, number | null>;
type StatusState = Record<InputName, FinancialInputStatus>;
type SourceState = Record<InputName, "document" | "conversation" | "manual">;

const inputNames: InputName[] = [
  "asset_price",
  "down_payment",
  "yearly_interest_rate_percent",
  "tenure_years",
  "yearly_farm_income",
  "monthly_costs",
  "monthly_existing_loan_payments",
  "yearly_hiring_spend",
];

const requiredInputNames = inputNames.slice(0, 7);

const fields: Record<Language, Array<{
  name: InputName;
  label: string;
  unit: string;
  help: string;
  min?: number;
  step?: number;
}>> = {
  hi: [
    { name: "asset_price", label: "खरीद की कीमत", unit: "₹", help: "जो खरीदना है उसकी कुल कीमत।", min: 1 },
    { name: "down_payment", label: "जमा रकम", unit: "₹", help: "कीमत में से पहले दी जाने वाली रकम।", min: 0 },
    { name: "yearly_interest_rate_percent", label: "सालाना ब्याज दर", unit: "% प्रति साल", help: "कर्ज़ पर लगने वाली सालाना दर।", min: 0, step: 0.1 },
    { name: "tenure_years", label: "कर्ज़ की अवधि", unit: "साल", help: "कर्ज़ चुकाने के साल।", min: 1, step: 1 },
    { name: "yearly_farm_income", label: "साल की खेती से कमाई", unit: "₹ प्रति साल", help: "अभी इंजन इसे बारह महीनों में बराबर बाँटकर देखता है।", min: 0 },
    { name: "monthly_costs", label: "घर और खेती का खर्च", unit: "₹ प्रति महीना", help: "नियमित घर और खेत का खर्च।", min: 0 },
    { name: "monthly_existing_loan_payments", label: "दूसरे कर्ज़ की किस्तें", unit: "₹ प्रति महीना", help: "पहले से चल रहे कर्ज़ की मासिक किस्तें।", min: 0 },
    { name: "yearly_hiring_spend", label: "किराये या सेवा का खर्च", unit: "₹ प्रति साल", help: "सिर्फ खरीद और किराये की तुलना के लिए। पता न हो तो खाली छोड़ें।", min: 0 },
  ],
  en: [
    { name: "asset_price", label: "Purchase price", unit: "₹", help: "The total price of what you are buying.", min: 1 },
    { name: "down_payment", label: "Down payment", unit: "₹", help: "The amount paid upfront toward the price.", min: 0 },
    { name: "yearly_interest_rate_percent", label: "Yearly interest rate", unit: "% per year", help: "The annual rate used for the loan estimate.", min: 0, step: 0.1 },
    { name: "tenure_years", label: "Loan duration", unit: "years", help: "How many years the loan is repaid over.", min: 1, step: 1 },
    { name: "yearly_farm_income", label: "Farm income per year", unit: "₹ per year", help: "The engine currently spreads this evenly across 12 months.", min: 0 },
    { name: "monthly_costs", label: "Household and farm costs", unit: "₹ per month", help: "Regular household and farm costs.", min: 0 },
    { name: "monthly_existing_loan_payments", label: "Other loan payments", unit: "₹ per month", help: "Monthly payments on existing loans.", min: 0 },
    { name: "yearly_hiring_spend", label: "Hiring or renting cost", unit: "₹ per year", help: "Only needed for the buy-versus-hiring comparison. Leave blank if unknown.", min: 0 },
  ],
};

const labels = {
  hi: {
    eyebrow: "मेरा हिसाब / बदलकर देखें",
    title: "एक बदलाव से हिसाब कैसे बदलता है?",
    intro: "यह अनुमान आपके दिए हुए नंबरों और चुनी गई मान्यताओं पर आधारित है।",
    decision: "अभी का फैसला",
    decisionName: "खेती की खरीद के लिए कर्ज़",
    decisionHint: "हिसाब की जानकारी होम की बातचीत से ली गई है।",
    inputTitle: "अपने नंबर बदलकर देखें",
    inputHint: "हर नंबर की स्थिति साफ़ दिखाई गई है। बदलाव को पहले अनुमान माना जाएगा।",
    missing: "ज़रूरी जानकारी बाकी",
    missingHint: "हिसाब पूरा करने के लिए ये जानकारी भरें। खाली नंबर को शून्य नहीं माना जाएगा।",
    given: "आपने बताया",
    assumed: "अनुमान",
    missingValue: "बाकी",
    confirm: "यह मेरी पक्की जानकारी है",
    makeAssumption: "इसे अनुमान मानें",
    optional: "वैकल्पिक",
    calculateLoading: "इंजन हिसाब कर रहा है…",
    fromDocument: "दस्तावेज़ से पुष्टि",
    updating: "चुनी हुई कमाई के हिसाब से नया नतीजा बन रहा है।",
    error: "हिसाब पूरा नहीं हो पाया",
    result: "आपके नंबरों का अनुमान",
    monthly: "हर महीने की किस्त",
    totalRepay: "कुल भुगतान",
    interest: "कुल ब्याज",
    interestSaved: "उसी दर और अवधि पर जमा रकम से अनुमानित ब्याज में कमी",
    resultNote: "यह अनुमान घटते कर्ज़ पर तय मासिक किस्त मानता है। बैंक की असली शर्तें अलग हो सकती हैं।",
    cashOverview: "महीने का पैसों का हिसाब",
    estimatedIncome: "अनुमानित महीने की कमाई",
    monthlyExpenses: "घर और खेती का खर्च",
    loanPayments: "कर्ज़ की कुल किस्तें",
    remaining: "बाकी रकम",
    cashFlowTitle: "कमाई का बँटवारा",
    cashFlowHint: "कमाई में से खर्च और किस्तें घटाने के बाद बची रकम।",
    cashFlowUnavailable: "कमाई के मुकाबले खर्च और किस्तें ज़्यादा हैं, इसलिए यह बँटवारा सही तरह नहीं दिखाया जा सकता।",
    breakdown: "कर्ज़ और ब्याज का हिस्सा",
    breakdownHint: "कुल भुगतान में मूल उधार और अनुमानित ब्याज का हिस्सा।",
    principal: "उधार की रकम",
    scenarioTitle: "कमाई घटे तो क्या होगा?",
    scenarioHint: "इंजन कमाई घटने का असर दिखाता है; बाकी खर्च और मौजूदा किस्तें वही रहती हैं।",
    incomeDrop: "खेती की कमाई में कमी",
    normal: "कमाई में कमी नहीं",
    moneyLeft: "साल में खर्च और किस्त के बाद",
    shortfall: "साल का अनुमानित घाटा",
    buyTitle: "खरीद या किराये की तुलना",
    buyHint: "यह तुलना केवल इंजन में उपलब्ध रकम पर आधारित है। इसे तय सलाह न मानें।",
    yearlyBuy: "खरीद का सालाना खर्च",
    yearlyHire: "किराये का सालाना खर्च",
    difference: "अंतर",
    buyLower: "इस हिसाब में खरीद का नकद खर्च कम है",
    hireLower: "इस हिसाब में किराये का नकद खर्च कम है",
    equal: "इस हिसाब में दोनों करीब बराबर हैं",
    exclusions: "इसमें चलाने-रखरखाव का खर्च (जैसे डीज़ल, मरम्मत, चारा), फीस और बाद में बेचने पर मिलने वाला पैसा शामिल नहीं है।",
    assumptions: "इस अनुमान की मान्यताएँ",
    noResult: "नतीजा अभी नहीं बना",
    noResultHint: "बाकी ज़रूरी नंबर भरें। हर बदलाव पर हिसाब इंजन से दोबारा होगा।",
    disclaimer: "यह शिक्षा के लिए है, बैंक की सलाह नहीं। किस्त और बाकी शर्तें बैंक से पक्का करें।",
    percent: "%",
    notSupported: "अभी इंजन मौसमी नकदी की तारीख, बढ़ते खर्च, फीस, मरम्मत या ईंधन का हिसाब नहीं करता।",
    noContext: "अभी बातचीत के नंबर नहीं हैं। आप ऊपर से एक अनुमान शुरू कर सकते हैं।",
    workspaceOnly: "यह अनुमान आपने इस पेज पर भरे नंबरों से बनाया है।",
    askChart: "इस चार्ट के बारे में कुबेरकेत से पूछें",
    explanationMode: "समझाने का तरीका",
    simpleMode: "आसान",
    detailedMode: "थोड़ा विस्तार",
    speechSpeed: "बोलने की गति",
    largerText: "बड़ा अक्षर",
    chartQuestion: "इस चार्ट के बारे में बोलकर या लिखकर पूछें।",
    chartQuestionPlaceholder: "जैसे, इस हिसाब में कितना ब्याज है?",
    ask: "पूछें",
    askByVoice: "आवाज़ में पूछें",
    transcriptReview: "कुबेरकेत ने यह सुना — ज़रूरत हो तो सुधारें",
    transcriptSend: "सुधारकर भेजें",
    transcriptCancel: "रद्द करें",
    chartError: "चार्ट की बात तैयार नहीं हो पाई।",
    noAudio: "जवाब का पाठ बातचीत में दिखाई देगा।",
  },
  en: {
    eyebrow: "MY NUMBERS / EXPLORE A CHANGE",
    title: "How does one change affect the estimate?",
    intro: "This estimate uses the numbers you provided and the assumptions you choose.",
    decision: "CURRENT DECISION",
    decisionName: "Loan for a farm purchase",
    decisionHint: "Inputs carry over from your Home conversation.",
    inputTitle: "Explore your numbers",
    inputHint: "Each value has a clear status. Changes are treated as estimates first.",
    missing: "Required details missing",
    missingHint: "Add these details to calculate. An empty value is not treated as zero.",
    given: "You told us",
    assumed: "Estimate",
    missingValue: "Missing",
    confirm: "This is my confirmed information",
    makeAssumption: "Treat as an estimate",
    optional: "Optional",
    calculateLoading: "The engine is calculating…",
    fromDocument: "Confirmed from document",
    updating: "The result is being recalculated for your selected income change.",
    error: "We couldn't complete the calculation",
    result: "Estimate from your numbers",
    monthly: "Monthly instalment",
    totalRepay: "Total repayment",
    interest: "Total interest",
    interestSaved: "Estimated interest saved by the down payment at the same rate and duration",
    resultNote: "This estimate uses a fixed monthly payment on a reducing loan balance. Lender terms may differ.",
    cashOverview: "Monthly money overview",
    estimatedIncome: "Estimated monthly income",
    monthlyExpenses: "Household and farm costs",
    loanPayments: "Total loan payments",
    remaining: "Money remaining",
    cashFlowTitle: "Income allocation",
    cashFlowHint: "Income after household and farm costs and loan payments.",
    cashFlowUnavailable: "Costs and payments are higher than income, so an allocation chart would be misleading.",
    breakdown: "Loan and interest portions",
    breakdownHint: "The estimated repayment split between the borrowed amount and interest.",
    principal: "Amount borrowed",
    scenarioTitle: "What if farm income falls?",
    scenarioHint: "The engine changes farm income only; costs and existing payments stay the same.",
    incomeDrop: "Farm income reduction",
    normal: "No income reduction",
    moneyLeft: "Estimated yearly amount after costs and instalment",
    shortfall: "Estimated yearly shortfall",
    buyTitle: "Buying or hiring comparison",
    buyHint: "This comparison uses only values supported by the engine. It is not a recommendation.",
    yearlyBuy: "Yearly buying outlay",
    yearlyHire: "Yearly hiring spend",
    difference: "Difference",
    buyLower: "Buying has lower cash outlay in this estimate",
    hireLower: "Hiring has lower cash outlay in this estimate",
    equal: "Both are about equal in this estimate",
    exclusions: "Running costs (such as fuel, repairs or feed), fees, and the resale value are not included.",
    assumptions: "Assumptions in this estimate",
    noResult: "No result yet",
    noResultHint: "Fill the remaining required numbers. Every change is recalculated by the engine.",
    disclaimer: "For education, not bank advice. Confirm instalment and other terms with your lender.",
    percent: "%",
    notSupported: "The engine does not model seasonal payment timing, increased costs, fees, repairs, or fuel yet.",
    noContext: "There are no conversation values yet. You can start an estimate above.",
    workspaceOnly: "This estimate uses values you entered on this page.",
    askChart: "Ask KuberKet about this chart",
    explanationMode: "Explanation style",
    simpleMode: "Simple",
    detailedMode: "More detail",
    speechSpeed: "Speaking speed",
    largerText: "Larger text",
    chartQuestion: "Ask by voice or type about this chart.",
    chartQuestionPlaceholder: "For example, how much is the interest here?",
    ask: "Ask",
    askByVoice: "Ask by voice",
    transcriptReview: "KuberKet heard this — edit it if needed",
    transcriptSend: "Correct and send",
    transcriptCancel: "Cancel",
    chartError: "The chart context could not be prepared.",
    noAudio: "The reply text remains available in the conversation.",
  },
} as const;

function snapshotInputs(session: SessionSnapshot): InputState {
  return Object.fromEntries(
    inputNames.map((name) => [name, session.numbers_inputs?.[name]?.value ?? null]),
  ) as InputState;
}

function snapshotStatuses(session: SessionSnapshot): StatusState {
  return Object.fromEntries(
    inputNames.map((name) => [
      name,
      session.numbers_inputs?.[name]?.status ?? "missing",
    ]),
  ) as StatusState;
}

function snapshotSources(session: SessionSnapshot): SourceState {
  return Object.fromEntries(
    inputNames.map((name) => {
      const source = session.numbers_inputs?.[name]?.source;
      return [
        name,
        source === "document" || source === "conversation" ? source : "manual",
      ];
    }),
  ) as SourceState;
}

function validate(inputs: InputState, language: Language): string | null {
  const errorText = language === "hi"
    ? "कृपया कीमत शून्य से अधिक, बाकी रकम शून्य या अधिक, और अवधि पूरे साल में भरें। जमा रकम कीमत से कम होनी चाहिए।"
    : "Enter a price above zero, non-negative amounts, and a whole-year tenure. Down payment must be below the price.";
  if (inputs.asset_price !== null && inputs.asset_price <= 0) return errorText;
  if (inputs.down_payment !== null && inputs.down_payment < 0) return errorText;
  if (
    inputs.asset_price !== null &&
    inputs.down_payment !== null &&
    inputs.down_payment >= inputs.asset_price
  ) return errorText;
  if (
    inputs.yearly_interest_rate_percent !== null &&
    inputs.yearly_interest_rate_percent < 0
  ) return errorText;
  if (
    inputs.tenure_years !== null &&
    (!Number.isInteger(inputs.tenure_years) || inputs.tenure_years < 1)
  ) return errorText;
  for (const name of [
    "yearly_farm_income",
    "monthly_costs",
    "monthly_existing_loan_payments",
    "yearly_hiring_spend",
  ] as const) {
    if (inputs[name] !== null && inputs[name]! < 0) return errorText;
  }
  return null;
}

function formatMoney(value: number, language: Language): string {
  const locale = language === "hi" ? "hi-IN" : "en-IN";
  return `₹${new Intl.NumberFormat(locale, {
    maximumFractionDigits: 0,
  }).format(Math.round(Math.abs(value)))}`;
}

function formatInputValue(value: number | null): string {
  return value === null ? "" : String(value);
}

function formatPercent(value: number, language: Language): string {
  const locale = language === "hi" ? "hi-IN" : "en-IN";
  const number = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 1,
  }).format(value);
  return `${number}%`;
}

export default function MyNumbers({ session, language, setSession, voice }: Props) {
  const text = labels[language];
  const [inputs, setInputs] = useState<InputState>(() => snapshotInputs(session));
  const [statuses, setStatuses] = useState<StatusState>(() => snapshotStatuses(session));
  const [sources, setSources] = useState<SourceState>(() => snapshotSources(session));
  const [incomeDrop, setIncomeDrop] = useState(session.numbers_income_drop_percent ?? 25);
  const [result, setResult] = useState<FinanceResultSnapshot | null>(
    () => session.numbers_result ?? session.finance_result,
  );
  const [loading, setLoading] = useState(false);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState("");
  const [changed, setChanged] = useState(false);
  const [activeChart, setActiveChart] = useState<ChartContextSnapshot["chart_id"] | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<string | null>(null);
  const [chartLoading, setChartLoading] = useState(false);
  const [chartError, setChartError] = useState("");
  const [chartDraft, setChartDraft] = useState("");
  const [explanationMode, setExplanationMode] = useState<"simple" | "detailed">(
    session.explanation_mode ?? "simple",
  );
  const [speechSpeed, setSpeechSpeed] = useState(session.speech_speed ?? 1);
  const [largeText, setLargeText] = useState(false);
  const preferenceTimer = useRef<number | null>(null);
  const preferenceRequestId = useRef(0);
  const chartRequestId = useRef(0);
  const chartInvalidationPromise = useRef<Promise<void> | null>(null);
  const chartContextInvalidated = useRef(false);
  const requestId = useRef(0);
  const activeChartRef = useRef(activeChart);
  const selectedPointRef = useRef(selectedPoint);
  activeChartRef.current = activeChart;
  selectedPointRef.current = selectedPoint;

  useEffect(() => {
    setInputs(snapshotInputs(session));
    setStatuses(snapshotStatuses(session));
    setSources(snapshotSources(session));
    setIncomeDrop(session.numbers_income_drop_percent ?? 25);
    setResult(session.numbers_result ?? session.finance_result);
  }, [
    session.session_id,
    session.numbers_inputs,
    session.numbers_result,
    session.numbers_income_drop_percent,
    session.numbers_workspace_active,
  ]);

  useEffect(() => {
    return () => {
      if (preferenceTimer.current !== null) window.clearTimeout(preferenceTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!changed) return;
    const validationError = validate(inputs, language);
    if (validationError) {
      setError(validationError);
      setLoading(false);
      setResult(null);
      setStale(false);
      setChanged(false);
      return;
    }

    setError("");
    const request = requestId.current;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setChanged(false);
      void (async () => {
        await chartInvalidationPromise.current;
        const calculated = await calculateNumbers(
          session.session_id,
          inputs,
          statuses,
          sources,
          incomeDrop,
        );
        if (requestId.current !== request) return;
        let updated = calculated;
        const chart = activeChartRef.current;
        if (chart) {
          const chartVersion = chartRequestId.current;
          setChartLoading(true);
          try {
            updated = await selectChartContext(
              session.session_id,
              chart,
              chart === "income_scenarios" ? incomeDrop : null,
              selectedPointRef.current,
              explanationMode,
              speechSpeed,
            );
            if (chartVersion !== chartRequestId.current) return;
          } catch (caught) {
            setChartError(
              caught instanceof Error ? caught.message : text.chartError,
            );
            setSession(calculated);
            setResult(calculated.numbers_result ?? null);
            setStale(false);
            return;
          } finally {
            setChartLoading(false);
          }
        }
        if (requestId.current !== request) return;
        if (chart) {
          chartContextInvalidated.current = false;
          chartInvalidationPromise.current = null;
        }
        setSession(updated);
        setResult(updated.numbers_result ?? null);
        setStale(false);
      })().catch((caught: unknown) => {
        if (requestId.current !== request) return;
        setResult(null);
        setStale(false);
        setError(
          caught instanceof Error
            ? caught.message
            : language === "hi"
              ? "हिसाब नहीं हो पाया। कृपया फिर कोशिश करें।"
              : "The calculation failed. Please try again.",
        );
      }).finally(() => {
        if (requestId.current === request) setLoading(false);
      });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [
    changed,
    explanationMode,
    incomeDrop,
    inputs,
    language,
    session.session_id,
    setSession,
    speechSpeed,
    statuses,
    sources,
    text.chartError,
  ]);

  const missingInputs = useMemo(
    () => requiredInputNames.filter((name) => inputs[name] === null),
    [inputs],
  );
  const hasHomeContext = Boolean(
    session.finance_result ||
    Object.values(session.slots).some(
      (slot) => slot.value !== null && (slot.status === "given" || slot.status === "assumed"),
    ),
  );
  const hasWorkspaceInputs = requiredInputNames.some((name) => inputs[name] !== null);
  const contextHint = hasHomeContext
    ? text.decisionHint
    : hasWorkspaceInputs
      ? text.workspaceOnly
      : text.noContext;
  const interestSaved = result?.interest_saved_by_down_payment ?? 0;

  const invalidateActiveChart = () => {
    if (
      !activeChartRef.current &&
      !session.chart_context &&
      !session.chart_context_stale
    ) return;
    if (chartContextInvalidated.current) return;
    chartContextInvalidated.current = true;
    if (voice.status === "listening") voice.cancelRecording();
    else if (voice.status === "transcript_review") voice.cancelTranscript();
    voice.clearSpeech();
    setSession((current) => ({
      ...current,
      chart_context: null,
      chart_context_stale: true,
      latest_speech: [],
      speech_error: null,
    }));
    chartInvalidationPromise.current = invalidateChartContext(session.session_id)
      .then(() => undefined)
      .catch((caught: unknown) => {
        setChartError(caught instanceof Error ? caught.message : text.chartError);
      });
  };

  const updateInput = (name: InputName, raw: string) => {
    invalidateActiveChart();
    voice.clearSpeech();
    const value = raw === "" ? null : Number(raw);
    requestId.current += 1;
    setInputs((previous) => ({ ...previous, [name]: Number.isFinite(value) ? value : null }));
    setStatuses((previous) => ({
      ...previous,
      [name]: value === null ? "missing" : "assumed",
    }));
    setSources((previous) => ({ ...previous, [name]: "manual" }));
    setError("");
    setResult(null);
    setStale(true);
    setChanged(true);
  };

  const updateStatus = (name: InputName) => {
    if (inputs[name] === null) return;
    invalidateActiveChart();
    voice.clearSpeech();
    requestId.current += 1;
    setStatuses((previous) => ({
      ...previous,
      [name]: previous[name] === "given" ? "assumed" : "given",
    }));
    setSources((previous) => ({ ...previous, [name]: "manual" }));
    setResult(null);
    setStale(true);
    setError("");
    setChanged(true);
  };

  const updateIncomeDrop = (value: number) => {
    invalidateActiveChart();
    voice.clearSpeech();
    requestId.current += 1;
    setIncomeDrop(value);
    setStale(true);
    setError("");
    setChanged(true);
  };

  const savePreferences = (mode: "simple" | "detailed", speed: number) => {
    if (preferenceTimer.current !== null) window.clearTimeout(preferenceTimer.current);
    const request = ++preferenceRequestId.current;
    preferenceTimer.current = window.setTimeout(() => {
      void updateExplanationPreferences(session.session_id, mode, speed)
        .then((updated) => {
          if (preferenceRequestId.current === request) {
            setSession((current) => ({
              ...current,
              explanation_mode: updated.explanation_mode ?? explanationMode,
              speech_speed: updated.speech_speed ?? speechSpeed,
              chart_context: current.chart_context
                ? {
                    ...current.chart_context,
                    explanation_mode: updated.explanation_mode ?? explanationMode,
                    speech_speed: updated.speech_speed ?? speechSpeed,
                  }
                : null,
            }));
          }
        })
        .catch((caught: unknown) => {
          if (preferenceRequestId.current !== request) return;
          setChartError(caught instanceof Error ? caught.message : text.chartError);
        });
    }, 350);
  };

  const setMode = (mode: "simple" | "detailed") => {
    setExplanationMode(mode);
    savePreferences(mode, speechSpeed);
  };

  const setSpeed = (speed: number) => {
    setSpeechSpeed(speed);
    savePreferences(explanationMode, speed);
  };

  const activateChart = async (
    chartId: ChartContextSnapshot["chart_id"],
    point: string | null = null,
  ) => {
    const calculationVersion = requestId.current;
    const chartVersion = ++chartRequestId.current;
    voice.clearSpeech();
    setChartLoading(true);
    setChartError("");
    try {
      const updated = await selectChartContext(
        session.session_id,
        chartId,
        chartId === "income_scenarios" ? incomeDrop : null,
        point,
        explanationMode,
        speechSpeed,
      );
      if (
        calculationVersion !== requestId.current ||
        chartVersion !== chartRequestId.current
      ) return;
      setSession(updated);
      setActiveChart(chartId);
      activeChartRef.current = chartId;
      setSelectedPoint(point);
      chartContextInvalidated.current = false;
      chartInvalidationPromise.current = null;
    } catch (caught) {
      setChartError(caught instanceof Error ? caught.message : text.chartError);
    } finally {
      setChartLoading(false);
    }
  };

  const askAboutChart = async (
    chartId: ChartContextSnapshot["chart_id"],
    point: string | null = null,
  ) => {
    const calculationVersion = requestId.current;
    const chartVersion = ++chartRequestId.current;
    setChartLoading(true);
    setChartError("");
    const explained = await voice.explainChart(
      chartId,
      chartId === "income_scenarios" ? incomeDrop : null,
      point,
      explanationMode,
      speechSpeed,
    );
    if (
      explained &&
      calculationVersion === requestId.current &&
      chartVersion === chartRequestId.current
    ) {
      setActiveChart(chartId);
      activeChartRef.current = chartId;
      setSelectedPoint(point);
      chartContextInvalidated.current = false;
      chartInvalidationPromise.current = null;
    }
    setChartLoading(false);
  };

  const submitChartQuestion = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (await voice.sendTyped(chartDraft)) setChartDraft("");
  };

  return (
    <section className={`numbers-workspace ${largeText ? "numbers-large-text" : ""}`} aria-labelledby="numbers-title">
      <header className="numbers-heading">
        <div>
          <p className="numbers-eyebrow">{text.eyebrow}</p>
          <h1 id="numbers-title">{text.title}</h1>
          <p>{text.intro}</p>
        </div>
        <div className="numbers-decision">
          <span>{text.decision}</span>
          <strong>{text.decisionName}</strong>
          <small>{contextHint}</small>
        </div>
      </header>

      <section className="numbers-accessibility-tools" aria-label={text.explanationMode}>
        <fieldset>
          <legend>{text.explanationMode}</legend>
          <button type="button" aria-pressed={explanationMode === "simple"} onClick={() => setMode("simple")}>
            {text.simpleMode}
          </button>
          <button type="button" aria-pressed={explanationMode === "detailed"} onClick={() => setMode("detailed")}>
            {text.detailedMode}
          </button>
        </fieldset>
        <label>
          <span>{text.speechSpeed}: {speechSpeed.toFixed(2)}×</span>
          <input
            type="range"
            min="0.85"
            max="1.15"
            step="0.05"
            value={speechSpeed}
            aria-label={text.speechSpeed}
            onChange={(event) => setSpeed(Number(event.target.value))}
          />
        </label>
        <button
          type="button"
          aria-pressed={largeText}
          onClick={() => setLargeText((current) => !current)}
        >
          {text.largerText}
        </button>
      </section>
      {chartError && <p className="chart-voice-error" role="alert">{chartError}</p>}

      <div className="numbers-layout">
        <section className="numbers-input-panel" aria-labelledby="numbers-input-title">
          <div className="numbers-section-heading">
            <div>
              <p className="numbers-eyebrow">{language === "hi" ? "बदलाव आपके हाथ में" : "YOU CONTROL THE INPUTS"}</p>
              <h2 id="numbers-input-title">{text.inputTitle}</h2>
            </div>
            <span className="input-count">
              {requiredInputNames.length - missingInputs.length}/{requiredInputNames.length}
            </span>
          </div>
          <p className="numbers-section-hint">{text.inputHint}</p>

          <div className="numbers-input-list">
            {fields[language].map((field) => {
              const status = statuses[field.name];
              return (
                <div className="number-input-row" key={field.name}>
                  <label htmlFor={`number-${field.name}`}>
                    <span className="number-input-label">{field.label}</span>
                    <small>{field.help}</small>
                  </label>
                  <div className="number-input-control">
                    <div className="number-input-value">
                      <input
                        id={`number-${field.name}`}
                        type="number"
                        inputMode="decimal"
                        min={field.min}
                        step={field.step ?? 1}
                        value={formatInputValue(inputs[field.name])}
                        onChange={(event) => updateInput(field.name, event.target.value)}
                        aria-label={`${field.label} (${field.unit})`}
                      />
                      <span>{field.unit}</span>
                    </div>
                    <div className="number-input-meta">
                      <span className={`number-status status-${status}`}>
                        {status === "given" ? text.given : status === "assumed" ? text.assumed : text.missingValue}
                      </span>
                      {sources[field.name] === "document" && (
                        <span className="number-optional">{text.fromDocument}</span>
                      )}
                      {field.name === "yearly_hiring_spend" && (
                        <span className="number-optional">{text.optional}</span>
                      )}
                      {inputs[field.name] !== null && (
                        <button
                          className="number-confirm-button"
                          type="button"
                          onClick={() => updateStatus(field.name)}
                        >
                          {status === "given" ? text.makeAssumption : text.confirm}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {missingInputs.length > 0 && (
            <div className="numbers-missing" role="status">
              <strong>{text.missing}</strong>
              <p>{text.missingHint}</p>
              <div>
                {missingInputs.map((name) => (
                  <span key={name}>{fields[language].find((field) => field.name === name)?.label}</span>
                ))}
              </div>
            </div>
          )}
        </section>

        <div className="numbers-results">
          {error && <div className="numbers-error" role="alert"><strong>{text.error}</strong><span>{error}</span></div>}
          {loading && (
            <div className="numbers-loading" role="status">
              <span className="numbers-loader" aria-hidden="true" />
              {text.calculateLoading}
            </div>
          )}
          {stale && result && !loading && (
            <p className="numbers-stale-note" role="status">{text.updating}</p>
          )}

          {result ? (
            <>
              <section className="numbers-result-hero" aria-labelledby="numbers-result-title">
                <p className="numbers-eyebrow">{text.result}</p>
                <h2 id="numbers-result-title">{text.monthly}</h2>
                <strong className="numbers-kist">{formatMoney(result.monthly_kist, language)}</strong>
                <div className="numbers-result-support">
                  <span><small>{text.totalRepay}</small><strong>{formatMoney(result.total_repayment, language)}</strong></span>
                  <span><small>{text.interest}</small><strong>{formatMoney(result.total_interest, language)}</strong></span>
                  {interestSaved > 0 && (
                    <span><small>{text.interestSaved}</small><strong>{formatMoney(interestSaved, language)}</strong></span>
                  )}
                </div>
                <p>{text.resultNote}</p>
              </section>

              <CashFlowOverview
                inputs={inputs}
                result={result}
                language={language}
                text={text}
                selectedPoint={selectedPoint}
                onSelectPoint={(point) => void activateChart("cash_flow", point)}
                onAsk={() => void askAboutChart("cash_flow")}
                disabled={chartLoading || loading || stale}
              />
              <RepaymentBreakdown
                result={result}
                language={language}
                text={text}
                selectedPoint={selectedPoint}
                onSelectPoint={(point) => void activateChart("repayment_breakdown", point)}
                onAsk={() => void askAboutChart("repayment_breakdown")}
                disabled={chartLoading || loading || stale}
              />
              <IncomeScenarios
                result={result}
                incomeDrop={incomeDrop}
                onChange={updateIncomeDrop}
                language={language}
                text={text}
                selectedPoint={selectedPoint}
                onSelectPoint={(point) => void activateChart("income_scenarios", point)}
                onAsk={() => void askAboutChart("income_scenarios")}
                disabled={chartLoading || loading || stale}
              />
              {result.buy_rent_comparison && (
                <BuyHiringComparison
                  result={result}
                  language={language}
                  text={text}
                  selectedPoint={selectedPoint}
                  onSelectPoint={(point) => void activateChart("buy_hire", point)}
                  onAsk={() => void askAboutChart("buy_hire")}
                  disabled={chartLoading || loading || stale}
                />
              )}
              {activeChart && session.chart_context?.chart_id === activeChart && (
                <section className="chart-conversation" aria-labelledby="chart-conversation-title">
                  <div className="chart-conversation-heading">
                    <div>
                      <p className="numbers-eyebrow">{language === "hi" ? "इसी हिसाब के साथ बातचीत" : "ASK WITH THIS DATA"}</p>
                      <h3 id="chart-conversation-title">{session.chart_context.title}</h3>
                    </div>
                    <span>{chartLoading ? "…" : "●"}</span>
                  </div>
                  <p>{text.chartQuestion}</p>
                  <div className="chart-context-assumptions">
                    {Object.entries(session.chart_context.input_statuses).map(([name, item]) => (
                      <span key={name} className={`number-status status-${item.status}`}>
                        {fields[language].find((field) => field.name === name)?.label ?? name}:
                        {" "}{item.status === "given" ? text.given : item.status === "assumed" ? text.assumed : text.missingValue}
                      </span>
                    ))}
                    {session.chart_context.limitations.map((limitation) => (
                      <small key={limitation}>{limitation}</small>
                    ))}
                  </div>
                  <div className="chart-conversation-messages" aria-live="polite">
                    {session.messages.slice(-4).map((message, index) => (
                      <p className={`chart-message ${message.role}`} key={`${index}-${message.text}`}>
                        <strong>{message.role === "assistant" ? "KuberKet" : language === "hi" ? "आप" : "You"}:</strong> {message.text}
                      </p>
                    ))}
                  </div>
                  {voice.status === "transcript_review" && (
                    <form
                      className="transcript-review chart-transcript-review"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void voice.submitTranscript().then((submitted) => {
                          if (submitted) setChartDraft("");
                        });
                      }}
                    >
                      <label htmlFor="chart-recognized-transcript">{text.transcriptReview}</label>
                      <textarea
                        id="chart-recognized-transcript"
                        value={voice.transcript}
                        onChange={(event) => voice.editTranscript(event.target.value)}
                        rows={3}
                      />
                      <div className="transcript-actions">
                        <button type="submit" disabled={!voice.transcript.trim()}>{text.transcriptSend}</button>
                        <button type="button" onClick={voice.cancelTranscript}>{text.transcriptCancel}</button>
                      </div>
                    </form>
                  )}
                  <form className="chart-question-form" onSubmit={(event) => void submitChartQuestion(event)}>
                    <label className="sr-only" htmlFor="chart-question">{text.chartQuestion}</label>
                    <input
                      id="chart-question"
                      value={chartDraft}
                      onChange={(event) => setChartDraft(event.target.value)}
                      placeholder={text.chartQuestionPlaceholder}
                      maxLength={4000}
                      disabled={voice.status === "processing" || voice.status === "listening"}
                    />
                    <button
                      type="submit"
                      disabled={!chartDraft.trim() || voice.status === "processing" || voice.status === "listening"}
                    >
                      {text.ask}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (voice.status === "listening") voice.stopRecording();
                        else if (voice.status === "speaking") voice.interruptAndListen();
                        else voice.startRecording();
                      }}
                      disabled={
                        chartLoading ||
                        loading ||
                        stale ||
                        Boolean(session.chart_context_stale) ||
                        voice.status === "processing" ||
                        voice.status === "transcript_review"
                      }
                    >
                      {voice.status === "listening"
                        ? language === "hi" ? "रिकॉर्डिंग रोकें" : "Stop recording"
                        : text.askByVoice}
                    </button>
                  </form>
                  {voice.status === "processing" && (
                    <p className="chart-voice-status" role="status">{voice.activityLabel}</p>
                  )}
                  {voice.error && <p className="chart-voice-error" role="alert">{voice.error}</p>}
                </section>
              )}
              <details className="numbers-assumptions">
                <summary>{text.assumptions}</summary>
                <ul>{result.assumptions.map((assumption) => <li key={assumption}>{assumption}</li>)}</ul>
              </details>
            </>
          ) : (
            <section className="numbers-no-result" aria-live="polite">
              <div className="numbers-no-result-mark" aria-hidden="true">K</div>
              <h2>{text.noResult}</h2>
              <p>{text.noResultHint}</p>
            </section>
          )}
          <p className="numbers-limitation">{text.notSupported}</p>
          <p className="numbers-disclaimer">{text.disclaimer}</p>
        </div>
      </div>
    </section>
  );
}

function RepaymentBreakdown({
  result,
  language,
  text,
  selectedPoint,
  onSelectPoint,
  onAsk,
  disabled,
}: {
  result: FinanceResultSnapshot;
  language: Language;
  text: (typeof labels)[Language];
  selectedPoint: string | null;
  onSelectPoint: (point: string) => void;
  onAsk: () => void;
  disabled: boolean;
}) {
  const total = result.loan_amount + result.total_interest;
  const circumference = 2 * Math.PI * 68;
  const principalShare = total > 0 ? result.loan_amount / total : 0;
  const principalDash = circumference * principalShare;
  const interestDash = circumference - principalDash;
  const principalPercent = total > 0 ? Math.round(principalShare * 100) : 0;
  const interestPercent = total > 0 ? 100 - principalPercent : 0;
  return (
    <section className="numbers-visual-section" aria-labelledby="repayment-breakdown-title">
      <div className="numbers-visual-heading">
        <div><h3 id="repayment-breakdown-title">{text.breakdown}</h3><p>{text.breakdownHint}</p></div>
        <button type="button" className="chart-ask-button" onClick={onAsk} disabled={disabled}>
          {text.askChart}
        </button>
      </div>
      <div className="donut-layout">
        <div className="donut-visual">
          <svg viewBox="0 0 180 180" role="img" aria-label={`${text.breakdown}: ${text.principal} ${formatMoney(result.loan_amount, language)}, ${text.interest} ${formatMoney(result.total_interest, language)}`}>
            <circle className="donut-track" cx="90" cy="90" r="68" />
            <circle
              className={`donut-slice principal-slice ${selectedPoint === "loan_amount" ? "selected" : ""}`}
              cx="90" cy="90" r="68"
              strokeDasharray={`${principalDash} ${circumference}`}
              transform="rotate(-90 90 90)"
            >
              <title>{text.principal}: {formatMoney(result.loan_amount, language)} ({principalPercent}%)</title>
            </circle>
            <circle
              className={`donut-slice interest-slice ${selectedPoint === "total_interest" ? "selected" : ""}`}
              cx="90" cy="90" r="68"
              strokeDasharray={`${interestDash} ${circumference}`}
              strokeDashoffset={-principalDash}
              transform="rotate(-90 90 90)"
            >
              <title>{text.interest}: {formatMoney(result.total_interest, language)} ({interestPercent}%)</title>
            </circle>
          </svg>
          <div className="donut-center">
            <small>{text.totalRepay}</small>
            <strong>{formatMoney(result.total_repayment, language)}</strong>
          </div>
        </div>
        <div className="donut-legend" role="group" aria-label={text.breakdown}>
          <button type="button" onClick={() => onSelectPoint("loan_amount")} disabled={disabled} aria-pressed={selectedPoint === "loan_amount"} aria-label={`${text.principal}: ${formatMoney(result.loan_amount, language)}`}>
            <span className="legend-dot principal-dot" aria-hidden="true" />
            <span>{text.principal}<small>{principalPercent}%</small></span>
            <strong>{formatMoney(result.loan_amount, language)}</strong>
          </button>
          <button type="button" onClick={() => onSelectPoint("total_interest")} disabled={disabled} aria-pressed={selectedPoint === "total_interest"} aria-label={`${text.interest}: ${formatMoney(result.total_interest, language)}`}>
            <span className="legend-dot interest-dot" aria-hidden="true" />
            <span>{text.interest}<small>{interestPercent}%</small></span>
            <strong>{formatMoney(result.total_interest, language)}</strong>
          </button>
        </div>
      </div>
    </section>
  );
}

function CashFlowOverview({
  inputs,
  result,
  language,
  text,
  selectedPoint,
  onSelectPoint,
  onAsk,
  disabled,
}: {
  inputs: InputState;
  result: FinanceResultSnapshot;
  language: Language;
  text: (typeof labels)[Language];
  selectedPoint: string | null;
  onSelectPoint: (point: string) => void;
  onAsk: () => void;
  disabled: boolean;
}) {
  const baseline = result.scenarios.find((scenario) => scenario.income_drop_percent === 0);
  const monthlyIncome = (inputs.yearly_farm_income ?? 0) / 12;
  const costs = inputs.monthly_costs ?? 0;
  const existingPayments = inputs.monthly_existing_loan_payments ?? 0;
  const loanPayments = existingPayments + result.monthly_kist;
  const remaining = baseline?.affordability.monthly_money_left ?? 0;
  const canShowAllocation =
    monthlyIncome > 0 &&
    remaining >= 0 &&
    monthlyIncome + 1 >= costs + loanPayments + remaining;
  const segments = [
    { id: "monthly_costs", label: text.monthlyExpenses, amount: costs, color: "costs-dot" },
    { id: "existing_loan_payments", label: text.loanPayments, amount: loanPayments, color: "payments-dot" },
    { id: "monthly_remaining", label: text.remaining, amount: remaining, color: "remaining-dot" },
  ];

  return (
    <section className="financial-overview" aria-labelledby="cash-overview-title">
      <div className="financial-overview-heading">
        <div>
          <p className="numbers-eyebrow">{text.cashOverview}</p>
          <h3 id="cash-overview-title">{text.cashFlowTitle}</h3>
          <p>{text.cashFlowHint}</p>
        </div>
        {canShowAllocation && (
          <button type="button" className="chart-ask-button" onClick={onAsk} disabled={disabled}>
            {text.askChart}
          </button>
        )}
      </div>
      <div className="financial-overview-metrics">
        <Metric label={text.estimatedIncome} value={formatMoney(monthlyIncome, language)} />
        <Metric label={text.monthlyExpenses} value={formatMoney(costs, language)} />
        <Metric label={text.loanPayments} value={formatMoney(loanPayments, language)} />
        <Metric label={text.remaining} value={formatMoney(remaining, language)} negative={remaining < 0} />
      </div>
      {canShowAllocation ? (
        <div className="cash-flow-chart">
          <DonutChart
            title={text.cashFlowTitle}
            centerLabel={text.estimatedIncome}
            centerValue={formatMoney(monthlyIncome, language)}
            total={monthlyIncome}
            segments={segments}
            language={language}
            selectedPoint={selectedPoint}
            onSelectPoint={onSelectPoint}
            disabled={disabled}
          />
        </div>
      ) : (
        <p className="chart-unavailable" role="status">{text.cashFlowUnavailable}</p>
      )}
    </section>
  );
}

function Metric({
  label,
  value,
  negative = false,
}: {
  label: string;
  value: string;
  negative?: boolean;
}) {
  return (
    <div className="financial-metric">
      <span>{label}</span>
      <strong className={negative ? "negative-value" : ""}>{value}</strong>
    </div>
  );
}

function DonutChart({
  title,
  centerLabel,
  centerValue,
  total,
  segments,
  language,
  selectedPoint,
  onSelectPoint,
  disabled,
}: {
  title: string;
  centerLabel: string;
  centerValue: string;
  total: number;
  segments: Array<{ id: string; label: string; amount: number; color: string }>;
  language: Language;
  selectedPoint: string | null;
  onSelectPoint: (point: string) => void;
  disabled: boolean;
}) {
  const circumference = 2 * Math.PI * 68;
  let offset = 0;
  const arcs = segments.map((segment) => {
    const fraction = total > 0 ? segment.amount / total : 0;
    const arc = {
      ...segment,
      dash: circumference * fraction,
      offset,
      percent: total > 0 ? Math.round(fraction * 100) : 0,
    };
    offset += arc.dash;
    return arc;
  });
  return (
    <div className="donut-layout">
      <div className="donut-visual">
        <svg viewBox="0 0 180 180" role="img" aria-label={title}>
          <circle className="donut-track" cx="90" cy="90" r="68" />
          {arcs.map((arc) => (
            <circle
              key={arc.id}
              className={`donut-slice ${arc.color} ${selectedPoint === arc.id ? "selected" : ""}`}
              cx="90" cy="90" r="68"
              strokeDasharray={`${arc.dash} ${circumference}`}
              strokeDashoffset={-arc.offset}
              transform="rotate(-90 90 90)"
            >
              <title>{arc.label}: {formatMoney(arc.amount, language)} ({arc.percent}%)</title>
            </circle>
          ))}
        </svg>
        <div className="donut-center">
          <small>{centerLabel}</small>
          <strong>{centerValue}</strong>
        </div>
      </div>
      <div className="donut-legend" role="group" aria-label={title}>
        {arcs.map((arc) => (
          <button
            key={arc.id}
            type="button"
            onClick={() => onSelectPoint(arc.id)}
            disabled={disabled}
            aria-pressed={selectedPoint === arc.id}
            aria-label={`${arc.label}: ${formatMoney(arc.amount, language)}`}
          >
            <span className={`legend-dot ${arc.color}`} aria-hidden="true" />
            <span>{arc.label}<small>{arc.percent}%</small></span>
            <strong>{formatMoney(arc.amount, language)}</strong>
          </button>
        ))}
      </div>
    </div>
  );
}

function IncomeScenarios({
  result,
  incomeDrop,
  onChange,
  language,
  text,
  selectedPoint,
  onSelectPoint,
  onAsk,
  disabled,
}: {
  result: FinanceResultSnapshot;
  incomeDrop: number;
  onChange: (value: number) => void;
  language: Language;
  text: (typeof labels)[Language];
  selectedPoint: string | null;
  onSelectPoint: (point: string) => void;
  onAsk: () => void;
  disabled: boolean;
}) {
  const values = result.scenarios.filter((scenario) =>
    [0, 25, 40, incomeDrop].includes(scenario.income_drop_percent),
  );
  const maxAmount = Math.max(
    1,
    ...values.map((scenario) => Math.abs(scenario?.affordability.yearly_money_left ?? 0)),
  );

  return (
    <section className="numbers-visual-section scenario-explorer" aria-labelledby="scenario-explorer-title">
      <div className="numbers-visual-heading">
        <div><h3 id="scenario-explorer-title">{text.scenarioTitle}</h3><p>{text.scenarioHint}</p></div>
        <div className="scenario-heading-actions">
          <strong className="scenario-drop">{formatPercent(incomeDrop, language)}</strong>
          <button type="button" className="chart-ask-button" onClick={onAsk} disabled={disabled}>
            {text.askChart}
          </button>
        </div>
      </div>
      <label className="scenario-slider-label" htmlFor="income-drop-slider">
        <span>{text.incomeDrop}</span>
        <input
          id="income-drop-slider"
          type="range"
          aria-label={text.incomeDrop}
          min={0}
          max={100}
          step={5}
          value={incomeDrop}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <span className="scenario-slider-ends"><span>{text.normal}</span><span>100%</span></span>
      </label>
      <div className="scenario-outcomes">
        {values.map((scenario) => {
          if (!scenario) return null;
          const amount = scenario.affordability.yearly_money_left;
          const negative = amount < 0;
          const dropLabel = scenario.income_drop_percent === 0
            ? text.normal
            : language === "hi"
              ? `कमाई ${formatPercent(scenario.income_drop_percent, language)} कम`
              : `Income down ${formatPercent(scenario.income_drop_percent, language)}`;
          return (
            <button
              className={`scenario-outcome ${selectedPoint === scenario.name ? "selected" : ""}`}
              key={scenario.name}
              type="button"
              onClick={() => onSelectPoint(scenario.name)}
              disabled={disabled}
              aria-pressed={selectedPoint === scenario.name}
              aria-label={`${dropLabel}: ${formatMoney(amount, language)} ${negative ? text.shortfall : text.moneyLeft}`}
            >
              <div className="scenario-outcome-copy">
                <span>{dropLabel}</span>
                <strong>{formatMoney(amount, language)}</strong>
                <small>{negative ? text.shortfall : text.moneyLeft}</small>
              </div>
              <div className={`scenario-value-track ${negative ? "negative" : ""}`}>
                <span
                  style={{
                    width: `${Math.max(1, (Math.abs(amount) / maxAmount) * 50)}%`,
                    ...(negative ? { right: "50%" } : { left: "50%" }),
                  }}
                />
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function BuyHiringComparison({
  result,
  language,
  text,
  selectedPoint,
  onSelectPoint,
  onAsk,
  disabled,
}: {
  result: FinanceResultSnapshot;
  language: Language;
  text: (typeof labels)[Language];
  selectedPoint: string | null;
  onSelectPoint: (point: string) => void;
  onAsk: () => void;
  disabled: boolean;
}) {
  const comparison = result.buy_rent_comparison;
  if (!comparison) return null;
  const maximum = Math.max(
    comparison.yearly_buying_cash_outlay,
    comparison.yearly_hiring_spend,
    1,
  );
  const lowerLabel = comparison.lower_cash_outlay === "buying"
    ? text.buyLower
    : comparison.lower_cash_outlay === "hiring"
      ? text.hireLower
      : text.equal;
  return (
    <section className="numbers-visual-section buy-hire-section" aria-labelledby="buy-hire-title">
      <div className="numbers-visual-heading">
        <div><h3 id="buy-hire-title">{text.buyTitle}</h3><p>{text.buyHint}</p></div>
        <button type="button" className="chart-ask-button" onClick={onAsk} disabled={disabled}>
          {text.askChart}
        </button>
      </div>
      <div className="buy-hire-bars">
        <ComparisonBar
          label={text.yearlyBuy}
          value={comparison.yearly_buying_cash_outlay}
          maximum={maximum}
          variant="buying"
          language={language}
          selected={selectedPoint === "buying"}
          onSelect={() => onSelectPoint("buying")}
          disabled={disabled}
        />
        <ComparisonBar
          label={text.yearlyHire}
          value={comparison.yearly_hiring_spend}
          maximum={maximum}
          variant="hiring"
          language={language}
          selected={selectedPoint === "hiring"}
          onSelect={() => onSelectPoint("hiring")}
          disabled={disabled}
        />
      </div>
      <p className="buy-hire-result"><strong>{lowerLabel}</strong> · {text.difference}: {formatMoney(Math.abs(comparison.yearly_difference_buying_minus_hiring), language)} / {language === "hi" ? "साल" : "year"}</p>
      <p className="buy-hire-exclusions">{text.exclusions}</p>
    </section>
  );
}

function ComparisonBar({
  label,
  value,
  maximum,
  variant,
  language,
  selected,
  onSelect,
  disabled,
}: {
  label: string;
  value: number;
  maximum: number;
  variant: "buying" | "hiring";
  language: Language;
  selected: boolean;
  onSelect: () => void;
  disabled: boolean;
}) {
  return (
    <button
      className={`comparison-bar-row ${selected ? "selected" : ""}`}
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      disabled={disabled}
      aria-label={`${label}: ${formatMoney(value, language)}`}
    >
      <div><span>{label}</span><strong>{formatMoney(value, language)}</strong></div>
      <div className={`comparison-bar-track ${variant}`}><span style={{ width: `${Math.max(3, (value / maximum) * 100)}%` }} /></div>
    </button>
  );
}
