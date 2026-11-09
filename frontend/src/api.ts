export type AppSection = "home" | "numbers" | "documents" | "schemes";
export type Language = "hi" | "en";
export type Message = { role: "assistant" | "farmer"; text: string };
export type SlotSnapshot = {
  value: number | null;
  status: "given" | "assumed" | "missing" | string;
};
export type FinancialInputStatus = "given" | "assumed" | "missing";
export type FinancialInputSnapshot = {
  value: number | null;
  status: FinancialInputStatus;
  source?: "document" | "conversation" | "manual" | null;
};
export type DocumentTermSnapshot = {
  field_id: string;
  label: string;
  value: string | null;
  status: "found" | "confirmed" | "missing";
  origin: "document" | "farmer";
  page: number | null;
  source: string | null;
  issue: string | null;
};
export type DocumentSnapshot = {
  document_id: string;
  filename: string;
  page_count: number;
  scanned_only: boolean;
  terms: Record<string, DocumentTermSnapshot>;
};
export type ChartContextSnapshot = {
  chart_id: "cash_flow" | "repayment_breakdown" | "income_scenarios" | "buy_hire";
  title: string;
  description: string;
  units: string;
  labels: string[];
  data: Array<Record<string, string | number | null>>;
  input_statuses: Record<string, FinancialInputSnapshot>;
  selected_scenario: number | null;
  methodology: string;
  limitations: string[];
  selected_point: string | null;
  explanation_mode: "simple" | "detailed";
  speech_speed: number;
};
export type FinanceScenarioSnapshot = {
  name: string;
  income_drop_percent: number;
  affordability: {
    yearly_money_left: number;
    yearly_status: string;
    monthly_money_left: number;
    monthly_status: string;
  };
};
export type FinanceResultSnapshot = {
  asset_price?: number;
  down_payment?: number;
  loan_amount: number;
  yearly_interest_rate_percent: number;
  tenure_years: number;
  monthly_kist: number;
  total_repayment: number;
  total_interest: number;
  interest_saved_by_down_payment?: number;
  scenarios: FinanceScenarioSnapshot[];
  buy_rent_comparison?: {
    yearly_hiring_spend: number;
    yearly_buying_cash_outlay: number;
    yearly_difference_buying_minus_hiring: number;
    total_hiring_spend: number;
    total_buying_cash_outlay: number;
    lower_cash_outlay: "buying" | "hiring" | "about_equal";
    exclusions: string[];
  } | null;
  assumptions: string[];
};
export type SpeechClip = {
  label: string;
  text: string;
  audio_base64: string;
  mime_type: "audio/wav";
};

export type LoanPurpose = "equipment" | "irrigation" | "livestock" | "other";
export type Crop = "paddy" | "wheat" | "maize";
export type InputMode = "audio" | "chat";

export type SessionSnapshot = {
  session_id: string;
  language: Language;
  section: AppSection;
  loan_purpose?: LoanPurpose;
  crop?: Crop;
  input_mode?: InputMode;
  messages: Message[];
  conversation_state: string;
  current_slot?: string | null;
  awaiting_confirmation?: { slot: string; value: number } | null;
  current_prompt: string | null;
  slots: Record<string, SlotSnapshot>;
  finance_result: FinanceResultSnapshot | null;
  screen_explanation: string | null;
  latest_speech: SpeechClip[];
  speech_error: string | null;
  numbers_inputs?: Record<string, FinancialInputSnapshot>;
  numbers_result?: FinanceResultSnapshot | null;
  numbers_income_drop_percent?: number;
  numbers_workspace_active?: boolean;
  chart_context?: ChartContextSnapshot | null;
  chart_context_stale?: boolean;
  document?: DocumentSnapshot | null;
  explanation_mode?: "simple" | "detailed";
  speech_speed?: number;
};

const API_BASE: string =
  import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? "http://127.0.0.1:8001" : "");
const SESSION_KEY = "kuberket-session-id";
const LANGUAGE_KEY = "kuberket-language";

/** The language the farmer chose last; the server uses it for any message it sends back. */
function savedLanguage(): Language {
  try {
    return localStorage.getItem(LANGUAGE_KEY) === "en" ? "en" : "hi";
  } catch {
    return "hi";
  }
}

const requestText = {
  hi: {
    offline: "KuberKet सर्वर से संपर्क नहीं हो पाया। कृपया सर्वर चालू करें।",
    failed: (status: number) => `अनुरोध पूरा नहीं हुआ (${status})। कृपया फिर कोशिश करें।`,
  },
  en: {
    offline: "Could not reach the KuberKet server. Please start the server.",
    failed: (status: number) => `The request did not go through (${status}). Please try again.`,
  },
};

