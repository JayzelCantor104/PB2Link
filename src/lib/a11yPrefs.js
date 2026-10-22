import { useEffect, useState } from 'react';

// Accessibility choices a visitor makes in the Accessibility menu
// (src/components/A11yMenu.jsx). Kept on this device only (localStorage);
// applied as attributes on <html> that src/styles/a11y.css reads, so every
// page and dialog follows them. public/emergency.html reads the text size too.

const KEY = 'pb2_a11y_prefs';

export const TEXT_SIZES = [
  { value: 'normal', label: 'Normal' },
  { value: 'large', label: 'Large' },
  { value: 'larger', label: 'Larger' },
];

export const DEFAULT_PREFS = { text: 'normal', contrast: false, motion: false, spacing: false, links: false };

export const loadPrefs = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { ...DEFAULT_PREFS, ...(saved && typeof saved === 'object' ? saved : {}) };
  } catch {
    return { ...DEFAULT_PREFS };
  }
};

/** Puts the choices on <html>: data-a11y-text plus a11y-* classes. */
export const applyPrefs = (prefs) => {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (prefs.text && prefs.text !== 'normal') root.setAttribute('data-a11y-text', prefs.text);
  else root.removeAttribute('data-a11y-text');
  root.classList.toggle('a11y-contrast', !!prefs.contrast);
  root.classList.toggle('a11y-reduce-motion', !!prefs.motion);
  root.classList.toggle('a11y-spacing', !!prefs.spacing);
  root.classList.toggle('a11y-links', !!prefs.links);
};

/** For main.jsx: apply the saved choices before the first render (no flash). */
export const applyStoredPrefs = () => applyPrefs(loadPrefs());

/** True when motion should stop: the device setting or the menu choice. */
export const prefersReducedMotion = () => (typeof window !== 'undefined')
  && (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    || document.documentElement.classList.contains('a11y-reduce-motion'));

const listeners = new Set();

/** [prefs, update(partial), reset()] shared by every component using it. */
export const useA11yPrefs = () => {
  const [prefs, setPrefs] = useState(loadPrefs);
  useEffect(() => {
    listeners.add(setPrefs);
    return () => { listeners.delete(setPrefs); };
  }, []);
  const commit = (next) => {
    applyPrefs(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // private mode: the choice lasts until the page is closed
    }
    listeners.forEach((fn) => fn(next));
  };
  const update = (partial) => commit({ ...loadPrefs(), ...partial });
  const reset = () => commit({ ...DEFAULT_PREFS });
  return [prefs, update, reset];
};
