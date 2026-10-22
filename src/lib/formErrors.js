// Form errors people can find without seeing colour (WCAG 1.4.1, 3.3.1).
// Fields with a problem carry aria-invalid="true" (set where each form marks
// its error ring); these helpers read that after the form re-renders.

const visible = (el) => el.getClientRects().length > 0;

// The label a person sees for a field: its <label>, else aria-label / placeholder.
const fieldName = (el) => {
  const label = el.labels?.[0]?.textContent || el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.name || '';
  return label.replace(/\*/g, '').replace(/\s+/g, ' ').trim();
};

const invalidFields = () => [...document.querySelectorAll('[aria-invalid="true"]')].filter(visible);

// After React has applied the error state (two frames).
const afterRender = (fn) => requestAnimationFrame(() => requestAnimationFrame(fn));

/** Moves focus to the first field marked invalid and brings it into view. */
export const focusFirstInvalid = () => afterRender(() => {
  const first = invalidFields()[0];
  if (!first) return;
  first.focus({ preventScroll: true });
  first.scrollIntoView({ behavior: 'smooth', block: 'center' });
});

/**
 * Shows the error toast naming the fields to fix ("Please complete: First
 * Name, Birth Date."), then focuses the first one. `fallback` is used when no
 * field could be named. `show` is the page's showToast(title, message, type).
 */
export const reportInvalid = (show, title, fallback = 'Please complete the required fields.') => afterRender(() => {
  const fields = invalidFields();
  const names = [...new Set(fields.map(fieldName).filter(Boolean))];
  const shown = names.slice(0, 6);
  const more = names.length > shown.length ? `, and ${names.length - shown.length} more` : '';
  show(title, shown.length ? `Please complete or correct: ${shown.join(', ')}${more}.` : fallback, 'error');
  const first = fields[0];
  if (first) {
    first.focus({ preventScroll: true });
    first.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
});
