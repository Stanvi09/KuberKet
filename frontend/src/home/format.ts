import type { Language } from "../api";

export function formatMoney(value: number): string {
  const formatted = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(Math.abs(value)));
  return `₹${formatted}`;
}

function formatDigits(value: number): string {
  return new Intl.NumberFormat("hi-IN", { maximumFractionDigits: 2 }).format(value);
}

export function formatPercent(value: number, language: Language): string {
  return language === "hi" ? `${formatDigits(value)} प्रतिशत` : `${value}%`;
}

export function formatYears(value: number, language: Language): string {
  return language === "hi" ? `${formatDigits(value)} साल` : `${value} years`;
}

export function formatValue(slot: string, value: number, language: Language): string {
  if (slot === "yearly_interest_rate_percent") return formatPercent(value, language);
  if (slot === "tenure_years") return formatYears(value, language);
  return formatMoney(value);
}
