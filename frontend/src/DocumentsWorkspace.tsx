import { useMemo, useRef, useState } from "react";
import type { FormEvent, SetStateAction } from "react";

import {
  removeDocument,
  transferDocumentValues,
  updateDocumentTerms,
  uploadDocument,
} from "./api";
import type { DocumentTermSnapshot, Language, SessionSnapshot } from "./api";
import { documentCopy, documentQuestionFields } from "./documentLocale";
import type { VoiceStatus } from "./useVoiceController";

type VoiceControls = {
  status: VoiceStatus;
  error: string;
  transcript: string;
  sendTyped: (text: string) => Promise<boolean>;
  submitTranscript: () => Promise<boolean>;
  editTranscript: (text: string) => void;
  cancelTranscript: () => void;
  explainDocument: (fieldId: string | null) => Promise<boolean>;
};

type Props = {
  session: SessionSnapshot;
  language: Language;
  setSession: (update: SetStateAction<SessionSnapshot | null>) => void;
  voice: VoiceControls;
};

const fieldIds = [
  "lender_name",
  "tractor_price",
  "loan_amount",
  "down_payment",
  "interest_rate",
  "interest_type",
  "tenure",
  "installment_amount",
  "total_repayment",
  "repayment_frequency",
  "processing_fee",
  "other_charges",
  "collateral",
  "late_payment_charges",
  "prepayment_conditions",
] as const;

const transferTargets = {
  tractor_price: "tractor_price",
  down_payment: "down_payment",
  interest_rate: "yearly_interest_rate_percent",
  tenure: "tenure_years",
} as const;

function transferNumber(fieldId: string, value: string | null): number | null {
  if (!value) return null;
  const found = value.match(/\d[\d,]*(?:\.\d+)?/);
  if (!found) return null;
  const amount = Number(found[0].replaceAll(",", ""));
  if (!Number.isFinite(amount)) return null;
  if (fieldId === "tenure") {
    const years = value.match(/\d+(?:\.\d+)?\s*(?:years?|yrs?)\b/i);
    if (!years) return null;
    const tenure = Number(years[0].match(/\d+(?:\.\d+)?/)?.[0]);
    return Number.isInteger(tenure) ? tenure : null;
  }
  return amount;
}

function currentNumber(session: SessionSnapshot, target: string): number | null {
  const fromNumbers = session.numbers_inputs?.[target]?.value;
  if (typeof fromNumbers === "number") return fromNumbers;
  const fromConversation = session.slots[target]?.value;
  return typeof fromConversation === "number" ? fromConversation : null;
}

