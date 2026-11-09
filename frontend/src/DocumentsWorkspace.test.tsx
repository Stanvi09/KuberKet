import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  explainDocument,
  removeDocument,
  transferDocumentValues,
  updateDocumentTerms,
  uploadDocument,
} from "./api";
import type { SessionSnapshot } from "./api";
import DocumentsWorkspace from "./DocumentsWorkspace";
import type { VoiceStatus } from "./useVoiceController";

vi.mock("./api", () => ({
  explainDocument: vi.fn(),
  removeDocument: vi.fn(),
  transferDocumentValues: vi.fn(),
  updateDocumentTerms: vi.fn(),
  uploadDocument: vi.fn(),
}));

const terms: NonNullable<SessionSnapshot["document"]>["terms"] = {
  lender_name: {
    field_id: "lender_name", label: "Lender name", value: "Example Bank",
    status: "found", origin: "document", page: 1, source: "Lender: Example Bank", issue: null,
  },
  tractor_price: {
    field_id: "tractor_price", label: "Tractor price", value: "700,000",
    status: "confirmed", origin: "farmer", page: 1, source: "Confirmed by farmer", issue: null,
  },
  loan_amount: {
    field_id: "loan_amount", label: "Loan amount", value: "600,000",
    status: "found", origin: "document", page: 1, source: "Loan amount: INR 600,000", issue: null,
  },
  down_payment: {
    field_id: "down_payment", label: "Down payment", value: null,
    status: "missing", origin: "document", page: null, source: null, issue: null,
  },
  interest_rate: {
    field_id: "interest_rate", label: "Interest rate", value: "10%",
    status: "found", origin: "document", page: 1, source: "Interest rate: 10%", issue: null,
  },
  interest_type: {
    field_id: "interest_type", label: "Rate type", value: null,
    status: "missing", origin: "document", page: null, source: null, issue: null,
  },
  tenure: {
    field_id: "tenure", label: "Loan tenure", value: "5 years",
    status: "found", origin: "document", page: 1, source: "Loan tenure: 5 years", issue: null,
  },
  installment_amount: {
    field_id: "installment_amount", label: "Instalment amount", value: "12,000",
    status: "found", origin: "document", page: 1, source: "EMI: INR 12,000", issue: null,
  },
  total_repayment: {
    field_id: "total_repayment", label: "Total repayment", value: null,
    status: "missing", origin: "document", page: null, source: null, issue: null,
  },
  repayment_frequency: {
    field_id: "repayment_frequency", label: "Repayment frequency", value: null,
    status: "missing", origin: "document", page: null, source: null, issue: null,
  },
  processing_fee: {
    field_id: "processing_fee", label: "Processing fee", value: "500",
    status: "found", origin: "document", page: 1, source: "Processing fee: INR 500", issue: null,
  },
  other_charges: {
    field_id: "other_charges", label: "Other charges", value: null,
    status: "missing", origin: "document", page: null, source: null, issue: null,
  },
  collateral: {
    field_id: "collateral", label: "Collateral or security", value: null,
    status: "missing", origin: "document", page: null, source: null, issue: null,
  },
  late_payment_charges: {
    field_id: "late_payment_charges", label: "Late-payment charges", value: null,
    status: "missing", origin: "document", page: null, source: null, issue: null,
  },
  prepayment_conditions: {
    field_id: "prepayment_conditions", label: "Prepayment terms", value: null,
    status: "missing", origin: "document", page: null, source: null, issue: null,
  },
};

function makeSession(overrides: Partial<SessionSnapshot> = {}): SessionSnapshot {
  return {
    session_id: "session-1",
    language: "en",
    section: "documents",
    messages: [{ role: "farmer", text: "What happens if I pay late?" }],
    conversation_state: "not_started",
    current_slot: null,
    awaiting_confirmation: null,
    current_prompt: null,
    slots: {},
    finance_result: null,
    screen_explanation: null,
    latest_speech: [],
    speech_error: null,
    document: {
      document_id: "doc-1",
      filename: "loan-terms.pdf",
      page_count: 2,
      scanned_only: false,
      terms,
    },
    numbers_inputs: {
      tractor_price: { value: 500_000, status: "given", source: "manual" },
    },
    ...overrides,
  };
}

