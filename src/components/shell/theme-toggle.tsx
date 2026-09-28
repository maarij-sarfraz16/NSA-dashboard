"use client";

import { useEffect, useState } from "react";

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

  function toggle() {
    const next: Theme = theme === "light" ? "dark" : "light";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    document.cookie = `theme=${next}; path=/; max-age=31536000; samesite=lax`;
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="rounded px-2 py-1 text-[12px] text-nav-ink hover:bg-nav-active hover:text-nav-ink-strong"
      aria-label={`Theme: ${LABEL[theme]}. Click to switch to ${LABEL[theme === "light" ? "dark" : "light"]}.`}
    >
      Theme: {LABEL[theme]}
    </button>
  );
}
