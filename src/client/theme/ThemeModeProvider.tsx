import { useCallback, useState, type ReactNode } from "react";
import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import {
  ThemeModeContext,
  type ThemeMode,
} from "~/client/theme/themeModeContextValue";

const STORAGE_KEY = "theme";

// Explicit choice (localStorage) wins over the OS preference, which is only
// consulted once on first load — matching the same resolution order and
// persistence key as the sproutly app's theme provider.
function resolveInitialMode(): ThemeMode {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "dark" || saved === "light") return saved;
    if (window.matchMedia("(prefers-color-scheme: dark)").matches)
      return "dark";
  } catch {
    // localStorage unavailable (e.g. private browsing restrictions)
  }
  return "light";
}

export function ThemeModeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(resolveInitialMode);

  const toggle = useCallback(() => {
    setMode((prev) => {
      const next: ThemeMode = prev === "light" ? "dark" : "light";
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // ignore — toggle still works for the current session
      }
      return next;
    });
  }, []);

  const theme = createTheme({ palette: { mode } });

  return (
    <ThemeModeContext.Provider value={{ mode, toggle }}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ThemeModeContext.Provider>
  );
}
