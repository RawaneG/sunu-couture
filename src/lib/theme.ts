import { useCallback, useEffect, useState } from "react";

const DURATION = 620;
const EASING = "cubic-bezier(0.22, 1, 0.36, 1)";

export function useTheme() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("sunu-theme", dark ? "dark" : "light");
  }, [dark]);

  const toggle = useCallback((origin?: { x: number; y: number }) => {
    const next = !document.documentElement.classList.contains("dark");
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduceMotion) {
      document.documentElement.classList.toggle("dark", next);
      setDark(next);
      return;
    }

    const x = origin?.x ?? window.innerWidth / 2;
    const y = origin?.y ?? window.innerHeight / 2;
    const endRadius = Math.ceil(
      Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y))
    );
    const outgoingPaper = getComputedStyle(document.documentElement).getPropertyValue("--paper").trim();

    // Swap the real theme immediately (no browser snapshot step to wait on — that's
    // what caused the laggy start), then cover it with a plain, cheap-to-animate
    // overlay in the outgoing theme's color and shrink that overlay from full
    // coverage down to a point at the click origin. Since the DOM underneath is
    // already the new theme, the shrink genuinely reveals it growing from the button.
    document.documentElement.classList.toggle("dark", next);
    setDark(next);

    const overlay = document.createElement("div");
    overlay.setAttribute("aria-hidden", "true");
    Object.assign(overlay.style, {
      position: "fixed",
      inset: "0",
      zIndex: "2147483647",
      pointerEvents: "none",
      background: outgoingPaper,
      clipPath: `circle(${endRadius}px at ${x}px ${y}px)`,
    });
    document.body.appendChild(overlay);

    const anim = overlay.animate(
      [
        { clipPath: `circle(${endRadius}px at ${x}px ${y}px)` },
        { clipPath: `circle(0px at ${x}px ${y}px)` },
      ],
      { duration: DURATION, easing: EASING }
    );
    const cleanup = () => overlay.remove();
    anim.onfinish = cleanup;
    anim.oncancel = cleanup;
  }, []);

  return { dark, toggle };
}