async function errorFrom(response: Response): Promise<Error> {
  const body = (await response.json().catch(() => null)) as { detail?: unknown } | null;
  const detail = typeof body?.detail === "string" ? body.detail : null;
  return new Error(detail ?? requestText[savedLanguage()].failed(response.status));
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", "X-KuberKet-Language": savedLanguage(), ...init?.headers },
    });
  } catch {
    throw new Error(requestText[savedLanguage()].offline);
  }

  if (!response.ok) throw await errorFrom(response);
  return (await response.json()) as T;
}

export async function loadSession(): Promise<SessionSnapshot> {
  const previousId = sessionStorage.getItem(SESSION_KEY);
  if (previousId) {
    try {
      const loaded = await request<SessionSnapshot>(`/api/sessions/${previousId}`);
      localStorage.setItem(LANGUAGE_KEY, loaded.language);
      return loaded;
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("not found")) {
        throw error;
      }
      sessionStorage.removeItem(SESSION_KEY);
    }
  }

  const created = await request<SessionSnapshot>("/api/sessions", {
    method: "POST",
  });
  sessionStorage.setItem(SESSION_KEY, created.session_id);
  const savedLanguage = localStorage.getItem(LANGUAGE_KEY);
  if (savedLanguage === "en") {
    const updated = await request<SessionSnapshot>(`/api/sessions/${created.session_id}`, {
      method: "PATCH",
      body: JSON.stringify({ language: savedLanguage }),
    });
    return updated;
  }
  localStorage.setItem(LANGUAGE_KEY, created.language);
  return created;
}

export async function updateSession(
  sessionId: string,
  update: Partial<Pick<SessionSnapshot, "section" | "language" | "loan_purpose" | "crop" | "input_mode" | "speech_speed">>,
): Promise<SessionSnapshot> {
  const updated = await request<SessionSnapshot>(`/api/sessions/${sessionId}`, {
    method: "PATCH",
    body: JSON.stringify(update),
  });
  if (update.language) localStorage.setItem(LANGUAGE_KEY, updated.language);
  return updated;
}

export function startConversation(sessionId: string): Promise<SessionSnapshot> {
  return request(`/api/sessions/${sessionId}/conversation/start`, {
    method: "POST",
  });
}

export function sendMessage(
  sessionId: string,
  text: string,
): Promise<SessionSnapshot> {
  return request(`/api/sessions/${sessionId}/messages`, {
    method: "POST",
    body: JSON.stringify({ text }),
  });
}

export function calculateNumbers(
  sessionId: string,
  inputs: Record<string, number | null>,
  inputStatuses: Record<string, FinancialInputStatus>,
  inputSources: Record<string, "document" | "conversation" | "manual">,
  incomeDropPercent: number,
): Promise<SessionSnapshot> {
  return request(`/api/sessions/${sessionId}/numbers/calculate`, {
    method: "POST",
    body: JSON.stringify({
      inputs,
      input_statuses: inputStatuses,
      input_sources: inputSources,
      income_drop_percent: incomeDropPercent,
    }),
  });
}

export function uploadDocument(
  sessionId: string,
  file: File,
  onProgress: (progress: number) => void,
): Promise<SessionSnapshot> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    const form = new FormData();
    form.append("upload", file, file.name);
    request.open("POST", `${API_BASE}/api/sessions/${sessionId}/documents/upload`);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    request.onerror = () => reject(new Error("Could not reach KuberKet while uploading the PDF."));
    request.onload = () => {
      let body: SessionSnapshot | { detail?: string };
      try {
        body = JSON.parse(request.responseText) as SessionSnapshot | { detail?: string };
      } catch {
        reject(new Error("KuberKet returned an unreadable upload response."));
        return;
      }
      if (request.status < 200 || request.status >= 300) {
        reject(new Error("detail" in body && body.detail ? body.detail : `Upload failed (${request.status}).`));
        return;
      }
      onProgress(100);
      resolve(body as SessionSnapshot);
    };
    request.send(form);
  });
}

export function removeDocument(sessionId: string): Promise<SessionSnapshot> {
  return request(`/api/sessions/${sessionId}/documents`, { method: "DELETE" });
}

export function updateDocumentTerms(
  sessionId: string,
  updates: Array<{ field_id: string; value: string | null; confirmed: boolean }>,
): Promise<SessionSnapshot> {
  return request(`/api/sessions/${sessionId}/documents/terms`, {
    method: "PATCH",
    body: JSON.stringify({ updates }),
  });
}

export function explainDocument(
  sessionId: string,
  fieldId: string | null,
): Promise<SessionSnapshot> {
  return request(`/api/sessions/${sessionId}/documents/explain`, {
    method: "POST",
    body: JSON.stringify({ field_id: fieldId }),
  });
}

