import { createContext, useContext, useState, useEffect } from 'react';
import { lightColors, darkColors, font } from '../styles/theme';

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [mode, setMode] = useState('light'); // default before we know the saved preference
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('yt_autopost_theme') : null;
    if (saved === 'dark' || saved === 'light') {
      setMode(saved);
    } else if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
      setMode('dark'); // fall back to the OS/browser preference if nothing saved yet
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem('yt_autopost_theme', mode);
    document.body.style.background = mode === 'dark' ? darkColors.bg : lightColors.bg;
    document.body.style.color = mode === 'dark' ? darkColors.text : lightColors.text;
  }, [mode, ready]);

  const colors = mode === 'dark' ? darkColors : lightColors;
  const toggle = () => setMode((m) => (m === 'dark' ? 'light' : 'dark'));

  return (
    <ThemeContext.Provider value={{ mode, colors, font, toggle, ready }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
