import React, { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { MIN_RESIDENCY_MONTHS, currentMonth, formatResidency } from '../lib/residency';
import Toast from '../components/Toast';
import { useToast } from '../lib/useToast';
import './ResidencyProofPanel.css';

const API_BASE = '/api_backend';

const fileUrl = (path) => {
  if (!path) return null;
  const normalized = path.replace(/^(\.\.\/)+/, '').replace(/^api\//, '').replace(/^\/+/, '');
  return `${API_BASE}/${normalized}`;
};

const STATUS_CLASS = { Pending: 'is-pending', Verified: 'is-verified', Rejected: 'is-rejected' };

/**
 * Staff review of a resident's residency length and under-6-months proof
 * (HOA Certification / Permit to Reside or an accepted alternative), via
 * backend/api/admin_residency_proof.php. Used in Documents, Pending Users
 * and Profiling.
 *
 * props: residentId, onChange(residency)? (after a staff action),
 *        notify(title, message, type)?
 */
const ResidencyProofPanel = ({ residentId, onChange, notify }) => {
  const [residency, setResidency] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [remarks, setRemarks] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [editingSince, setEditingSince] = useState(false);
  const [since, setSince] = useState('');
  // Own confirmation dialog: the panel is used inside several admin pages.
  const { toast: confirmUi, confirmToast, closeToast } = useToast();

  // Callbacks kept in refs so a parent passing inline functions doesn't
  // re-trigger the load effect on every render.
  const onChangeRef = useRef(onChange);
  const notifyRef = useRef(notify);
  useEffect(() => { onChangeRef.current = onChange; notifyRef.current = notify; });

  const say = useCallback((title, message, type) => notifyRef.current && notifyRef.current(title, message, type), []);

  const apply = useCallback((data) => {
    setResidency(data.residency);
    setHistory(data.history || []);
  }, []);

  useEffect(() => {
    if (!residentId) return undefined;
    let cancelled = false;
    axios.get(`${API_BASE}/admin_residency_proof.php`, { params: { resident_id: residentId } })
      .then(({ data }) => { if (!cancelled && data.success) apply(data); })
      .catch(() => { if (!cancelled) say('Error', 'Could not load residency details.', 'error'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [residentId, apply, say]);

  const post = async (payload, successTitle) => {
    setBusy(true);
    try {
      const { data } = await axios.post(`${API_BASE}/admin_residency_proof.php`, payload);
      if (data.success) {
        apply(data);
        if (onChangeRef.current) onChangeRef.current(data.residency);
        setRemarks('');
        setValidUntil('');
        setEditingSince(false);
        say(successTitle, data.message, 'success');
      } else {
        say('Not saved', data.message, 'error');
      }
    } catch {
      say('Error', 'Could not reach the server.', 'error');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="rpp-box rpp-muted">Loading residency details…</div>;
  if (!residency) return null;

  const proof = residency.proof;
  const pending = proof && proof.status === 'Pending' ? proof : null;

  // Verifying or rejecting a proof decides whether the resident's documents can be
  // released, and a rejection reason is shown to them: ask first.
  const decide = async (action) => {
    const ok = action === 'verify'
      ? await confirmToast('Verify this proof of residence?', 'Documents held for this proof can then be released to the resident.', { confirmLabel: 'Verify' })
      : await confirmToast('Reject this proof of residence?', 'The resident will see your remarks and must upload a new proof.', { confirmLabel: 'Reject', danger: true });
    if (!ok) return;
    post(action === 'verify'
      ? { action: 'verify', proof_id: pending.proof_id, remarks, valid_until: validUntil }
      : { action: 'reject', proof_id: pending.proof_id, remarks }, action === 'verify' ? 'Verified' : 'Rejected');
  };

  return (
    <div className="rpp-box">
      <Toast toast={confirmUi} onClose={closeToast} />
      <div className="rpp-head">
        <div>
          <span className="rpp-label">Residency in PB2</span>
          <strong>
            {residency.months === null ? 'Move-in month not recorded' : formatResidency(residency.months)}
          </strong>
          {residency.residing_since && (
            <span className="rpp-sub">since {new Date(`${residency.residing_since}T00:00:00`).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })}</span>
          )}
        </div>
        {residency.under_minimum === false && (
          // migration 018: 6+ months is accepted alone only when the scanned
          // ID showed a Pasong Buaya II address; otherwise a proof of address.
          residency.id_address_match === 1 ? <span className="rpp-pill is-verified">6+ months — ID shows PB2 address</span>
          : residency.proof_verified ? <span className="rpp-pill is-verified">6+ months — proof of address verified</span>
          : residency.proof_in_force ? <span className="rpp-pill is-pending">6+ months — proof of address awaiting review</span>
          : residency.id_address_match === 0 ? <span className="rpp-pill is-pending">6+ months — ID address not in PB2</span>
          : <span className="rpp-pill is-verified">6+ months</span>
        )}
        {residency.under_minimum && (
          <span className={`rpp-pill ${residency.proof_verified ? 'is-verified' : 'is-pending'}`}>
            Under {MIN_RESIDENCY_MONTHS} months — {residency.proof_verified ? 'proof verified' : residency.proof_in_force ? 'proof awaiting review' : 'no valid proof'}
          </span>
        )}
      </div>

      {!editingSince ? (
        <button type="button" className="rpp-link" onClick={() => { setSince(residency.residing_since ? residency.residing_since.slice(0, 7) : ''); setEditingSince(true); }}>
          <i className="bi bi-pencil"></i> Correct move-in month
        </button>
      ) : (
        <div className="rpp-inline">
          <input type="month" max={currentMonth()} value={since} onChange={(e) => setSince(e.target.value)} />
          <button type="button" className="rpp-btn" disabled={busy || !since}
            onClick={() => post({ action: 'set_residing_since', resident_id: residentId, residing_since: since }, 'Updated')}>Save</button>
          <button type="button" className="rpp-btn is-ghost" onClick={() => setEditingSince(false)}>Cancel</button>
        </div>
      )}

      {/* The proof on file (from registration, Edit Profile or a request), whatever its status. */}
      {proof && proof.status !== 'Pending' && (
        <div className="rpp-proof rpp-onfile">
          <i className={`bi ${proof.status === 'Verified' ? 'bi-patch-check-fill' : 'bi-file-earmark-x'}`}></i>
          <div>
            <strong>{proof.proof_type} <span className={`rpp-pill ${STATUS_CLASS[proof.status] || ''}`}>{proof.status}</span></strong>
            <span className="rpp-sub">
              Proof of residence · uploaded {proof.submitted_at?.slice(0, 10)}
              {proof.reviewed_by_name ? ` · ${proof.status === 'Verified' ? 'verified' : 'reviewed'} by ${proof.reviewed_by_name}` : ''}
              {proof.valid_until ? ` · valid until ${proof.valid_until}` : ''}
              {proof.remarks ? ` · "${proof.remarks}"` : ''}
            </span>
          </div>
          <a href={fileUrl(proof.file_path)} target="_blank" rel="noreferrer" className="rpp-btn is-ghost">
            <i className="bi bi-box-arrow-up-right"></i> Open
          </a>
        </div>
      )}
      {!proof && residency.under_minimum === false && residency.id_address_match !== 1 && (
        <p className="rpp-muted">No proof of residence on file. The ID scan did not confirm a Pasong Buaya II address.</p>
      )}

      {pending && (
        <div className="rpp-review">
          <div className="rpp-proof">
            <i className="bi bi-file-earmark-check"></i>
            <div>
              <strong>{pending.proof_type}</strong>
              <span className="rpp-sub">
                {pending.issued_by ? `Issued by ${pending.issued_by}` : 'Issuer not stated'}
                {pending.issue_date ? ` · ${pending.issue_date}` : ''} · uploaded {pending.submitted_at?.slice(0, 10)}
              </span>
            </div>
            <a href={fileUrl(pending.file_path)} target="_blank" rel="noreferrer" className="rpp-btn is-ghost">
              <i className="bi bi-box-arrow-up-right"></i> Open
            </a>
          </div>
          <p className="rpp-muted">
            Check that it shows this resident's name and a Pasong Buaya II address. Certifications must be signed by the HOA officer, landlord or Purok leader.
          </p>
          <div className="rpp-grid">
            <label>
              Remarks <small>(required to reject — the resident sees this)</small>
              <input type="text" value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="e.g. Unsigned certificate" />
            </label>
            <label>
              Valid until <small>(optional)</small>
              <input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
            </label>
          </div>
          <div className="rpp-actions">
            <button type="button" className="rpp-btn is-danger" disabled={busy}
              onClick={() => decide('reject')}>
              <i className="bi bi-x-circle"></i> Reject
            </button>
            <button type="button" className="rpp-btn" disabled={busy}
              onClick={() => decide('verify')}>
              <i className="bi bi-patch-check"></i> Verify proof
            </button>
          </div>
        </div>
      )}

      {history.filter(h => h.proof_id !== proof?.proof_id).length > 0 && (
        <details className="rpp-history">
          <summary>Proof history ({history.filter(h => h.proof_id !== proof?.proof_id).length})</summary>
          <ul>
            {history.filter(h => h.proof_id !== proof?.proof_id).map(h => (
              <li key={h.proof_id}>
                <span className={`rpp-pill ${STATUS_CLASS[h.status] || ''}`}>{h.status}</span>
                <a href={fileUrl(h.file_path)} target="_blank" rel="noreferrer">{h.proof_type}</a>
                <span className="rpp-sub">
                  {h.submitted_at?.slice(0, 10)}
                  {h.reviewed_by_name ? ` · by ${h.reviewed_by_name}` : ''}
                  {h.valid_until ? ` · valid until ${h.valid_until}` : ''}
                  {h.remarks ? ` · "${h.remarks}"` : ''}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
};

export default ResidencyProofPanel;
