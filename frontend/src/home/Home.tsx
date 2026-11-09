import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, FormEvent, SetStateAction } from "react";

import {
  getCashflow,
  getVoiceStatus,
  resetConversation,
  speakCashflow,
  updateSession,
} from "../api";
import type { CashflowInputs, Crop, InputMode, Language, LoanPurpose, SessionSnapshot } from "../api";
import VoiceOrb from "../VoiceOrb";
import type useVoiceController from "../useVoiceController";
import YearPanel from "../year/YearPanel";
import { CROPS, harvestHint, toReportLanguage } from "../year/text";
import { SPEEDS, cropChipNames, homeText, purposeNames, slotNames } from "./copy";
import { formatValue } from "./format";
import Results from "./Results";
import VoiceCheck from "./VoiceCheck";
import "./home.css";

type Voice = ReturnType<typeof useVoiceController>;
type Tab = "key" | "year" | "check";
type Flow = "explain" | "year" | "ask" | null;

const LOAN_PURPOSES: LoanPurpose[] = ["equipment", "irrigation", "livestock", "other"];

type Props = {
  session: SessionSnapshot;
  setSession: Dispatch<SetStateAction<SessionSnapshot | null>>;
  voice: Voice;
  onError: (message: string) => void;
  /** Tells the app whether the mic should open by itself once KuberKet stops speaking. */
  onListenChange: (listen: boolean) => void;
  onOpenSection: (section: "numbers" | "schemes") => void;
};

