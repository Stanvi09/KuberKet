import type { Crop, ReportLanguage } from "../api";

/** The engine-built sentences exist in Hindi and English. */
export const toReportLanguage = (language: string): ReportLanguage => (language === "hi" ? "hi" : "en");

export const CROPS: Crop[] = ["paddy", "wheat", "maize"];

export const cropNames: Record<ReportLanguage, Record<Crop, string>> = {
  hi: { paddy: "धान", wheat: "गेहूँ", maize: "मक्का" },
  en: { paddy: "Paddy", wheat: "Wheat", maize: "Maize" },
};

/** Typical calendars. Kept equal to finance_engine.CROP_CALENDARS by a Python test. */
export const CROP_CALENDAR: Record<Crop, { season: "kharif" | "rabi"; sowing_month: number; harvest_months: number[] }> = {
  paddy: { season: "kharif", sowing_month: 6, harvest_months: [10, 11] },
  wheat: { season: "rabi", sowing_month: 11, harvest_months: [3, 4] },
  maize: { season: "kharif", sowing_month: 6, harvest_months: [9, 10] },
};

export const monthShort: Record<ReportLanguage, string[]> = {
  hi: ["जन", "फ़र", "मार्च", "अप्र", "मई", "जून", "जुल", "अग", "सित", "अक्टू", "नव", "दिस"],
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
};
export const monthLong: Record<ReportLanguage, string[]> = {
  hi: ["जनवरी", "फ़रवरी", "मार्च", "अप्रैल", "मई", "जून", "जुलाई", "अगस्त", "सितंबर", "अक्टूबर", "नवंबर", "दिसंबर"],
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
};

export function harvestHint(language: ReportLanguage, crop: Crop): string {
  const months = CROP_CALENDAR[crop].harvest_months.map((m) => monthLong[language][m - 1]);
  const joiner = language === "hi" ? " और " : " and ";
  return language === "hi"
    ? `${cropNames.hi[crop]}: कमाई ${months.join(joiner)} में`
    : `${cropNames.en[crop]}: income in ${months.join(joiner)}`;
}

const grouping = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

export function money(value: number): string {
  const rounded = Math.round(value);
  return `${rounded < 0 ? "−" : ""}₹${grouping.format(Math.abs(rounded))}`;
}

export function shortMoney(value: number, language: ReportLanguage): string {
  if (value === 0) return "₹0";
  const sign = value < 0 ? "−" : "";
  const abs = Math.abs(value);
  if (abs >= 100_000) {
    const lakhs = Math.round((abs / 100_000) * 10) / 10;
    return `${sign}₹${lakhs}${language === "hi" ? " लाख" : "L"}`;
  }
  const thousands = Math.round((abs / 1000) * 10) / 10;
  return `${sign}₹${thousands}${language === "hi" ? " हज़ार" : "k"}`;
}

export const yearText = {
  hi: {
    title: "साल की कहानी",
    dropBefore: "अगर आमदनी",
    dropAfter: "कम हो जाए",
    dropValue: (n: number) => `आमदनी ${n} प्रतिशत कम`,
    play: "▶ साल चलाएँ",
    pause: "⏸ रोकें",
    resume: "▶ आगे चलाएँ",
    stop: "■ बंद करें",
    ask: "इस चार्ट के बारे में पूछें",
    askClose: "पूछना बंद करें",
    listen: "🔊 सुनें",
    cash: "अब तक हाथ में",
    cashEnd: "साल के अंत में हाथ में",
    lowest: (amount: string, month: string) => `सबसे कम: ${amount} (${month})`,
    captionsOnly: "आवाज़ अभी नहीं बन पाई, इसलिए सिर्फ़ लिखा हुआ दिख रहा है।",
    loading: "साल का हिसाब तैयार हो रहा है…",
    error: "साल का हिसाब लोड नहीं हो पाया। ऐप का सर्वर चालू है?",
    retry: "फिर से कोशिश करें",
    legendIncome: "कमाई",
    legendCosts: "खर्च + किस्त",
    legendCash: "हाथ में पैसा",
    legendShort: "पैसे कम पड़ने वाले महीने",
    chartLabel: (crop: string, ending: string) => `${crop} के लिए बारह महीनों का हिसाब। साल के अंत में ${ending}।`,
    tableCaption: "महीने-दर-महीने आँकड़े",
    tableHeads: ["महीना", "कमाई", "खर्च + किस्त", "हाथ में पैसा"],
    month: "महीना",
    noteCrop: "कमाई के महीने इस फसल के आम महीने हैं; असल तारीखें जगह और साल के हिसाब से बदलती हैं। बचत शून्य मानी गई है।",
    assumptions: "यह हिसाब किन बातों पर टिका है",
    notAForecast: "यह भविष्यवाणी नहीं, इंजन का हिसाब है।",
  },
  en: {
    title: "The year's story",
    dropBefore: "If income is",
    dropAfter: "lower",
    dropValue: (n: number) => `Income ${n} percent lower`,
    play: "▶ Play the year",
    pause: "⏸ Pause",
    resume: "▶ Resume",
    stop: "■ Stop",
    ask: "Ask about this chart",
    askClose: "Close questions",
    listen: "🔊 Listen",
    cash: "Cash in hand so far",
    cashEnd: "Cash in hand at year end",
    lowest: (amount: string, month: string) => `Lowest: ${amount} (${month})`,
    captionsOnly: "Voice is not available right now, so only captions are shown.",
    loading: "Preparing the year…",
    error: "The year could not be loaded. Is the app server running?",
    retry: "Try again",
    legendIncome: "Income",
    legendCosts: "Costs + instalment",
    legendCash: "Cash in hand",
    legendShort: "Months money runs short",
    chartLabel: (crop: string, ending: string) => `Twelve-month cash flow for ${crop}. At year end: ${ending}.`,
    tableCaption: "Month-by-month figures",
    tableHeads: ["Month", "Income", "Costs + instalment", "Cash in hand"],
    month: "Month",
    noteCrop: "Harvest months are typical for this crop; real dates vary by place and year. Savings are assumed to be zero.",
    assumptions: "What this assumes",
    notAForecast: "This is the engine's arithmetic, not a forecast.",
  },
} as const;