export function transferDocumentValues(
  sessionId: string,
  fieldIds: string[],
  overwriteApproved: string[],
  incomeDropPercent: number,
): Promise<SessionSnapshot> {
  return request(`/api/sessions/${sessionId}/documents/transfer`, {
    method: "POST",
    body: JSON.stringify({
      field_ids: fieldIds,
      overwrite_approved: overwriteApproved,
      income_drop_percent: incomeDropPercent,
    }),
  });
}

export function selectChartContext(
  sessionId: string,
  chartId: ChartContextSnapshot["chart_id"],
  selectedScenario: number | null,
  selectedPoint: string | null,
  explanationMode: "simple" | "detailed",
  speechSpeed: number,
): Promise<SessionSnapshot> {
  return request(`/api/sessions/${sessionId}/numbers/chart-context`, {
    method: "POST",
    body: JSON.stringify({
      chart_id: chartId,
      selected_scenario: selectedScenario,
      selected_point: selectedPoint,
      explanation_mode: explanationMode,
      speech_speed: speechSpeed,
    }),
  });
}

export function explainChart(
  sessionId: string,
  chartId: ChartContextSnapshot["chart_id"],
  selectedScenario: number | null,
  selectedPoint: string | null,
  explanationMode: "simple" | "detailed",
  speechSpeed: number,
): Promise<SessionSnapshot> {
  return request(`/api/sessions/${sessionId}/numbers/chart-explanation`, {
    method: "POST",
    body: JSON.stringify({
      chart_id: chartId,
      selected_scenario: selectedScenario,
      selected_point: selectedPoint,
      explanation_mode: explanationMode,
      speech_speed: speechSpeed,
    }),
  });
}

export function invalidateChartContext(sessionId: string): Promise<SessionSnapshot> {
  return request(`/api/sessions/${sessionId}/numbers/chart-context/invalidate`, {
    method: "POST",
  });
}

export function updateExplanationPreferences(
  sessionId: string,
  explanationMode: "simple" | "detailed",
  speechSpeed: number,
): Promise<SessionSnapshot> {
  return request(`/api/sessions/${sessionId}/numbers/preferences`, {
    method: "PATCH",
    body: JSON.stringify({
      explanation_mode: explanationMode,
      speech_speed: speechSpeed,
    }),
  });
}

export async function transcribeAudio(
  sessionId: string,
  audio: Blob,
): Promise<{ transcript: string; language_code: string }> {
  const form = new FormData();
  form.append("audio_file", audio, "recording.wav");

  let response: Response;
  try {
    response = await fetch(
      `${API_BASE}/api/sessions/${sessionId}/transcribe`,
      { method: "POST", body: form, headers: { "X-KuberKet-Language": savedLanguage() } },
    );
  } catch {
    throw new Error(requestText[savedLanguage()].offline);
  }
  if (!response.ok) throw await errorFrom(response);
  return (await response.json()) as { transcript: string; language_code: string };
}

export type CashflowRow = {
  index: number;
  calendar_month: number;
  income: number;
  household_and_farm_costs: number;
  existing_loan_payments: number;
  kist: number;
  other_flows: number;
  net: number;
  balance: number;
};

export type CashflowScenario = {
  name: string;
  income_drop_percent: number;
  yearly_income: number;
  rows: CashflowRow[];
  lowest_balance: number;
  lowest_month_index: number;
  negative_month_indexes: number[];
  ending_balance: number;
};

export type CashflowInputs = {
  crop: Crop;
  yearly_income: number;
  monthly_costs: number;
  monthly_existing_loan_payments: number;
  asset_price: number;
  down_payment: number;
  loan_rate: number;
  tenure_years: number;
  savings: number;
};

/** The language the engine-built sentences are written in. */
export type ReportLanguage = "hi" | "en";

export type CashflowReport = {
  crop: Crop;
  crop_name: string;
  season: "kharif" | "rabi";
  start_month: number;
  harvest_months: number[];
  month_names: string[];
  loan_amount: number;
  monthly_kist: number;
  monthly_outgo: number;
  savings: number;
  scenarios: CashflowScenario[];
  selected_drop_percent: number;
  selected: CashflowScenario;
  risky_sentence: string;
  normal_risky_sentence: string;
  narration: { text: string; at_month: number }[];
  answers: { question: string; answer: string }[];
  assumptions: string[];
};

export type DemoYear = CashflowReport & {
  synthetic: boolean;
  farmer: { name: string; inputs: Record<string, number | string> };
};

/** One harvest-based year for the made-up demo farmer, calculated by the finance engine. */
export function getDemoYear(
  incomeDropPercent: number,
  language: ReportLanguage,
  signal?: AbortSignal,
): Promise<DemoYear> {
  return request<DemoYear>(
    `/api/demo/farmer-year?income_drop_percent=${encodeURIComponent(incomeDropPercent)}&language=${language}`,
    { signal },
  );
}

