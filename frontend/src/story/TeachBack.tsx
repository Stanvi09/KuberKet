import { useState } from "react";

import { teachBack, teachBackEn } from "./content";
import { storyCopy } from "./copy";
import type { StoryLang } from "./copy";

type Stage = "ask" | "retry" | "pass" | "finish";


/** The Teach-Back check, replayed with the exact words the app uses. */
export default function TeachBack({ lang = "hi" }: { lang?: StoryLang }) {
  const lines = lang === "hi" ? teachBack : teachBackEn;
  const t = storyCopy[lang].teach;
  const answers = [
    { id: "yes", label: t.yes },
    { id: "no", label: t.no },
  ] as const;
  const [stage, setStage] = useState<Stage>("ask");

  const answer = (id: "yes" | "no") => {
    if (id === "yes") setStage("pass");
    else setStage(stage === "ask" ? "retry" : "finish");
  };
  const asking = stage === "ask" || stage === "retry";

  return (
    <div className="st-teach" data-stage={stage}>
      <p className="st-teach-tag">{t.tag}</p>
      <p className="st-teach-q">{stage === "retry" ? lines.retryQuestion : lines.question}</p>

      {asking && (
        <div className="st-teach-answers" role="group" aria-label={t.answerGroup}>
          {answers.map((item) => (
            <button key={item.id} type="button" className="st-answer" onClick={() => answer(item.id)}>
              {item.label}
            </button>
          ))}
        </div>
      )}

      <div className="st-teach-result" role="status" aria-live="polite">
        {stage === "retry" && (
          <div className="st-teach-bubble st-teach-kind">
            <span aria-hidden="true">🏪</span>
            <p>{lines.retry}</p>
          </div>
        )}
        {stage === "pass" && (
          <div className="st-teach-bubble st-teach-good">
            <span aria-hidden="true">✓</span>
            <p>{lines.pass}</p>
          </div>
        )}
        {stage === "finish" && (
          <div className="st-teach-bubble st-teach-kind">
            <span aria-hidden="true">🤝</span>
            <p>{lines.finish}</p>
          </div>
        )}
      </div>

      {!asking && (
        <button type="button" className="st-btn st-btn-ghost" onClick={() => setStage("ask")}>
          {t.again}
        </button>
      )}
    </div>
  );
}
