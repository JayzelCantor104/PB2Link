import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import '../styles/form-draft.css';
import { ADMIN_FORM_DRAFT_PREFIX as ADMIN_PREFIX, FORM_DRAFT_PREFIX as PREFIX } from './formDraftStore';

// Auto-saves a request form while the resident fills it in, so a refresh, the
// Back button or a slip of the finger doesn't lose their answers.
//
// - Saved in sessionStorage: it survives a refresh and leaving and coming back
//   in the same tab, but not closing the tab, and it never leaves the browser.
//   One draft per signed-in resident (or staff member, owner: 'admin') and
//   form; cleared on sign-out
//   (clearAllFormDrafts in formDraftStore.js, called by AuthContext) and once the request is submitted.
// - Only after the resident types or picks something, so the profile data the
//   form fills in on its own never counts as a draft.
// - Files can't be stored in the browser: photos and documents are left out,
//   and the notice asks to attach them again.
//
// const draft = useFormDraft('clearance', { formData, requestMode, currentStep }, (d) => { ... });
// render {draft.notice}; call draft.clear() after a successful submit.

const MAX_AGE_MS = 12 * 60 * 60 * 1000; // a day-old half-finished form is stale
const REBASE = '__rebase__'; // baseline marker after a save

const isFile = (v) => (typeof File !== 'undefined' && v instanceof File) || (typeof Blob !== 'undefined' && v instanceof Blob);

// Copy without File / Blob values; counts what was left out.
const stripFiles = (value, dropped) => {
  if (isFile(value)) { dropped.n += 1; return null; }
  if (typeof value === 'string' && value.startsWith('blob:')) return null; // previews die with the page
  if (Array.isArray(value)) return value.map((v) => stripFiles(v, dropped)).filter((v) => v !== undefined);
  if (value && typeof value === 'object') {
    const out = {};
    Object.entries(value).forEach(([k, v]) => {
      if (k === 'url' && typeof v === 'string' && v.startsWith('blob:')) return; // previews die with the page
      out[k] = stripFiles(v, dropped);
    });
    return out;
  }
  return value;
};

const ago = (at) => {
  const min = Math.round((Date.now() - at) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} minute${min === 1 ? '' : 's'} ago`;
  const h = Math.round(min / 60);
  return `${h} hour${h === 1 ? '' : 's'} ago`;
};

export default function useFormDraft(formKey, snapshot, apply, { enabled = true, owner = 'resident', trigger = 'input', onReset = null, dirty } = {}) {
  const { user, adminUser } = useAuth();
  const ownerId = owner === 'admin' ? adminUser?.admin_id : user?.user_id;
  const storageKey = ownerId ? `${owner === 'admin' ? ADMIN_PREFIX : PREFIX}${ownerId}_${formKey}` : null;
  // The draft is "open" while the form is shown (a pop-up form: while it's open).
  const activeKey = enabled ? storageKey : null;
  const [restored, setRestored] = useState(null); // { key, at, files }
  const touched = useRef(false);
  const baseline = useRef(null);      // the form as it opened (JSON)
  const applyRef = useRef(apply);
  const resetRef = useRef(onReset);
  // dirty (optional): the form's own "unsaved changes" flag; when given, a
  // draft is kept exactly while it is true.
  const dirtyRef = useRef(dirty);
  useEffect(() => { applyRef.current = apply; resetRef.current = onReset; dirtyRef.current = dirty; });

  const json = (() => { try { return JSON.stringify(stripFiles(snapshot, { n: 0 })); } catch { return ''; } })();
  const jsonRef = useRef(json);
  useEffect(() => { jsonRef.current = json; });

  // Restore when the form opens (each time, for a pop-up form).
  useEffect(() => {
    touched.current = false;
    baseline.current = jsonRef.current; // how the form looked when it opened (Start over goes back to it)
    if (!activeKey) return;
    let saved = null;
    try { saved = JSON.parse(sessionStorage.getItem(activeKey) || 'null'); } catch { saved = null; }
    if (!saved || !saved.data || Date.now() - saved.at > MAX_AGE_MS) {
      try { sessionStorage.removeItem(activeKey); } catch { /* ignore */ }
      return;
    }
    applyRef.current(saved.data);
    touched.current = true; // keep saving what was restored
    setRestored({ key: activeKey, at: saved.at, files: saved.files || 0 });
  }, [activeKey]);

  // trigger 'input' (residents' full-page forms): saving starts once the
  // resident types or picks something, so the profile data the form fills in
  // on its own never counts. trigger 'change' (staff pop-up forms): saving
  // starts once the form differs from how it opened; typing in the page's
  // search boxes and filters doesn't count.
  useEffect(() => {
    if (!activeKey || trigger !== 'input') return undefined;
    const mark = (e) => { if (e.isTrusted) touched.current = true; };
    document.addEventListener('input', mark, true);
    document.addEventListener('change', mark, true);
    return () => {
      document.removeEventListener('input', mark, true);
      document.removeEventListener('change', mark, true);
    };
  }, [activeKey, trigger]);

  // Save shortly after each change.
  useEffect(() => {
    if (!activeKey || !json) return undefined;
    const t = setTimeout(() => {
      // Just saved (clear()): what the form shows now is the new starting point.
      if (baseline.current === REBASE) { baseline.current = json; return; }
      if (dirtyRef.current === false) { try { sessionStorage.removeItem(activeKey); } catch { /* ignore */ } return; }
      if (dirtyRef.current === true) touched.current = true;
      if (trigger === 'change' && json !== baseline.current) touched.current = true;
      if (!touched.current) return;
      const dropped = { n: 0 };
      const data = stripFiles(snapshot, dropped);
      try { sessionStorage.setItem(activeKey, JSON.stringify({ at: Date.now(), files: dropped.n, data })); } catch { /* full or blocked */ }
    }, 400);
    return () => clearTimeout(t);
    // json stands for snapshot's content
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [json, activeKey, trigger]);

  const clear = useCallback(() => {
    touched.current = false;
    baseline.current = REBASE;
    setRestored(null);
    if (storageKey) { try { sessionStorage.removeItem(storageKey); } catch { /* ignore */ } }
  }, [storageKey]);

  // Start over: onReset if given; a pop-up form (trigger 'change') goes back to
  // how it was when opened; a full-page form reloads.
  const startOver = () => {
    const opened = baseline.current;
    clear();
    if (resetRef.current) resetRef.current();
    else if (trigger === 'change' && opened) { try { applyRef.current(JSON.parse(opened)); } catch { /* ignore */ } }
    else window.location.reload();
  };

  const shown = restored && restored.key === activeKey ? restored : null;
  const notice = shown ? (
    <div className="fd-notice" role="status">
      <i className="bi bi-arrow-counterclockwise" aria-hidden="true"></i>
      <div>
        <strong>We kept what you filled in earlier</strong> <span>(saved {ago(shown.at)}).</span>
        {shown.files > 0 && <span className="fd-files"> Files and photos can't be kept, so please attach them again.</span>}
      </div>
      <button type="button" className="fd-btn" onClick={startOver}>Start over</button>
      <button type="button" className="fd-close" onClick={() => setRestored(null)} aria-label="Dismiss"><i className="bi bi-x-lg" aria-hidden="true"></i></button>
    </div>
  ) : null;

  return { notice, clear, restored: !!shown };
}
