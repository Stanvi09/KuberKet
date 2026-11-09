import type { ReportLanguage, SchemeEvaluation, SchemeId, SchemesResult } from "../api";
import { money, monthLong } from "../year/text";

type Lang = ReportLanguage;

export const schemesText = {
  hi: {
    navTitle: "योजनाएँ",
    heading: "योजनाएँ: आपके आँकड़ों पर तुलना",
    lead: "पाँच असली सरकारी योजनाएँ। अपने आँकड़े डालिए, इंजन हर योजना का असर आपकी कमाई और किस्त पर निकालेगा।",
    notAdvice: "ये आपके आँकड़ों पर निकाले गए अंतर हैं, सलाह नहीं। कुबेरकेत वित्तीय सलाहकार नहीं है; फ़ैसले से पहले बैंक या कृषि कार्यालय से पक्का करें।",
    asOf: (date: string) => `योजनाओं की जानकारी ${date} को आधिकारिक पन्नों से पढ़ी गई। नियम बदल सकते हैं।`,
    cropLabel: "आपकी फसल",
    formTitle: "आपके आँकड़े",
    fill: "डेमो किसान के आँकड़े भरें (काल्पनिक)",
    clear: "सब हटाएँ",
    fields: {
      yearly_income: "साल की कमाई (₹)",
      monthly_costs: "हर महीने घर और खेत का खर्च (₹)",
      monthly_existing_loan_payments: "हर महीने दूसरे कर्ज़ की किस्त (₹)",
      asset_price: "खरीद की कीमत (₹) — कर्ज़ न हो तो खाली",
      down_payment: "पहले दिया पैसा (₹)",
      loan_rate: "कर्ज़ का ब्याज (% सालाना)",
      tenure_years: "कर्ज़ कितने साल का",
      savings: "साल की शुरुआत में बचत (₹)",
      alternative_rate: "दूसरे कर्ज़ का ब्याज (%), तुलना के लिए",
    },
    toggles: {
      small_or_marginal: "छोटा या सीमांत किसान",
      sc_st_or_women: "SC/ST या महिला किसान",
      buying_machinery: "मशीन या ट्रैक्टर खरीद रहा हूँ",
      post_harvest_project: "कटाई के बाद का ढाँचा (गोदाम, कोल्ड स्टोरेज, ग्रेडिंग)",
      pays_income_tax: "आयकर देता हूँ",
      government_employee_or_pensioner: "सरकारी कर्मचारी या पेंशनर हूँ",
    },
    tractorClass: "ट्रैक्टर का आकार",
    tractorAny: "अभी तय नहीं",
    needInputs: "साल की कमाई और हर महीने का खर्च डालिए, तुलना यहाँ दिखेगी।",
    calculating: "इंजन हिसाब लगा रहा है…",
    failed: "हिसाब नहीं लग पाया।",
    summaryTitle: "आपकी तस्वीर बिना किसी योजना के",
    harvest: (crop: string, months: string) => `${crop}: कमाई ${months} में आती है।`,
    kist: (amount: string) => `महीने की किस्त ${amount}`,
    lowest: (amount: string, month: string) => `सबसे कम बचत ${amount} (${month})`,
    lowest40: (amount: string) => `कमाई 40% कम हो तो सबसे कम बचत ${amount}`,
    shortMonths: (n: number) => (n === 0 ? "किसी महीने पैसे कम नहीं पड़ते" : `${n} महीने पैसे कम पड़ते हैं`),
    rankingTitle: "सबसे ज़्यादा फ़र्क",
    byMoney: (name: string, amount: string, oneTime: boolean) =>
      `पैसे के हिसाब से: ${name} — ${amount} ${oneTime ? "(एक बार)" : "पहले साल"}`,
    byRisk: (name: string, amount: string) => `जोखिम के हिसाब से: ${name} — सबसे कम बचत ${amount} बेहतर`,
    nothingHelps: "इन आँकड़ों पर कोई योजना पैसे या जोखिम में साफ़ फ़र्क नहीं डालती।",
    tableTitle: "तुलना",
    cols: { scheme: "योजना", money: "पैसे पर असर (पहला साल)", lowest: "सबसे कम बचत में बदलाव", lowest40: "कमाई 40% कम हो तो", short: "पैसे कम पड़ने वाले महीने", risk: "पैसे कम पड़ने का जोखिम" },
    risk: { lower: "कम होता है", higher: "बढ़ता है", same: "बराबर", na: "लागू नहीं" },
    status: { may_apply: "लागू हो सकती है", not_applicable: "लागू नहीं", not_eligible: "पात्र नहीं लगते", not_needed: "ज़रूरत नहीं दिखती" },
    reasons: {
      no_loan: "आपने कोई कर्ज़ नहीं डाला।",
      project_type: "यह योजना कटाई के बाद के ढाँचे के लिए है; आपने ऐसा काम नहीं चुना।",
      not_machinery: "आप मशीन नहीं खरीद रहे।",
      no_shortfall: "इन आँकड़ों में कटाई से पहले पैसे कम नहीं पड़ते, इसलिए फसल कर्ज़ की ज़रूरत नहीं दिखती।",
      exclusion: "आपके चुने जवाबों के हिसाब से आप इस योजना से बाहर हो सकते हैं; पक्का आधिकारिक पोर्टल पर देखें।",
    },
    what: "यह योजना क्या है",
    computed: "आपके आँकड़ों पर इंजन का हिसाब",
    terms: "मुख्य शर्तें",
    watch: "ध्यान रखें",
    ask: "बैंक से ज़रूर पूछें",
    copy: "सवाल कॉपी करें",
    copied: "कॉपी हो गया",
    sources: "स्रोत",
    balanceChart: "हाथ में पैसा, सामान्य साल",
    withScheme: "योजना के साथ",
    without: "बिना योजना",
    assumptions: "यह हिसाब किन बातों पर टिका है",
    assumptionList: [
      "कटाई के महीने आम तौर पर होने वाले हैं, असल तारीखें जगह और साल के हिसाब से बदलती हैं।",
      "बचत शून्य मानी गई है, जब तक आप कोई रकम न डालें।",
      "डाउन पेमेंट इस साल के हिसाब से बाहर चुकाया माना गया है।",
      "किस्त पहले महीने से शुरू मानी गई है।",
      "KCC में पूरी रकम पहले महीने ली जाती है और पहली कटाई के महीने चुकाई जाती है।",
      "PM-KISAN की ₹2,000 की किस्तें साल के पहले, पाँचवें और नौवें महीने मानी गई हैं।",
      "PMFBY का प्रीमियम पहले महीने दिया माना गया है; फसल के नुकसान पर दावे की रकम नहीं निकाली गई।",
      "SMAM की सब्सिडी से कर्ज़ घटता है; सब्सिडी मिलना पक्का नहीं है।",
    ],
    sourceAsOf: "पढ़ी गई तारीख",
    optional: "और विकल्प",
    sumInsured: "बीमित राशि (₹), खाली तो साल की कमाई",
    cropLoanAmount: "KCC की रकम (₹), खाली तो इंजन अंदाज़ा लगाएगा",
  },
  en: {
    navTitle: "Schemes",
    heading: "Schemes: compared on your numbers",
    lead: "Five real government schemes. Enter your numbers and the engine works out what each one changes on your income and instalment.",
    notAdvice: "These are differences worked out on your numbers, not advice. KuberKet is not a financial adviser; confirm with your bank or agriculture office before deciding.",
    asOf: (date: string) => `Scheme facts were read from official pages on ${date}. Rules can change.`,
    cropLabel: "Your crop",
    formTitle: "Your numbers",
    fill: "Fill in the demo farmer's numbers (made-up)",
    clear: "Clear all",
    fields: {
      yearly_income: "Yearly income (₹)",
      monthly_costs: "Household and farm costs each month (₹)",
      monthly_existing_loan_payments: "Other loan payments each month (₹)",
      asset_price: "Purchase price (₹), leave empty for no loan",
      down_payment: "Paid up front (₹)",
      loan_rate: "Loan interest (% a year)",
      tenure_years: "Loan length in years",
      savings: "Savings at start of year (₹)",
      alternative_rate: "Interest of another loan (%), for comparison",
    },
    toggles: {
      small_or_marginal: "Small or marginal farmer",
      sc_st_or_women: "SC/ST or woman farmer",
      buying_machinery: "Buying a machine or tractor",
      post_harvest_project: "Post-harvest facility (godown, cold storage, grading)",
      pays_income_tax: "I pay income tax",
      government_employee_or_pensioner: "Government employee or pensioner",
    },
    tractorClass: "Tractor size",
    tractorAny: "Not decided yet",
    needInputs: "Enter yearly income and monthly costs and the comparison will appear here.",
    calculating: "The engine is calculating…",
    failed: "The calculation failed.",
    summaryTitle: "Your picture with no scheme",
    harvest: (crop: string, months: string) => `${crop}: income arrives in ${months}.`,
    kist: (amount: string) => `Monthly instalment ${amount}`,
    lowest: (amount: string, month: string) => `Lowest cash ${amount} (${month})`,
    lowest40: (amount: string) => `If income is 40% lower, lowest cash ${amount}`,
    shortMonths: (n: number) => (n === 0 ? "Money does not run short in any month" : `Money runs short in ${n} months`),
    rankingTitle: "Biggest differences",
    byMoney: (name: string, amount: string, oneTime: boolean) =>
      `By money: ${name} — ${amount} ${oneTime ? "(one time)" : "in the first year"}`,
    byRisk: (name: string, amount: string) => `By risk: ${name} — lowest cash is ${amount} better`,
    nothingHelps: "On these numbers no scheme clearly changes money or risk.",
    tableTitle: "Comparison",
    cols: { scheme: "Scheme", money: "Effect on money (first year)", lowest: "Change in lowest cash", lowest40: "If income is 40% lower", short: "Months money runs short", risk: "Risk of running short" },
    risk: { lower: "Lower", higher: "Higher", same: "Same", na: "Not applicable" },
    status: { may_apply: "May apply", not_applicable: "Does not apply", not_eligible: "May not be eligible", not_needed: "Not needed" },
    reasons: {
      no_loan: "You entered no loan.",
      project_type: "This scheme is for post-harvest facilities; you did not choose that kind of project.",
      not_machinery: "You are not buying a machine.",
      no_shortfall: "On these numbers money does not run short before harvest, so a crop loan does not look needed.",
      exclusion: "Going by your answers you may be excluded from this scheme; check the official portal.",
    },
    what: "What this scheme is",
    computed: "The engine's working on your numbers",
    terms: "Main terms",
    watch: "Keep in mind",
    ask: "Ask your bank",
    copy: "Copy questions",
    copied: "Copied",
    sources: "Sources",
    balanceChart: "Cash in hand, normal year",
    withScheme: "With the scheme",
    without: "Without",
    assumptions: "What this assumes",
    assumptionList: [
      "Harvest months are typical; real dates vary by place and year.",
      "Savings are assumed to be zero unless you enter a figure.",
      "The down payment is assumed to be paid from outside this year.",
      "The instalment is assumed to start in the first month.",
      "KCC: the whole amount is drawn in month one and repaid in the first harvest month.",
      "PM-KISAN: the ₹2,000 instalments are assumed in months 1, 5 and 9 of the year.",
      "PMFBY: the premium is assumed paid in month one; the amount of a crop-loss claim is not calculated.",
      "SMAM: the subsidy lowers the loan; getting it is not guaranteed.",
    ],
    sourceAsOf: "Read on",
    optional: "More options",
    sumInsured: "Sum insured (₹), empty means yearly income",
    cropLoanAmount: "KCC amount (₹), empty lets the engine estimate",
  },
} as const;

