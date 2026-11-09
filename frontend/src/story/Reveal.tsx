import { createElement } from "react";
import type { ReactNode } from "react";

import { useInView } from "./hooks";

type Props = {
  as?: "div" | "li" | "article" | "p" | "h2" | "section";
  className?: string;
  /** Stagger in seconds. */
  delay?: number;
  children: ReactNode;
};

/** Fades and lifts its children in once, the first time they scroll into view. */
export default function Reveal({ as = "div", className = "", delay = 0, children }: Props) {
  const [ref, shown] = useInView<HTMLElement>({ once: true });
  return createElement(
    as,
    {
      ref,
      className: `st-reveal ${className}`.trim(),
      "data-shown": shown ? "true" : "false",
      style: delay ? { transitionDelay: `${delay}s` } : undefined,
    },
    children,
  );
}
