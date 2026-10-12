"use client";

import { useEffect, useRef, useState } from "react";
import { setTheme as setThemeAction } from "@/app/actions";

export type Theme = "light" | "dark";
const LABEL: Record<Theme, string> = { light: "Light", dark: "Dark" };

/**
 * `initial` is the saved cookie theme, or null on a first visit — the page then
 * renders with the OS preference (CSS), and we read it here after mount.
 */
export function ThemeToggle({ initial }: { initial: Theme | null }) {
  const [theme, setTheme] = useState<Theme>(initial ?? "light");

  useEffect(() => {
    if (initial === null && window.matchMedia("(prefers-color-scheme: dark)").matches) setTheme("dark");
  }, [initial]);

  // the value the click is switching to, fixed at click time (state changes before the form submits)
  const clicked = useRef<Theme | null>(null);
  const next: Theme = theme === "light" ? "dark" : "light";

  // The server action (cookie + re-render) is the source of truth and works even before
  // hydration; the click handler just applies the change instantly.
  return (
    <form action={() => setThemeAction(clicked.current ?? next)}>
      <button
        type="submit"
        onClick={() => {
          clicked.current = next;
          setTheme(next);
          document.documentElement.dataset.theme = next;
        }}
        className="rounded px-2 py-1 text-[12px] text-nav-ink hover:bg-nav-active hover:text-nav-ink-strong"
        aria-label={`Theme: ${LABEL[theme]}. Click to switch to ${LABEL[next]}.`}
      >
        Theme: {LABEL[theme]}
      </button>
    </form>
  );
}
