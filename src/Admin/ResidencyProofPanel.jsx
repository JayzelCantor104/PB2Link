import React, { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { MIN_RESIDENCY_MONTHS, currentMonth, formatResidency } from '../lib/residency';
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

  return (
    <div className="rpp-box">
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
        {residency.under_minimum === false && <span className="rpp-pill is-verified">6+ months — no proof needed</span>}
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
            Check that the name and address match this resident, and that it is signed by the HOA officer, landlord or Purok leader.
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
              onClick={() => post({ action: 'reject', proof_id: pending.proof_id, remarks }, 'Rejected')}>
              <i className="bi bi-x-circle"></i> Reject
            </button>
            <button type="button" className="rpp-btn" disabled={busy}
              onClick={() => post({ action: 'verify', proof_id: pending.proof_id, remarks, valid_until: validUntil }, 'Verified')}>
              <i className="bi bi-patch-check"></i> Verify proof
            </button>
          </div>
        </div>
      )}

      {history.filter(h => h !== pending).length > 0 && (
        <details className="rpp-history">
          <summary>Proof history ({history.filter(h => h !== pending).length})</summary>
          <ul>
            {history.filter(h => h !== pending).map(h => (
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
