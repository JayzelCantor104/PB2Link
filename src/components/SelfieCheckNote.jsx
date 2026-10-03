import { SELFIE_MAX_FAILED_TRIES } from '../lib/selfieCheck';
import '../styles/selfie-check.css';

/**
 * Shows the result of the verification-selfie check under the upload.
 * check: { status: 'idle'|'checking'|'verified'|'failed'|'unavailable', message, failures }
 */
export default function SelfieCheckNote({ check }) {
  if (!check || check.status === 'idle') return null;

  if (check.status === 'checking') {
    return <div className="selfie-check selfie-check--checking"><span className="selfie-check-spinner" aria-hidden="true"></span> Checking your selfie…</div>;
  }
  if (check.status === 'verified') {
    return <div className="selfie-check selfie-check--ok"><i className="bi bi-check-circle-fill"></i> Selfie checked: your face and your ID are both visible.</div>;
  }
  if (check.status === 'unavailable') {
    return <div className="selfie-check selfie-check--info"><i className="bi bi-info-circle-fill"></i> Automatic selfie checking is unavailable right now. Staff will review your selfie.</div>;
  }
  const canContinue = (check.failures || 0) >= SELFIE_MAX_FAILED_TRIES;
  return (
    <div className="selfie-check selfie-check--fail" role="alert">
      <i className="bi bi-exclamation-triangle-fill"></i>
      <div>
        <strong>This doesn't look like a selfie holding your ID.</strong>
        <span>{check.message}</span>
        <span className="selfie-check-next">
          {canContinue ? 'You can continue — staff will review your selfie before approving.' : 'Please retake it.'}
        </span>
      </div>
    </div>
  );
}
