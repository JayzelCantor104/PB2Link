import { useEffect, useState } from 'react';
import '../styles/two-factor.css';

const API_BASE = '/api_backend';

/**
 * Edit Profile's "Two-step sign-in" card (migration 052,
 * backend/api/two_factor_settings.php). Optional for residents: once on, a
 * code by email or SMS is asked after the password when signing in.
 * SMS is offered only for a mobile number confirmed by SMS.
 */
export default function TwoFactorSettings({ showToast }) {
  const [state, setState] = useState(null);
  const [mode, setMode] = useState(''); // '' | 'enable' | 'disable'
  const [channel, setChannel] = useState('email');
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const notify = (type, title, message) => { if (showToast) showToast(title, message, type); };

  const call = async (body) => {
    const res = await fetch(`${API_BASE}/two_factor_settings.php`, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      credentials: 'include',
      body: body ? JSON.stringify(body) : undefined,
    });
    return res.json();
  };

  useEffect(() => {
    let alive = true;
    call().then((d) => { if (alive && d.success) setState(d); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  if (!state) return null;
  const channels = state.channels || {};
  const options = Object.keys(channels);
  const label = (ch) => (ch === 'sms' ? 'Text message (SMS)' : 'Email');

  const reset = () => { setMode(''); setSent(false); setCode(''); setPassword(''); setError(''); };

  const run = async (body, after) => {
    setBusy(true);
    setError('');
    try {
      const d = await call(body);
      if (d.success) {
        if (d.enabled !== undefined) setState(d);
        after?.(d);
      } else {
        setError(d.message || 'Something went wrong. Please try again.');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const startEnable = () => {
    reset();
    setChannel(state.channel && channels[state.channel] ? state.channel : options[0]);
    setMode('enable');
  };

  return (
    <section className="tfa-card" aria-labelledby="tfa-settings-title">
      <h3 id="tfa-settings-title">
        <i className="bi bi-shield-lock" aria-hidden="true"></i> Two-step sign-in
        <span className={`tfa-pill ${state.enabled ? 'on' : 'off'}`}>{state.enabled ? 'On' : 'Off'}</span>
      </h3>
      <p>
        {state.enabled
          ? `After your password, we ask for a code sent by ${state.channel === 'sms' ? `text to ${channels.sms || 'your mobile'}` : `email to ${channels.email || 'your email'}`}. Someone who learns your password still can't sign in without it.`
          : 'Optional extra protection: after your password, we also ask for a 6-digit code sent to your email or phone.'}
      </p>
      {!options.length && <p>Add an email address or confirm your mobile number by SMS first.</p>}
      {options.length === 1 && !channels.sms && <p>To get codes by text, confirm your mobile number with an SMS code first.</p>}
      {error && <p className="tfa-error" role="alert">{error}</p>}

      {mode === '' && (
        <div className="tfa-row">
          {!state.enabled && options.length > 0 && <button type="button" className="tfa-btn" onClick={startEnable}>Turn on</button>}
          {state.enabled && options.length > 1 && (
            <button type="button" className="tfa-btn ghost" disabled={busy}
              onClick={() => { const next = state.channel === 'sms' ? 'email' : 'sms'; run({ action: 'set_channel', channel: next }, (d) => notify('success', 'Saved', d.message)); }}>
              Send codes by {state.channel === 'sms' ? 'email' : 'text'} instead
            </button>
          )}
          {state.enabled && <button type="button" className="tfa-btn danger" onClick={() => { reset(); setMode('disable'); }}>Turn off</button>}
          {state.trusted_devices > 0 && (
            <button type="button" className="tfa-btn ghost" disabled={busy}
              onClick={() => run({ action: 'forget_devices' }, (d) => notify('success', 'Devices forgotten', d.message))}>
              Forget remembered devices ({state.trusted_devices})
            </button>
          )}
        </div>
      )}

      {mode === 'enable' && (
        <div className="tfa">
          {options.length > 1 && (
            <div className="tfa-channels" role="group" aria-label="Where to send sign-in codes">
              {options.map((ch) => (
                <button key={ch} type="button" className={`tfa-channel${channel === ch ? ' is-on' : ''}`} aria-pressed={channel === ch}
                  disabled={busy} onClick={() => { setChannel(ch); setSent(false); setCode(''); }}>
                  <i className={`bi ${ch === 'sms' ? 'bi-phone' : 'bi-envelope'}`} aria-hidden="true"></i>
                  <span>{label(ch)}</span>
                  <small>{channels[ch]}</small>
                </button>
              ))}
            </div>
          )}
          {!sent ? (
            <div className="tfa-row">
              <button type="button" className="tfa-btn" disabled={busy}
                onClick={() => run({ action: 'send', channel }, () => setSent(true))}>
                Send a test code to {channels[channel]}
              </button>
              <button type="button" className="tfa-btn ghost" onClick={reset}>Cancel</button>
            </div>
          ) : (
            <>
              <p className="tfa-info" role="status">Enter the 6-digit code we sent to {channels[channel]}.</p>
              <label className="tfa-label" htmlFor="tfa-enable-code">6-digit code</label>
              <input id="tfa-enable-code" className="tfa-field" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6}
                value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} aria-invalid={!!error} />
              <div className="tfa-row">
                <button type="button" className="tfa-btn" disabled={busy || code.length !== 6}
                  onClick={() => run({ action: 'enable', channel, code }, (d) => { reset(); notify('success', 'Two-step sign-in is on', d.message); })}>
                  Turn on
                </button>
                <button type="button" className="tfa-btn ghost" disabled={busy}
                  onClick={() => run({ action: 'send', channel }, () => notify('info', 'Code sent', `A new code went to ${channels[channel]}.`))}>
                  Send a new code
                </button>
                <button type="button" className="tfa-btn ghost" onClick={reset}>Cancel</button>
              </div>
            </>
          )}
        </div>
      )}

      {mode === 'disable' && (
        <div className="tfa">
          <label className="tfa-label" htmlFor="tfa-disable-password">Enter your current password to turn it off</label>
          <input id="tfa-disable-password" name="current_password" className="tfa-field" type="password" autoComplete="current-password"
            value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={!!error} />
          <div className="tfa-row">
            <button type="button" className="tfa-btn danger" disabled={busy || !password}
              onClick={() => run({ action: 'disable', password }, (d) => { reset(); notify('success', 'Two-step sign-in is off', d.message); })}>
              Turn off
            </button>
            <button type="button" className="tfa-btn ghost" onClick={reset}>Cancel</button>
          </div>
        </div>
      )}
    </section>
  );
}
