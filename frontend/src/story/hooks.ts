import { useEffect, useRef, useState } from "react";

const hasObserver = () => typeof IntersectionObserver !== "undefined";

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false,
  );
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);
  return reduced;
}

type Options = { threshold?: number; rootMargin?: string; once?: boolean };

/**
 * True while the element is on screen. Without IntersectionObserver
 * (old browsers, tests) everything counts as visible, so no content is
 * ever left hidden.
 */
export function useInView<T extends Element>({
  threshold = 0.2,
  rootMargin = "0px 0px -8% 0px",
  once = false,
}: Options = {}) {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(() => !hasObserver());

  useEffect(() => {
    const element = ref.current;
    if (!element || !hasObserver()) {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          if (once) observer.disconnect();
        } else if (!once) {
          setInView(false);
        }
      },
      { threshold, rootMargin },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [threshold, rootMargin, once]);

  return [ref, inView] as const;
}
