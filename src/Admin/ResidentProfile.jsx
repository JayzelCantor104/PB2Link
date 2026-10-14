import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import axios from 'axios';
import ResidencyProofPanel from './ResidencyProofPanel';
import { formatResidency } from '../lib/residency';
import { FIX_ITEMS, MAX_RESUBMITS, suggestFixItems } from '../lib/registrationFix';
import { CHANGE_CATEGORIES, CHANGE_CATEGORY_LOOKUP, REQUEST_STATES } from '../lib/changeRequests';
import {
  API_BASE, BLOOD_TYPES, CIVIL_STATUSES, GENDERS, NOTIFY_CHANNELS, RESIDENCY_STATUSES, SECTORS,
  STATUS_CLASS, STATUS_LABEL, fileUrl, fmtDate, fmtMonth, fullAddress, initials, isPdf, verificationChecks,
} from './residentConfig';

// One resident's full record for staff (admin_residents.php ?action=detail):
// decisions, profile, IDs and images, requests, and (Super Admin) change
// history. Opened from Profiling.jsx.

const DECISIONS = {
  approve: {
    title: 'Approve this account',
    icon: 'bi-check-circle-fill',
    tone: 'primary',
    button: 'Approve account',
    body: 'The resident can sign in right away. A residency proof waiting on this registration is marked verified.',
    remarks: null,
    notify: true,
  },
  require_action: {
    title: 'Ask the resident to fix something',
    icon: 'bi-exclamation-circle-fill',
    tone: 'warn',
    button: 'Send request',
    body: 'The account cannot sign in until staff approve it again. The resident sees your note when they try to sign in and in the notice.',
    remarks: { label: 'What needs to be fixed?', placeholder: 'e.g. The ID photo is blurry. Please bring your valid ID to the Barangay Hall.', required: true },
    notify: true,
  },
  archive: {
    title: 'Archive this resident',
    icon: 'bi-archive-fill',
    tone: 'danger',
    button: 'Archive',
    body: 'They can no longer sign in. The record, IDs and request history are kept and can be restored later.',
    remarks: { label: 'Reason', placeholder: 'e.g. Moved out of the barangay', required: true },
    notify: false,
  },
  restore: {
    title: 'Restore this account',
    icon: 'bi-arrow-counterclockwise',
    tone: 'primary',
    button: 'Restore',
    body: 'The account becomes active again and the resident can sign in.',
    remarks: null,
    notify: true,
  },
};

const ACTIONS_BY_STATUS = {
  Pending: ['approve', 'require_action', 'archive'],
  'Action Required': ['approve', 'require_action', 'archive'],
  Active: ['require_action', 'archive'],
  Archived: ['restore'],
};

const ACTION_LABEL = {
  approve: { label: 'Approve', icon: 'bi-check-lg', cls: 'rp-btn-primary' },
  require_action: { label: 'Ask for action', icon: 'bi-exclamation-circle', cls: 'rp-btn-warn' },
  archive: { label: 'Archive', icon: 'bi-archive', cls: 'rp-btn-ghost' },
  restore: { label: 'Restore', icon: 'bi-arrow-counterclockwise', cls: 'rp-btn-primary' },
};

/** Checks staff can accept or reject (admin_residents.php review_check). */
const REVIEW_META = {
  id: { label: 'ID scan', pass: 'Matched', fail: 'Mismatch' },
  selfie: { label: 'Selfie with ID', pass: 'Verified', fail: 'Needs Review' },
  philsys: { label: 'PhilSys card', pass: 'Matched', fail: 'Mismatch' },
  address: { label: 'Address on the ID', pass: 'Shows Pasong Buaya II', fail: 'Not a Pasong Buaya II address' },
  guardian: { label: 'Parent or guardian documents', pass: 'Verified', fail: 'Rejected' },
};

const REQUEST_STATUS_TONE = (s) => {
  const v = String(s || '').toLowerCase();
  if (/(claimed|completed|approved|resolved|ready)/.test(v)) return 'ok';
  if (/(declined|rejected|cancel|closed)/.test(v)) return 'muted';
  return 'warn';
};

const FIELD_LABELS = {
  fName: 'First name', mName: 'Middle name', lName: 'Last name', suffix: 'Suffix', gender: 'Sex', birth_date: 'Birth date',
  civil_status: 'Civil status', spouse_name_text: 'Spouse', height: 'Height', blood_type: 'Blood type', religion: 'Religion',
  birth_city: 'Birth city', birth_province: 'Birth province', birth_country: 'Birth country', contact_num: 'Mobile',
  email: 'Email', notify_channel: 'Updates by', house_no: 'House no.', block_lot: 'Block & lot', street: 'Street',
  subdivision: 'Subdivision', zone: 'Zone', area: 'Area', landmark: 'Landmark', residing_since: 'Living here since',
  residency_status: 'Residency status', contact_person: 'Emergency contact', contactp_relationship: 'Relationship',
  contactp_num: 'Emergency number', philsys_nat_id: 'PhilSys number', valid_id: 'ID type', status: 'Account status',
  admin_remarks: 'Staff remarks', is_senior: 'Senior', is_pwd: 'PWD', is_solo_parent: 'Solo Parent', is_indigent: 'Indigent',
  is_4ps: '4Ps', valid_id_img_front: 'ID front', valid_id_img_back: 'ID back', valid_id_img_holding: 'Selfie with ID',
  profile_picture: 'Profile photo', philsys_img_front: 'PhilSys front', philsys_img_back: 'PhilSys back',
  proof_pwd: 'PWD proof', proof_4ps: '4Ps proof', proof_solo_parent: 'Solo Parent proof', proof_indigent: 'Indigent proof',
  age: 'Age', years_in_PB2: 'Years in PB2', mobile_verified_at: 'Mobile verified', philsys_verification_status: 'PhilSys check',
};

const Info = ({ label, children, wide }) => (
  <div className={`rp-info${wide ? ' is-wide' : ''}`}>
    <span className="rp-info-label">{label}</span>
    <span className="rp-info-value">{children === null || children === undefined || children === '' ? <em className="rp-none">Not given</em> : children}</span>
  </div>
);

const Section = ({ icon, title, children, aside }) => (
  // A div, not <section>: the site stylesheet centers every section.
  <div className="rp-section">
    <div className="rp-section-head">
      <h4><i className={`bi ${icon}`}></i> {title}</h4>
      {aside}
    </div>
    {children}
  </div>
);

/** A record image, with a note instead of a broken image when the file is gone. */
const DocImage = ({ path, label }) => {
  const [broken, setBroken] = useState(false);
  if (broken) return <span className="rp-doc-empty"><i className="bi bi-exclamation-triangle"></i> File missing</span>;
  return <img src={fileUrl(path)} alt={label} loading="lazy" onError={() => setBroken(true)} />;
};

// ------------------------------------------------------------------ edit form

// Fields staff may change directly. Name, address, move-in month, sectors,
// PhilSys, valid ID, email and mobile need the resident's proof or code
// (migration 028): staff ask the resident instead (RequestChangeDialog).
const EDIT_FIELDS = [
  'gender', 'birth_date', 'civil_status', 'spouse_name_text', 'height', 'blood_type', 'religion', 'birth_city',
  'birth_province', 'birth_country', 'notify_channel', 'residency_status', 'contact_person', 'contactp_relationship', 'contactp_num',
];

const formFrom = (r) => {
  const f = {};
  EDIT_FIELDS.forEach((k) => { f[k] = r[k] ?? ''; });
  return f;
};

/** Current value shown for each proof-backed category. */
const proofValue = (r, key) => {
  switch (key) {
    case 'name': return r.full_name;
    case 'address': return `${fullAddress(r) || 'No address'}${r.residing_since ? ` · since ${fmtMonth(r.residing_since)}` : ''}`;
    case 'sectors': return SECTORS.filter((s) => s.proof && Number(r[s.key]) === 1).map((s) => s.label).join(', ') || 'None';
    case 'philsys': return r.philsys_nat_id || 'None';
    case 'id': return r.valid_id || 'Not recorded';
    case 'contact': return `${r.email || 'No email'} · ${r.contact_num || 'no mobile'}`;
    default: return '';
  }
};

