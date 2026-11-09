import { useEffect, useRef, useState } from "react";

import farmerSrc from "../assets/hero-farmer.webp";
import salesSrc from "../assets/hero-sales.webp";
import { storyCopy } from "./copy";
import type { StoryLang } from "./copy";
import { useInView, usePrefersReducedMotion } from "./hooks";

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

const CYCLE_MS = 5200;

/**
 * The hero illustration: a farmer listens to KuberKet on his phone and ignores loan agents
 * shouting offers. Two cut-out layers move with the pointer at different depths (like the old coin),
 * the agents jostle, and their shouts get a calm reply. Stops while off-screen; still with reduced motion.
 */
export default function HeroScene({ lang = "hi" }: { lang?: StoryLang }) {
  const copy = storyCopy[lang].hero;
  const [stageRef, live] = useInView<HTMLDivElement>({ threshold: 0.05, rootMargin: "0px" });
  const reduced = usePrefersReducedMotion();
  const [turn, setTurn] = useState(0);
  const sceneRef = useRef<HTMLDivElement>(null);
  const moving = live && !reduced;

  // Pointer parallax: the agents drift one way, the farmer the other, the whole scene tilts slightly.
  useEffect(() => {
    const stage = stageRef.current;
    const scene = sceneRef.current;
    if (!moving || !stage || !scene) return;
    let frame = 0;
    let pending: { x: number; y: number } | null = null;
    const onMove = (event: PointerEvent) => {
      const box = stage.getBoundingClientRect();
      pending = {
        x: clamp((event.clientX - (box.left + box.width / 2)) / (window.innerWidth / 2), -1, 1),
        y: clamp((event.clientY - (box.top + box.height / 2)) / (window.innerHeight / 2), -1, 1),
      };
      if (!frame) {
        frame = requestAnimationFrame(() => {
          frame = 0;
          if (!pending) return;
          scene.style.setProperty("--mx", pending.x.toFixed(3));
          scene.style.setProperty("--my", pending.y.toFixed(3));
        });
      }
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [moving, stageRef]);

  // One shout and one reply at a time.
  useEffect(() => {
    if (!moving) return;
    const timer = window.setInterval(() => setTurn((n) => (n + 1) % copy.exchanges.length), CYCLE_MS);
    return () => window.clearInterval(timer);
  }, [moving, copy.exchanges.length]);

  const exchange = copy.exchanges[turn % copy.exchanges.length];
  const who = turn % 2 === 0 ? "man" : "woman";

  return (
    <div
      className="st-scene-stage"
      ref={stageRef}
      role="img"
      aria-label={copy.label}
    >
      <div className="st-scene" ref={sceneRef} data-paused={moving ? "false" : "true"}>
        <span className="st-scene-sun" aria-hidden="true" />
        <svg className="st-scene-field" viewBox="0 0 600 160" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0 70 Q150 40 300 62 T600 50 V160 H0 Z" fill="#0f3a2c" />
          <path d="M0 100 Q160 78 320 96 T600 88 V160 H0 Z" fill="#124634" />
          <g stroke="#1f6b4a" strokeWidth="2" fill="none" opacity="0.7">
            <path d="M0 122 Q300 102 600 118" />
            <path d="M0 142 Q300 124 600 140" />
          </g>
        </svg>

        <div className="st-scene-layer st-scene-sales" aria-hidden="true">
          <img src={salesSrc} alt="" draggable={false} />
        </div>
        <div className="st-scene-layer st-scene-farmer" aria-hidden="true">
          <img src={farmerSrc} alt="" draggable={false} />
          <span className="st-scene-phone-glow" />
        </div>

        <div className="st-scene-talk" key={`${lang}-${turn}`} aria-hidden="true">
          <p className={`st-shout st-shout-${who}`}>{exchange.shout}</p>
          <p className="st-reply">
            <span className="st-reply-mark">₹</span>
            {exchange.reply}
          </p>
        </div>
      </div>
    </div>
  );
}
