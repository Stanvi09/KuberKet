import { describe, expect, it } from "vitest";

import { storyCopy } from "./story/copy";
import { voiceText } from "./useVoiceController";

const DEVANAGARI = /[ऀ-ॿ]/;

/** Every string in an object, calling functions with sample arguments so their output is checked too. */
function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (typeof value === "function") return strings((value as (...args: unknown[]) => unknown)(3, "₹1", "₹2", 9, 5));
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === "object") return Object.values(value).flatMap(strings);
  return [];
}

describe("one language at a time", () => {
  it("has every voice message in both languages, each in its own script", () => {
    expect(Object.keys(voiceText.en).sort()).toEqual(Object.keys(voiceText.hi).sort());
    for (const line of Object.values(voiceText.en)) expect(line).not.toMatch(DEVANAGARI);
    for (const line of Object.values(voiceText.hi)) expect(line).toMatch(DEVANAGARI);
  });

  it("writes the English story copy without any Hindi", () => {
    const hindi = strings(storyCopy.en).filter((line) => DEVANAGARI.test(line));
    expect(hindi).toEqual([]);
  });

  it("writes the Hindi story copy without English sentences", () => {
    const englishy = strings(storyCopy.hi).filter((line) => /\b[A-Za-z]{3,}\s+[A-Za-z]{3,}\b/.test(line.replace(/Gnani Prisma|Gnani Timbre|Prisma \+ Timbre/g, "")));
    expect(englishy).toEqual([]);
  });
});

describe("English words only in English", () => {
  it("never says kist in the English story copy (it is a Hindi word); it says instalment", () => {
    const kist = strings(storyCopy.en).filter((line) => /\bkists?\b/i.test(line));
    expect(kist).toEqual([]);
  });
});