const EditForm = ({ resident, requests, onRequestChange, onCancel, onSaved, notify }) => {
  const original = useMemo(() => formFrom(resident), [resident]);
  const [form, setForm] = useState(original);
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState([]);
  const [saving, setSaving] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const changed = EDIT_FIELDS.filter((k) => String(form[k] ?? '').trim() !== String(original[k] ?? '').trim());

  const save = async (e) => {
    e.preventDefault();
    if (!changed.length) { setErrors(['Nothing was changed.']); return; }
    if (reason.trim().length < 5) { setErrors(['Give a short reason for the change; the resident sees it too.']); return; }
    setSaving(true);
    setErrors([]);
    const changes = {};
    changed.forEach((k) => { changes[k] = form[k]; });
    try {
      const res = await axios.post(`${API_BASE}/admin_residents.php?action=update`, { id: resident.resident_id, changes, reason });
      if (!res.data.success) {
        setErrors(res.data.errors || [res.data.message || 'The changes were not saved.']);
        return;
      }
      const sent = res.data.notified;
      const how = sent ? [sent.sms && 'SMS', sent.email && 'email'].filter(Boolean).join(' and ') : '';
      notify('Saved', `${res.data.message} ${how ? `The resident was told by ${how}.` : 'The notice could not be sent; tell the resident directly.'}`, how ? 'success' : 'warning');
      if (res.data.warnings?.length) notify('Check for a duplicate', res.data.warnings.join(' '), 'warning');
      onSaved();
    } catch {
      setErrors(['The server could not be reached. Nothing was saved.']);
    } finally {
      setSaving(false);
    }
  };

  const field = (k, input) => (
    <label className={`rp-field${changed.includes(k) ? ' is-changed' : ''}`}>
      <span>{FIELD_LABELS[k]}{changed.includes(k) && <b className="rp-changed-dot" title="Changed"> • changed</b>}</span>
      {input}
    </label>
  );
  const text = (k, props = {}) => field(k, <input type="text" value={form[k]} onChange={set(k)} {...props} />);
  const select = (k, options, { allowEmpty = false, emptyLabel = 'None' } = {}) => field(k, (
    <select value={form[k]} onChange={set(k)}>
      {allowEmpty && <option value="">{emptyLabel}</option>}
      {options.map((o) => (typeof o === 'string'
        ? <option key={o} value={o}>{o}</option>
        : <option key={o.value} value={o.value}>{o.label}</option>))}
    </select>
  ));
  const openByCategory = Object.fromEntries((requests || []).filter((q) => q.status === 'open').map((q) => [q.category, q]));

  return (
    <form className="rp-edit" onSubmit={save}>
      <div className="rp-edit-note">
        <i className="bi bi-info-circle"></i>
        <span>
          Edits apply right away, are recorded in the audit log with your reason, and the resident is always notified of what changed.
          Information that needs the resident's proof or code can't be changed here: ask the resident to change it in Edit Profile.
        </span>
      </div>

      <Section icon="bi-person" title="Personal details">
        <div className="rp-form-grid">
          {select('gender', GENDERS)}
          {field('birth_date', <input type="date" value={form.birth_date} max={new Date().toISOString().slice(0, 10)} onChange={set('birth_date')} required />)}
          {select('civil_status', CIVIL_STATUSES)}
          {text('spouse_name_text', { maxLength: 150 })}
          {field('height', <input type="text" inputMode="decimal" value={form.height} onChange={set('height')} placeholder="cm" />)}
          {select('blood_type', BLOOD_TYPES, { allowEmpty: true, emptyLabel: 'Unknown' })}
          {text('religion', { maxLength: 50 })}
          {text('birth_city', { maxLength: 100 })}
          {text('birth_province', { maxLength: 100 })}
          {text('birth_country', { maxLength: 100 })}
        </div>
        <p className="rp-hint">Senior citizen status follows the birth date.</p>
      </Section>

      <Section icon="bi-telephone" title="Residency, updates and emergency contact">
        <div className="rp-form-grid">
          {select('residency_status', RESIDENCY_STATUSES)}
          {select('notify_channel', NOTIFY_CHANNELS)}
          {text('contact_person', { maxLength: 100 })}
          {text('contactp_relationship', { maxLength: 50 })}
          {field('contactp_num', <input type="tel" inputMode="numeric" value={form.contactp_num} onChange={set('contactp_num')} maxLength={20} />)}
        </div>
      </Section>

      <Section icon="bi-shield-lock" title="Needs the resident's proof">
        <p className="rp-hint rp-hint-top">
          The resident changes these in Edit Profile with the proof. You are notified on Profile Approvals and accept or reject it there.
        </p>
        <div className="rp-proof-list">
          {CHANGE_CATEGORIES.map((cat) => {
            const open = openByCategory[cat.key];
            const st = open ? REQUEST_STATES[open.state] || REQUEST_STATES.open : null;
            return (
              <div key={cat.key} className="rp-proof-row">
                <div>
                  <strong>{cat.label}</strong>
                  <span>{proofValue(resident, cat.key)}</span>
                  {open && <small className={`rp-tone is-${st.tone}`}>Requested: {open.details} · {st.label}</small>}
                </div>
                {!open && (
                  <button type="button" className="rp-btn rp-btn-ghost rp-btn-sm" onClick={() => onRequestChange(cat.key)} disabled={resident.status !== 'Active'}
                    title={resident.status !== 'Active' ? 'For a registration under review, use "Ask for action".' : `Needs ${cat.proof}`}>
                    <i className="bi bi-send"></i> Ask the resident to change it
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </Section>

      <div className="rp-edit-footer">
        <label className="rp-field rp-reason">
          <span>Reason for the change (the resident sees it; kept in the audit log)</span>
          <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Corrected civil status per marriage certificate presented at the hall" />
        </label>
        {errors.length > 0 && (
          <div className="rp-alert is-bad" role="alert">
            <i className="bi bi-x-octagon"></i>
            <ul>{errors.map((e) => <li key={e}>{e}</li>)}</ul>
          </div>
        )}
        <div className="rp-edit-actions">
          <span className="rp-muted">{changed.length ? `${changed.length} field(s) changed` : 'No changes yet'}</span>
          <button type="button" className="rp-btn rp-btn-ghost" onClick={onCancel} disabled={saving}>Close</button>
          <button type="submit" className="rp-btn rp-btn-primary" disabled={saving || !changed.length}>
            {saving ? 'Saving…' : 'Save and notify the resident'}
          </button>
        </div>
      </div>
    </form>
  );
};

// ------------------------------------------------------------------ review / request dialogs

const CHECK_FOLLOW_UP = {
  id: { item: 'id', category: 'id' },
  selfie: { item: 'id', category: 'id' },
  philsys: { item: 'philsys', category: 'philsys' },
  address: { item: 'address', category: 'address' },
  guardian: { item: 'guardian', category: null },
};

/** Staff verdict on one automatic check (admin_residents.php review_check). */
const ReviewCheckDialog = ({ check, decision, resident, onClose, onDone, notify }) => {
  const [note, setNote] = useState('');
  const [followUp, setFollowUp] = useState(decision === 'reject');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const accept = decision === 'accept';
  const follow = CHECK_FOLLOW_UP[check.key] || {};
  const canFollow = !accept && (resident.status === 'Active' ? !!follow.category : resident.status !== 'Archived');

  const submit = async (e) => {
    e.preventDefault();
    if (!accept && note.trim().length < 5) { setError('Say why it is rejected; the resident sees this.'); return; }
    setBusy(true);
    setError('');
    try {
      const res = await axios.post(`${API_BASE}/admin_residents.php?action=review_check`, { id: resident.resident_id, check: check.key, decision, note });
      if (!res.data.success) { setError(res.data.message || 'Not saved.'); return; }
      const sent = res.data.notified;
      const how = sent ? [sent.sms && 'SMS', sent.email && 'email'].filter(Boolean).join(' and ') : '';
      notify(res.data.message, how ? `The resident was told by ${how}.` : 'The notice could not be sent; tell the resident directly.', how ? 'success' : 'warning');
      onDone(canFollow && followUp ? follow : null);
    } catch {
      setError('The server could not be reached. Nothing was changed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rp-dialog-backdrop" onMouseDown={(e) => { e.stopPropagation(); onClose(); }}>
      <form className={`rp-dialog ${accept ? '' : 'is-danger'}`} onMouseDown={(e) => e.stopPropagation()} onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="rp-rev-title">
        <h3 id="rp-rev-title"><i className={`bi ${accept ? 'bi-check-circle-fill' : 'bi-x-circle-fill'}`}></i> {accept ? 'Accept' : 'Reject'}: {check.label}</h3>
        <p className="rp-dialog-who">{resident.full_name} · {resident.control_num}</p>
        <p>
          {accept
            ? `You looked at the documents and they are in order. The status becomes "${check.pass}", marked as confirmed by you.`
            : `The status becomes "${check.fail}". The resident is told why.`}
          {' '}The decision is kept in the record and the audit log.
        </p>
        <label className="rp-field">
          <span>{accept ? 'Note (optional)' : 'Why is it rejected? (the resident sees this)'}</span>
          <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={250} autoFocus
            placeholder={accept ? 'e.g. Face matches the ID photo; name readable.' : 'e.g. The face in the selfie does not match the photo on the ID.'} />
        </label>
        {canFollow && (
          <label className="rp-check rp-check-block">
            <input type="checkbox" checked={followUp} onChange={(e) => setFollowUp(e.target.checked)} />
            <span>Then ask the resident to upload a new one{resident.status === 'Active' ? ' (in Edit Profile, with proof)' : ' (restricted Edit Profile)'}.</span>
          </label>
        )}
        {!accept && !canFollow && resident.status === 'Active' && (
          <p className="rp-hint">Guardian documents can only be re-collected while the registration is under review, or at the Barangay Hall.</p>
        )}
        {error && <div className="rp-alert is-bad" role="alert"><i className="bi bi-x-octagon"></i> {error}</div>}
        <div className="rp-dialog-actions">
          <button type="button" className="rp-btn rp-btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className={`rp-btn ${accept ? 'rp-btn-primary' : 'rp-btn-danger'}`} disabled={busy}>{busy ? 'Saving…' : accept ? 'Accept' : 'Reject'}</button>
        </div>
      </form>
    </div>
  );
};

/** Ask an Active resident to change proof-backed information in Edit Profile. */
const RequestChangeDialog = ({ category, resident, onClose, onDone, notify }) => {
  const [cat, setCat] = useState(category || 'name');
  const [details, setDetails] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const meta = CHANGE_CATEGORY_LOOKUP[cat];
  const placeholders = {
    name: 'e.g. Surname is now DELA CRUZ (married)',
    address: 'e.g. Moved to Blk 5 Lot 2, Sampaguita St.',
    sectors: 'e.g. Add PWD / Remove Solo Parent',
    philsys: 'e.g. Add the PhilSys number',
    id: 'e.g. The ID on file has expired',
    contact: 'e.g. The mobile number on file no longer works',
  };

  const submit = async (e) => {
    e.preventDefault();
    if (details.trim().length < 3) { setError('Say what should change.'); return; }
    setBusy(true);
    setError('');
    try {
      const res = await axios.post(`${API_BASE}/admin_residents.php?action=request_change`, { id: resident.resident_id, category: cat, details, note });
      if (!res.data.success) { setError(res.data.message || 'Not sent.'); return; }
      const sent = res.data.notified;
      const how = sent ? [sent.sms && 'SMS', sent.email && 'email'].filter(Boolean).join(' and ') : '';
      notify('Request sent', how ? `The resident was asked by ${how}. It also shows on their Edit Profile.` : 'It shows on their Edit Profile, but the notice could not be sent; tell the resident directly.', how ? 'success' : 'warning');
      onDone();
    } catch {
      setError('The server could not be reached. Nothing was sent.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rp-dialog-backdrop" onMouseDown={(e) => { e.stopPropagation(); onClose(); }}>
      <form className="rp-dialog" onMouseDown={(e) => e.stopPropagation()} onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="rp-req-title">
        <h3 id="rp-req-title"><i className="bi bi-send-fill"></i> Ask the resident to change it</h3>
        <p className="rp-dialog-who">{resident.full_name} · {resident.control_num}</p>
        <p>
          The resident is notified and sees the request on Edit Profile. They make the change there with {meta.proof};
          {cat === 'contact' ? ' it applies once they enter the code.' : ' you then accept or reject it on Profile Approvals.'} Nothing on the record changes until then.
        </p>
        <label className="rp-field">
          <span>What to change</span>
          <select value={cat} onChange={(e) => setCat(e.target.value)}>
            {CHANGE_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        </label>
        <p className="rp-hint rp-hint-top">On file: {proofValue(resident, cat)}</p>
        <label className="rp-field">
          <span>Details (the resident sees this)</span>
          <input type="text" value={details} onChange={(e) => setDetails(e.target.value)} maxLength={250} placeholder={placeholders[cat]} autoFocus />
        </label>
        <label className="rp-field">
          <span>Note (optional)</span>
          <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={250} placeholder="e.g. Reported at the hall on Oct 14" />
        </label>
        {error && <div className="rp-alert is-bad" role="alert"><i className="bi bi-x-octagon"></i> {error}</div>}
        <div className="rp-dialog-actions">
          <button type="button" className="rp-btn rp-btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="rp-btn rp-btn-primary" disabled={busy}>{busy ? 'Sending…' : 'Send request'}</button>
        </div>
      </form>
    </div>
  );
};

// ------------------------------------------------------------------ dialogs

const DecisionDialog = ({ decision, resident, warnings, changes, presetItems, onClose, onDone, notify }) => {
  const cfg = DECISIONS[decision];
  const [remarks, setRemarks] = useState(decision === 'require_action' && resident.status === 'Action Required' ? (resident.admin_remarks || '') : '');
  const [tell, setTell] = useState(cfg.notify);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Ask for action (migration 027): fix online in restricted mode, or visit the hall.
  const usedUp = (resident.resubmit_count || 0) >= (resident.max_resubmits || MAX_RESUBMITS);
  const [mode, setMode] = useState(usedUp ? 'hall' : 'online');
  const [items, setItems] = useState(() => (presetItems?.length ? presetItems : resident.fix_items?.length ? resident.fix_items : suggestFixItems(resident.review_reasons || [], resident.age)));
  // Approve: the resident's waiting profile changes can be approved with the account.
  const [withChanges, setWithChanges] = useState(!!resident.resubmitted_at);

  const toggleItem = (key) => setItems((list) => (list.includes(key) ? list.filter((k) => k !== key) : [...list, key]));

  const submit = async (e) => {
    e.preventDefault();
    if (cfg.remarks?.required && remarks.trim().length < 5) { setError(`${cfg.remarks.label} (at least a few words).`); return; }
    if (decision === 'require_action' && mode === 'online' && items.length === 0) { setError('Tick at least one thing the resident can fix online, or choose "Visit the Barangay Hall".'); return; }
    setBusy(true);
    setError('');
    try {
      if (decision === 'approve' && withChanges && changes.length) {
        const ch = await axios.post(`${API_BASE}/admin_process_profile.php`, {
          action: 'approve', user_id: resident.user_id, batch_action: true, change_ids: changes.map((c) => c.change_id), note: 'Approved with the account',
        });
        if (!ch.data.success) { setError(`The profile changes were not approved: ${ch.data.message || 'please try again'}. The account was not changed.`); return; }
      }
      const body = { id: resident.resident_id, decision, remarks, notify: tell };
      if (decision === 'require_action') body.fix_items = mode === 'online' ? items : [];
      const res = await axios.post(`${API_BASE}/admin_residents.php?action=status`, body);
      if (!res.data.success) { setError(res.data.message || 'Not saved.'); return; }
      const sent = res.data.notified;
      const how = sent ? [sent.sms && 'SMS', sent.email && 'email'].filter(Boolean).join(' and ') : '';
      notify(res.data.message, tell ? (how ? `The resident was notified by ${how}.` : 'The notice could not be sent; tell the resident directly.') : 'The resident was not notified.', tell && !how ? 'warning' : 'success');
      onDone();
    } catch {
      setError('The server could not be reached. Nothing was changed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rp-dialog-backdrop" onMouseDown={(e) => { e.stopPropagation(); onClose(); }}>
      <form className={`rp-dialog is-${cfg.tone}`} onMouseDown={(e) => e.stopPropagation()} onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="rp-dialog-title">
        <h3 id="rp-dialog-title"><i className={`bi ${cfg.icon}`}></i> {cfg.title}</h3>
        <p className="rp-dialog-who">{resident.full_name} · {resident.control_num}</p>
        <p>{cfg.body}</p>
        {decision === 'approve' && warnings.length > 0 && (
          <div className="rp-alert is-warn">
            <i className="bi bi-exclamation-triangle"></i>
            <div>
              <strong>Approving even though:</strong>
              <ul>{warnings.map((w) => <li key={w}>{w}</li>)}</ul>
            </div>
          </div>
        )}
        {decision === 'approve' && changes.length > 0 && (
          <label className="rp-check rp-check-block">
            <input type="checkbox" checked={withChanges} onChange={(e) => setWithChanges(e.target.checked)} />
            <span>
              Also approve the {changes.length} profile change{changes.length > 1 ? 's' : ''} the resident made
              ({[...new Set(changes.map((c) => FIELD_LABELS[c.field_name] || c.field_name.replace(/_/g, ' ')))].join(', ')}).
              Untick to review them on Profile Approvals instead.
            </span>
          </label>
        )}

        {decision === 'require_action' && (
          <div className="rp-fix-choice">
            <label className={`rp-fix-mode${mode === 'online' ? ' is-on' : ''}${usedUp ? ' is-disabled' : ''}`}>
              <input type="radio" name="fix-mode" checked={mode === 'online'} disabled={usedUp} onChange={() => setMode('online')} />
              <span>
                <strong>Let the resident fix it online</strong>
                <small>
                  {usedUp
                    ? `Not available: they already sent it back ${resident.resubmit_count} times.`
                    : 'They sign in to a restricted Edit Profile, fix what you tick, and send it back to this queue.'}
                </small>
              </span>
            </label>
            {mode === 'online' && (
              <div className="rp-fix-items">
                {FIX_ITEMS.map((i) => (
                  <label key={i.key} className={`rp-check${items.includes(i.key) ? ' is-changed' : ''}`} title={i.help}>
                    <input type="checkbox" checked={items.includes(i.key)} onChange={() => toggleItem(i.key)} /> {i.label}
                  </label>
                ))}
              </div>
            )}
            <label className={`rp-fix-mode${mode === 'hall' ? ' is-on' : ''}`}>
              <input type="radio" name="fix-mode" checked={mode === 'hall'} onChange={() => setMode('hall')} />
              <span>
                <strong>Visit the Barangay Hall</strong>
                <small>For a suspected fake or someone else's ID, or anything a person must check face to face. The resident can't sign in at all.</small>
              </span>
            </label>
          </div>
        )}

        {cfg.remarks && (
          <label className="rp-field">
            <span>{cfg.remarks.label}</span>
            <textarea rows={3} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder={decision === 'require_action' && mode === 'online' ? 'e.g. The ID photo is blurry. Please upload a clearer photo of the front and back.' : cfg.remarks.placeholder} autoFocus />
          </label>
        )}
        <label className="rp-check">
          <input type="checkbox" checked={tell} onChange={(e) => setTell(e.target.checked)} />
          Notify the resident (by their chosen channel; email if SMS can't go out)
        </label>
        {error && <div className="rp-alert is-bad" role="alert"><i className="bi bi-x-octagon"></i> {error}</div>}
        <div className="rp-dialog-actions">
          <button type="button" className="rp-btn rp-btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className={`rp-btn ${cfg.tone === 'danger' ? 'rp-btn-danger' : cfg.tone === 'warn' ? 'rp-btn-warn' : 'rp-btn-primary'}`} disabled={busy}>
            {busy ? 'Saving…' : cfg.button}
          </button>
        </div>
      </form>
    </div>
  );
};

/** Same person registered more than once: keep the newest, archive the rest. */
const DuplicateDialog = ({ resident, records, onClose, onDone, notify }) => {
  const [tell, setTell] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const all = [{ ...resident, requests: null, self: true }, ...records]
    .sort((a, b) => String(b.date_registered).localeCompare(String(a.date_registered)) || b.resident_id - a.resident_id);
  const keep = all[0];
  const older = all.slice(1);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await axios.post(`${API_BASE}/admin_residents.php?action=resolve_duplicate`, { id: resident.resident_id, notify: tell });
      if (!res.data.success) { setError(res.data.message || 'Not saved.'); return; }
      notify('Duplicate resolved', res.data.message, 'success');
      onDone(res.data.kept_id);
    } catch {
      setError('The server could not be reached. Nothing was changed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rp-dialog-backdrop" onMouseDown={(e) => { e.stopPropagation(); onClose(); }}>
      <form className="rp-dialog is-warn" onMouseDown={(e) => e.stopPropagation()} onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="rp-dup-title">
        <h3 id="rp-dup-title"><i className="bi bi-people-fill"></i> Keep the newest registration</h3>
        <p>Compare the ID photos first: only do this if these records are really the same person.</p>
        <ul className="rp-dup-list">
          {all.map((d) => (
            <li key={d.resident_id} className={d === keep ? 'is-keep' : ''}>
              <span>
                <strong>{d.control_num}</strong>{d.self && ' (this record)'}
                <small>{d.status} · registered {fmtDate(d.date_registered, true)}{d.requests ? ` · ${d.requests} request(s)` : ''}</small>
              </span>
              <b>{d === keep ? 'Keep' : 'Archive'}</b>
            </li>
          ))}
        </ul>
        <p>
          The older record{older.length > 1 ? 's are' : ' is'} archived as "replaced by {keep.control_num}" and kept for reference
          {older.some((o) => o.requests) ? '; their request history stays with them' : ''}.
          {keep.status !== 'Active' && ` ${keep.control_num} is asked to confirm their details online (restricted Edit Profile), then comes back to this queue.`}
        </p>
        {keep.status !== 'Active' && (
          <label className="rp-check">
            <input type="checkbox" checked={tell} onChange={(e) => setTell(e.target.checked)} />
            Notify the resident of {keep.control_num}
          </label>
        )}
        {error && <div className="rp-alert is-bad" role="alert"><i className="bi bi-x-octagon"></i> {error}</div>}
        <div className="rp-dialog-actions">
          <button type="button" className="rp-btn rp-btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="rp-btn rp-btn-warn" disabled={busy}>{busy ? 'Saving…' : `Keep ${keep.control_num}`}</button>
        </div>
      </form>
    </div>
  );
};

const UploadDialog = ({ item, resident, onClose, onDone, notify }) => {
  const [file, setFile] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const preview = useMemo(() => (file && file.type.startsWith('image/') ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const submit = async (e) => {
    e.preventDefault();
    if (!file) { setError('Choose a file.'); return; }
    if (note.trim().length < 5) { setError('Say briefly why the file is being replaced.'); return; }
    setBusy(true);
    setError('');
    const fd = new FormData();
    fd.append('id', resident.resident_id);
    fd.append('field', item.field);
    fd.append('note', note);
    fd.append('file', file);
    try {
      const res = await axios.post(`${API_BASE}/admin_residents.php?action=upload`, fd);
      if (!res.data.success) { setError(res.data.message || 'Not uploaded.'); return; }
      notify('File replaced', res.data.message, 'success');
      onDone();
    } catch {
      setError('The server could not be reached.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rp-dialog-backdrop" onMouseDown={(e) => { e.stopPropagation(); onClose(); }}>
      <form className="rp-dialog" onMouseDown={(e) => e.stopPropagation()} onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="rp-up-title">
        <h3 id="rp-up-title"><i className="bi bi-upload"></i> Replace {item.label.toLowerCase()}</h3>
        <p className="rp-dialog-who">{resident.full_name} · {resident.control_num}</p>
        <p>
          Use this when the resident presents a new document at the hall. The old file stays in the record folder.
          {item.field === 'valid_id_img_front' && ' The ID scan result becomes "Manual Entry".'}
          {item.field === 'valid_id_img_holding' && ' The selfie check becomes "Not Checked".'}
        </p>
        <label className="rp-field">
          <span>File ({item.pdf ? 'JPEG, PNG, WebP or PDF' : 'JPEG, PNG or WebP'}, up to 10 MB)</span>
          <input type="file" accept={item.pdf ? 'image/jpeg,image/png,image/webp,application/pdf' : 'image/jpeg,image/png,image/webp'} onChange={(e) => setFile(e.target.files[0] || null)} />
        </label>
        {preview && <img className="rp-upload-preview" src={preview} alt="Selected file preview" />}
        <label className="rp-field">
          <span>Why is it being replaced?</span>
          <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Resident presented a new driver's license at the hall" />
        </label>
        {error && <div className="rp-alert is-bad" role="alert"><i className="bi bi-x-octagon"></i> {error}</div>}
        <div className="rp-dialog-actions">
          <button type="button" className="rp-btn rp-btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="rp-btn rp-btn-primary" disabled={busy}>{busy ? 'Uploading…' : 'Replace file'}</button>
        </div>
      </form>
    </div>
  );
};

const Lightbox = ({ items, index, onClose, onMove }) => {
  const item = items[index];
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
      if (e.key === 'ArrowRight') onMove(1);
      if (e.key === 'ArrowLeft') onMove(-1);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose, onMove]);
  if (!item) return null;
  return (
    <div className="rp-lightbox" onMouseDown={(e) => { e.stopPropagation(); onClose(); }} role="dialog" aria-modal="true" aria-label={item.label}>
      <div className="rp-lightbox-bar" onMouseDown={(e) => e.stopPropagation()}>
        <strong>{item.label}</strong>
        <span>{index + 1} / {items.length}</span>
        <a href={fileUrl(item.path)} target="_blank" rel="noopener noreferrer"><i className="bi bi-box-arrow-up-right"></i> Open full size</a>
        <button type="button" onClick={onClose} aria-label="Close"><i className="bi bi-x-lg"></i></button>
      </div>
      {items.length > 1 && (
        <>
          <button type="button" className="rp-lightbox-nav is-prev" onMouseDown={(e) => { e.stopPropagation(); onMove(-1); }} aria-label="Previous"><i className="bi bi-chevron-left"></i></button>
          <button type="button" className="rp-lightbox-nav is-next" onMouseDown={(e) => { e.stopPropagation(); onMove(1); }} aria-label="Next"><i className="bi bi-chevron-right"></i></button>
        </>
      )}
      <img src={fileUrl(item.path)} alt={item.label} onMouseDown={(e) => e.stopPropagation()} />
    </div>
  );
};

// ------------------------------------------------------------------ main

const ResidentProfile = ({ residentId, onClose, onChanged, onOpenResident, notify, isSuper }) => {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('profile');
  const [editing, setEditing] = useState(false);
  const [decision, setDecision] = useState(null);
  const [upload, setUpload] = useState(null);
  const [dupOpen, setDupOpen] = useState(false);
  const [reviewing, setReviewing] = useState(null);   // { check, decision }
  const [requesting, setRequesting] = useState(null); // category key
  const [presetItems, setPresetItems] = useState(null);
  const [zoom, setZoom] = useState(null);
  const panelRef = useRef(null);

  // Profiling mounts one panel per resident (key), so state starts fresh.
  // load() asks for a fresh copy; a reply that arrives after closing is ignored.
  const [reloadKey, setReloadKey] = useState(0);
  const load = useCallback(() => setReloadKey((k) => k + 1), []);
  useEffect(() => {
    let alive = true;
    axios.get(`${API_BASE}/admin_residents.php`, { params: { action: 'detail', id: residentId } })
      .then((res) => {
        if (!alive) return;
        if (res.data.success) { setData(res.data); setError(''); } else setError(res.data.message || 'Could not load the record.');
      })
      .catch(() => { if (alive) setError('Could not load the record.'); });
    return () => { alive = false; };
  }, [residentId, reloadKey]);
  useEffect(() => { panelRef.current?.focus(); }, [residentId]);

  // Esc closes the top-most layer; the lightbox handles its own.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape' || zoom !== null) return;
      if (decision) setDecision(null);
      else if (dupOpen) setDupOpen(false);
      else if (reviewing) setReviewing(null);
      else if (requesting) setRequesting(null);
      else if (upload) setUpload(null);
      else if (!editing) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zoom, decision, dupOpen, reviewing, requesting, upload, editing, onClose]);

  const refresh = () => { load(); onChanged(); };

  const r = data?.resident;
  const gallery = useMemo(() => {
    if (!r) return [];
    const items = [
      { field: 'valid_id_img_front', label: 'ID front', path: r.valid_id_img_front, group: 'id' },
      { field: 'valid_id_img_back', label: 'ID back', path: r.valid_id_img_back, group: 'id' },
      { field: 'valid_id_img_holding', label: 'Selfie holding the ID', path: r.valid_id_img_holding, group: 'id' },
      { field: 'profile_picture', label: 'Profile photo', path: r.profile_picture, group: 'id' },
    ];
    // PhilSys card photos, when they are a separate card from the ID above.
    if (r.philsys_nat_id || r.philsys_img_front) {
      if (r.philsys_img_front !== r.valid_id_img_front) items.push({ field: 'philsys_img_front', label: 'PhilSys card front', path: r.philsys_img_front, group: 'philsys' });
      if (r.philsys_img_back !== r.valid_id_img_back) items.push({ field: 'philsys_img_back', label: 'PhilSys card back', path: r.philsys_img_back, group: 'philsys' });
    }
    SECTORS.filter((s) => s.proof && (Number(r[s.key]) === 1 || r[s.proof])).forEach((s) => {
      items.push({ field: s.proof, label: `${s.label} proof`, path: r[s.proof], group: 'sector', pdf: true });
    });
    // A minor's parent/guardian documents (migration 027), the latest set.
    const g = data?.guardians?.[0];
    if (g) {
      items.push({ field: 'guardian_id', label: "Guardian's ID", path: g.id_path, group: 'guardian', noReplace: true });
      if (g.letter_path) items.push({ field: 'guardian_letter', label: "Guardian's signed letter", path: g.letter_path, group: 'guardian', noReplace: true });
    }
    return items;
  }, [r, data]);
  const zoomable = gallery.filter((g) => g.path && !isPdf(g.path));
  const openZoom = (item) => {
    if (isPdf(item.path)) { window.open(fileUrl(item.path), '_blank', 'noopener'); return; }
    setZoom(zoomable.findIndex((g) => g.field === item.field));
  };

  const warnings = useMemo(() => {
    if (!data) return [];
    return [...(data.resident.review_reasons || []), ...(data.duplicates || [])];
  }, [data]);

  const copy = (text) => {
    navigator.clipboard?.writeText(text).then(() => notify('Copied', text, 'success')).catch(() => {});
  };

  const tabs = [
    { key: 'profile', label: 'Profile', icon: 'bi-person-lines-fill' },
    { key: 'verification', label: 'IDs & verification', icon: 'bi-shield-check' },
    { key: 'activity', label: 'Requests & activity', icon: 'bi-clock-history', count: data?.history?.length },
    ...(isSuper ? [{ key: 'history', label: 'Change history', icon: 'bi-journal-text' }] : []),
  ];

  const checks = r ? verificationChecks(r) : [];
  const snap = r?.id_ocr_snapshot;

  // Rendered on <body>: the admin layout's content column is its own stacking
  // layer, which would keep the header above this panel.
  return createPortal(
    <div className="rp-overlay" onMouseDown={() => { if (!editing) onClose(); }}>
      <aside className="rp-panel" ref={panelRef} tabIndex={-1} onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Resident record">
        {!data && !error && <div className="rp-loading"><i className="bi bi-arrow-repeat"></i> Loading the record…</div>}
        {error && (
          <div className="rp-loading">
            <p>{error}</p>
            <button type="button" className="rp-btn rp-btn-ghost" onClick={onClose}>Close</button>
          </div>
        )}

        {r && (
          <>
            {/* A div, not <header>: the site stylesheet styles every header. */}
            <div className="rp-head">
              <button type="button" className="rp-avatar" onClick={() => r.profile_picture && openZoom(gallery.find((g) => g.field === 'profile_picture'))} title={r.profile_picture ? 'View profile photo' : ''}>
                {r.profile_picture ? <img src={fileUrl(r.profile_picture)} alt="" /> : <span>{initials(r)}</span>}
              </button>
              <div className="rp-head-main">
                <div className="rp-head-title">
                  <h2>{r.full_name}</h2>
                  <span className={`rp-status ${STATUS_CLASS[r.status] || ''}`}>{STATUS_LABEL[r.status] || r.status}</span>
                </div>
                <div className="rp-head-meta">
                  <button type="button" className="rp-copy" onClick={() => copy(r.control_num)} title="Copy control number">
                    <i className="bi bi-upc"></i> {r.control_num} <i className="bi bi-copy"></i>
                  </button>
                  <span><i className="bi bi-calendar-plus"></i> Registered {fmtDate(r.date_registered)}</span>
                  <span>
                    <i className="bi bi-person-check"></i>{' '}
                    {r.approval_method === 'auto' ? 'Approved automatically' : r.approval_method === 'manual' ? 'Approved by staff' : 'Not approved yet'}
                  </span>
                  <span><i className="bi bi-box-arrow-in-right"></i> {r.last_login ? `Last sign-in ${fmtDate(r.last_login, true)}` : 'Never signed in'}</span>
                </div>
              </div>
              <button type="button" className="rp-close" onClick={onClose} aria-label="Close"><i className="bi bi-x-lg"></i></button>
            </div>

            {!editing && (
              <div className="rp-actionbar">
                {(ACTIONS_BY_STATUS[r.status] || []).map((d) => (
                  <button key={d} type="button" className={`rp-btn ${ACTION_LABEL[d].cls}`} onClick={() => setDecision(d)}>
                    <i className={`bi ${ACTION_LABEL[d].icon}`}></i> {d === 'require_action' && r.status === 'Action Required' ? 'Change request' : ACTION_LABEL[d].label}
                  </button>
                ))}
                <span className="rp-actionbar-gap" />
                <button type="button" className="rp-btn rp-btn-ghost" onClick={() => setEditing(true)}>
                  <i className="bi bi-pencil-square"></i> Edit details
                </button>
              </div>
            )}

            <div className="rp-body">
              {/* Things staff should see before anything else. */}
              {r.status === 'Pending' && r.review_reasons.length > 0 && (
                <div className="rp-alert is-warn">
                  <i className="bi bi-flag-fill"></i>
                  <div>
                    <strong>Why this registration needs review</strong>
                    <ul>{r.review_reasons.map((x) => <li key={x}>{x}</li>)}</ul>
                    <small>Check the IDs and verification tab before deciding.</small>
                  </div>
                </div>
              )}
              {r.status === 'Pending' && r.review_reasons.length === 0 && (
                <div className="rp-alert is-info">
                  <i className="bi bi-info-circle-fill"></i>
                  <div>No automatic check flagged this registration. Compare the ID photos with the details, then approve.</div>
                </div>
              )}
              {r.status === 'Action Required' && (
                <div className="rp-alert is-info">
                  <i className={`bi ${r.fix_items.length ? 'bi-laptop' : 'bi-building'}`}></i>
                  <div>
                    {r.fix_items.length ? (
                      <>
                        <strong>Waiting for the resident to fix it online</strong>
                        <p>Asked to fix: {r.fix_labels.join(', ')}{r.action_requested_at ? ` (since ${fmtDate(r.action_requested_at, true)})` : ''}.</p>
                        <small>Sent back {r.resubmit_count} of {r.max_resubmits} times. When they send it back it returns to "Needs review".</small>
                        {data.fix_changes.length > 0 && <p>Done so far: {data.fix_changes.join('; ')}.</p>}
                      </>
                    ) : (
                      <>
                        <strong>Waiting for the resident to visit the Barangay Hall</strong>
                        <p>They can't sign in. Fix the record with "Edit details" or "Replace" when they come, then approve.</p>
                      </>
                    )}
                  </div>
                </div>
              )}
              {r.replaced_by && (
                <div className="rp-alert is-note">
                  <i className="bi bi-arrow-right-circle-fill"></i>
                  <div>
                    <strong>Replaced by a newer registration</strong>
                    <p>
                      This record was closed as a duplicate of {r.replaced_by.control_num}.{' '}
                      {onOpenResident && <button type="button" className="rp-link" onClick={() => onOpenResident(r.replaced_by.resident_id)}>Open {r.replaced_by.control_num}</button>}
                    </p>
                  </div>
                </div>
              )}
              {data.duplicates.length > 0 && (
                <div className="rp-alert is-bad">
                  <i className="bi bi-people-fill"></i>
                  <div>
                    <strong>Possible duplicate record</strong>
                    <ul>
                      {data.duplicate_records.map((d) => (
                        <li key={d.resident_id}>
                          {d.control_num} ({d.status}, registered {fmtDate(d.date_registered)}{d.requests ? `, ${d.requests} request(s)` : ''}) has the same name and birth date or PhilSys number.{' '}
                          {onOpenResident && <button type="button" className="rp-link" onClick={() => onOpenResident(d.resident_id)}>Open</button>}
                        </li>
                      ))}
                    </ul>
                    <button type="button" className="rp-btn rp-btn-ghost rp-btn-sm" onClick={() => setDupOpen(true)}>
                      <i className="bi bi-person-check"></i> Same person: keep the newest registration
                    </button>
                  </div>
                </div>
              )}
              {r.admin_remarks && r.status !== 'Active' && (
                <div className="rp-alert is-note">
                  <i className="bi bi-chat-left-text-fill"></i>
                  <div><strong>{r.status === 'Archived' ? 'Archived because' : 'Staff asked the resident'}</strong><p>{r.admin_remarks}</p></div>
                </div>
              )}
              {data.change_requests.some((q) => q.status === 'open') && (
                <div className="rp-alert is-info">
                  <i className="bi bi-send-fill"></i>
                  <div>
                    <strong>Asked the resident to change</strong>
                    <ul className="rp-req-list">
                      {data.change_requests.filter((q) => q.status === 'open').map((q) => {
                        const st = REQUEST_STATES[q.state] || REQUEST_STATES.open;
                        return (
                          <li key={q.request_id}>
                            <span><b>{q.label}:</b> {q.details} <span className={`rp-tone is-${st.tone}`}>{st.label}</span>
                              {q.rejection && <small className="rp-muted"> Rejected: {q.rejection}</small>}
                              <small className="rp-muted"> · asked {fmtDate(q.created_at)}</small></span>
                            {q.state === 'submitted'
                              ? <Link className="rp-link" to="/admin/profiles">Review</Link>
                              : <button type="button" className="rp-link" onClick={async () => {
                                  const res = await axios.post(`${API_BASE}/admin_residents.php?action=cancel_change_request`, { id: r.resident_id, request_id: q.request_id });
                                  notify(res.data.success ? 'Cancelled' : 'Not cancelled', res.data.message, res.data.success ? 'success' : 'error');
                                  refresh();
                                }}>Cancel</button>}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </div>
              )}
              {data.changes.length > 0 && (
                <div className="rp-alert is-info">
                  <i className="bi bi-person-gear"></i>
                  <div>
                    <strong>{data.changes.length} profile change(s) waiting for approval</strong>
                    <p>
                      {[...new Set(data.changes.map((c) => FIELD_LABELS[c.field_name] || c.field_name.replace(/_/g, ' ')))].join(', ')}.{' '}
                      {r.status === 'Pending' ? 'You can approve them together with the account, or ' : ''}
                      <Link to="/admin/profiles">review them on Profile Approvals</Link>.
                    </p>
                  </div>
                </div>
              )}

              {editing ? (
                <EditForm resident={r} requests={data.change_requests} onRequestChange={(cat) => setRequesting(cat)} notify={notify} onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); refresh(); }} />
              ) : (
                <>
                  <nav className="rp-tabs" role="tablist">
                    {tabs.map((t) => (
                      <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={`rp-tab${tab === t.key ? ' is-active' : ''}`} onClick={() => setTab(t.key)}>
                        <i className={`bi ${t.icon}`}></i> {t.label}
                        {t.count ? <span className="rp-tab-count">{t.count}</span> : null}
                      </button>
                    ))}
                  </nav>

                  {tab === 'profile' && (
                    <div className="rp-tabpanel">
                      <Section icon="bi-person" title="Personal information">
                        <div className="rp-grid">
                          <Info label="First name">{r.fName}</Info>
                          <Info label="Middle name">{r.mName}</Info>
                          <Info label="Last name">{r.lName}</Info>
                          <Info label="Suffix">{r.suffix}</Info>
                          <Info label="Sex">{r.gender}</Info>
                          <Info label="Birth date">{r.birth_date ? `${fmtDate(r.birth_date)} (${r.age} yrs)` : ''}</Info>
                          <Info label="Civil status">{r.civil_status}</Info>
                          <Info label="Spouse">{r.spouse_name_text}</Info>
                          <Info label="Height">{r.height ? `${r.height} cm` : ''}</Info>
                          <Info label="Blood type">{r.blood_type}</Info>
                          <Info label="Religion">{r.religion}</Info>
                          <Info label="Birthplace">{[r.birth_city, r.birth_province, r.birth_country].filter(Boolean).join(', ')}</Info>
                        </div>
                      </Section>

                      <Section icon="bi-house" title="Address and residency">
                        <div className="rp-grid">
                          <Info label="Full address" wide>{fullAddress(r)}</Info>
                          <Info label="House no.">{r.house_no}</Info>
                          <Info label="Block & lot">{r.block_lot}</Info>
                          <Info label="Street">{r.street}</Info>
                          <Info label="Subdivision">{r.subdivision}</Info>
                          <Info label="Zone / Purok">{r.zone}</Info>
                          <Info label="Area">{r.area}</Info>
                          <Info label="Landmark">{r.landmark}</Info>
                          <Info label="Residency status">{r.residency_status}</Info>
                          <Info label="Living in PB2 since">
                            {r.residing_since ? <>{fmtMonth(r.residing_since)} <span className="rp-muted">({formatResidency(r.months_residing)})</span></> : ''}
                          </Info>
                          <Info label="Address on the ID">
                            {r.id_address_match === null || r.id_address_match === undefined ? 'Not read'
                              : Number(r.id_address_match) === 1 ? <span className="rp-tone is-ok">Shows Pasong Buaya II</span>
                                : <span className="rp-tone is-warn">Not a Pasong Buaya II address</span>}
                          </Info>
                        </div>
                      </Section>

                      <Section icon="bi-telephone" title="Contact">
                        <div className="rp-grid">
                          <Info label="Mobile">
                            {r.contact_num ? <>{r.contact_num} <span className={`rp-tone ${r.mobile_verified_at ? 'is-ok' : 'is-warn'}`}>{r.mobile_verified_at ? 'Verified' : 'Not verified'}</span></> : ''}
                          </Info>
                          <Info label="Email">{r.email}</Info>
                          <Info label="Updates sent by">{NOTIFY_CHANNELS.find((c) => c.value === r.notify_channel)?.label || 'Email'}</Info>
                          <Info label="Emergency contact">{r.contact_person}</Info>
                          <Info label="Relationship">{r.contactp_relationship}</Info>
                          <Info label="Emergency number">{r.contactp_num}</Info>
                        </div>
                      </Section>

                      <Section icon="bi-people" title="Sectors">
                        <div className="rp-sector-row">
                          {SECTORS.map((s) => {
                            const on = Number(r[s.key]) === 1;
                            const proof = s.proof ? r[s.proof] : null;
                            return (
                              <div key={s.key} className={`rp-sector${on ? ' is-on' : ''}`}>
                                <i className={`bi ${on ? 'bi-check-circle-fill' : 'bi-circle'}`}></i>
                                <span>{s.label}</span>
                                {on && s.proof && (proof
                                  ? <button type="button" className="rp-link" onClick={() => openZoom(gallery.find((g) => g.field === s.proof))}>View proof</button>
                                  : <small className="rp-muted">No proof on file</small>)}
                                {on && s.key === 'is_senior' && r.age !== null && r.age < 60 && <small className="rp-tone is-warn">Age {r.age}</small>}
                              </div>
                            );
                          })}
                        </div>
                        {r.ftj_availed_at && <p className="rp-hint">First-Time Jobseeker exemption used on {fmtDate(r.ftj_availed_at)}.</p>}
                      </Section>
                    </div>
                  )}

                  {tab === 'verification' && (
                    <div className="rp-tabpanel">
                      <Section icon="bi-shield-check" title="Automatic checks">
                        <div className="rp-check-cards">
                          {checks.map((c) => {
                            const meta = REVIEW_META[c.key];
                            const rv = data.check_reviews?.[c.key];
                            // Only checks that didn't pass need a person; passed ones need nothing.
                            const reviewable = meta && c.tone !== 'ok' && c.tone !== 'none' && !(c.key === 'philsys' && !r.philsys_nat_id) && !(c.key === 'address' && !r.valid_id_img_front);
                            return (
                              <div key={c.key} className={`rp-check-card is-${c.tone}`}>
                                <div className="rp-check-card-head">
                                  <span>{c.label}</span>
                                  <b>{c.status}</b>
                                </div>
                                <p>{c.text}</p>
                                {rv && (
                                  <p className={`rp-review-line is-${rv.decision}`}>
                                    <i className={`bi ${rv.decision === 'accepted' ? 'bi-person-check-fill' : 'bi-person-x-fill'}`}></i>{' '}
                                    {rv.decision === 'accepted' ? 'Confirmed' : 'Rejected'} by {rv.reviewer || 'staff'} · {fmtDate(rv.reviewed_at)}{rv.note ? `: ${rv.note}` : ''}
                                  </p>
                                )}
                                {reviewable && (
                                  <div className="rp-review-actions">
                                    <button type="button" className="rp-btn rp-btn-primary rp-btn-xs" onClick={() => setReviewing({ check: { key: c.key, ...meta }, decision: 'accept' })}><i className="bi bi-check-lg"></i> Accept</button>
                                    {c.tone !== 'bad' && <button type="button" className="rp-btn rp-btn-ghost rp-btn-xs" onClick={() => setReviewing({ check: { key: c.key, ...meta }, decision: 'reject' })}><i className="bi bi-x-lg"></i> Reject</button>}
                                  </div>
                                )}
                                {meta && c.tone === 'ok' && !rv && <small className="rp-muted"><i className="bi bi-robot"></i> Passed the automatic check: no review needed.</small>}
                                {reviewable && !rv && <small className="rp-review-needed"><i className="bi bi-person-exclamation"></i> Needs a staff decision.</small>}
                                {c.key === 'mobile' && <small className="rp-muted">Confirmed only by the resident's SMS code; no staff review.</small>}
                              </div>
                            );
                          })}
                        </div>
                        <div className="rp-grid">
                          <Info label="ID type">{r.valid_id}</Info>
                          <Info label="PhilSys number">{r.philsys_nat_id}</Info>
                        </div>
                        {snap && (
                          <div className="rp-compare">
                            <div className="rp-compare-head">
                              <strong>What the ID scanner read vs. the record</strong>
                              {snap.confidence !== undefined && <span className="rp-muted">Scan confidence {Math.round(Number(snap.confidence))}%</span>}
                            </div>
                            <table>
                              <thead><tr><th>Field</th><th>Scanned from the ID</th><th>On the record</th></tr></thead>
                              <tbody>
                                {['fName', 'mName', 'lName', 'birth_date'].filter((k) => snap[k] !== undefined).map((k) => {
                                  const same = String(snap[k] || '').trim().toUpperCase() === String(r[k] || '').trim().toUpperCase();
                                  return (
                                    <tr key={k} className={same ? '' : 'is-diff'}>
                                      <td>{FIELD_LABELS[k]}</td>
                                      <td>{snap[k] || '—'}</td>
                                      <td>{r[k] || '—'} {!same && <i className="bi bi-exclamation-triangle-fill" title="Different"></i>}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </Section>

                      <Section icon="bi-images" title="IDs and photos" aside={<span className="rp-muted">Click a photo to enlarge. New IDs and proofs come from the resident ("Ask the resident to change it").</span>}>
                        <div className="rp-gallery">
                          {gallery.map((g) => (
                            <figure key={g.field} className="rp-doc">
                              <button type="button" className="rp-doc-thumb" onClick={() => g.path && openZoom(g)} disabled={!g.path} aria-label={`View ${g.label}`}>
                                {!g.path ? <span className="rp-doc-empty"><i className="bi bi-image"></i> Not on file</span>
                                  : isPdf(g.path) ? <span className="rp-doc-empty"><i className="bi bi-file-earmark-pdf"></i> PDF, open</span>
                                    : <DocImage path={g.path} label={g.label} />}
                              </button>
                              <figcaption>
                                <span>{g.label}</span>
                                {g.field === 'profile_picture' && <button type="button" className="rp-link" onClick={() => setUpload(g)}><i className="bi bi-arrow-repeat"></i> Replace</button>}
                              </figcaption>
                            </figure>
                          ))}
                        </div>
                      </Section>

                      {(data.guardians.length > 0 || (r.age !== null && r.age < 18)) && (
                        <Section icon="bi-person-hearts" title="Parent or guardian (applicant under 18)">
                          {data.guardians.length === 0 ? (
                            <p className="rp-muted">No parent or guardian documents on file. Ask for them with "Ask for action" (Parent or guardian documents).</p>
                          ) : (() => {
                            const g = data.guardians[0];
                            return (
                              <>
                                <div className="rp-grid">
                                  <Info label="Guardian">{`${g.guardian_fname} ${g.guardian_lname}`}</Info>
                                  <Info label="Relationship">{g.relationship}</Info>
                                  <Info label="Surname">
                                    {Number(g.same_surname) === 1
                                      ? <span className="rp-tone is-ok">Same as the applicant's</span>
                                      : <span className="rp-tone is-warn">Different: check the signed letter</span>}
                                  </Info>
                                  <Info label="Status">
                                    <span className={`rp-tone ${g.status === 'Verified' ? 'is-ok' : g.status === 'Rejected' ? 'is-bad' : 'is-warn'}`}>{g.status}</span>
                                    {g.reviewed_at && <small className="rp-muted"> {fmtDate(g.reviewed_at)}{g.reviewed_by_name ? ` by ${g.reviewed_by_name}` : ''}</small>}
                                  </Info>
                                  <Info label="Submitted">{fmtDate(g.submitted_at, true)}</Info>
                                </div>
                                <div className="rp-review-actions">
                                  {g.status !== 'Verified' && <button type="button" className="rp-btn rp-btn-primary rp-btn-xs" onClick={() => setReviewing({ check: { key: 'guardian', ...REVIEW_META.guardian }, decision: 'accept' })}><i className="bi bi-check-lg"></i> Accept</button>}
                                  {g.status !== 'Rejected' && <button type="button" className="rp-btn rp-btn-ghost rp-btn-xs" onClick={() => setReviewing({ check: { key: 'guardian', ...REVIEW_META.guardian }, decision: 'reject' })}><i className="bi bi-x-lg"></i> Reject</button>}
                                </div>
                                <p className="rp-hint">
                                  Check that the guardian's ID is genuine{Number(g.same_surname) === 1 ? ' and shares the surname' : ', and that the signature on the letter matches the one on the ID'}.
                                  Their photos are in "IDs and photos" above. Approving the account marks these documents verified.
                                  {data.guardians.length > 1 && ` ${data.guardians.length - 1} earlier upload(s) on file.`}
                                </p>
                              </>
                            );
                          })()}
                        </Section>
                      )}

                      <Section icon="bi-house-check" title="Proof of residence">
                        <ResidencyProofPanel residentId={r.resident_id} notify={notify} onChange={load} />
                      </Section>
                    </div>
                  )}

                  {tab === 'activity' && (
                    <div className="rp-tabpanel">
                      <div className="rp-stat-row">
                        <div className="rp-stat"><b>{data.history.length}</b><span>Requests and reports</span></div>
                        <div className="rp-stat"><b>{data.payments.total}</b><span>Payments{data.payments.for_verification ? `, ${data.payments.for_verification} to verify` : ''}</span></div>
                        <div className="rp-stat"><b>{data.issue_reports}</b><span>Issue map reports</span></div>
                        <div className="rp-stat"><b>{data.changes.length}</b><span>Profile changes waiting</span></div>
                      </div>
                      <Section icon="bi-clock-history" title="Requests and reports">
                        {data.history.length === 0 ? <p className="rp-muted">No requests yet.</p> : (
                          <div className="rp-table-wrap">
                            <table className="rp-table">
                              <thead><tr><th>Type</th><th>Tracking code</th><th>Status</th><th>Date</th><th></th></tr></thead>
                              <tbody>
                                {data.history.map((h) => (
                                  <tr key={`${h.kind}-${h.tracking_code}-${h.date_requested}`}>
                                    <td>{h.type}</td>
                                    <td><code>{h.tracking_code}</code></td>
                                    <td><span className={`rp-tone is-${REQUEST_STATUS_TONE(h.status)}`}>{h.status}</span></td>
                                    <td>{fmtDate(h.date_requested)}</td>
                                    <td>
                                      <Link className="rp-link" to={h.kind === 'amenity' ? '/admin/amenities' : h.kind === 'incident' ? '/admin/incidents' : `/admin/documents?q=${encodeURIComponent(h.tracking_code || '')}`}>
                                        Open <i className="bi bi-arrow-right"></i>
                                      </Link>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </Section>
                    </div>
                  )}

                  {tab === 'history' && isSuper && (
                    <div className="rp-tabpanel">
                      <Section icon="bi-journal-text" title="Staff changes to this record">
                        {!data.audit || data.audit.length === 0 ? <p className="rp-muted">No staff changes recorded.</p> : (
                          <ol className="rp-timeline">
                            {data.audit.map((a, i) => (
                              <li key={i}>
                                <div className="rp-timeline-head">
                                  <strong>{a.description}</strong>
                                  <span className="rp-muted">{a.actor_username || 'system'} · {fmtDate(a.created_at, true)}</span>
                                </div>
                                {a.changed_fields.length > 0 && (
                                  <ul className="rp-diff">
                                    {a.changed_fields.map((f, j) => (
                                      <li key={j}>
                                        <span>{FIELD_LABELS[f.field] || f.field}</span>
                                        <del>{f.old_value === null || f.old_value === '' ? '—' : String(f.old_value)}</del>
                                        <i className="bi bi-arrow-right"></i>
                                        <ins>{f.new_value === null || f.new_value === '' ? '—' : String(f.new_value)}</ins>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </li>
                            ))}
                          </ol>
                        )}
                      </Section>
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </aside>

      {decision && r && (
        <DecisionDialog decision={decision} resident={r} warnings={warnings} changes={data.changes} presetItems={presetItems} notify={notify} onClose={() => { setDecision(null); setPresetItems(null); }} onDone={() => { setDecision(null); setPresetItems(null); refresh(); }} />
      )}
      {reviewing && r && (
        <ReviewCheckDialog
          check={reviewing.check}
          decision={reviewing.decision}
          resident={r}
          notify={notify}
          onClose={() => setReviewing(null)}
          onDone={(follow) => {
            setReviewing(null);
            refresh();
            // A rejected check: ask the resident for a new one.
            if (follow && r.status === 'Active' && follow.category) setRequesting(follow.category);
            else if (follow && follow.item && r.status !== 'Archived') { setPresetItems([follow.item]); setDecision('require_action'); }
          }}
        />
      )}
      {requesting && r && (
        <RequestChangeDialog category={requesting} resident={r} notify={notify} onClose={() => setRequesting(null)} onDone={() => { setRequesting(null); refresh(); }} />
      )}
      {dupOpen && r && (
        <DuplicateDialog
          resident={r}
          records={data.duplicate_records}
          notify={notify}
          onClose={() => setDupOpen(false)}
          onDone={(keptId) => {
            setDupOpen(false);
            refresh();
            if (keptId && keptId !== r.resident_id && onOpenResident) onOpenResident(keptId);
          }}
        />
      )}
      {upload && r && (
        <UploadDialog item={upload} resident={r} notify={notify} onClose={() => setUpload(null)} onDone={() => { setUpload(null); refresh(); }} />
      )}
      {zoom !== null && zoomable.length > 0 && (
        <Lightbox items={zoomable} index={zoom} onClose={() => setZoom(null)} onMove={(d) => setZoom((z) => (z + d + zoomable.length) % zoomable.length)} />
      )}
    </div>,
    document.body,
  );
};

export default ResidentProfile;