const voice = {
  status: "idle" as VoiceStatus,
  error: "",
  transcript: "",
  sendTyped: vi.fn(async () => true),
  submitTranscript: vi.fn(async () => true),
  editTranscript: vi.fn(),
  cancelTranscript: vi.fn(),
  explainDocument: vi.fn(async () => true),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(explainDocument).mockResolvedValue(makeSession());
  vi.mocked(removeDocument).mockResolvedValue(makeSession({ document: null }));
  vi.mocked(transferDocumentValues).mockResolvedValue(makeSession({ section: "numbers" }));
  vi.mocked(updateDocumentTerms).mockResolvedValue(makeSession());
  vi.mocked(uploadDocument).mockResolvedValue(makeSession());
});

afterEach(cleanup);

describe("Documents workspace", () => {
  it("shows page references, three review states, and missing-term questions", () => {
    render(
      <DocumentsWorkspace
        session={makeSession()}
        language="en"
        setSession={vi.fn()}
        voice={voice}
      />,
    );

    expect(screen.getAllByText("Found in document").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Confirmed by farmer").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Missing or unclear").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Page 1").length).toBeGreaterThan(0);
    expect(screen.getByText("What happens if a payment is late?")).toBeTruthy();
  });

  it("routes term explanations through the shared voice companion", () => {
    render(
      <DocumentsWorkspace
        session={makeSession()}
        language="en"
        setSession={vi.fn()}
        voice={voice}
      />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Explain this term" })[0]);

    expect(voice.explainDocument).toHaveBeenCalledWith("lender_name");
  });

  it("saves a farmer correction without silently confirming it", async () => {
    const setSession = vi.fn();
    render(
      <DocumentsWorkspace
        session={makeSession()}
        language="en"
        setSession={setSession}
        voice={voice}
      />,
    );

    fireEvent.change(screen.getByLabelText("Interest rate"), { target: { value: "11%" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Save correction" })[4]);

    await waitFor(() => {
      expect(updateDocumentTerms).toHaveBeenCalledWith("session-1", [{
        field_id: "interest_rate",
        value: "11%",
        confirmed: false,
      }]);
    });
    expect(setSession).toHaveBeenCalledOnce();
  });

  it("requires explicit approval before applying a value that overwrites My Numbers", async () => {
    const setSession = vi.fn();
    render(
      <DocumentsWorkspace
        session={makeSession()}
        language="en"
        setSession={setSession}
        voice={voice}
      />,
    );

    fireEvent.click(screen.getByRole("checkbox", { name: /Tractor price/ }));
    const apply = screen.getByRole("button", { name: "Apply selected values and open My Numbers" });
    expect((apply as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", { name: "I approve replacing the different values shown above" }));
    fireEvent.click(apply);

    await waitFor(() => {
      expect(transferDocumentValues).toHaveBeenCalledWith(
        "session-1",
        ["tractor_price"],
        ["tractor_price"],
        25,
      );
    });
  });

  it("retains document data when rendered in another interface language (Hindi)", () => {
    const session = makeSession();
    const { rerender } = render(
      <DocumentsWorkspace session={session} language="en" setSession={vi.fn()} voice={voice} />,
    );

    rerender(
      <DocumentsWorkspace session={session} language="hi" setSession={vi.fn()} voice={voice} />,
    );

    expect(screen.getByText("loan-terms.pdf")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
    expect(screen.getByDisplayValue("10%")).toBeTruthy();
  });

  it("rejects a non-PDF upload before sending it to the backend", () => {
    render(
      <DocumentsWorkspace
        session={makeSession({ document: null })}
        language="en"
        setSession={vi.fn()}
        voice={voice}
      />,
    );
    const file = new File(["not pdf"], "notes.txt", { type: "text/plain" });

    fireEvent.change(screen.getByLabelText("Choose a PDF"), { target: { files: [file] } });

    expect(screen.getByRole("alert").textContent).toContain("Choose a PDF");
    expect(uploadDocument).not.toHaveBeenCalled();
  });
});
