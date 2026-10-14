import { useCallback, useEffect, useState } from 'react';
import { ADDRESS_PROOF_TYPES, RESIDENCY_PROOF_TYPES } from '../lib/residency';
import { FIX_ITEM_LOOKUP, GUARDIAN_RELATIONSHIPS, sameSurname } from '../lib/registrationFix';
import '../styles/registration-fix.css';

// Top of Edit Profile while a registration is being fixed (restricted mode,
// migration 027; backend/api/resident_fix.php). Lists what staff asked for,
// takes the uploads that have no place elsewhere in Edit Profile (proof of
// address, parent/guardian documents) and sends the registration back.

const API_BASE = '/api_backend';
const PROOF_LABELS = Object.fromEntries([...ADDRESS_PROOF_TYPES, ...RESIDENCY_PROOF_TYPES].map((t) => [t.value, t.label]));

// Which change lines (from the server) count as having done an item.
const DONE_TESTS = {
  id: /valid ID photos/i,
  details: /first name|middle name|last name|suffix|birth date|sex/i,
  philsys: /PhilSys/i,
  address: /proof of address|address|move-in/i,
  sectors: /claim/i,
  mobile: /mobile/i,
  guardian: /guardian/i,
};

const fmt = (v) => {
  if (!v) return '';
  const d = new Date(String(v).replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? v : d.toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
};

const RegistrationFixPanel = ({ notify, onSent }) => {
  const [state, setState] = useState(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(null); // 'address' | 'guardian'
  const [busy, setBusy] = useState(false);
  const [proof, setProof] = useState({ type: '', file: null });
  const [guardian, setGuardian] = useState({ guardian_fname: '', guardian_lname: '', guardian_relationship: '', id: null, letter: null });
  const [confirmed, setConfirmed] = useState(false);
  const [sent, setSent] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let alive = true;
    fetch(`${API_BASE}/resident_fix.php`, { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        if (!alive) return;
        if (data.success) { setState(data); setError(''); } else setError(data.message || 'Could not load what needs fixing.');
      })
      .catch(() => { if (alive) setError('Could not load what needs fixing. Check your connection.'); });
    return () => { alive = false; };
  }, [reloadKey]);

  // Changes made below (codes entered, ID uploaded) show up here on return.
  useEffect(() => {
    const onFocus = () => reload();
    window.addEventListener('focus', onFocus);
    window.addEventListener('pb2:profile-changed', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('pb2:profile-changed', onFocus);
    };
  }, [reload]);

  const post = async (action, body, isJson = false) => {
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/resident_fix.php?action=${action}`, {
        method: 'POST',
        credentials: 'include',
        ...(isJson ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { body }),
      });
      const data = await res.json();
      if (!data.success) { notify('Not sent', data.message || 'Please try again.', 'error'); return null; }
      return data;
    } catch {
      notify('Connection problem', 'The server could not be reached. Please try again.', 'error');
      return null;
    } finally {
      setBusy(false);
    }
  };

  const uploadProof = async (e) => {
    e.preventDefault();
    if (!proof.type || !proof.file) { notify('Missing details', 'Choose the type of document and the file.', 'error'); return; }
    const fd = new FormData();
    fd.append('proof_type', proof.type);
    fd.append('proof_file', proof.file);
    const data = await post('proof', fd);
    if (data) { notify('Uploaded', data.message, 'success'); setState(data); setOpen(null); setProof({ type: '', file: null }); }
  };

  const needsLetter = state && guardian.guardian_lname.trim() !== '' && !sameSurname(guardian.guardian_lname, state.last_name);

  const uploadGuardian = async (e) => {
    e.preventDefault();
    const fd = new FormData();
    ['guardian_fname', 'guardian_lname', 'guardian_relationship'].forEach((k) => fd.append(k, guardian[k]));
    if (guardian.id) fd.append('guardian_id', guardian.id);
    if (needsLetter && guardian.letter) fd.append('guardian_letter', guardian.letter);
    const data = await post('guardian', fd);
    if (data) { notify('Uploaded', data.message, 'success'); setState(data); setOpen(null); }
  };

  const resubmit = async () => {
    const data = await post('resubmit', { confirm: true }, true);
    if (data) setSent(data.message);
  };

  if (sent) {
    return (
      <div className="rfx-panel is-sent" role="status">
        <i className="bi bi-send-check-fill rfx-big"></i>
        <h3>Sent back for review</h3>
        <p>{sent}</p>
        <p className="rfx-muted">You are now signed out. You can sign in again once staff approve your account.</p>
        <button type="button" className="rfx-btn rfx-btn-primary" onClick={onSent}>OK</button>
      </div>
    );
  }
  if (error) return <div className="rfx-panel is-error"><i className="bi bi-exclamation-triangle"></i> {error} <button type="button" className="rfx-link" onClick={reload}>Try again</button></div>;
  if (!state) return <div className="rfx-panel"><i className="bi bi-arrow-repeat"></i> Loading what needs fixing…</div>;
  if (state.mode !== 'fix') return null;

  const changes = state.changes || [];
  const done = (key) => DONE_TESTS[key] && changes.some((c) => DONE_TESTS[key].test(c));
  const left = state.max_resubmits - state.resubmit_count;
  const goTo = (section) => {
    const el = document.getElementById(section);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="rfx-panel">
      <div className="rfx-head">
        <i className="bi bi-tools"></i>
        <div>
          <h3>Your registration needs a few fixes</h3>
          <p>Your account can't be used yet. Fix the items below, then send your registration back to barangay staff.</p>
        </div>
      </div>

      {state.remarks && (
        <div className="rfx-note">
          <strong>Barangay staff wrote{state.asked_at ? ` on ${fmt(state.asked_at)}` : ''}:</strong>
          <p>{state.remarks}</p>
        </div>
      )}

      <ol className="rfx-items">
        {state.items.map((item) => {
          const meta = FIX_ITEM_LOOKUP[item.key] || {};
          const isDone = done(item.key);
          return (
            <li key={item.key} className={isDone ? 'is-done' : ''}>
              <i className={`bi ${isDone ? 'bi-check-circle-fill' : 'bi-circle'}`} aria-hidden="true"></i>
              <div className="rfx-item-body">
                <strong>{item.label}{isDone && <span className="rfx-done-tag">Done</span>}</strong>
                <span>{item.help}</span>

                {item.key === 'address' && (
                  <>
                    {state.proof && <small className="rfx-muted">On file: {PROOF_LABELS[state.proof.type] || state.proof.type} ({state.proof.status}, {fmt(state.proof.submitted_at)})</small>}
                    {open === 'address' ? (
                      <form className="rfx-form" onSubmit={uploadProof}>
                        <label>
                          <span>Type of document</span>
                          <select value={proof.type} onChange={(e) => setProof((p) => ({ ...p, type: e.target.value }))}>
                            <option value="">Select</option>
                            {state.proof_types.map((t) => <option key={t} value={t}>{PROOF_LABELS[t] || t}</option>)}
                          </select>
                        </label>
                        <label>
                          <span>File (JPEG, PNG, WebP or PDF, up to 10 MB)</span>
                          <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => setProof((p) => ({ ...p, file: e.target.files?.[0] || null }))} />
                        </label>
                        {state.proof_kind === 'endorsement' && <small className="rfx-muted">You have lived here for less than 6 months, so an HOA endorsement or another certification is needed.</small>}
                        <div className="rfx-form-actions">
                          <button type="button" className="rfx-btn" onClick={() => setOpen(null)} disabled={busy}>Cancel</button>
                          <button type="submit" className="rfx-btn rfx-btn-primary" disabled={busy}>{busy ? 'Uploading…' : 'Upload proof'}</button>
                        </div>
                      </form>
                    ) : (
                      <button type="button" className="rfx-link" onClick={() => setOpen('address')}><i className="bi bi-upload"></i> {state.proof ? 'Upload another proof' : 'Upload proof'}</button>
                    )}
                  </>
                )}

                {item.key === 'guardian' && (
                  <>
                    {state.guardian && (
                      <small className="rfx-muted">
                        On file: {state.guardian.name} ({state.guardian.relationship}){state.guardian.has_letter ? ', with a signed letter' : ''}, {state.guardian.status}
                      </small>
                    )}
                    {open === 'guardian' ? (
                      <form className="rfx-form" onSubmit={uploadGuardian}>
                        <div className="rfx-form-grid">
                          <label><span>Guardian's first name</span><input type="text" value={guardian.guardian_fname} maxLength={100} onChange={(e) => setGuardian((g) => ({ ...g, guardian_fname: e.target.value }))} /></label>
                          <label><span>Guardian's last name</span><input type="text" value={guardian.guardian_lname} maxLength={100} onChange={(e) => setGuardian((g) => ({ ...g, guardian_lname: e.target.value }))} /></label>
                          <label>
                            <span>Relationship to you</span>
                            <select value={guardian.guardian_relationship} onChange={(e) => setGuardian((g) => ({ ...g, guardian_relationship: e.target.value }))}>
                              <option value="">Select</option>
                              {(state.guardian_relationships || GUARDIAN_RELATIONSHIPS).map((r) => <option key={r} value={r}>{r}</option>)}
                            </select>
                          </label>
                        </div>
                        <label>
                          <span>Guardian's valid ID, showing the signature</span>
                          <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => setGuardian((g) => ({ ...g, id: e.target.files?.[0] || null }))} />
                        </label>
                        {needsLetter ? (
                          <label>
                            <span>Signed letter from the guardian (needed: the surname differs from yours)</span>
                            <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => setGuardian((g) => ({ ...g, letter: e.target.files?.[0] || null }))} />
                          </label>
                        ) : guardian.guardian_lname && <small className="rfx-muted">Same surname as yours: no letter needed.</small>}
                        <div className="rfx-form-actions">
                          <button type="button" className="rfx-btn" onClick={() => setOpen(null)} disabled={busy}>Cancel</button>
                          <button type="submit" className="rfx-btn rfx-btn-primary" disabled={busy}>{busy ? 'Uploading…' : 'Upload documents'}</button>
                        </div>
                      </form>
                    ) : (
                      <button type="button" className="rfx-link" onClick={() => setOpen('guardian')}><i className="bi bi-upload"></i> {state.guardian ? 'Upload again' : 'Upload documents'}</button>
                    )}
                  </>
                )}

                {meta.section && !isDone && (
                  <button type="button" className="rfx-link" onClick={() => goTo(meta.section)}>
                    <i className="bi bi-arrow-down-circle"></i> Go to this part of your profile
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {state.codes_waiting > 0 && (
        <div className="rfx-warn"><i className="bi bi-envelope-exclamation"></i> Some changes still need their verification code. Enter it below before sending your registration back.</div>
      )}

      <div className="rfx-changes">
        <strong>Changes you made</strong>
        {changes.length ? <ul>{changes.map((c) => <li key={c}>{c}</li>)}</ul> : <p className="rfx-muted">None yet.</p>}
      </div>

      <div className="rfx-send">
        <label className="rfx-check">
          <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
          I fixed what was asked, and the details on my profile are true and correct.
        </label>
        <div className="rfx-send-row">
          <span className="rfx-muted">
            {left > 1 ? `You can send it back ${left} more times.` : 'This is your last chance to send it back online; after this, please visit the Barangay Hall.'}
          </span>
          <button type="button" className="rfx-btn rfx-btn-primary" disabled={!confirmed || busy} onClick={resubmit}>
            <i className="bi bi-send"></i> {busy ? 'Sending…' : 'Send back for review'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default RegistrationFixPanel;
