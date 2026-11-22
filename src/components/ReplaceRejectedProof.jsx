import React, { useState } from 'react';
import { ADDRESS_PROOF_TYPES, MIN_RESIDENCY_MONTHS, RESIDENCY_PROOF_TYPES } from '../lib/residency';

const API_BASE = '/api_backend';

/**
 * Edit Profile: upload a new proof in place of one staff rejected, through
 * submit_residency_proof.php (replace=hoa|other; the server checks there is a
 * rejected proof in that slot and which types it accepts). An HOA
 * Certification is replaced by an HOA Certification; a proof of address, for
 * 6+ months, by any accepted proof of address.
 *
 * props: proof (the rejected one), months (residing), notify(title, msg, type),
 *        onDone() (reload the profile)
 */
const ReplaceRejectedProof = ({ proof, months, notify, onDone }) => {
  const slot = proof.proof_type === 'HOA Certification' ? 'hoa' : 'other';
  const types = slot === 'hoa'
    ? RESIDENCY_PROOF_TYPES.filter((t) => t.value === 'HOA Certification')
    : months !== null && months >= MIN_RESIDENCY_MONTHS ? ADDRESS_PROOF_TYPES : RESIDENCY_PROOF_TYPES;
  const [open, setOpen] = useState(false);
  const [type, setType] = useState(slot === 'hoa' ? 'HOA Certification' : '');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const idBase = `ep-replace-${slot}`;

  const send = async () => {
    if (!type || !file) {
      notify('Incomplete', 'Choose the type of document and attach the file.', 'error');
      return;
    }
    const body = new FormData();
    body.append('replace', slot);
    body.append('proof_type', type);
    body.append('proof_file', file);
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/submit_residency_proof.php`, { method: 'POST', body, credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        notify('Proof sent', 'Barangay staff will check your new proof.', 'success');
        setOpen(false);
        setFile(null);
        if (onDone) onDone();
      } else {
        notify('Not sent', data.message || 'The proof could not be uploaded.', 'error');
      }
    } catch {
      notify('Connection Error', 'Could not reach the server. Please try again.', 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button type="button" className="ep2-mini-btn ep2-replace-open" onClick={() => setOpen(true)}>
        <i className="bi bi-upload" aria-hidden="true"></i> Upload a new proof
      </button>
    );
  }

  return (
    <div className="ep2-replace">
      <label htmlFor={`${idBase}-type`}>Type of document</label>
      <select id={`${idBase}-type`} value={type} onChange={(e) => setType(e.target.value)} disabled={slot === 'hoa'}>
        {slot !== 'hoa' && <option value="">Choose one</option>}
        {types.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
      </select>
      <label htmlFor={`${idBase}-file`}>File (JPEG, PNG, WebP or PDF, up to 10 MB)</label>
      <input id={`${idBase}-file`} type="file" accept="image/jpeg,image/png,image/webp,application/pdf"
        onChange={(e) => setFile(e.target.files?.[0] || null)} />
      <div className="ep2-replace-actions">
        <button type="button" className="ep2-mini-btn" onClick={() => { setOpen(false); setFile(null); }} disabled={busy}>Cancel</button>
        <button type="button" className="ep2-mini-btn is-primary" onClick={send} disabled={busy}>
          <i className="bi bi-send" aria-hidden="true"></i> {busy ? 'Sending…' : 'Send new proof'}
        </button>
      </div>
    </div>
  );
};

export default ReplaceRejectedProof;
