// Accessible dialogs everywhere, without editing every dialog (WCAG 2.1.2,
// 2.4.3, 4.1.2). The site has ~30 dialog styles (modal-backdrop, asv-overlay,
// detail-modal-overlay, ...), so instead of a per-dialog hook this watches the
// page: any full-screen fixed layer that contains controls is treated as a
// dialog while it is open:
//   - it is marked role="dialog" aria-modal="true", named by its first heading;
//   - focus moves into it (an [autofocus] field, else the first field, else the
//     first button), and Tab / Shift+Tab stay inside;
//   - Escape closes it the way a person would: its close button, else its
//     Cancel / Close button, else a click on the backdrop;
//   - when it closes, focus returns to what opened it.
// Installed once in main.jsx. A dialog that handles these itself keeps working:
// focus already inside is left alone, and Escape only acts if the dialog is
// still open a moment later.

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), summary';
const stack = []; // open dialogs, topmost last: { layer, box, returnTo }
let uid = 0;

const visible = (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
const focusables = (box) => [...box.querySelectorAll(FOCUSABLE)].filter(visible);

// A full-screen fixed (or absolute, covering the viewport) layer with controls.
const isDialogLayer = (el) => {
  if (!(el instanceof HTMLElement) || el.id === 'root') return false;
  if (el.matches('[role="dialog"], [role="alertdialog"], [aria-modal="true"]')) {
    // Small confirm toasts are alertdialogs that don't block the page.
    const r = el.getBoundingClientRect();
    if (r.width < window.innerWidth * 0.6 && el.getAttribute('role') === 'alertdialog') return false;
    return focusables(el).length > 0;
  }
  const s = getComputedStyle(el);
  if (s.position !== 'fixed' || s.pointerEvents === 'none' || s.display === 'none') return false;
  const r = el.getBoundingClientRect();
  if (r.width < window.innerWidth * 0.9 || r.height < window.innerHeight * 0.9) return false;
  return focusables(el).length > 0;
};

// The visible card inside a backdrop: the element already marked as a dialog,
// else the largest child that isn't full-screen itself.
const dialogBox = (layer) => {
  if (layer.matches('[role="dialog"], [role="alertdialog"]')) return layer;
  const marked = layer.querySelector('[role="dialog"], [role="alertdialog"]');
  if (marked) return marked;
  const kids = [...layer.children].filter(visible);
  return kids.find((k) => focusables(k).length > 0) || layer;
};

const label = (box) => {
  if (!box.hasAttribute('role')) box.setAttribute('role', 'dialog');
  if (!box.hasAttribute('aria-modal')) box.setAttribute('aria-modal', 'true');
  if (!box.hasAttribute('aria-label') && !box.hasAttribute('aria-labelledby')) {
    const h = box.querySelector('h1, h2, h3, h4, h5, [class*="title"]');
    if (h && h.textContent.trim()) {
      if (!h.id) h.id = `pb2-dialog-title-${++uid}`;
      box.setAttribute('aria-labelledby', h.id);
    }
  }
};

const firstTarget = (box) => {
  const auto = box.querySelector('[autofocus]');
  if (auto && visible(auto)) return auto;
  const all = focusables(box);
  const field = all.find((e) => e.matches('input:not([type="checkbox"]):not([type="radio"]):not([type="file"]), select, textarea'));
  if (field) return field;
  const action = all.find((e) => !isCloseControl(e));
  return action || all[0] || null;
};

const isCloseControl = (el) => el.matches('[aria-label*="Close" i], [title*="Close" i], [class*="close" i]');

const open = (layer) => {
  if (stack.some((d) => d.layer === layer)) return;
  const box = dialogBox(layer);
  label(box);
  const returnTo = document.activeElement && document.activeElement !== document.body ? document.activeElement : null;
  stack.push({ layer, box, returnTo });
  // After React finishes rendering the dialog's contents.
  requestAnimationFrame(() => {
    if (!layer.isConnected || box.contains(document.activeElement)) return;
    const target = firstTarget(box);
    if (target) target.focus();
    else {
      if (!box.hasAttribute('tabindex')) box.setAttribute('tabindex', '-1');
      box.focus();
    }
  });
};

const closedCheck = () => {
  for (let i = stack.length - 1; i >= 0; i--) {
    const d = stack[i];
    if (d.layer.isConnected && visible(d.layer)) continue;
    stack.splice(i, 1);
    // Back to what opened it, if it's still on the page and nothing else took focus.
    const focusLost = !document.activeElement || document.activeElement === document.body || !document.activeElement.isConnected;
    if (d.returnTo && d.returnTo.isConnected && focusLost && i === stack.length) d.returnTo.focus();
  }
};

// Cheap first test, so big renders (table rows) aren't measured: dialog roles,
// layers added straight to <body> (portals), or overlay-like class names.
const LIKELY = /overlay|backdrop|modal|dialog|lightbox|viewer|drawer/i;
const likely = (el) => el.parentElement === document.body
  || el.hasAttribute('role') || el.hasAttribute('aria-modal')
  || LIKELY.test(typeof el.className === 'string' ? el.className : '');

const scan = (node) => {
  if (!(node instanceof HTMLElement)) return;
  if (likely(node) && isDialogLayer(node)) open(node);
  // A portal or wrapper may add the backdrop one level down.
  for (const child of node.children) if (likely(child) && isDialogLayer(child)) open(child);
};

const closeTop = () => {
  const d = stack[stack.length - 1];
  if (!d || !d.layer.isConnected) return;
  const buttons = [...d.box.querySelectorAll('button, [role="button"], a')].filter(visible);
  const close = buttons.find(isCloseControl)
    || buttons.find((b) => /^(cancel|close|done|ok|isara)$/i.test((b.textContent || '').trim()));
  if (close) { close.click(); return; }
  // A click on the backdrop itself (most dialogs close that way).
  d.layer.dispatchEvent(new MouseEvent('click', { bubbles: true }));
};

const onKeyDown = (e) => {
  const d = stack[stack.length - 1];
  if (!d || !d.layer.isConnected) return;
  if (e.key === 'Escape') {
    // Let a dialog that handles Escape itself go first.
    setTimeout(() => { if (d.layer.isConnected && stack[stack.length - 1] === d) closeTop(); }, 0);
    return;
  }
  if (e.key !== 'Tab') return;
  const items = focusables(d.box);
  if (!items.length) { e.preventDefault(); return; }
  const first = items[0];
  const last = items[items.length - 1];
  const inside = d.box.contains(document.activeElement);
  if (e.shiftKey && (document.activeElement === first || !inside)) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && (document.activeElement === last || !inside)) { e.preventDefault(); first.focus(); }
};

export function installDialogA11y() {
  if (typeof window === 'undefined' || window.__pb2DialogA11y) return;
  window.__pb2DialogA11y = true;
  const observer = new MutationObserver((records) => {
    for (const r of records) r.addedNodes.forEach(scan);
    if (stack.length) closedCheck();
  });
  const start = () => {
    observer.observe(document.body, { childList: true, subtree: true });
    document.body.querySelectorAll('*').forEach((el) => { if (likely(el) && isDialogLayer(el)) open(el); });
  };
  if (document.body) start(); else window.addEventListener('DOMContentLoaded', start);
  document.addEventListener('keydown', onKeyDown);
}
