import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ evaluateSchemes: vi.fn(), getSchemesInfo: vi.fn() }));
vi.mock("../api", () => api);

import SchemesPage from "./SchemesPage";
import { makeInfo, makeResult } from "./testFixtures";

function setup(props: Partial<React.ComponentProps<typeof SchemesPage>> = {}) {
  const onCropChange = vi.fn();
  render(<SchemesPage language="en" crop="paddy" onCropChange={onCropChange} slots={{}} {...props} />);
  return { onCropChange };
}

beforeEach(() => {
  api.getSchemesInfo.mockResolvedValue(makeInfo());
  api.evaluateSchemes.mockResolvedValue(makeResult());
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("Schemes page", () => {
  it("asks for income and costs first and does not call the engine without them", async () => {
    setup();

    expect(screen.getByText(/Enter yearly income and monthly costs/)).toBeTruthy();
    expect(screen.getByText(/not a financial adviser/)).toBeTruthy();
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(api.evaluateSchemes).not.toHaveBeenCalled();
  });

  it("sends the farmer's numbers and crop to the engine and shows differences, not advice", async () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /Fill in the demo farmer/ }));

    await waitFor(() => expect(api.evaluateSchemes).toHaveBeenCalled());
    expect(api.evaluateSchemes.mock.calls[0][0]).toMatchObject({
      crop: "paddy",
      yearly_income: 480000,
      monthly_costs: 18000,
      monthly_existing_loan_payments: 3000,
      asset_price: 600000,
      down_payment: 100000,
      loan_rate: 9,
      tenure_years: 5,
      buying_machinery: true,
      tractor_class: "2wd_40_50",
    });

    const ranking = await screen.findByRole("heading", { name: "Biggest differences" });
    const section = ranking.closest("section") as HTMLElement;
    expect(within(section).getByText(/By money: Sub-Mission on Agricultural Mechanization \(SMAM\) — ₹3,00,000 \(one time\)/)).toBeTruthy();
    expect(within(section).getByText(/By risk: Kisan Credit Card \(KCC\) — lowest cash is ₹83,000 better/)).toBeTruthy();
  });

  it("compares every scheme in a table with the engine's risk verdicts", async () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /Fill in the demo farmer/ }));

    const table = await screen.findByRole("table");
    const rowFor = (name: RegExp) => within(table).getByRole("row", { name });

    expect(within(rowFor(/SMAM/)).getByText("+₹3,00,000")).toBeTruthy();
    expect(within(rowFor(/SMAM/)).getByText("Lower")).toBeTruthy();
    expect(within(rowFor(/PMFBY/)).getAllByText("−₹9,600")).toHaveLength(3); // money, lowest cash, lowest cash at 40% lower
    expect(within(rowFor(/PMFBY/)).getByText("Higher")).toBeTruthy();
    expect(within(rowFor(/AIF/)).getByText("Does not apply")).toBeTruthy();
    expect(within(rowFor(/AIF/)).getByText("Not applicable")).toBeTruthy();
  });

  it("explains each scheme, shows the working, and says why one does not apply", async () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /Fill in the demo farmer/ }));

    const smam = (await screen.findByRole("heading", { name: /Sub-Mission on Agricultural Mechanization/, level: 2 })).closest("article") as HTMLElement;
    expect(within(smam).getByText("smam explained")).toBeTruthy();
    expect(within(smam).getByText(/Subsidy 50% = ₹3,00,000; cap ₹4,50,000/)).toBeTruthy();
    expect(within(smam).getByText(/Selection is not guaranteed/)).toBeTruthy();
    expect(within(smam).getByText(/discourage individual ownership/)).toBeTruthy();

    const aif = screen.getByRole("heading", { name: /Agriculture Infrastructure Fund/, level: 2 }).closest("article") as HTMLElement;
    expect(within(aif).getByText(/for post-harvest facilities; you did not choose that kind of project/)).toBeTruthy();

    const kcc = screen.getByRole("heading", { name: /Kisan Credit Card/, level: 2 }).closest("article") as HTMLElement;
    expect(within(kcc).getByText(/KCC saves ₹2,075/)).toBeTruthy();
    expect(within(kcc).getByText(/Repaid on time the interest is ₹1,383/)).toBeTruthy();

    const pmfby = screen.getByRole("heading", { name: /PM Fasal Bima/, level: 2 }).closest("article") as HTMLElement;
    expect(within(pmfby).getByText(/What a claim would pay is not calculated here/)).toBeTruthy();
    expect(within(pmfby).getByText(/sum insured taken as yearly income/)).toBeTruthy();
  });

  it("lists the questions to ask the bank, copies them, and links the official sources", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    setup();
    fireEvent.click(screen.getByRole("button", { name: /Fill in the demo farmer/ }));

    const kcc = (await screen.findByRole("heading", { name: /Kisan Credit Card/, level: 2 })).closest("article") as HTMLElement;
    expect(within(kcc).getByText("kcc question one")).toBeTruthy();

    fireEvent.click(within(kcc).getByRole("button", { name: "Copy questions" }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(writeText.mock.calls[0][0]).toContain("1. kcc question one");
    expect(writeText.mock.calls[0][0]).toContain("2. kcc question two");
    await within(kcc).findByRole("button", { name: "Copied" });

    const link = within(kcc).getByRole("link", { name: "kcc official page" });
    expect(link.getAttribute("href")).toBe("https://example.gov.in/kcc");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(within(kcc).getByText(/Read on 2026-11-09/)).toBeTruthy();
  });

  it("lets the farmer change the crop", () => {
    const { onCropChange } = setup();

    fireEvent.click(screen.getByRole("button", { name: "Wheat" }));
    expect(onCropChange).toHaveBeenCalledWith("wheat");
    expect(screen.getByRole("button", { name: "Paddy" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("Paddy: income in October and November")).toBeTruthy();
  });

  it("starts from numbers already given in the conversation", async () => {
    setup({
      slots: {
        yearly_farm_income: { value: 300000, status: "given" },
        monthly_costs: { value: 10000, status: "given" },
        asset_price: { value: null, status: "missing" },
      },
    });

    await waitFor(() => expect(api.evaluateSchemes).toHaveBeenCalled());
    expect(api.evaluateSchemes.mock.calls[0][0]).toMatchObject({ yearly_income: 300000, monthly_costs: 10000, asset_price: 0 });
  });

  it("does not ask the engine when the down payment is not below the price", async () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /Fill in the demo farmer/ }));
    await waitFor(() => expect(api.evaluateSchemes).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText(/Paid up front/), { target: { value: "700000" } });
    await screen.findByText(/Enter yearly income and monthly costs/);
    expect(api.evaluateSchemes).toHaveBeenCalledTimes(1);
  });

  it("shows the engine's error message and a retry when scheme information cannot load", async () => {
    api.getSchemesInfo.mockRejectedValueOnce(new Error("offline"));
    api.evaluateSchemes.mockRejectedValueOnce(new Error("Down payment must be less than the asset price."));
    setup();
    fireEvent.click(screen.getByRole("button", { name: /Fill in the demo farmer/ }));

    await screen.findByText("Scheme information could not be loaded.");
    await screen.findByText("Down payment must be less than the asset price.");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(api.getSchemesInfo).toHaveBeenCalledTimes(2));
  });
});