export default function DocumentsWorkspace({
  session,
  language,
  setSession,
  voice,
}: Props) {
  const text = documentCopy[language];
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [activeTerm, setActiveTerm] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [selectedTransfers, setSelectedTransfers] = useState<string[]>([]);
  const [overwriteApproved, setOverwriteApproved] = useState(false);
  const [draftQuestion, setDraftQuestion] = useState("");
  const [error, setError] = useState("");

  const document = session.document ?? null;
  const terms = document?.terms ?? {};
  const candidates = useMemo(
    () =>
      Object.entries(transferTargets).flatMap(([fieldId, target]) => {
        const term = terms[fieldId];
        const value = transferNumber(fieldId, term?.value ?? null);
        if (!term || term.status !== "confirmed" || value === null) return [];
        return [{
          fieldId,
          target,
          value,
          current: currentNumber(session, target),
          label: text[`field_${fieldId}`],
        }];
      }),
    [session, terms, text],
  );
  const selectedCandidates = candidates.filter((item) =>
    selectedTransfers.includes(item.fieldId),
  );
  const conflicts = selectedCandidates.filter(
    (item) => item.current !== null && item.current !== item.value,
  );

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setError("");
    if (!file.name.toLowerCase().endsWith(".pdf") || file.type && file.type !== "application/pdf") {
      setError(language === "hi"
        ? "सिर्फ PDF दस्तावेज़ चुनें।"
        : "Choose a PDF document only.");
      return;
    }
    if (file.size === 0 || file.size > 10 * 1024 * 1024) {
      setError(language === "hi"
        ? "PDF खाली है या 10 MB से बड़ी है।"
        : "The PDF is empty or larger than 10 MB.");
      return;
    }
    setUploading(true);
    setProgress(0);
    setSelectedTransfers([]);
    setOverwriteApproved(false);
    try {
      const next = await uploadDocument(session.session_id, file, setProgress);
      setSession(next);
      setDrafts({});
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : text.error);
    } finally {
      setUploading(false);
      setProgress(0);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const remove = async () => {
    setBusy(true);
    setError("");
    try {
      setSession(await removeDocument(session.session_id));
      setDrafts({});
      setSelectedTransfers([]);
      setOverwriteApproved(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : text.error);
    } finally {
      setBusy(false);
    }
  };

  const updateTerm = async (term: DocumentTermSnapshot, confirmed: boolean) => {
    const value = Object.hasOwn(drafts, term.field_id)
      ? drafts[term.field_id].trim()
      : term.value;
    setBusy(true);
    setError("");
    try {
      const next = await updateDocumentTerms(session.session_id, [{
        field_id: term.field_id,
        value,
        confirmed,
      }]);
      setSession(next);
      if (confirmed) {
        setSelectedTransfers((selected) => selected.filter((item) => item !== term.field_id));
        setOverwriteApproved(false);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : text.error);
    } finally {
      setBusy(false);
    }
  };

  const askToExplain = async (fieldId: string | null) => {
    setActiveTerm(fieldId);
    setError("");
    await voice.explainDocument(fieldId);
  };

  const submitQuestion = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (await voice.sendTyped(draftQuestion)) setDraftQuestion("");
  };

  const submitTranscript = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await voice.submitTranscript();
  };

  const applyTransfers = async () => {
    if (selectedCandidates.length === 0 || (conflicts.length > 0 && !overwriteApproved)) return;
    setBusy(true);
    setError("");
    try {
      setSession(await transferDocumentValues(
        session.session_id,
        selectedCandidates.map((item) => item.fieldId),
        overwriteApproved ? conflicts.map((item) => item.fieldId) : [],
        session.numbers_income_drop_percent ?? 25,
      ));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : text.error);
    } finally {
      setBusy(false);
    }
  };

  const questions = document
    ? documentQuestionFields
      .filter((fieldId) => terms[fieldId]?.status === "missing")
      .map((fieldId) => text[`question_${fieldId}`])
      .concat(
        terms.interest_type?.status !== "missing" &&
        /floating|variable|तैर|फ्लोट/i.test(terms.interest_type?.value ?? "")
          ? [text.question_floating]
          : [],
      )
    : [];
  const conversation = session.messages.slice(-8);

  return (
    <main className="documents-workspace" aria-labelledby="documents-title">
      <header className="documents-heading">
        <p className="documents-eyebrow">{text.eyebrow}</p>
        <h1 id="documents-title">{text.title}</h1>
        <p>{text.intro}</p>
      </header>

      {error && <div className="documents-error" role="alert">{error}</div>}

      <section className="document-upload-panel" aria-labelledby="document-upload-title">
        <div className="document-panel-heading">
          <div>
            <p className="documents-kicker">01 / {text.uploadTitle}</p>
            <h2 id="document-upload-title">{document?.filename ?? text.uploadTitle}</h2>
            <p>{document
              ? `${document.page_count} ${text.pageCount}`
              : text.noFile}</p>
          </div>
          {document && (
            <button type="button" className="document-remove" onClick={() => void remove()} disabled={busy}>
              {text.removePdf}
            </button>
          )}
        </div>
        <div className="document-upload-actions">
          <input
            ref={fileInput}
            className="visually-hidden"
            type="file"
            accept="application/pdf,.pdf"
            aria-label={text.choosePdf}
            onChange={(event) => void upload(event.currentTarget.files?.[0])}
            disabled={uploading}
          />
          <button
            className="document-primary-action"
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={uploading}
          >
            {uploading ? text.uploading : document ? text.replacePdf : text.choosePdf}
          </button>
          <span>{text.uploadHint}</span>
        </div>
        {uploading && (
          <div className="document-progress" role="progressbar" aria-label={text.uploading} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
            <span style={{ width: `${progress}%` }} />
            <strong>{progress}%</strong>
          </div>
        )}
        {document && (
          <div className={`document-read-status ${document.scanned_only ? "is-warning" : "is-success"}`} role="status">
            {document.scanned_only ? text.scanned : text.extracted}
          </div>
        )}
      </section>

      {document && (
        <>
          <div className="document-review-grid">
            <section className="document-terms-panel" aria-labelledby="document-terms-title">
              <div className="document-section-heading">
                <div>
                  <p className="documents-kicker">02 / REVIEW</p>
                  <h2 id="document-terms-title">{text.termsTitle}</h2>
                  <p>{text.termsHint}</p>
                </div>
                <button
                  type="button"
                  className="document-ask-action"
                  onClick={() => void askToExplain(null)}
                  disabled={voice.status === "processing"}
                >
                  {text.askDocument}
                </button>
              </div>

              <div className="document-status-legend" aria-label={text.termsHint}>
                <span className="document-status found">{text.found}</span>
                <span className="document-status confirmed">{text.confirmed}</span>
                <span className="document-status missing">{text.missing}</span>
              </div>

              <div className="document-term-list">
                {fieldIds.map((fieldId) => {
                  const term = terms[fieldId];
                  if (!term) return null;
                  const edited = term.origin === "farmer" && term.status === "found";
                  const statusText = term.status === "confirmed"
                    ? text.confirmed
                    : term.status === "missing"
                      ? text.missing
                      : edited
                        ? text.edited
                        : text.found;
                  const value = Object.hasOwn(drafts, fieldId)
                    ? drafts[fieldId]
                    : term.value ?? "";
                  return (
                    <article className="document-term" key={fieldId}>
                      <div className="document-term-main">
                        <div className="document-term-title">
                          <h3>{text[`field_${fieldId}`]}</h3>
                          <span className={`document-status ${term.status}`}>
                            {statusText}
                          </span>
                        </div>
                        {term.issue && <p className="document-term-issue">{term.issue}</p>}
                        {term.page && (
                          <p className="document-source">{text.page} {term.page}
                            {term.source && <span> · {text.source}: “{term.source}”</span>}
                          </p>
                        )}
                        {term.source && term.origin === "farmer" && (
                          <p className="document-source">{term.source}</p>
                        )}
                        <p className="document-term-meaning">{text[`meaning_${fieldId}`]}</p>
                      </div>
                      <div className="document-term-controls">
                        <label htmlFor={`document-term-${fieldId}`}>{text[`field_${fieldId}`]}</label>
                        <input
                          id={`document-term-${fieldId}`}
                          value={value}
                          maxLength={300}
                          placeholder={text.editPlaceholder}
                          onChange={(event) => setDrafts((current) => ({
                            ...current,
                            [fieldId]: event.target.value,
                          }))}
                        />
                        <div className="document-term-actions">
                          <button
                            type="button"
                            onClick={() => void updateTerm(term, false)}
                            disabled={busy || value.trim() === (term.value ?? "")}
                          >
                            {text.saveCorrection}
                          </button>
                          <button
                            type="button"
                            className="document-confirm"
                            onClick={() => void updateTerm(term, true)}
                            disabled={busy || !value.trim() || term.status === "confirmed" && value.trim() === term.value}
                          >
                            {text.confirmValue}
                          </button>
                          <button
                            type="button"
                            className="document-explain-term"
                            onClick={() => void askToExplain(fieldId)}
                            disabled={voice.status === "processing"}
                            aria-pressed={activeTerm === fieldId}
                          >
                            {text.explainTerm}
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>

            <aside className="document-side-column">
              <section className="document-explanation-panel" aria-labelledby="document-explanation-title">
                <p className="documents-kicker">03 / PLAIN LANGUAGE</p>
                <h2 id="document-explanation-title">{text.explanationTitle}</h2>
                <p>{text.explanationHint}</p>
                <ul className="document-explanation-list">
                  {fieldIds.map((fieldId) => {
                    const term = terms[fieldId];
                    if (!term || term.status === "missing" && !term.issue) return null;
                    return (
                      <li key={fieldId}>
                        <strong>{text[`field_${fieldId}`]}</strong>
                        <span>{term.status === "missing"
                          ? text.notStated
                          : `${term.value} — ${text[`meaning_${fieldId}`]}`}</span>
                      </li>
                    );
                  })}
                </ul>
              </section>

              <section className="document-questions-panel" aria-labelledby="document-questions-title">
                <p className="documents-kicker">04 / BEFORE YOU SIGN</p>
                <h2 id="document-questions-title">{text.questionsTitle}</h2>
                {questions.length === 0 ? (
                  <p>{text.noQuestions}</p>
                ) : (
                  <ul>{questions.map((question) => <li key={question}>{question}</li>)}</ul>
                )}
                <p className="document-legal-note">
                  {language === "en"
                    ? "An unclear clause is an information gap, not proof of wrongdoing. KuberKet does not give legal advice."
                    : "साफ़ न हुई शर्त जानकारी की कमी है, गलत काम का सबूत नहीं। कुबेरकेत कानूनी सलाह नहीं देता।"}
                </p>
              </section>
            </aside>
          </div>

          <section className="document-transfer-panel" aria-labelledby="document-transfer-title">
            <div className="document-section-heading">
              <div>
                <p className="documents-kicker">05 / OPTIONAL TRANSFER</p>
                <h2 id="document-transfer-title">{text.transferTitle}</h2>
                <p>{text.transferHint}</p>
              </div>
            </div>
            {candidates.length === 0 ? (
              <p>{text.transferNoValues}</p>
            ) : (
              <>
                <div className="document-transfer-list">
                  {candidates.map((item) => (
                    <label className="document-transfer-row" key={item.fieldId}>
                      <input
                        type="checkbox"
                        checked={selectedTransfers.includes(item.fieldId)}
                        onChange={(event) => {
                          setSelectedTransfers((current) =>
                            event.target.checked
                              ? [...current, item.fieldId]
                              : current.filter((field) => field !== item.fieldId),
                          );
                          setOverwriteApproved(false);
                        }}
                      />
                      <span>
                        <strong>{item.label}</strong>
                        <small>{text.current}: {item.current === null ? text.notStated : formatNumber(item.current, language)}
                          {" · "}{text.proposed}: {formatNumber(item.value, language)}</small>
                      </span>
                      <span>{text.selectTransfer}</span>
                    </label>
                  ))}
                </div>
                {candidates.some((item) => item.fieldId === "loan_amount") && (
                  <p className="document-transfer-note">{text.transferHint}</p>
                )}
                {conflicts.length > 0 ? (
                  <div className="document-overwrite-approval">
                    <p>{text.overwriteWarning}</p>
                    <label>
                      <input
                        type="checkbox"
                        checked={overwriteApproved}
                        onChange={(event) => setOverwriteApproved(event.target.checked)}
                      />
                      {text.approveOverwrite}
                    </label>
                  </div>
                ) : (
                  <p className="document-transfer-note">{text.noOverwrite}</p>
                )}
                <p className="document-transfer-note">{text.missingAfter}</p>
                <button
                  className="document-primary-action"
                  type="button"
                  onClick={() => void applyTransfers()}
                  disabled={busy || selectedCandidates.length === 0 || conflicts.length > 0 && !overwriteApproved}
                >
                  {text.apply}
                </button>
              </>
            )}
          </section>

          <section className="document-conversation-panel" aria-labelledby="document-conversation-title">
            <div className="document-section-heading">
              <div>
                <p className="documents-kicker">06 / SHARED CONVERSATION</p>
                <h2 id="document-conversation-title">{text.askDocument}</h2>
                <p>{text.speak}</p>
              </div>
            </div>
            <div className="document-conversation" aria-live="polite">
              {conversation.length === 0
                ? <p className="document-chat-empty">{text.chatEmpty}</p>
                : conversation.map((message, index) => (
                  <article className={`document-message ${message.role}`} key={`${index}-${message.text.slice(0, 20)}`}>
                    <span>{message.role === "farmer"
                      ? language === "hi" ? "आप" : "You"
                      : "KuberKet"}</span>
                    <p>{message.text}</p>
                  </article>
                ))}
            </div>
            {voice.status === "transcript_review" && (
              <form className="document-transcript-review" onSubmit={(event) => void submitTranscript(event)}>
                <label htmlFor="document-transcript">{text.transcriptReview}</label>
                <textarea
                  id="document-transcript"
                  value={voice.transcript}
                  onChange={(event) => voice.editTranscript(event.target.value)}
                  rows={3}
                />
                <div>
                  <button type="button" onClick={voice.cancelTranscript}>{text.transcriptCancel}</button>
                  <button type="submit">{text.transcriptSend}</button>
                </div>
              </form>
            )}
            {voice.error && <p className="documents-error" role="alert">{voice.error}</p>}
            <form className="document-question-form" onSubmit={(event) => void submitQuestion(event)}>
              <label htmlFor="document-question">{text.typedLabel}</label>
              <div>
                <input
                  id="document-question"
                  value={draftQuestion}
                  onChange={(event) => setDraftQuestion(event.target.value)}
                  placeholder={text.placeholder}
                  maxLength={4000}
                />
                <button type="submit" disabled={!draftQuestion.trim() || voice.status === "processing"}>
                  {text.send}
                </button>
              </div>
            </form>
          </section>
        </>
      )}
    </main>
  );
}

function formatNumber(value: number, language: Language): string {
  const locale = language === "hi" ? "hi-IN" : "en-IN";
  return `₹${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value)}`;
}
