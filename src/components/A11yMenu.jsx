import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { TEXT_SIZES, useA11yPrefs } from '../lib/a11yPrefs';

// Accessibility menu on every resident page: text size, high contrast,
// reduce motion, easier reading and underlined links, remembered on this
// device (src/lib/a11yPrefs.js). A small panel, not a full-screen dialog:
// focus moves into it, Escape or the close button closes it, and focus
// returns to the button.
const OPTIONS = [
  { key: 'contrast', label: 'High contrast', hint: 'Stronger colours and darker text.' },
  { key: 'motion', label: 'Reduce motion', hint: 'Stops animations and moving backgrounds.' },
  { key: 'spacing', label: 'Easier reading', hint: 'More space between lines, letters and words.' },
  { key: 'links', label: 'Underline links', hint: 'Shows which words are links.' },
];

const A11yMenu = () => {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [prefs, update, reset] = useA11yPrefs();
  const panelRef = useRef(null);
  const buttonRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    // Start on the current text size, not the close button.
    (panelRef.current?.querySelector('button[aria-pressed="true"]') || panelRef.current?.querySelector('input'))?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onClickAway = (e) => {
      if (!panelRef.current?.contains(e.target) && !buttonRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClickAway);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClickAway);
    };
  }, [open]);

  // Staff screens and the sign-in pages for staff have their own layout.
  if (pathname.startsWith('/admin') || pathname === '/setup-password') return null;

  const close = () => { setOpen(false); buttonRef.current?.focus(); };
  const changed = prefs.text !== 'normal' || OPTIONS.some((o) => prefs[o.key]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="a11y-fab"
        aria-label="Accessibility options"
        aria-expanded={open}
        aria-controls="pb2-a11y-panel"
        title="Accessibility options"
        onClick={() => setOpen((v) => !v)}
      >
        <i className="bi bi-universal-access-circle" aria-hidden="true"></i>
      </button>

      {open && (
        <div id="pb2-a11y-panel" ref={panelRef} className="a11y-panel" role="dialog" aria-labelledby="pb2-a11y-title">
          <button type="button" className="a11y-close" aria-label="Close" onClick={close}>
            <i className="bi bi-x-lg" aria-hidden="true"></i>
          </button>
          <h2 id="pb2-a11y-title"><i className="bi bi-universal-access" aria-hidden="true"></i> Accessibility</h2>
          <p>Saved on this device. You can also zoom with your browser (Ctrl and +, or pinch).</p>

          <fieldset className="a11y-group">
            <legend>Text size</legend>
            <div className="a11y-sizes">
              {TEXT_SIZES.map((s) => (
                <button key={s.value} type="button" aria-pressed={prefs.text === s.value} onClick={() => update({ text: s.value })}>
                  {s.label}
                </button>
              ))}
            </div>
          </fieldset>

          {OPTIONS.map((o) => (
            <label key={o.key} className="a11y-toggle">
              <input type="checkbox" checked={!!prefs[o.key]} onChange={(e) => update({ [o.key]: e.target.checked })} />
              <span>
                {o.label}
                <small>{o.hint}</small>
              </span>
            </label>
          ))}

          <div className="a11y-panel-foot">
            <Link to="/accessibility" onClick={() => setOpen(false)}>About accessibility</Link>
            {changed && <button type="button" className="a11y-reset" onClick={reset}>Reset</button>}
          </div>
        </div>
      )}
    </>
  );
};

export default A11yMenu;