export function getCashflow(
  inputs: CashflowInputs,
  incomeDropPercent: number,
  language: ReportLanguage,
  signal?: AbortSignal,
): Promise<CashflowReport> {
  return request<CashflowReport>("/api/cashflow", {
    method: "POST",
    body: JSON.stringify({ ...inputs, income_drop_percent: incomeDropPercent, language }),
    signal,
  });
}

/** One sentence of the year story, spoken. Callers must wait for one clip before asking for the next. */
export function speakCashflow(
  inputs: CashflowInputs,
  incomeDropPercent: number,
  language: ReportLanguage,
  mode: "narration" | "answer",
  index: number,
  speed = 1,
): Promise<SpeechClip> {
  return request<SpeechClip>("/api/cashflow/speak", {
    method: "POST",
    body: JSON.stringify({ ...inputs, income_drop_percent: incomeDropPercent, language, mode, index, speed }),
  });
}

export type SchemeSource = { title: string; url: string };
export type SchemeInfo = {
  id: SchemeId;
  kind: "loan" | "subsidy" | "insurance" | "income_support";
  name: Record<ReportLanguage, string>;
  what: Record<ReportLanguage, string>;
  terms: Record<ReportLanguage, string[]>;
  watch_out: Record<ReportLanguage, string[]>;
  ask_bank: Record<ReportLanguage, string[]>;
  sources: SchemeSource[];
};
export type SchemeId = "kcc" | "aif" | "smam" | "pmfby" | "pm_kisan";
export type TractorClass = { label_en: string; label_hi: string; priority: number; other: number; other_derived?: boolean };
export type SchemesInfo = { as_of: string; schemes: SchemeInfo[]; tractor_classes: Record<string, TractorClass> };

export type SchemesInputs = CashflowInputs & {
  alternative_rate?: number | null;
  small_or_marginal: boolean;
  sc_st_or_women: boolean;
  buying_machinery: boolean;
  tractor_class?: string | null;
  post_harvest_project: boolean;
  pays_income_tax: boolean;
  government_employee_or_pensioner: boolean;
  sum_insured?: number | null;
  crop_loan_amount?: number | null;
};

export type SchemeRiskChange = {
  name: string;
  lowest_balance_change: number;
  negative_months_change: number;
  ending_balance_change: number;
};
export type SchemeMetric = {
  name: string;
  income_drop_percent: number;
  lowest_balance: number;
  lowest_month_index: number;
  negative_month_indexes: number[];
  ending_balance: number;
};
export type SchemeEvaluation = {
  id: SchemeId;
  status: "may_apply" | "not_applicable" | "not_eligible" | "not_needed";
  reason: string;
  figures: Record<string, number | boolean | string | null>;
  money_effect_first_year: number | null;
  money_effect_is_one_time: boolean;
  after: SchemeMetric[];
  risk_change: SchemeRiskChange[];
  balances_normal: number[];
};
export type SchemesResult = {
  as_of: string;
  crop: Crop;
  season: "kharif" | "rabi";
  start_month: number;
  harvest_months: number[];
  baseline: {
    loan_amount: number;
    monthly_kist: number;
    cashflow: { scenarios: CashflowScenario[] };
    metrics: SchemeMetric[];
  };
  schemes: SchemeEvaluation[];
  ranking_by_money: SchemeId[];
  ranking_by_risk: SchemeId[];
  assumptions: string[];
};

export function getSchemesInfo(signal?: AbortSignal): Promise<SchemesInfo> {
  return request<SchemesInfo>("/api/schemes", { signal });
}

export function evaluateSchemes(inputs: SchemesInputs, signal?: AbortSignal): Promise<SchemesResult> {
  return request<SchemesResult>("/api/schemes/evaluate", {
    method: "POST",
    body: JSON.stringify(inputs),
    signal,
  });
}

export type VoiceCheckResult = {
  key_configured: boolean;
  speech: { ok: boolean; message: string };
  listening: { ok: boolean; message: string };
};

/** Cheap check on page load: is a Gnani key present on the computer running KuberKet? */
export function getVoiceStatus(signal?: AbortSignal): Promise<{ key_configured: boolean }> {
  return request<{ key_configured: boolean }>("/api/voice/status", { signal });
}

/** Tries Timbre and Prisma once and says in plain words which part is broken. */
export function checkVoice(language: ReportLanguage): Promise<VoiceCheckResult> {
  return request<VoiceCheckResult>(`/api/voice/check?language=${language}`, { method: "POST" });
}

/** Forget this conversation's answers so the farmer can begin again. */
export function resetConversation(sessionId: string): Promise<SessionSnapshot> {
  return request<SessionSnapshot>(`/api/sessions/${sessionId}/conversation/reset`, { method: "POST" });
}