export default function Home({ session, setSession, voice, onError, onListenChange, onOpenSection }: Props) {
  const language: Language = session.language;
  const t = homeText[language];
  const reportLanguage = toReportLanguage(language);
  const mode: InputMode = session.input_mode ?? "audio";
  const speed = session.speech_speed ?? 1;
  const crop: Crop = session.crop ?? "paddy";
  const state = session.conversation_state;
  const result = session.numbers_workspace_active ? session.numbers_result ?? null : session.finance_result;
  const phase: "setup" | "collect" | "results" =
    state === "not_started" ? "setup" : result && state !== "collecting" ? "results" : "collect";

  const [draft, setDraft] = useState("");
  const [autoListen, setAutoListen] = useState(true);
  const [tab, setTab] = useState<Tab>("key");
  const [flow, setFlow] = useState<Flow>(null);
  const [keyConfigured, setKeyConfigured] = useState(true);
  const timelineRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<HTMLElement>(null);
  const previousState = useRef(state);
  const flowStarted = useRef(false);

  const fail = useCallback((caught: unknown) => {
    onError(caught instanceof Error ? caught.message : "");
  }, [onError]);

  const patch = useCallback(
    async (update: Parameters<typeof updateSession>[1]) => {
      onError("");
      try {
        setSession(await updateSession(session.session_id, update));
      } catch (caught) {
        fail(caught);
      }
    },
    [fail, onError, session.session_id, setSession],
  );

  useEffect(() => {
    const controller = new AbortController();
    getVoiceStatus(controller.signal)
      .then((status) => setKeyConfigured(status.key_configured))
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  // The mic opens by itself only while KuberKet is waiting for an answer.
  const expectsAnswer = state === "collecting" || (state === "teach_back" && tab === "check");
  useEffect(() => {
    onListenChange(mode === "audio" && autoListen && phase !== "setup" && expectsAnswer && keyConfigured);
  }, [autoListen, expectsAnswer, keyConfigured, mode, onListenChange, phase]);

  // Keep the newest message in view: the farmer should never have to scroll the chat by hand.
  const messageCount = session.messages.length;
  useEffect(() => {
    const timeline = timelineRef.current;
    if (timeline) timeline.scrollTop = timeline.scrollHeight;
  }, [messageCount, voice.status, session.awaiting_confirmation]);
  useEffect(() => {
    if (phase === "collect") chatRef.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [phase]);

  const clipIndex = useCallback(
    (label: string) => voice.speechClips.findIndex((clip) => clip.label === label),
    [voice.speechClips],
  );

  // The moment the numbers are ready, the audio walk-through begins (audio mode only).
  useEffect(() => {
    const before = previousState.current;
    previousState.current = state;
    if (before === "collecting" && state === "teach_back") {
      setTab("key");
      flowStarted.current = false;
      if (mode === "audio") setFlow(session.latest_speech.length > 0 ? "explain" : "year");
      else setFlow(null);
    }
  }, [mode, session.latest_speech.length, state]);

  const goToYear = useCallback(() => {
    setTab("year");
    setFlow("year");
  }, []);

  useEffect(() => {
    if (flow !== "explain") return;
    if (voice.playingClip !== null) flowStarted.current = true;
    if ((flowStarted.current && voice.playbackComplete && voice.playingClip === null) || voice.speechError) {
      goToYear();
    }
  }, [flow, goToYear, voice.playbackComplete, voice.playingClip, voice.speechError]);

  const finishYear = useCallback(() => {
    setTab("check");
    const question = clipIndex("Teach-back question");
    if (question >= 0 && mode === "audio") {
      setFlow("ask");
      voice.playClipRange(question, question, true);
    } else {
      setFlow(null);
    }
  }, [clipIndex, mode, voice]);

  const takeOver = (next: Tab) => {
    setFlow(null);
    voice.stopSpeech();
    setTab(next);
  };

  const switchMode = async (next: InputMode) => {
    if (next === mode) return;
    if (voice.status === "listening") voice.cancelRecording();
    voice.stopSpeech();
    setFlow(null);
    await patch({ input_mode: next });
  };

  /** A button tap during an open mic closes the mic first, so a tap is never ignored. */
  const answerNow = async (value: string) => {
    if (voice.status === "listening") {
      voice.cancelRecording();
      await new Promise<void>((resolve) => window.setTimeout(resolve, 200));
    }
    await voice.sendTyped(value);
  };

  const submitDraft = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (await voice.sendTyped(draft)) setDraft("");
  };

  const startOver = async () => {
    voice.stopSpeech();
    voice.clearSpeech();
    setFlow(null);
    setTab("key");
    try {
      setSession(await resetConversation(session.session_id));
    } catch (caught) {
      fail(caught);
    }
  };

  const yearInputs = useMemo<CashflowInputs | null>(() => {
    const source = session.numbers_workspace_active ? session.numbers_inputs ?? {} : session.slots;
    const value = (name: string): number | null => {
      const item = source[name];
      return item && item.status !== "missing" && typeof item.value === "number" ? item.value : null;
    };
    const income = value("yearly_farm_income");
    const costs = value("monthly_costs");
    if (income === null || costs === null) return null;
    const price = value("asset_price") ?? 0;
    const down = value("down_payment") ?? 0;
    const years = value("tenure_years") ?? 0;
    if (price > 0 && (down >= price || years < 1)) return null;
    return {
      crop,
      yearly_income: income,
      monthly_costs: costs,
      monthly_existing_loan_payments: value("monthly_existing_loan_payments") ?? 0,
      asset_price: price,
      down_payment: down,
      loan_rate: value("yearly_interest_rate_percent") ?? 0,
      tenure_years: price > 0 ? years : 0,
      savings: 0,
    };
  }, [session.slots, session.numbers_inputs, session.numbers_workspace_active, crop]);

  const slotEntries = Object.entries(session.slots);
  const doneCount = slotEntries.filter(([, slot]) => slot.status !== "missing").length;
  const busy = voice.status === "processing" || voice.status === "listening";
  const quickReplies = useMemo(() => {
    if (session.awaiting_confirmation) {
      return [
        { text: t.confirmYes, value: language === "hi" ? "हाँ, सही है" : "Yes, that's right" },
        { text: t.confirmNo, value: language === "hi" ? "नहीं, सुधारना है" : "No, let me correct it" },
      ];
    }
    if (state === "collecting" && session.current_slot === "yearly_hiring_spend" && session.slots.yearly_hiring_spend?.status === "missing") {
      return [{ text: t.skipHiring, value: language === "hi" ? "किराये का खर्च नहीं बताना" : "Skip, I don't know" }];
    }
    return [];
  }, [language, session.awaiting_confirmation, session.current_slot, session.slots, state, t]);

  const modeSwitch = (
    <div className="hm-mode" role="group" aria-label={t.switchLabel}>
      {(["audio", "chat"] as const).map((item) => (
        <button
          key={item}
          type="button"
          className={mode === item ? "active" : ""}
          aria-pressed={mode === item}
          onClick={() => void switchMode(item)}
        >
          <span aria-hidden="true">{item === "audio" ? "🎙" : "⌨"}</span> {item === "audio" ? t.audio : t.chat}
        </button>
      ))}
    </div>
  );

  const speedControl = mode === "audio" && (
    <div className="hm-speed" role="group" aria-label={t.speed}>
      <span>{t.speed}</span>
      {SPEEDS.map((value, index) => (
        <button
          key={value}
          type="button"
          className={speed === value ? "active" : ""}
          aria-pressed={speed === value}
          onClick={() => void patch({ speech_speed: value })}
        >
          {[t.slow, t.normal, t.fast][index]}
        </button>
      ))}
    </div>
  );

  const notices = (
    <>
      {!keyConfigured && mode === "audio" && <p className="hm-banner" role="alert">{t.voiceBanner}</p>}
      {voice.error && <p className="hm-error" role="alert">{voice.error}</p>}
      {voice.notice && <p className="hm-notice" role="status">{voice.notice}</p>}
      {voice.speechError && mode === "audio" && <p className="hm-error" role="status">{voice.speechError}</p>}
    </>
  );

  if (phase === "setup") {
    return (
      <section className="hm hm-setup" aria-labelledby="hm-title">
        <h1 id="hm-title">{t.setupTitle}</h1>
        <p className="hm-sub">{t.setupSub}</p>

        <div className="hm-block" role="group" aria-label={t.howTitle}>
          <h2>{t.howTitle}</h2>
          <div className="hm-choice">
            {(["audio", "chat"] as const).map((item) => (
              <button
                key={item}
                type="button"
                className={mode === item ? "active" : ""}
                aria-pressed={mode === item}
                onClick={() => void switchMode(item)}
              >
                <span className="hm-choice-icon" aria-hidden="true">{item === "audio" ? "🎙" : "⌨"}</span>
                <strong>{item === "audio" ? t.audio : t.chat}</strong>
                <small>{item === "audio" ? t.audioHint : t.chatHint}</small>
              </button>
            ))}
          </div>
          {speedControl}
        </div>

        <div className="hm-block" role="group" aria-label={t.cropQuestion}>
          <h2>{t.cropQuestion}</h2>
          <div className="hm-chips">
            {CROPS.map((item) => (
              <button
                key={item}
                type="button"
                className={crop === item ? "active" : ""}
                aria-pressed={crop === item}
                onClick={() => void patch({ crop: item })}
              >
                {cropChipNames[language][item]}
              </button>
            ))}
          </div>
          <small>{harvestHint(reportLanguage, crop)}</small>
        </div>

        <div className="hm-block" role="group" aria-label={t.purposeQuestion}>
          <h2>{t.purposeQuestion}</h2>
          <div className="hm-chips">
            {LOAN_PURPOSES.map((purpose) => (
              <button
                key={purpose}
                type="button"
                className={session.loan_purpose === purpose ? "active" : ""}
                aria-pressed={session.loan_purpose === purpose}
                onClick={() => void patch({ loan_purpose: purpose })}
              >
                {purposeNames[language][purpose]}
              </button>
            ))}
          </div>
        </div>

        {notices}
        <button className="start-conversation hm-start" type="button" onClick={() => void voice.beginConversation()} disabled={busy}>
          <span>{t.start}</span>
          <span aria-hidden="true">↗</span>
        </button>
        {mode === "audio" && <VoiceCheck language={language} />}
      </section>
    );
  }

  if (phase === "collect") {
    const lastIndex = session.messages.length - 1;
    return (
      <section className="hm hm-collect" aria-label={t.setupTitle}>
        <div className="hm-bar">
          {modeSwitch}
          {speedControl}
          {mode === "audio" && (
            <label className="hm-toggle">
              <input type="checkbox" checked={autoListen} onChange={(event) => setAutoListen(event.target.checked)} />
              <span>{t.autoListen}</span>
            </label>
          )}
          <span className="hm-progress" aria-live="polite">{t.progress(doneCount, slotEntries.length)}</span>
        </div>

        <article className="hm-chat" ref={chatRef}>
          <div className="hm-timeline" ref={timelineRef} role="log" aria-live="polite" aria-label={t.yourDetails}>
            {session.messages.map((message, index) => (
              <div className={`hm-turn ${message.role}`} key={`${index}-${message.role}`}>
                <span className="hm-who">{message.role === "assistant" ? t.assistant : t.farmer}</span>
                <p>{message.text}</p>
                {index === lastIndex && message.role === "assistant" && session.awaiting_confirmation && (
                  <small className="hm-pending">
                    {t.awaiting}: {slotNames[language][session.awaiting_confirmation.slot] ?? session.awaiting_confirmation.slot} —{" "}
                    {formatValue(session.awaiting_confirmation.slot, session.awaiting_confirmation.value, language)}
                  </small>
                )}
                {index === lastIndex && message.role === "assistant" && mode === "audio" && voice.speechClips.length > 0 && (
                  <button
                    type="button"
                    className="hm-link"
                    onClick={() => (voice.status === "speaking" ? voice.stopSpeech() : voice.replaySpeech())}
                  >
                    {voice.status === "speaking" ? `■ ${t.stopSound}` : `▶ ${t.replay}`}
                  </button>
                )}
              </div>
            ))}
            {voice.status === "processing" && (
              <div className="hm-working" role="status">
                <i /><i /><i />
                <span>{voice.activityLabel || t.working}</span>
              </div>
            )}
          </div>

          <div className="hm-dock">
            {notices}
            {quickReplies.length > 0 && (
              <div className="hm-quick" aria-label={t.suggested}>
                {quickReplies.map((reply) => (
                  <button key={reply.text} type="button" disabled={voice.status === "processing"} onClick={() => void answerNow(reply.value)}>
                    {reply.text}
                  </button>
                ))}
              </div>
            )}
            {voice.status === "transcript_review" && (
              <form className="hm-review" onSubmit={(event) => { event.preventDefault(); void voice.submitTranscript(); }}>
                <label htmlFor="hm-heard">{t.reviewLabel}</label>
                <textarea id="hm-heard" rows={2} value={voice.transcript} onChange={(event) => voice.editTranscript(event.target.value)} />
                <div>
                  <button type="submit" disabled={!voice.transcript.trim()}>{t.reviewSend}</button>
                  <button type="button" className="hm-ghost" onClick={voice.cancelTranscript}>{t.reviewCancel}</button>
                </div>
              </form>
            )}
            {mode === "audio" ? (
              <div className="hm-voice">
                <VoiceOrb
                  status={voice.status}
                  level={voice.microphoneLevel}
                  error=""
                  activityLabel={voice.activityLabel}
                  language={language}
                  onStart={voice.startRecording}
                  onStopRecording={voice.stopRecording}
                  onCancelRecording={voice.cancelRecording}
                  onInterrupt={voice.stopSpeech}
                  blocked={Boolean(session.chart_context_stale)}
                />
                <small>{t.tapToSpeak}</small>
              </div>
            ) : (
              <form className="hm-composer" onSubmit={(event) => void submitDraft(event)}>
                <label htmlFor="hm-draft">{t.typedLabel}</label>
                <div>
                  <input
                    id="hm-draft"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    placeholder={t.placeholder}
                    maxLength={4000}
                    autoComplete="off"
                    disabled={busy}
                  />
                  <button type="submit" disabled={busy || !draft.trim()}>{voice.status === "processing" ? "…" : t.send}</button>
                </div>
              </form>
            )}
          </div>
        </article>

        <details className="hm-details">
          <summary>{t.yourDetails}</summary>
          <dl>
            {slotEntries.map(([name, slot]) => {
              const pending = session.awaiting_confirmation?.slot === name;
              const label = pending ? t.awaiting : slot.status === "given" ? t.given : slot.status === "assumed" ? t.assumed : t.missing;
              const shown = pending || slot.status === "missing" || slot.value === null ? null : formatValue(name, slot.value, language);
              return (
                <div key={name}>
                  <dt>{slotNames[language][name] ?? name}</dt>
                  <dd>{shown ?? label} <span className={`hm-chip hm-chip-${pending ? "pending" : slot.status}`}>{label}</span></dd>
                </div>
              );
            })}
          </dl>
        </details>
      </section>
    );
  }

  // Results: the chat is gone. Three numbered steps, played by voice in audio mode.
  const explanation = voice.speechClips.filter((clip) => clip.label === "Explanation" || clip.label === "Simpler explanation");
  const question = clipIndex("Teach-back question");
  const lastAssistant = [...session.messages].reverse().find((message) => message.role === "assistant");
  const tabs: { id: Tab; label: string }[] = [
    { id: "key", label: t.keyTab },
    { id: "year", label: t.yearTab },
    { id: "check", label: t.checkTab },
  ];

  return (
    <section className="hm hm-done" aria-label={t.results}>
      <div className="hm-bar">
        {modeSwitch}
        {speedControl}
        <button type="button" className="hm-ghost" onClick={() => void startOver()}>{t.startOver}</button>
      </div>
      {notices}
      {flow && <p className="hm-auto" role="status">🔊 {t.auto}</p>}

      <div className="hm-tabs" role="tablist" aria-label={t.results}>
        {tabs.map((item, index) => (
          <button
            key={item.id}
            id={`hm-tab-${item.id}`}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            aria-controls={`hm-panel-${item.id}`}
            className={tab === item.id ? "active" : ""}
            onClick={() => takeOver(item.id)}
          >
            <b>{index + 1}</b> {item.label}
          </button>
        ))}
      </div>

      {tab === "key" && (
        <div id="hm-panel-key" role="tabpanel" aria-labelledby="hm-tab-key" className="hm-panel">
          <h2>{t.results}</h2>
          <p className="hm-sub">{t.resultsSub}</p>
          {result && <Results result={result} language={language} />}
          {explanation.length > 0 && (
            <div className="hm-say">
              <strong>{t.kuberketSays}</strong>
              {explanation.map((clip, index) => <p key={index}>{clip.text}</p>)}
              {mode === "audio" && (
                <button
                  type="button"
                  className="hm-link"
                  onClick={() => (voice.status === "speaking" ? voice.stopSpeech() : voice.playClipRange(0, question > 0 ? question - 1 : 0))}
                >
                  {voice.status === "speaking" ? `■ ${t.stopSound}` : `▶ ${t.replay}`}
                </button>
              )}
            </div>
          )}
          <button type="button" className="hm-next" onClick={() => takeOver("year")}>{t.nextYear}</button>
        </div>
      )}

      {tab === "year" && (
        <div id="hm-panel-year" role="tabpanel" aria-labelledby="hm-tab-year" className="hm-panel">
          {yearInputs ? (
            <YearPanel
              language={reportLanguage}
              reloadKey={JSON.stringify([yearInputs, reportLanguage])}
              load={(drop, signal) => getCashflow(yearInputs, drop, reportLanguage, signal)}
              speak={(speakMode, index, drop) => speakCashflow(yearInputs, drop, reportLanguage, speakMode, index, speed)}
              autoPlay={flow === "year"}
              onFinished={flow === "year" ? finishYear : undefined}
            />
          ) : (
            <p className="hm-sub">{language === "hi" ? "साल की कहानी के लिए कमाई और खर्च बताना ज़रूरी है।" : "The year story needs your income and costs."}</p>
          )}
          <button type="button" className="hm-next" onClick={() => takeOver("check")}>{t.nextCheck}</button>
        </div>
      )}

      {tab === "check" && (
        <div id="hm-panel-check" role="tabpanel" aria-labelledby="hm-tab-check" className="hm-panel">
          {state === "teach_back" ? (
            <>
              <h2>{t.checkTitle}</h2>
              <p className="hm-sub">{t.checkSub}</p>
              {lastAssistant && <p className="hm-question">{lastAssistant.text.split("\n").slice(-1)[0]}</p>}
              <div className="hm-answers">
                <button type="button" disabled={voice.status === "processing"} onClick={() => void answerNow(language === "hi" ? "हाँ, देनी होगी" : "Yes, still due")}>{t.yes}</button>
                <button type="button" disabled={voice.status === "processing"} onClick={() => void answerNow(language === "hi" ? "नहीं, माफ़ हो जाएगी" : "No, it is waived")}>{t.no}</button>
              </div>
              {mode === "audio" && (
                <div className="hm-voice">
                  <VoiceOrb
                    status={voice.status}
                    level={voice.microphoneLevel}
                    error=""
                    activityLabel={voice.activityLabel}
                    language={language}
                    onStart={voice.startRecording}
                    onStopRecording={voice.stopRecording}
                    onCancelRecording={voice.cancelRecording}
                    onInterrupt={voice.stopSpeech}
                  />
                  <small>{t.tapToSpeak}</small>
                </div>
              )}
              <button
                type="button"
                className="hm-ghost"
                disabled={voice.status === "processing"}
                onClick={() => void answerNow(language === "hi" ? "नहीं, फिर से समझाइए" : "No, explain again")}
              >
                {t.explainAgain}
              </button>
            </>
          ) : (
            <>
              <h2>{t.done}</h2>
              <p className="hm-sub">{t.doneSub}</p>
              {lastAssistant && <p className="hm-say">{lastAssistant.text}</p>}
              <div className="hm-answers">
                <button type="button" onClick={() => onOpenSection("schemes")}>{t.toSchemes}</button>
                <button type="button" onClick={() => onOpenSection("numbers")}>{t.toNumbers}</button>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
