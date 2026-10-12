import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

const API_BASE = '/api_backend';

// Signed-in admin verifies their own contacts (migration 015): an email code
// first, then an SMS code to their mobile number (admin_contact_verify.php).
// Shown from AdminLayout for accounts that are not verified yet, e.g. ones
// created before admins had mobile numbers.
const AdminContactVerify = ({ status, onStatus, onClose }) => {
  const [code, setCode] = useState('');
  const [mobile, setMobile] = useState('');
  const [sent, setSent] = useState({ email: false, sms: false });
  const [resendIn, setResendIn] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  const channel = !status.email_verified ? 'email' : 'sms';
  const done = status.email_verified && status.mobile_verified;

  useEffect(() => {
    if (resendIn <= 0) return undefined;
    const t = setTimeout(() => setResendIn(resendIn - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const call = async (payload) => {
    const res = await fetch(`${API_BASE}/admin_contact_verify.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.status) onStatus(data.status);
    return data;
  };

  const send = async () => {
    setMessage({ type: '', text: '' });
    if (channel === 'sms' && mobile && !/^09\d{9}$/.test(mobile)) {
      setMessage({ type: 'error', text: 'Mobile number must be 11 digits starting with 09.' });
      return;
    }
    setBusy(true);
    try {
      const data = await call({ action: 'send', channel, mobile: channel === 'sms' ? mobile : undefined });
      if (data.resend_in) setResendIn(data.resend_in);
      if (data.success) {
        setSent(prev => ({ ...prev, [channel]: true }));
        setCode('');
      }
      setMessage({ type: data.success ? 'success' : 'error', text: data.message });
    } catch {
      setMessage({ type: 'error', text: 'Unable to reach the server. Please try again.' });
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e) => {
    e.preventDefault();
    if (code.length !== 6) {
      setMessage({ type: 'error', text: 'Please enter the 6-digit code.' });
      return;
    }
    setBusy(true);
    try {
      const data = await call({ action: 'verify', channel, otp: code });
      setCode('');
      if (data.success) setResendIn(0);
      setMessage({ type: data.success ? 'success' : 'error', text: data.message });
    } catch {
      setMessage({ type: 'error', text: 'Unable to reach the server. Please try again.' });
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="acv-overlay" role="presentation">
      <form className="acv-dialog" role="dialog" aria-modal="true" aria-labelledby="acv-title" onSubmit={verify}>
        <div className="acv-head">
          <i className={`bi ${done ? 'bi-patch-check-fill' : channel === 'email' ? 'bi-envelope-check' : 'bi-phone'}`} aria-hidden="true"></i>
          <div>
            <h3 id="acv-title">
              {done ? 'Contacts Verified' : channel === 'email' ? 'Step 1 of 2: Verify Your Email' : 'Step 2 of 2: Verify Your Mobile Number'}
            </h3>
            <p>
              {done
                ? 'Your email address and mobile number are verified. You can now reset your password by SMS.'
                : channel === 'email'
                  ? `We'll email a 6-digit code to ${status.email}.`
                  : status.mobile
                    ? `We'll text a 6-digit code to ${status.mobile}, or enter a different number.`
                    : 'Enter your mobile number and we will text you a 6-digit code.'}
            </p>
          </div>
          <button type="button" className="acv-close" onClick={onClose} aria-label="Close"><i className="bi bi-x-lg"></i></button>
        </div>

        {message.text && <div className={`acv-msg ${message.type === 'error' ? 'is-error' : ''}`}>{message.text}</div>}

        {!done && (
          <>
            {channel === 'sms' && (
              <>
                <label className="acv-label" htmlFor="acv-mobile">Mobile Number {status.mobile ? '(optional)' : ''}</label>
                <input id="acv-mobile" className="acv-input" type="text" inputMode="numeric" maxLength={11}
                  placeholder={status.mobile ? `Leave blank to use ${status.mobile}` : '09XXXXXXXXX'}
                  value={mobile} onChange={(e) => setMobile(e.target.value.replace(/\D/g, ''))} />
              </>
            )}
            {sent[channel] && (
              <>
                <label className="acv-label" htmlFor="acv-code">6-Digit {channel === 'email' ? 'Email' : 'SMS'} Code</label>
                <input id="acv-code" className="acv-input acv-code" type="text" inputMode="numeric" autoComplete="one-time-code"
                  maxLength={6} placeholder="000000" autoFocus
                  value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
              </>
            )}
            <div className="acv-actions">
              {sent[channel] && (
                <button type="button" className="acv-link" onClick={send} disabled={busy || resendIn > 0}>
                  {resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code'}
                </button>
              )}
              <button type="button" className="acv-btn" onClick={onClose}>Later</button>
              {sent[channel] ? (
                <button type="submit" className="acv-btn is-primary" disabled={busy}>{busy ? 'Checking...' : 'Verify'}</button>
              ) : (
                <button type="button" className="acv-btn is-primary" onClick={send}
                  disabled={busy || (channel === 'sms' && !status.sms_available)}>
                  {busy ? 'Sending...' : channel === 'email' ? 'Email Me a Code' : 'Text Me a Code'}
                </button>
              )}
            </div>
          </>
        )}
        {done && (
          <div className="acv-actions">
            <button type="button" className="acv-btn is-primary" onClick={onClose}>Done</button>
          </div>
        )}
      </form>
    </div>,
    document.body
  );
};

export default AdminContactVerify;
