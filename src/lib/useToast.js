import { useCallback, useEffect, useRef, useState } from 'react';

// Shared state for <Toast /> (src/components/Toast.jsx) — replaces the
// browser's alert()/confirm() popups everywhere, citizen and admin side.
//
//   const { toast, showToast, confirmToast, closeToast } = useToast();
//   showToast('Saved', 'Your changes were saved.', 'success');
//   if (!(await confirmToast('Delete announcement?', 'This cannot be undone.', { confirmLabel: 'Delete', danger: true }))) return;
//   <Toast toast={toast} onClose={closeToast} />
//
// Plain toasts auto-dismiss; confirmation toasts stay until a button is
// pressed (closing one counts as "Cancel").
export const useToast = (duration = 8000) => {
  const [toast, setToast] = useState(null);
  const timerRef = useRef(null);
  const resolverRef = useRef(null);

  // Settle a pending confirmation (if any) so its awaiting caller never hangs.
  const settle = useCallback((value) => {
    if (resolverRef.current) {
      resolverRef.current(value);
      resolverRef.current = null;
    }
  }, []);

  const closeToast = useCallback(() => {
    clearTimeout(timerRef.current);
    settle(false);
    setToast(null);
  }, [settle]);

  const showToast = useCallback((title, message, type = 'success') => {
    clearTimeout(timerRef.current);
    settle(false);
    setToast({ title, message, type });
    timerRef.current = setTimeout(() => setToast(null), duration);
  }, [duration, settle]);

  const confirmToast = useCallback((title, message, { confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false } = {}) => {
    clearTimeout(timerRef.current);
    settle(false);
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      const answer = (value) => {
        settle(value);
        setToast(null);
      };
      setToast({
        title,
        message,
        type: danger ? 'error' : 'warning',
        actions: [
          { label: cancelLabel, variant: 'ghost', onClick: () => answer(false) },
          { label: confirmLabel, variant: danger ? 'danger' : 'primary', onClick: () => answer(true) }
        ]
      });
    });
  }, [settle]);

  useEffect(() => () => {
    clearTimeout(timerRef.current);
    settle(false);
  }, [settle]);

  return { toast, showToast, confirmToast, closeToast };
};
