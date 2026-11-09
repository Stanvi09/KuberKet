import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DemoYear } from "../api";
import { makeDemoYear } from "../year/testFixtures";

const api = vi.hoisted(() => ({ getDemoYear: vi.fn(), speakCashflow: vi.fn() }));
vi.mock("../api", () => api);

import Landing from "./Landing";

const makeYear = (drop: number): DemoYear => makeDemoYear(drop);

const handlers = () => ({ onOpenApp: vi.fn(), onStartVoice: vi.fn(), onSkip: vi.fn() });

beforeEach(() => {
  vi.stubGlobal("scrollTo", vi.fn());
  api.getDemoYear.mockImplementation(async (drop: number) => makeYear(drop));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("Landing story", () => {
  it("shows the hero headline, badge and both calls to action", () => {
    render(<Landing {...handlers()} />);

    const headline = screen.getByRole("heading", { level: 1 });
    expect(headline.textContent).toContain("किस्त समझिए, कर्ज़ से पहले");
    expect(within(headline).getByText("समझिए")).toBeTruthy();
    expect(screen.getAllByText("Gnani Prisma + Timbre पर बना").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /बोलकर शुरू करें/ }).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "डेमो किसान देखें" })).toBeTruthy();
  });

  it("routes the open, voice and skip actions to the app", () => {
    const props = handlers();
    render(<Landing {...props} />);

    fireEvent.click(screen.getByRole("button", { name: "छोड़ें" }));
    expect(props.onSkip).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getAllByRole("button", { name: "ऐप खोलें" })[0]);
    expect(props.onOpenApp).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getAllByRole("button", { name: /बोलकर शुरू करें/ })[0]);
    expect(props.onStartVoice).toHaveBeenCalledTimes(1);
  });

  it("lists only true promises in the trust ledger, with no count-up zeros", () => {
    render(<Landing {...handlers()} testCount={150} />);

    const ledger = screen.getByText("गणित इंजन", { selector: ".st-ledger-entry" }).closest(".st-ledger") as HTMLElement;
    expect(screen.getByText(/एआई कोई अंक नहीं बनाता/)).toBeTruthy();
    expect(screen.getByText("हिंदी · अंग्रेज़ी")).toBeTruthy();
    expect(screen.getByText(/आधार, पैन, पासवर्ड, पिन/)).toBeTruthy();
    expect(screen.getByText("150+ टेस्ट")).toBeTruthy();
    expect(within(ledger).queryByText(/^0\+?%?$/)).toBeNull();
    expect(screen.queryByText(/उपयोगकर्ता|किसानों ने|users/i)).toBeNull();
  });

  it("does not show a test number when the count is unknown", () => {
    render(<Landing {...handlers()} testCount={0} />);
    expect(screen.getByText("अपने-आप टेस्ट")).toBeTruthy();
  });

  it("explains each pipeline node on focus and says the engine makes the numbers", () => {
    render(<Landing {...handlers()} />);

    const info = screen.getByRole("status", { name: "चुने हुए पड़ाव की जानकारी" });
    expect(info.textContent).toContain("गणित इंजन");
    expect(info.textContent).toContain("रकम यहीं बनती है, एआई से नहीं।");

    const prisma = screen.getByRole("button", { name: /Gnani Prisma/ });
    fireEvent.focus(prisma);
    expect(info.textContent).toContain("लिखे हुए शब्दों में बदलता है");
    expect(prisma.getAttribute("aria-pressed")).toBe("true");
  });

  it("loads the demo farmer from the engine and re-asks when the slider moves", async () => {
    render(<Landing {...handlers()} />);

    await screen.findByText(/Risky months/);
    expect(screen.getByText(/काल्पनिक, असली किसान नहीं/)).toBeTruthy();
    expect(api.getDemoYear).toHaveBeenCalledWith(0, "hi", expect.anything());

    fireEvent.change(screen.getByRole("slider"), { target: { value: "25" } });
    await waitFor(() => expect(api.getDemoYear).toHaveBeenCalledWith(25, "hi", expect.anything()));
    await screen.findByText("Risky months: 1,2,3,4,11,12");
  });

  it("has the Play button and the ask-about-chart button from the year panel", async () => {
    render(<Landing {...handlers()} />);
    await screen.findByText(/Risky months/);

    expect(screen.getByRole("button", { name: /साल चलाएँ/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "इस चार्ट के बारे में पूछें" })).toBeTruthy();
  });

  it("offers a retry when the demo cannot load", async () => {
    api.getDemoYear.mockRejectedValueOnce(new Error("offline"));
    render(<Landing {...handlers()} />);

    await screen.findByText(/लोड नहीं हो पाया/);
    fireEvent.click(screen.getByRole("button", { name: "फिर से कोशिश करें" }));
    await screen.findByText(/Risky months/);
  });

  it("re-explains a wrong Teach-Back answer with the shop-rent example", () => {
    render(<Landing {...handlers()} />);

    fireEvent.click(screen.getByRole("button", { name: "नहीं, माफ़ हो जाएगी" }));
    expect(screen.getByText(/दुकान का किराया/)).toBeTruthy();
    expect(screen.getByText("क्या फसल कम होने पर भी किस्त देनी होगी?")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "नहीं, माफ़ हो जाएगी" }));
    expect(screen.getByText(/यह बात बैंक से भी पूछ सकते हैं/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "फिर से देखें" }));
    fireEvent.click(screen.getByRole("button", { name: "हाँ, देनी होगी" }));
    expect(screen.getByText(/माफ़ नहीं होती/)).toBeTruthy();
  });

  it("carries the engine's instalment into the phone mockup and states the limits", async () => {
    render(<Landing {...handlers()} />);

    await screen.findByText(/महीने की किस्त करीब 5,000 रुपये है/);
    expect(screen.getAllByText(/शिक्षा के लिए है, बैंक की सलाह नहीं/).length).toBeGreaterThan(0);
    expect(screen.getByText(/रामू एक काल्पनिक डेमो किसान है/)).toBeTruthy();
  });

  it("tells the demo year as diary chapters from the engine numbers", async () => {
    render(<Landing {...handlers()} />);
    await screen.findByText(/Risky months/);

    // Fixture: kist 5,000; four months before harvest at 10,000 each; harvest 72,000 + 72,000; ends at +24,000.
    expect(screen.getAllByText("₹5,000").length).toBeGreaterThan(0);
    expect(screen.getByText("₹40,000")).toBeTruthy();
    expect(screen.getByText(/4 किस्तें ₹20,000 और घर-खेती का खर्च ₹20,000/)).toBeTruthy();
    expect(screen.getByText("₹1,44,000")).toBeTruthy();
    expect(screen.getByText(/\+₹24,000/)).toBeTruthy();
    expect(screen.getByText("फसल का पैसा पूरे साल चलता है।")).toBeTruthy();

    fireEvent.change(screen.getByRole("slider"), { target: { value: "25" } });
    await screen.findByText("फसल के बाद 2 महीने हाथ में शुरुआत से कम पैसा रहता है।");
    expect(screen.getAllByText(/−₹12,000/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("पैसा कम")).toHaveLength(2);
  });

  it("switches the sample conversation between Hindi and English", async () => {
    render(<Landing {...handlers()} />);
    await screen.findByText(/महीने की किस्त करीब 5,000 रुपये है/);

    const thread = within(screen.getByRole("group", { name: "बातचीत की भाषा" }));
    fireEvent.click(thread.getByRole("button", { name: "English" }));
    expect(screen.getByText(/What is the price of the equipment, in rupees\?/)).toBeTruthy();
    expect(screen.getByText(/The monthly instalment is about 5,000 rupees\./)).toBeTruthy();
    expect(thread.getByRole("button", { name: "English" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("shows the whole story in English, with the year from the engine in English", async () => {
    render(<Landing {...handlers()} language="en" />);
    await screen.findByText(/Risky months/);

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Understand the instalment before the loan");
    expect(api.getDemoYear).toHaveBeenCalledWith(0, "en", expect.anything());
    expect(screen.getByText("Took the loan")).toBeTruthy();
    expect(screen.getByText(/If the harvest is poor, will the loan instalment still need to be paid\?/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "No, it is waived" }));
    expect(screen.getByText(/its rent still needs to be paid/)).toBeTruthy();
  });

  it("asks the app to switch language from the story's own switch", () => {
    const onLanguageChange = vi.fn();
    render(<Landing {...handlers()} onLanguageChange={onLanguageChange} />);
    const group = within(screen.getByRole("group", { name: "भाषा" }));
    fireEvent.click(group.getByRole("button", { name: "English" }));
    expect(onLanguageChange).toHaveBeenCalledWith("en");
  });

  // Visible text and labels, minus the two language names in the switches (each written in its own script).
  const pageWords = (root: HTMLElement) => {
    const clone = root.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("[lang='hi'] button, button[lang], .st-thread-langs button, .st-lang button").forEach((node) => node.remove());
    const labels = [...clone.querySelectorAll("[aria-label]")].map((node) => node.getAttribute("aria-label") ?? "");
    return `${clone.textContent ?? ""} ${labels.join(" ")}`;
  };

  it("has no Hindi words on the English page", async () => {
    const { container } = render(<Landing {...handlers()} language="en" />);
    await screen.findByText(/Risky months/);
    const hindi = pageWords(container).match(/[\u0900-\u097F]+/g) ?? [];
    expect(hindi).toEqual([]);
  });

  it("has no English words on the Hindi page apart from brand names", async () => {
    const { container } = render(<Landing {...handlers()} language="hi" />);
    await screen.findByText(/Risky months/);
    // Brand and product names, plus the year panel's test fixture text, which is not page copy.
    const allowed = /^(KuberKet|Gnani|Prisma|Timbre|Risky|months|Sentence|one|two|three|about|income|outgo|the|tightest|month|Which|is|hardest|What|if|falls|Savings|are|assumed|to|be|zero|Paddy|Normal|risky)$/;
    const words = pageWords(container).match(/[A-Za-z]{2,}/g) ?? [];
    expect(words.filter((word) => !allowed.test(word))).toEqual([]);
  });
});
