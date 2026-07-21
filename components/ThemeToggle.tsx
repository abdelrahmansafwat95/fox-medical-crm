"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

const KEY = "foxmed_theme";

/** Dark-mode switch. Toggles the `dark` class on <html> and persists the
 *  choice to localStorage (read by the no-flash script in the root layout).
 *  `variant="sidebar"` = full-width labelled row (navy sidebar);
 *  `variant="icon"` = compact icon button (light top bar). */
export default function ThemeToggle({ variant = "sidebar" }: { variant?: "sidebar" | "icon" }) {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem(KEY, next ? "dark" : "light");
    } catch {
      /* ignore storage failures (private mode etc.) */
    }
    setDark(next);
  }

  if (variant === "icon") {
    return (
      <button
        onClick={toggle}
        aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
        className="p-2 rounded-lg text-slate-500 hover:bg-slate-100"
      >
        {dark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
      </button>
    );
  }

  return (
    <button
      onClick={toggle}
      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-slate-300 hover:bg-white/10 hover:text-white transition"
    >
      {dark ? <Sun className="w-4 h-4 shrink-0" /> : <Moon className="w-4 h-4 shrink-0" />}
      <span className="flex-1 text-left">{dark ? "Light mode" : "Dark mode"}</span>
    </button>
  );
}
