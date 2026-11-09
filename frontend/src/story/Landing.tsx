import { useCallback, useEffect, useRef, useState } from "react";
import type { MouseEvent } from "react";

import "@fontsource/baloo-2/devanagari-800.css";
import "@fontsource/noto-sans-devanagari/devanagari-400.css";
import "@fontsource/noto-sans-devanagari/devanagari-600.css";
import "./story.css";

import type { DemoYear } from "../api";
import HeroScene from "./HeroScene";
import Pipeline from "./Pipeline";
import Reveal from "./Reveal";
import TeachBack from "./TeachBack";
import VoiceThread from "./VoiceThread";
import YearDiary from "./YearDiary";
import YearStory from "./YearStory";
import { storyCopy } from "./copy";
import type { Heading, StoryLang } from "./copy";
import { usePrefersReducedMotion } from "./hooks";

type Props = {
  /** Open the existing Home. */
  onOpenApp: () => void;
  /** Open Home and start the spoken conversation. */
  onStartVoice: () => void;
  /** Skip the story. */
  onSkip: () => void;
  /** Number of automatic tests, shown as "N+". Keep it at or below the real count. */
  testCount?: number;
  /** The page language; it follows the app's language. */
  language?: StoryLang;
  /** Called when the reader switches language on the story page. */
  onLanguageChange?: (language: StoryLang) => void;
};

/** A heading with its one gold word. */
function Title({ id, text }: { id: string; text: Heading }) {
  return <span id={id}>{text.before}<em>{text.em}</em>{text.after}</span>;
}

const stepIcons = [
   <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.9V21h2v-2.1A7 7 0 0 0 19 12h-2Z" /></svg>,

   <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm1 3v3h12V6H6Zm1 5v2h2v-2H7Zm4 0v2h2v-2h-2Zm4 0v2h2v-2h-2ZM7 15v2h2v-2H7Zm4 0v2h2v-2h-2Zm4 0v2h2v-2h-2Z" /></svg>,

   <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10v4h4l5 4V6L7 10H3Zm13.5 2a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4ZM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6Z" /></svg>,
];

