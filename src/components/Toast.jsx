import { createPortal } from 'react-dom';
import '../styles/toast.css';

const ICONS = {
  success: 'bi-check-circle-fill',
  error: 'bi-exclamation-octagon-fill',
  warning: 'bi-exclamation-triangle-fill',
  info: 'bi-info-circle-fill',
};

// Shared toast for the whole app (citizen + admin). `toast` is
// { title, message, type, actions? } or null. State usually comes from
// useToast() (src/lib/useToast.js), which also handles auto-dismiss and
// confirm-style toasts (`actions` = [{ label, onClick, variant }]).
// Portaled to <body> so a parent's transform/backdrop-filter can't trap it.
const Toast = ({ toast, onClose }) => {
  if (!toast) return null;
  const type = ICONS[toast.type] ? toast.type : 'success';
  const isConfirm = Array.isArray(toast.actions) && toast.actions.length > 0;

  return createPortal(
    <div
      className={`ep-toast ep-toast--${type} ${isConfirm ? 'ep-toast--confirm' : ''}`}
      role={isConfirm ? 'alertdialog' : type === 'error' ? 'alert' : 'status'}
      aria-live={type === 'error' || isConfirm ? 'assertive' : 'polite'}
    >
      <i className={`bi ${ICONS[type]} ep-toast-icon`} aria-hidden="true"></i>
      <div className="ep-toast-body">
        {toast.title && <h4>{toast.title}</h4>}
        {toast.message && <p>{toast.message}</p>}
        {isConfirm && (
          <div className="ep-toast-actions">
            {toast.actions.map((action, i) => (
              <button
                key={action.label}
                type="button"
                className={`ep-toast-btn ep-toast-btn--${action.variant || 'primary'}`}
                onClick={action.onClick}
                autoFocus={i === toast.actions.length - 1 && action.variant !== 'danger'}
              >
                {action.label}
              </button>
            ))}
          </div>
        )}
      </div>
      {onClose && (
        <button type="button" className="ep-toast-close" onClick={onClose} aria-label="Dismiss notification">
          <i className="bi bi-x-lg"></i>
        </button>
      )}
    </div>,
    document.body
  );
};

export default Toast;
