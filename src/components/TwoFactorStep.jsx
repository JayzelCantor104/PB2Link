import { useCallback, useEffect, useRef, useState } from 'react';
import '../styles/two-factor.css';

const API_BASE = '/api_backend';

/**
 * The code step of two-step sign-in (migration 052, backend/api/login_2fa.php).
 * Shown by Login.jsx and AdminLogin.jsx after the right password when the
 * response has `two_factor: true`.
 *
 * props: tier ('resident' | 'admin'), channels ({ email?: masked, sms?: masked }),
 *        defaultChannel, onDone(data) with the normal sign-in response,
 *        onCancel(message?) to go back to the password form.
 */
export default function TwoFactorStep({ tier, channels, defaultChannel, onDone, onCancel }) {
  const options = Object.keys(channels || {});
  const [channel, setChannel] = useState(defaultChannel && channels?.[defaultChannel] ? defaultChannel : options[0]);
  const [code, setCode] = useState('');
  const [trust, setTrust] = useState(false);
  const [info, setInfo] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);
  // Nothing is sent until the person picks where and presses Send (sent = the channel the last code went to).
  const [sent, setSent] = useState('');
  const inputRef = useRef(null);

  const call = useCallback(async (body) => {
    const res = await fetch(`${API_BASE}/login_2fa.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ tier, ...body }),
    });
    return res.json();
  }, [tier]);

  const send = useCallback(async (ch) => {
    setError('');
    setBusy(true);
    setInfo('Sending your code…');
    try {
      const data = await call({ action: 'send', channel: ch });
      if (data.code === 'EXPIRED') { onCancel(data.message); return; }
      if (data.success) {
        setInfo(`We sent a 6-digit code to ${data.sent_to || channels[ch]}. It works for 10 minutes.`);
        setSent(ch);
        setWait(60);
      } else {
        setInfo('');
        setError(data.message || 'We could not send the code. Please try again.');
        if (data.resend_in) setWait(data.resend_in);
      }
    } catch {
      setInfo('');
      setError('Network error. Please try again.');
    }
    setBusy(false);
  }, [call, channels, onCancel]);

  // Focus the code box once a code is on its way.
  useEffect(() => { if (sent) inputRef.current?.focus(); }, [sent]);

  useEffect(() => {
    if (wait <= 0) return undefined;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const verify = async (e) => {
    e.preventDefault();
    if (sent !== channel) { send(channel); return; }
    const digits = code.replace(/\D/g, '');
    if (digits.length !== 6) {
      setError('Enter the 6-digit code.');
      inputRef.current?.focus();
      return;
    }
    setBusy(true);
    setError('');
    try {
      const data = await call({ action: 'verify', channel, code: digits, trust });
      if (data.code === 'EXPIRED') { onCancel(data.message); return; }
      if (data.success) { onDone(data); return; }
      setError(data.message || 'That code is not right.');
      setCode('');
      inputRef.current?.focus();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const label = (ch) => (ch === 'sms' ? 'Text message' : 'Email');

  return (
    <form className="tfa" onSubmit={verify} noValidate>
      <h2 className="tfa-title">Two-step sign-in</h2>
      <p className="tfa-lead">Your password is correct. {options.length > 1 ? 'Choose where to receive your sign-in code, then press Send.' : 'Press Send to get your sign-in code.'}</p>

      {options.length > 1 && (
        <div className="tfa-channels" role="group" aria-label="Where to send the code">
          {options.map((ch) => (
            <button
              key={ch}
              type="button"
              className={`tfa-channel${channel === ch ? ' is-on' : ''}`}
              aria-pressed={channel === ch}
              onClick={() => { if (ch !== channel) { setCode(''); setError(''); setInfo(''); setChannel(ch); } }}
              disabled={busy}
            >
              <i className={`bi ${ch === 'sms' ? 'bi-phone' : 'bi-envelope'}`} aria-hidden="true"></i>
              <span>{label(ch)}</span>
              <small>{channels[ch]}</small>
            </button>
          ))}
        </div>
      )}

      {info && <p className="tfa-info" role="status">{info}</p>}
      {error && <p className="tfa-error" role="alert">{error}</p>}

      {sent !== channel ? (
        <>
          <button type="submit" className="tfa-submit" disabled={busy}>
            <i className={`bi ${channel === 'sms' ? 'bi-phone' : 'bi-envelope'}`} aria-hidden="true"></i>{' '}
            {busy ? 'Sending…' : `Send code ${channel === 'sms' ? 'by text' : 'by email'}`}
          </button>
          <p className="tfa-to">To {channels[channel]}</p>
          <div className="tfa-links">
            <span></span>
            <button type="button" className="tfa-link" onClick={() => onCancel()}>Back to sign in</button>
          </div>
        </>
      ) : (<>
      <label className="tfa-label" htmlFor="tfa-code">6-digit code</label>
      <input
        ref={inputRef}
        id="tfa-code"
        name="one_time_code"
        className="tfa-code"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
        aria-invalid={!!error}
      />

      <label className="tfa-trust">
        <input type="checkbox" checked={trust} onChange={(e) => setTrust(e.target.checked)} />
        <span>Don't ask again on this device for 30 days{tier === 'admin' ? ' (not on shared computers)' : ''}</span>
      </label>

      <button type="submit" className="tfa-submit" disabled={busy}>{busy ? 'Checking…' : 'Verify and sign in'}</button>

      <div className="tfa-links">
        <button type="button" className="tfa-link" onClick={() => send(channel)} disabled={wait > 0 || busy}>
          {wait > 0 ? `Send a new code in ${wait}s` : 'Send a new code'}
        </button>
        <button type="button" className="tfa-link" onClick={() => onCancel()}>Back to sign in</button>
      </div>
      </>)}
    </form>
  );
}
