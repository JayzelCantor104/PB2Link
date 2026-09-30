import React, { useState } from 'react';
import {
  MIN_RESIDENCY_MONTHS, RESIDENCY_PROOF_TYPES, SUGGESTED_PROOFS,
  currentMonth, formatResidency,
} from '../lib/residency';
import '../styles/id-on-file.css';

const API_BASE = '/api_backend';

const fileUrl = (path) => {
  if (!path) return null;
  const normalized = path.replace(/^(\.\.\/)+/, '').replace(/^api\//, '').replace(/^\/+/, '');
  return `${API_BASE}/${normalized}`;
};

const ID_STATUS_LABEL = {
  Matched: { text: 'Scan matched', tone: 'ok' },
  Mismatch: { text: 'Scan mismatch — staff will double-check', tone: 'warn' },
  'Manual Entry': { text: 'Entered manually', tone: 'neutral' },
  'Not Scanned': { text: 'Not scanned', tone: 'neutral' },
};

/**
 * Shows the registration ID that will be used to verify this request (instead
 * of asking for a new upload), and — when `requireResidency` — the resident's
 * residency length and under-6-months proof, with an inline uploader.
 *
 * props: idOnFile, residency (from get_user_profile.php), requireResidency,
 *        showNoProofNeeded (false on pages that still ask for their own proof
 *        of residency, e.g. Certificate of Residency),
 *        residencyOnly (show just the residency / HOA proof part, e.g. under
 *        Business Clearance's "home-based business" checkbox),
 *        onResidencyChange(residency), showToast(title, message, type)
 */
const IdOnFileCard = ({ idOnFile, residency, requireResidency = false, showNoProofNeeded = true, residencyOnly = false, onResidencyChange, showToast }) => {
  const [since, setSince] = useState('');
  const [proofType, setProofType] = useState('');
  const [issuedBy, setIssuedBy] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [proofFile, setProofFile] = useState(null);
  const [busy, setBusy] = useState(false);

  const notify = (title, message, type) => showToast && showToast(title, message, type);

  const post = async (fields) => {
    const body = new FormData();
    Object.entries(fields).forEach(([k, v]) => { if (v !== null && v !== '') body.append(k, v); });
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/submit_residency_proof.php`, { method: 'POST', body, credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        notify('Saved', data.message, 'success');
        if (data.residency && onResidencyChange) onResidencyChange(data.residency);
        setProofFile(null);
      } else {
        notify('Not saved', data.message, 'error');
        if (data.residency && onResidencyChange) onResidencyChange(data.residency);
      }
    } catch {
      notify('Server Error', 'Could not reach the server. Please try again.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const saveSince = () => {
    if (!since) return notify('Missing month', 'Please choose the month you moved in.', 'error');
    post({ action: 'set_residing_since', residing_since: since });
  };

  const uploadProof = () => {
    if (!proofType || !proofFile) return notify('Incomplete', 'Please choose the type of proof and attach the file.', 'error');
    post({ proof_type: proofType, proof_file: proofFile, issued_by: issuedBy, issue_date: issueDate });
  };

  const idStatus = ID_STATUS_LABEL[idOnFile?.verification_status] || ID_STATUS_LABEL['Not Scanned'];
  const proof = residency?.proof;
  const suggested = SUGGESTED_PROOFS[residency?.residency_status] || [];

  return (
    <div className="iof-wrap">
      {/* ---- ID on file ---- */}
      {!residencyOnly && (
      <div className="iof-card">
        <div className="iof-card-head">
          <i className="bi bi-person-vcard-fill"></i>
          <div>
            <h4>Valid ID on file</h4>
            <p>The ID you submitted during registration will be used to verify this request — no need to upload it again.</p>
          </div>
        </div>

        {idOnFile ? (
          <>
            <div className="iof-id-row">
              {idOnFile.front && (
                <a href={fileUrl(idOnFile.front)} target="_blank" rel="noreferrer" className="iof-thumb" title="View ID (front)">
                  <img src={fileUrl(idOnFile.front)} alt="Your valid ID (front)" />
                </a>
              )}
              <div className="iof-id-meta">
                <span className="iof-id-type">{idOnFile.type || 'Government ID'}</span>
                <span className={`iof-pill iof-pill-${idStatus.tone}`}>{idStatus.text}</span>
                {idOnFile.change_pending && (
                  <span className="iof-pill iof-pill-neutral">ID change awaiting approval — your current ID is used until then</span>
                )}
              </div>
            </div>
            <p className="iof-note"><i className="bi bi-info-circle"></i> Bring this same ID when you claim your document at the Barangay Hall.</p>
          </>
        ) : (
          <p className="iof-alert iof-alert-danger">
            <i className="bi bi-exclamation-octagon"></i>
            We could not find the valid ID from your registration. Please update your ID from your profile before requesting.
          </p>
        )}
      </div>
      )}

      {/* ---- Residency length / HOA permit ---- */}
      {requireResidency && residency && (
        <div className="iof-card">
          <div className="iof-card-head">
            <i className="bi bi-house-check-fill"></i>
            <div>
              <h4>Residency in Pasong Buaya II</h4>
              <p>
                {residency.under_minimum === null
                  ? 'We need the month you started living here.'
                  : `Living here: ${formatResidency(residency.months)}`}
              </p>
            </div>
          </div>

          {residency.under_minimum === null && (
            <div className="iof-form">
              <label htmlFor="iof-since">Living in PB2 since *</label>
              <div className="iof-inline">
                <input id="iof-since" type="month" max={currentMonth()} value={since} onChange={(e) => setSince(e.target.value)} />
                <button type="button" className="iof-btn" onClick={saveSince} disabled={busy}>
                  {busy ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          )}

          {residency.under_minimum === false && showNoProofNeeded && (
            <p className="iof-alert iof-alert-ok"><i className="bi bi-check-circle-fill"></i> No additional residency proof needed.</p>
          )}

          {residency.under_minimum && residency.proof_in_force && (
            <p className={`iof-alert ${residency.proof_verified ? 'iof-alert-ok' : 'iof-alert-info'}`}>
              <i className={`bi ${residency.proof_verified ? 'bi-patch-check-fill' : 'bi-hourglass-split'}`}></i>
              {residency.proof_verified
                ? `Your ${proof.proof_type} is verified.`
                : `Your ${proof.proof_type} is awaiting verification. You can submit now — the document will be released once staff verify it.`}
            </p>
          )}

          {residency.under_minimum && !residency.proof_in_force && (
            <>
              <p className="iof-alert iof-alert-warn">
                <i className="bi bi-house-exclamation-fill"></i>
                <span>
                  You have lived here for less than {MIN_RESIDENCY_MONTHS} months, so the barangay needs an
                  <strong> HOA Certification (Permit to Reside)</strong> or another accepted proof of residency.
                  {proof?.status === 'Rejected' && proof.remarks && (
                    <><br /><em>Your previous proof was not accepted: {proof.remarks}</em></>
                  )}
                </span>
              </p>
              <div className="iof-form iof-grid">
                <div className="iof-field iof-span">
                  <label htmlFor="iof-proof-type">Type of proof *</label>
                  <select id="iof-proof-type" value={proofType} onChange={(e) => setProofType(e.target.value)}>
                    <option value="">Select proof</option>
                    {RESIDENCY_PROOF_TYPES.map(t => (
                      <option key={t.value} value={t.value}>
                        {t.label}{suggested[0] === t.value ? ' (suggested)' : ''}
                      </option>
                    ))}
                  </select>
                  {proofType && <small>{RESIDENCY_PROOF_TYPES.find(t => t.value === proofType)?.hint}</small>}
                </div>
                <div className="iof-field">
                  <label htmlFor="iof-issued-by">Issued by</label>
                  <input id="iof-issued-by" type="text" value={issuedBy} onChange={(e) => setIssuedBy(e.target.value)} placeholder="e.g. HOA President" />
                </div>
                <div className="iof-field">
                  <label htmlFor="iof-issue-date">Date issued</label>
                  <input id="iof-issue-date" type="date" max={new Date().toISOString().slice(0, 10)} value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
                </div>
                <div className="iof-field iof-span">
                  <label htmlFor="iof-proof-file">Upload proof * <small>(JPEG, PNG, WebP or PDF, max 10MB)</small></label>
                  <input id="iof-proof-file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => setProofFile(e.target.files?.[0] || null)} />
                </div>
                <div className="iof-span">
                  <button type="button" className="iof-btn" onClick={uploadProof} disabled={busy}>
                    {busy ? 'Uploading…' : 'Upload proof'}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default IdOnFileCard;
