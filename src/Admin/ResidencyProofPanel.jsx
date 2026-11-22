import React, { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
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
 *        notify(title, message, type)?,
 *        onAskAction()? (opens Ask for action with "Proof of address" ticked;
 *        without it the follow-up note links to the resident record)
 */
const ResidencyProofPanel = ({ residentId, onChange, notify, onAskAction }) => {
  const [residency, setResidency] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  // Per proof (several can wait at once: a proof of address plus the HOA
  // Certification at registration), keyed by proof_id.
  const [remarks, setRemarks] = useState({});
  const [validUntil, setValidUntil] = useState({});
  const [editingSince, setEditingSince] = useState(false);
  const [since, setSince] = useState('');
  // Set after rejecting a proof on an account not approved yet: the resident
  // can't sign in to send a new one until staff ask for it.
  const [askAction, setAskAction] = useState(false);
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
        setRemarks({});
        setValidUntil({});
        setEditingSince(false);
        setAskAction(!!data.ask_action);
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
  // Every proof waiting for a check, each shown in full with its own Verify /
  // Reject (registration can send two: a proof of address and the HOA
  // Certification). Falls back to the proof in force when history is empty.
  const pendingProofs = history.filter((h) => h.status === 'Pending');
  if (!pendingProofs.length && proof && proof.status === 'Pending') pendingProofs.push(proof);
  const pendingIds = new Set(pendingProofs.map((p) => p.proof_id));
  const pastProofs = history.filter((h) => !pendingIds.has(h.proof_id) && h.proof_id !== proof?.proof_id);

  // Verifying or rejecting a proof decides whether the resident's documents can be
  // released, and a rejection reason is shown to them: ask first.
  const decide = async (action, p) => {
    const ok = action === 'verify'
      ? await confirmToast(`Verify the ${p.proof_type}?`, 'Documents held for this proof can then be released to the resident.', { confirmLabel: 'Verify' })
      : await confirmToast(`Reject the ${p.proof_type}?`, 'The resident will see your remarks and must upload a new proof.', { confirmLabel: 'Reject', danger: true });
    if (!ok) return;
    post(action === 'verify'
      ? { action: 'verify', proof_id: p.proof_id, remarks: remarks[p.proof_id] || '', valid_until: validUntil[p.proof_id] || '' }
      : { action: 'reject', proof_id: p.proof_id, remarks: remarks[p.proof_id] || '' }, action === 'verify' ? 'Verified' : 'Rejected');
  };

  return (
    <div className="rpp-box">
      <Toast toast={confirmUi} onClose={closeToast} />
      <div className="rpp-head">
        <div>
          <span className="rpp-label">Residency in Pasong Buaya II</span>
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
          residency.id_address_match === 1 ? <span className="rpp-pill is-verified">6+ months — address matched on the ID</span>
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

      {askAction && (
        <div className="rpp-next" role="status">
          <i className="bi bi-signpost-split" aria-hidden="true"></i>
          <div>
            <strong>Next: ask the resident for a new proof</strong>
            <span>This account isn't approved yet, so the resident can't sign in to send one. "Ask for action" with "Proof of address" ticked lets them sign in and upload it.</span>
          </div>
          {onAskAction
            ? <button type="button" className="rpp-btn" onClick={() => { setAskAction(false); onAskAction(); }}><i className="bi bi-exclamation-circle" aria-hidden="true"></i> Ask for action</button>
            : <Link className="rpp-btn" to={`/admin/profiling?open=${residentId}`}><i className="bi bi-person-lines-fill" aria-hidden="true"></i> Open resident record</Link>}
        </div>
      )}

      {pendingProofs.length > 1 && (
        <p className="rpp-count"><i className="bi bi-files" aria-hidden="true"></i> {pendingProofs.length} proofs to check</p>
      )}
      {pendingProofs.map((p, i) => (
        <div className="rpp-review" key={p.proof_id}>
          <div className="rpp-proof">
            <i className="bi bi-file-earmark-check"></i>
            <div>
              <strong>{pendingProofs.length > 1 ? `${i + 1}. ` : ''}{p.proof_type}</strong>
              <span className="rpp-sub">
                {p.issued_by ? `Issued by ${p.issued_by}` : 'Issuer not stated'}
                {p.issue_date ? ` · ${p.issue_date}` : ''} · uploaded {p.submitted_at?.slice(0, 10)}
              </span>
            </div>
            <a href={fileUrl(p.file_path)} target="_blank" rel="noreferrer" className="rpp-btn is-ghost">
              <i className="bi bi-box-arrow-up-right"></i> Open
            </a>
          </div>
          <p className="rpp-muted">
            {p.proof_type === 'HOA Certification'
              ? 'Check that it is signed by the HOA president or secretary and names this resident and their Pasong Buaya II address.'
              : 'Check that it shows this resident\'s name and a Pasong Buaya II address. Certifications must be signed by the HOA officer, landlord or Purok leader.'}
          </p>
          <div className="rpp-grid">
            <label>
              Remarks <small>(required to reject — the resident sees this)</small>
              <input type="text" value={remarks[p.proof_id] || ''} onChange={(e) => setRemarks((r) => ({ ...r, [p.proof_id]: e.target.value }))} placeholder="e.g. Unsigned certificate" />
            </label>
            <label>
              Valid until <small>(optional)</small>
              <input type="date" value={validUntil[p.proof_id] || ''} onChange={(e) => setValidUntil((v) => ({ ...v, [p.proof_id]: e.target.value }))} />
            </label>
          </div>
          <div className="rpp-actions">
            <button type="button" className="rpp-btn is-danger" disabled={busy}
              onClick={() => decide('reject', p)}>
              <i className="bi bi-x-circle"></i> Reject
            </button>
            <button type="button" className="rpp-btn" disabled={busy}
              onClick={() => decide('verify', p)}>
              <i className="bi bi-patch-check"></i> Verify proof
            </button>
          </div>
        </div>
      ))}

      {pastProofs.length > 0 && (
        <details className="rpp-history">
          <summary>Proof history ({pastProofs.length})</summary>
          <ul>
            {pastProofs.map(h => (
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
