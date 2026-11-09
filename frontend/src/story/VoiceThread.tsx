import { useEffect, useState } from "react";

import { conversation, conversationEn } from "./content";
import { storyCopy } from "./copy";
import type { StoryLang } from "./copy";
import { useInView } from "./hooks";

type Props = { kist?: number; lang?: StoryLang };
type Lang = "hi" | "en";
type Line = { who: "ai" | "farmer"; text: string; seconds?: number };

const rupees = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

// Bar heights for the farmer's voice notes: fixed, so the page looks the same on every load.
const WAVE = [5, 9, 14, 8, 16, 11, 6, 13, 17, 9, 12, 7, 15, 10, 6, 11, 14, 8, 5, 9];

function threadFor(lang: Lang, kist?: number): Line[] {
  const c = lang === "hi" ? conversation : conversationEn;
  const lines: Line[] = [
    { who: "ai", text: `${c.welcome} ${c.firstQuestion}` },
    { who: "farmer", text: lang === "hi" ? "छह लाख रुपये" : "six lakh rupees", seconds: 2 },
    { who: "ai", text: c.readback },
    { who: "farmer", text: lang === "hi" ? "हाँ, सही है" : "yes", seconds: 1 },
    { who: "ai", text: c.nextQuestion },
  ];
  if (kist !== undefined) {
    const amount = rupees.format(Math.round(kist));
    lines.push({
      who: "ai",
      text: lang === "hi" ? `महीने की किस्त करीब ${amount} रुपये है। ${c.resultTail}` : `The monthly instalment is about ${amount} rupees. ${c.resultTail}`,
    });
  }
  return lines;
}

/** A sample conversation as voice notes: the farmer speaks, KuberKet answers in the same language. */
export default function VoiceThread({ kist, lang: pageLang = "hi" }: Props) {
  const [ref, shown] = useInView<HTMLDivElement>({ once: true, threshold: 0.2 });
  // The sample starts in the page's language; the switch lets you hear the same talk in the other one.
  const [lang, setLang] = useState<Lang>(pageLang);
  useEffect(() => setLang(pageLang), [pageLang]);
  const lines = threadFor(lang, kist);
  const t = storyCopy[pageLang].thread;

  return (
    <div className="st-thread" ref={ref} data-shown={shown ? "true" : "false"} lang={lang}>
      <div className="st-thread-head">
        <span className="st-thread-avatar" aria-hidden="true">₹</span>
        <div>
          <strong>{t.name}</strong>
          <small>{t.sub}</small>
        </div>
        <div className="st-thread-langs" role="group" aria-label={t.langGroup}>
          {(["hi", "en"] as const).map((code) => (
            <button key={code} type="button" aria-pressed={lang === code} onClick={() => setLang(code)}>
              {code === "hi" ? "हिंदी" : "English"}
            </button>
          ))}
        </div>
      </div>

      <ol className="st-thread-list" aria-label={t.listLabel} key={lang}>
        {lines.map((line, index) => (
          <li key={index} className={`st-note st-note-${line.who}`} style={{ ["--d" as string]: `${0.15 + index * 0.16}s` }}>
            {line.who === "farmer" ? (
              <>
                <span className="st-note-voice" aria-hidden="true">
                  <span className="st-note-play">▶</span>
                  <span className="st-note-wave">
                    {WAVE.map((height, bar) => <i key={bar} style={{ height }} />)}
                  </span>
                  <span className="st-note-time">0:0{line.seconds}</span>
                </span>
                <span className="st-note-text">{line.text}</span>
              </>
            ) : (
              <span className="st-note-text">{line.text}</span>
            )}
          </li>
        ))}
        {kist === undefined && (
          <li className="st-note-gap" aria-hidden="true">· · ·</li>
        )}
      </ol>
      <p className="st-thread-foot">{t.foot}</p>
    </div>
  );
}
