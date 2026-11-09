import { useState } from "react";

import { pipelineNodes, pipelineNodesEn } from "./content";
import { storyCopy } from "./copy";
import type { StoryLang } from "./copy";
import { useInView } from "./hooks";

/**
 * The voice-to-voice pipeline drawn as a loop: the farmer's voice goes in at the top and comes back
 * as voice at the end. A gold packet circles the ring while it is on screen; the middle explains
 * the chosen station.
 */
export default function Pipeline({ lang = "hi" }: { lang?: StoryLang }) {
  const [ref, live] = useInView<HTMLDivElement>({ threshold: 0.25 });
  const [activeId, setActiveId] = useState("engine");
  const nodes = lang === "hi" ? pipelineNodes : pipelineNodesEn;
  const active = nodes.find((node) => node.id === activeId) ?? nodes[0];
  const activeIndex = nodes.indexOf(active);
  const count = nodes.length;

  return (
    <div className="st-loop" ref={ref} data-live={live ? "true" : "false"}>
      <span className="st-loop-ring" aria-hidden="true" />
      <span className="st-loop-orbit" aria-hidden="true"><span className="st-loop-packet" /></span>

      <ol className="st-loop-list">
        {nodes.map((node, index) => {
          const angle = (index / count) * 2 * Math.PI - Math.PI / 2;
          return (
            <li
              key={node.id}
              className="st-loop-item"
              style={{
                ["--x" as string]: `${50 + 44 * Math.cos(angle)}%`,
                ["--y" as string]: `${50 + 44 * Math.sin(angle)}%`,
              }}
            >
              <button
                type="button"
                className={`st-station st-station-${node.kind}`}
                data-active={activeId === node.id ? "true" : "false"}
                aria-pressed={activeId === node.id}
                onMouseEnter={() => setActiveId(node.id)}
                onFocus={() => setActiveId(node.id)}
                onClick={() => setActiveId(node.id)}
              >
                <span className="st-station-step" aria-hidden="true">{index + 1}</span>
                <strong>{node.title}</strong>
                <small>{node.sub}</small>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="st-loop-core" role="status" aria-live="polite" aria-label={storyCopy[lang].pipelineStatus}>
        <span className="st-loop-count" aria-hidden="true">{activeIndex + 1} / {count}</span>
        <strong className="st-loop-title">{active.title}</strong>
        <p>{active.line}</p>
      </div>
    </div>
  );
}
