import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { MutableRefObject, ReactNode } from "react";

import type { CashflowReport, ReportLanguage, SpeechClip } from "../api";
import { usePrefersReducedMotion } from "../story/hooks";
import YearChart from "./YearChart";
import { money, monthLong, yearText } from "./text";
import "./year.css";

type Handle = { audio: HTMLAudioElement; finish: () => void };

function playClip(clip: SpeechClip, handle: MutableRefObject<Handle | null>): Promise<void> {
  return new Promise((resolve, reject) => {
    let url = "";
    try {
      const binary = atob(clip.audio_base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      url = URL.createObjectURL(new Blob([bytes], { type: clip.mime_type }));
    } catch (caught) {
      reject(caught);
      return;
    }
    const audio = new Audio(url);
    const release = () => {
      handle.current = null;
      URL.revokeObjectURL(url);
    };
    handle.current = {
      audio,
      finish: () => {
        audio.pause();
        release();
        resolve();
      },
    };
    audio.onended = () => {
      release();
      resolve();
    };
    audio.onerror = () => {
      release();
      reject(new Error("audio"));
    };
    audio.play().catch((caught: unknown) => {
      release();
      reject(caught);
    });
  });
}

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

type Props = {
  language: ReportLanguage;
  load: (drop: number, signal: AbortSignal) => Promise<CashflowReport>;
  /** Asks for one spoken sentence. The panel never has two of these in flight. */
  speak: (mode: "narration" | "answer", index: number, drop: number) => Promise<SpeechClip>;
  /** Change this to make the panel reload (for example when the farmer's numbers change). */
  reloadKey?: string;
  tag?: string;
  heading?: string;
  intro?: ReactNode;
  onLoaded?: (report: CashflowReport) => void;
  initialDrop?: number;
  /** Start the month-by-month story by itself as soon as the chart is ready (the audio walk-through). */
  autoPlay?: boolean;
  /** Called once when a Play run reaches December without being stopped. */
  onFinished?: () => void;
};

/**
 * "साल की कहानी": the 12-month chart, an income-drop slider, a Play button that walks month by month
 * while KuberKet reads engine-built sentences one at a time, and a way to ask about the chart.
 */
export default function YearPanel({ language, load, speak, reloadKey = "", tag, heading, intro, onLoaded, initialDrop = 0, autoPlay = false, onFinished }: Props) {
  const t = yearText[language];
  const reduced = usePrefersReducedMotion();
  const sliderId = useId();
  const [drop, setDrop] = useState(initialDrop);
  const [report, setReport] = useState<CashflowReport | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [month, setMonth] = useState(12);
  const [state, setState] = useState<"idle" | "playing" | "paused">("idle");
  const [caption, setCaption] = useState("");
  const [captionsOnly, setCaptionsOnly] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState<number | null>(null);
  const runId = useRef(0);
  const paused = useRef(false);
  const handle = useRef<Handle | null>(null);
  const onLoadedRef = useRef(onLoaded);
  onLoadedRef.current = onLoaded;
  const loadRef = useRef(load);
  loadRef.current = load;
  const onFinishedRef = useRef(onFinished);
  onFinishedRef.current = onFinished;
  const playRef = useRef<() => Promise<void>>(async () => {});
  const autoPlayedRef = useRef(false);

  const halt = useCallback(() => {
    runId.current += 1;
    paused.current = false;
    handle.current?.finish();
    setState("idle");
  }, []);

  useEffect(() => halt, [halt]);

  useEffect(() => {
    const controller = new AbortController();
    const wait = window.setTimeout(() => {
      loadRef
        .current(drop, controller.signal)
        .then((next) => {
          setReport(next);
          setError(false);
          onLoadedRef.current?.(next);
        })
        .catch((caught: unknown) => {
          if (caught instanceof DOMException && caught.name === "AbortError") return;
          setError(true);
        });
    }, 120);
    return () => {
      window.clearTimeout(wait);
      controller.abort();
    };
  }, [drop, reloadKey, attempt]);

  const changeDrop = (value: number) => {
    halt();
    setCaption("");
    setMonth(12);
    setAnswer(null);
    setDrop(value);
  };

  const failVoice = (caught: unknown) => {
    setCaptionsOnly(caught instanceof Error && caught.message && caught.message !== "audio" ? caught.message : t.captionsOnly);
  };

  const play = async () => {
    if (!report) return;
    halt();
    const token = runId.current;
    const alive = () => runId.current === token;
    const hold = async (ms: number) => {
      let left = ms;
      while (left > 0 && alive()) {
        if (!paused.current) left -= 100;
        await sleep(100);
      }
    };
    setState("playing");
    setCaptionsOnly(null);
    setAsking(false);
    setCaption("");
    setMonth(0);
    let voice = true;
    for (let current = 1; current <= 12 && alive(); current += 1) {
      setMonth(current);
      const items = report.narration.map((item, index) => ({ ...item, index })).filter((item) => item.at_month === current);
      for (const item of items) {
        if (!alive()) return;
        setCaption(item.text);
        if (voice) {
          try {
            const clip = await speak("narration", item.index, drop);
            if (!alive()) return;
            await playClip(clip, handle);
          } catch (caught) {
            voice = false;
            failVoice(caught);
            if (!alive()) return;
            await hold(readTime(item.text, reduced));
          }
        } else {
          await hold(readTime(item.text, reduced));
        }
        if (!alive()) return;
      }
      await hold(reduced ? 250 : 650);
    }
    if (alive()) {
      setState("idle");
      setMonth(12);
      onFinishedRef.current?.();
    }
  };
  playRef.current = play;

  useEffect(() => {
    if (!autoPlay || !report || autoPlayedRef.current) return;
    autoPlayedRef.current = true;
    void playRef.current();
  }, [autoPlay, report]);

  const togglePause = () => {
    if (state === "playing") {
      paused.current = true;
      handle.current?.audio.pause();
      setState("paused");
    } else if (state === "paused") {
      paused.current = false;
      void handle.current?.audio.play().catch(() => handle.current?.finish());
      setState("playing");
    }
  };

  const stop = () => {
    halt();
    setCaption("");
    setMonth(12);
  };

  const listenToAnswer = async (index: number) => {
    if (!report) return;
    halt();
    setCaptionsOnly(null);
    try {
      const clip = await speak("answer", index, drop);
      await playClip(clip, handle);
    } catch (caught) {
      failVoice(caught);
    }
  };

  const scenario = report?.selected;
  const names = monthLong[language];
  const current = useMemo(() => (scenario && month >= 1 ? scenario.rows[Math.min(month, 12) - 1] : null), [scenario, month]);
  const finished = state === "idle" && month >= 12;
  const lowestRow = scenario ? scenario.rows[scenario.lowest_month_index - 1] : null;

  return (
    <div className="yr" data-language={language}>
      <div className="yr-head">
        <div>
          {tag && <p className="yr-tag">{tag}</p>}
          <h3>{heading ?? t.title}</h3>
          {intro}
        </div>
        {report && report.monthly_kist > 0 && (
          <dl className="yr-kist">
            <dt>{language === "hi" ? "महीने की किस्त" : "Monthly instalment"}</dt>
            <dd>{money(report.monthly_kist)}</dd>
          </dl>
        )}
      </div>

      <div className="yr-controls">
        <label htmlFor={sliderId}>
          {t.dropBefore} <strong>{drop}%</strong> {t.dropAfter}
        </label>
        <input
          id={sliderId}
          type="range"
          min={0}
          max={60}
          step={5}
          value={drop}
          onChange={(event) => changeDrop(Number(event.target.value))}
          aria-valuetext={t.dropValue(drop)}
        />
        <div className="yr-buttons">
          {state === "idle" ? (
            <button type="button" className="yr-btn yr-btn-primary" onClick={() => void play()} disabled={!report}>
              {t.play}
            </button>
          ) : (
            <>
              <button type="button" className="yr-btn yr-btn-primary" onClick={togglePause}>
                {state === "playing" ? t.pause : t.resume}
              </button>
              <button type="button" className="yr-btn yr-btn-ghost" onClick={stop}>
                {t.stop}
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="yr-error" role="alert">
          <p>{t.error}</p>
          <button type="button" className="yr-btn yr-btn-ghost" onClick={() => setAttempt((n) => n + 1)}>
            {t.retry}
          </button>
        </div>
      )}
      {!report && !error && <p className="yr-loading">{t.loading}</p>}

      {report && scenario && (
        <>
          <YearChart
            report={report}
            scenario={scenario}
            language={language}
            shown={month}
            highlight={state === "idle" ? null : month}
          />

          <p className="yr-risky">{report.risky_sentence}</p>

          <div className="yr-cash" aria-live={state === "playing" ? "off" : "polite"}>
            <span>
              {finished
                ? t.cashEnd
                : `${t.cash} · ${current ? names[current.calendar_month - 1] : ""}`}
            </span>
            {/* Before the first month of a Play run there is no balance yet: show a dash, not a false ₹0. */}
            {finished || current ? (
              <strong data-tone={(finished ? scenario.ending_balance : current!.balance) < 0 ? "negative" : "positive"}>
                {money(finished ? scenario.ending_balance : current!.balance)}
              </strong>
            ) : (
              <strong>—</strong>
            )}
            {lowestRow && (
              <small>{t.lowest(money(scenario.lowest_balance), names[lowestRow.calendar_month - 1])}</small>
            )}
          </div>

          {caption && <p className="yr-caption" aria-live="polite">{caption}</p>}
          {captionsOnly && <p className="yr-fallback" role="status">{captionsOnly}</p>}

          <div className="yr-ask">
            <button
              type="button"
              className="yr-btn yr-btn-ghost"
              aria-expanded={asking}
              onClick={() => {
                setAsking((open) => !open);
                setAnswer(null);
              }}
            >
              {asking ? t.askClose : t.ask}
            </button>
            {asking && (
              <div className="yr-questions">
                <ul>
                  {report.answers.map((item, index) => (
                    <li key={item.question}>
                      <button type="button" className="yr-q" aria-pressed={answer === index} onClick={() => setAnswer(index)}>
                        {item.question}
                      </button>
                    </li>
                  ))}
                </ul>
                {answer !== null && (
                  <div className="yr-answer" aria-live="polite">
                    <p>{report.answers[answer].answer}</p>
                    <button type="button" className="yr-btn yr-btn-ghost" onClick={() => void listenToAnswer(answer)}>
                      {t.listen}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <p className="yr-note">{t.noteCrop} {t.notAForecast}</p>
          <details className="yr-assume">
            <summary>{t.assumptions}</summary>
            <ul>{report.assumptions.map((item) => <li key={item}>{item}</li>)}</ul>
          </details>
        </>
      )}
    </div>
  );
}

function readTime(text: string, reduced: boolean): number {
  const base = Math.min(7000, Math.max(2200, text.length * 55));
  return reduced ? base / 2 : base;
}