export default function Landing({ onOpenApp, onStartVoice, onSkip, testCount = 115, language = "hi", onLanguageChange }: Props) {
  const lang: StoryLang = language;
  const t = storyCopy[lang];
  const navLinks = [
    { id: "st-how", label: t.nav.how },
    { id: "st-pipeline", label: t.nav.pipeline },
    { id: "st-year", label: t.nav.year },
    { id: "st-teach", label: t.nav.teach },
  ];
  const rootRef = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();
  const [demo, setDemo] = useState<DemoYear | null>(null);
  const kist = demo?.monthly_kist;

  const ledger = t.ledger(testCount);

  // Dark page background even when the browser overscrolls; reveal styles only apply once JS runs.
  useEffect(() => {
    const html = document.documentElement;
    html.classList.add("st-active");
    rootRef.current?.classList.add("st-js");
    return () => html.classList.remove("st-active");
  }, []);

  // Scroll progress. Browsers with scroll-driven animations draw it in CSS; this is the fallback.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      root.style.setProperty("--st-progress", String(max > 0 ? Math.min(1, window.scrollY / max) : 0));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  const scrollTo = useCallback(
    (id: string) => {
      const target = document.getElementById(id);
      if (!target) return;
      target.scrollIntoView?.({ behavior: reduced ? "auto" : "smooth", block: "start" });
      target.focus({ preventScroll: true });
    },
    [reduced],
  );

  const jump = (id: string) => (event: MouseEvent) => {
    event.preventDefault();
    scrollTo(id);
  };

  const onLoaded = useCallback((data: DemoYear) => setDemo(data), []);

  return (
    <div className="st-root" ref={rootRef} lang={lang}>
      <a className="st-skip-link" href="#st-main" onClick={jump("st-main")}>{t.skipLink}</a>

      <header className="st-nav">
        <div className="st-nav-inner">
          <a className="st-brand" href="#st-top" onClick={jump("st-top")} aria-label={t.brandLabel}>
            <span className="st-brand-mark" aria-hidden="true">₹</span>
            <strong>KuberKet</strong>
          </a>
          <nav className="st-nav-links" aria-label={t.navLabel}>
            {navLinks.map((link) => (
              <a key={link.id} href={`#${link.id}`} onClick={jump(link.id)}>{link.label}</a>
            ))}
          </nav>
          <div className="st-nav-actions">
            <div className="st-lang" role="group" aria-label={t.languageLabel}>
              {(["hi", "en"] as const).map((code) => (
                <button key={code} type="button" lang={code} aria-pressed={lang === code} onClick={() => onLanguageChange?.(code)}>
                  {code === "hi" ? "हिंदी" : "English"}
                </button>
              ))}
            </div>
            <button type="button" className="st-link-button" onClick={onSkip}>{t.skip}</button>
            <button type="button" className="st-btn st-btn-gold st-btn-small" onClick={onOpenApp}>{t.openApp}</button>
          </div>
        </div>
        <div className="st-progress" aria-hidden="true"><span /></div>
      </header>

      <main id="st-main" tabIndex={-1}>
        {/* 1. Hero */}
        <section className="st-hero" id="st-top" tabIndex={-1} aria-labelledby="st-hero-title">
          <div className="st-wrap st-hero-grid">
            <div className="st-hero-copy">
              <p className="st-badge"><span className="st-badge-dot" aria-hidden="true" />{t.badge}</p>
              <h1 id="st-hero-title" className="st-display">{t.heroTitle.before}<em>{t.heroTitle.em}</em>{t.heroTitle.after}</h1>
              <p className="st-lead">{t.heroLead}</p>
              <div className="st-cta-row">
                <button type="button" className="st-btn st-btn-gold" onClick={onStartVoice}>
                  <span aria-hidden="true">🎙</span> {t.startVoice}
                </button>
                <button type="button" className="st-btn st-btn-ghost" onClick={() => scrollTo("st-year")}>{t.seeDemo}</button>
              </div>
            </div>
            <div className="st-hero-scene"><HeroScene lang={lang} /></div>
          </div>
          <button type="button" className="st-scroll-cue" onClick={() => scrollTo("st-stats")} aria-label={t.scrollCue}>
            <span aria-hidden="true">↓</span>
          </button>
        </section>

        {/* 2. Trust: a ledger of promises */}
        <section className="st-section" id="st-stats" tabIndex={-1} aria-labelledby="st-stats-title">
          <div className="st-wrap">
            <Reveal as="h2" className="st-h2"><Title id="st-stats-title" text={t.trustTitle} /></Reveal>
            <Reveal className="st-ledger">
              <div className="st-ledger-head" aria-hidden="true">
                {t.ledgerHead.map((cell) => <span key={cell}>{cell}</span>)}
              </div>
              <ol className="st-ledger-rows">
                {ledger.map((row) => (
                  <li key={row.what} className="st-ledger-row">
                    <span className="st-ledger-what">
                      <strong>{row.what}</strong>
                      <span>{row.detail}</span>
                    </span>
                    <span className="st-ledger-entry">{row.entry}</span>
                  </li>
                ))}
              </ol>
              <span className="st-ledger-stamp" aria-hidden="true">{t.stamp}</span>
            </Reveal>
          </div>
        </section>

        {/* 3. How it works */}
        <section className="st-section" id="st-how" tabIndex={-1} aria-labelledby="st-how-title">
          <div className="st-wrap">
            <Reveal as="h2" className="st-h2"><Title id="st-how-title" text={t.howTitle} /></Reveal>
            <ol className="st-rows">
              {t.steps.map((step, index) => (
                <Reveal as="li" key={step.title} className="st-row" delay={index * 0.08}>
                  <span className="st-row-num" aria-hidden="true">0{index + 1}</span>
                  <h3 className="st-row-verb"><span className="st-row-icon">{stepIcons[index]}</span>{step.title}</h3>
                  <p>{step.text}</p>
                </Reveal>
              ))}
            </ol>
          </div>
        </section>

        {/* 4. Pipeline */}
        <section className="st-section" id="st-pipeline" tabIndex={-1} aria-labelledby="st-pipe-title">
          <div className="st-wrap">
            <Reveal as="h2" className="st-h2"><Title id="st-pipe-title" text={t.pipelineTitle} /></Reveal>
            <Reveal as="p" className="st-section-lead">
              {t.pipelineLead}
            </Reveal>
            <Pipeline lang={lang} />
          </div>
        </section>

        {/* 5. Year story */}
        <section className="st-section" id="st-year" tabIndex={-1} aria-labelledby="st-year-title">
          <div className="st-wrap">
            <Reveal as="h2" className="st-h2"><Title id="st-year-title" text={t.yearTitle} /></Reveal>
            <Reveal as="p" className="st-section-lead">
              {t.yearLead}
            </Reveal>
            <div className="st-year-grid">
              <Reveal><YearDiary report={demo} lang={lang} /></Reveal>
              <Reveal className="st-card"><YearStory onLoaded={onLoaded} lang={lang} /></Reveal>
            </div>
          </div>
        </section>

        {/* 6. Teach-Back: a chalkboard */}
        <section className="st-section" id="st-teach" tabIndex={-1} aria-labelledby="st-teach-title">
          <div className="st-wrap">
            <Reveal as="h2" className="st-h2"><Title id="st-teach-title" text={t.teachTitle} /></Reveal>
            <Reveal as="p" className="st-section-lead">
              {t.teachLead}
            </Reveal>
            <Reveal className="st-board"><TeachBack key={lang} lang={lang} /></Reveal>
          </div>
        </section>

        {/* 7. Chat in your language */}
        <section className="st-section" id="st-phone" tabIndex={-1} aria-labelledby="st-phone-title">
          <div className="st-wrap st-split st-split-reverse">
            <VoiceThread kist={kist} lang={lang} />
            <div>
              <Reveal as="h2" className="st-h2"><Title id="st-phone-title" text={t.chatTitle} /></Reveal>
              <Reveal as="p" className="st-section-lead">
                {t.chatLead}
              </Reveal>
              <Reveal className="st-cta-row" delay={0.1}>
                <button type="button" className="st-btn st-btn-gold" onClick={onStartVoice}>
                  <span aria-hidden="true">🎙</span> {t.startVoice}
                </button>
              </Reveal>
            </div>
          </div>
        </section>

        {/* 8. Trust */}
        <section className="st-section st-trust" aria-label={t.trustLabel}>
          <div className="st-wrap">
            <ul className="st-trust-strip">
              {t.trustStrip.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
        </section>
      </main>

      <footer className="st-footer">
        <div className="st-wrap st-footer-grid">
          <div>
            <p className="st-footer-brand"><span className="st-brand-mark" aria-hidden="true">₹</span> KuberKet</p>
            <p className="st-footer-line">{t.footerLine}</p>
            <p className="st-footer-small">{t.footerSmall}</p>
          </div>
          <div className="st-footer-side">
            <p className="st-badge"><span className="st-badge-dot" aria-hidden="true" />{t.badge}</p>
            <button type="button" className="st-btn st-btn-gold" onClick={onOpenApp}>{t.openApp}</button>
          </div>
        </div>
      </footer>
    </div>
  );
}
