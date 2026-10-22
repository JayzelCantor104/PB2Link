import React, { useEffect, useState } from 'react';
import { disablePush, enablePush, pushStatus } from '../lib/pushAlerts';
import '../styles/advisory-tools.css';

/**
 * "Get alerts on this phone": turns barangay advisory push notifications on or
 * off for this device (src/lib/pushAlerts.js). Hidden where the browser can't
 * receive them at all, except for a short hint on iPhone.
 */
const AlertsOnDevice = ({ language = 'en', staff = false }) => {
  const [status, setStatus] = useState('loading');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    pushStatus().then((s) => { if (active) setStatus(s); }).catch(() => { if (active) setStatus('unsupported'); });
    return () => { active = false; };
  }, []);

  const toggle = async () => {
    setBusy(true);
    const r = status === 'on' ? await disablePush() : await enablePush(language);
    setMessage(r.message || '');
    setStatus(await pushStatus().catch(() => 'unsupported'));
    setBusy(false);
  };

  if (status === 'loading') return null;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  if (status === 'unsupported') {
    return ios ? (
      <p className="adv-push-note"><i className="bi bi-phone"></i> To get alerts on your iPhone, tap Share, then <strong>Add to Home Screen</strong>, and open PB2Link from there.</p>
    ) : null;
  }

  return (
    <div className={`adv-push${status === 'on' ? ' is-on' : ''}`}>
      <div>
        <strong><i className={`bi ${status === 'on' ? 'bi-bell-fill' : 'bi-bell'}`}></i> {status === 'on' ? 'Alerts are on for this device' : staff ? 'Get advisories and practice alerts on this device' : 'Get emergency alerts on this phone'}</strong>
        <span>
          {status === 'blocked'
            ? 'Notifications are blocked for this site. Allow them in your browser settings, then try again.'
            : status === 'on'
              ? 'You will get a notification when the barangay issues or raises an advisory, even with the site closed.'
              : 'Free, and works even when the site is closed. Text messages still go out too.'}
        </span>
        {message && <span className="adv-push-msg" role="status">{message}</span>}
      </div>
      {status !== 'blocked' && (
        <button type="button" className={`adv-push-btn${status === 'on' ? ' is-off' : ''}`} onClick={toggle} disabled={busy}>
          {busy ? 'Please wait…' : status === 'on' ? 'Turn off' : 'Turn on alerts'}
        </button>
      )}
    </div>
  );
};

export default AlertsOnDevice;