export const schemeShortNames: Record<Lang, Record<SchemeId, string>> = {
  hi: { kcc: "KCC", aif: "AIF", smam: "SMAM", pmfby: "PMFBY", pm_kisan: "PM-KISAN" },
  en: { kcc: "KCC", aif: "AIF", smam: "SMAM", pmfby: "PMFBY", pm_kisan: "PM-KISAN" },
};

const num = (value: unknown): number => (typeof value === "number" ? value : 0);

export type FigureContext = { loanRate: number; baselineKist: number; baselineLoan: number; language: Lang };

/** Plain sentences describing what the engine worked out for one scheme. */
export function figureLines(scheme: SchemeEvaluation, ctx: FigureContext): string[] {
  const f = scheme.figures;
  const hi = ctx.language === "hi";
  const lines: string[] = [];
  if (scheme.status === "not_applicable" || scheme.status === "not_eligible" || scheme.status === "not_needed") return lines;
  switch (scheme.id) {
    case "kcc": {
      const held = num(f.months_held);
      lines.push(
        hi
          ? `कटाई से पहले का घाटा करीब ${money(num(f.shortfall_before_harvest))}; इसके लिए ${money(num(f.amount))} का फसल कर्ज़ लगाया, ${held} महीने के लिए।${f.amount_capped_at_limit ? " (सीमा ₹3,00,000 पर रोका गया)" : ""}`
          : `The gap before harvest is about ${money(num(f.shortfall_before_harvest))}; the engine tried a crop loan of ${money(num(f.amount))} for ${held} months.${f.amount_capped_at_limit ? " (capped at the ₹3,00,000 limit)" : ""}`,
      );
      lines.push(
        hi
          ? `समय पर चुकाने पर ब्याज ${money(num(f.interest_on_time))} (4%); देर करने पर ${money(num(f.interest_without_incentive))} (7%), यानी ${money(num(f.extra_cost_if_incentive_lost))} ज़्यादा।`
          : `Repaid on time the interest is ${money(num(f.interest_on_time))} (4%); if late, ${money(num(f.interest_without_incentive))} (7%), which is ${money(num(f.extra_cost_if_incentive_lost))} more.`,
      );
      if (typeof f.saving_vs_alternative === "number") {
        lines.push(
          hi
            ? `${f.alternative_rate_percent}% वाले दूसरे कर्ज़ पर यही रकम ${money(num(f.interest_at_alternative))} ब्याज लेती; KCC से ${money(num(f.saving_vs_alternative))} बचता है।`
            : `The same amount at ${f.alternative_rate_percent}% would cost ${money(num(f.interest_at_alternative))} in interest; KCC saves ${money(num(f.saving_vs_alternative))}.`,
        );
      }
      break;
    }
    case "aif": {
      lines.push(
        hi
          ? `ब्याज ${ctx.loanRate}% से ${num(f.rate_after_percent)}%; किस्त ${money(num(f.kist_before))} से ${money(num(f.kist_after))}, हर महीने ${money(num(f.monthly_saving))} कम।`
          : `Interest goes from ${ctx.loanRate}% to ${num(f.rate_after_percent)}%; the instalment falls from ${money(num(f.kist_before))} to ${money(num(f.kist_after))}, ${money(num(f.monthly_saving))} less each month.`,
      );
      lines.push(
        hi
          ? `${num(f.support_years_counted)} साल की सहायता में कुल करीब ${money(num(f.total_saving_over_support_years))} की बचत।${f.tenure_longer_than_support ? " कर्ज़ सहायता के 7 साल से लंबा है, इसलिए बाद के सालों की बचत नहीं गिनी।" : ""}`
          : `Over ${num(f.support_years_counted)} years of support that is about ${money(num(f.total_saving_over_support_years))} saved.${f.tenure_longer_than_support ? " The loan is longer than the 7 years of support, so later years are not counted." : ""}`,
      );
      break;
    }
    case "smam": {
      lines.push(
        hi
          ? `सब्सिडी ${num(f.percent)}% = ${money(num(f.uncapped_subsidy))}${f.cap_unknown ? "। ट्रैक्टर का आकार चुनेंगे तो प्रति-मशीन सीमा लगेगी; अभी यह ऊपरी आँकड़ा है।" : `; सीमा ${money(num(f.cap))}${f.cap_applied ? " (सीमा लगी)" : ""}`}।`
          : `Subsidy ${num(f.percent)}% = ${money(num(f.uncapped_subsidy))}${f.cap_unknown ? ". Choose a tractor size to apply the per-machine cap; this is an upper figure." : `; cap ${money(num(f.cap))}${f.cap_applied ? " (cap applied)" : ""}`}.`,
      );
      lines.push(
        hi
          ? `मिले तो कर्ज़ ${money(ctx.baselineLoan)} से ${money(num(f.loan_after))}, किस्त ${money(num(f.kist_before))} से ${money(num(f.kist_after))}, हर महीने ${money(num(f.monthly_saving))} कम, कर्ज़ की अवधि में कुल ${money(num(f.total_saving_over_tenure))}।`
          : `If received, the loan falls from ${money(ctx.baselineLoan)} to ${money(num(f.loan_after))}, the instalment from ${money(num(f.kist_before))} to ${money(num(f.kist_after))}, ${money(num(f.monthly_saving))} less each month, ${money(num(f.total_saving_over_tenure))} over the loan.`,
      );
      lines.push(hi ? "चयन पक्का नहीं है; यह वह सूरत है जब सब्सिडी मिल जाए।" : "Selection is not guaranteed; this is the case where the subsidy is received.");
      if (f.cap_derived) lines.push(hi ? "इस आकार की सीमा स्कैन किए दस्तावेज़ से अनुमान की गई है; पक्का करें।" : "The cap for this size is derived from a scanned document; please confirm.");
      if (f.individual_ownership_discouraged) lines.push(hi ? "दिशानिर्देश कहते हैं कि इस आकार के ट्रैक्टर का व्यक्तिगत मालिकाना हतोत्साहित है।" : "The guidelines discourage individual ownership of tractors this size.");
      break;
    }
    case "pmfby": {
      lines.push(
        hi
          ? `प्रीमियम ${num(f.premium_percent)}% × बीमित राशि ${money(num(f.sum_insured))} = ${money(num(f.premium))}${f.sum_insured_assumed ? " (बीमित राशि साल की कमाई मानी गई)" : ""}।`
          : `Premium ${num(f.premium_percent)}% × sum insured ${money(num(f.sum_insured))} = ${money(num(f.premium))}${f.sum_insured_assumed ? " (sum insured taken as yearly income)" : ""}.`,
      );
      lines.push(
        hi
          ? `कमाई 25% घटे तो ${money(num(f.income_at_stake_25))} और 40% घटे तो ${money(num(f.income_at_stake_40))} दाँव पर है। दावे में कितना मिलेगा, यह यहाँ नहीं निकाला गया।`
          : `If income falls 25%, ${money(num(f.income_at_stake_25))} is at stake; at 40%, ${money(num(f.income_at_stake_40))}. What a claim would pay is not calculated here.`,
      );
      break;
    }
    case "pm_kisan": {
      lines.push(
        hi
          ? `साल में ${money(num(f.per_year))} (₹2,000 की तीन किस्तें), लौटाना नहीं पड़ता।`
          : `${money(num(f.per_year))} a year (three instalments of ₹2,000), no repayment.`,
      );
      break;
    }
  }
  return lines;
}

export type RiskVerdict = "lower" | "higher" | "same" | "na";

/** Whether a scheme lowers or raises the risk of running out of money, from the engine's normal-year numbers. */
export function riskVerdict(scheme: SchemeEvaluation): RiskVerdict {
  if (scheme.status !== "may_apply") return "na";
  const normal = scheme.risk_change[0];
  if (!normal) return "na";
  if (normal.lowest_balance_change > 0.5 || normal.negative_months_change < 0) return "lower";
  if (normal.lowest_balance_change < -0.5 || normal.negative_months_change > 0) return "higher";
  return "same";
}

export function signedMoney(value: number): string {
  return `${value > 0 ? "+" : ""}${money(value)}`;
}

export function harvestMonths(result: SchemesResult, language: Lang): string {
  const names = result.harvest_months.map((m) => monthLong[language][m - 1]);
  return names.join(language === "hi" ? " और " : " and ");
}
