import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import Toast from '../components/Toast';
import { useToast } from '../lib/useToast';
import PaymentPanel from './PaymentPanel';
import { PAYMENT_STATUS_STYLE, peso } from '../lib/payment';
import '../styles/payment.css';
import './Payments.css';

const API_BASE = '/api_backend';
const QUEUE_FILTERS = ['For Verification', 'Unpaid', 'Rejected', 'Paid', 'Waived', 'Refunded', 'all'];
const DOC_LABELS = {
  clearance: 'Barangay Clearance', residency: 'Certificate of Residency', barangay_id: 'Barangay ID',
  business_clearance: 'Business Clearance', indigency: 'Certificate of Indigency', service: 'Custom service',
};
const WAIVERS = [
  ['waive_first_jobseeker', 'First-Time Jobseeker'],
  ['waive_indigent', 'Indigent'],
  ['waive_senior', 'Senior'],
  ['waive_pwd', 'PWD'],
];
const todayStr = () => new Date().toISOString().slice(0, 10);

/**
 * Payments (migration 020). Tabs by permission (admin_permissions.php):
 *   'payments.verify'   -> To verify (queue) and Collections (treasurer's report)
 *   'payments.settings' -> Fees & QR (payment_settings.php)
 * Super Admins have both; others get them from their position or overrides
 * set on Manage Admins.
 */
const Payments = () => {
  const { toast, showToast, confirmToast, closeToast } = useToast();
  const [perms, setPerms] = useState(null);
  const [tab, setTab] = useState(null);

  useEffect(() => {
    axios.get(`${API_BASE}/admin_payments.php`, { params: { action: 'me' } })
      .then(({ data }) => {
        const p = data.permissions || [];
        setPerms(p);
        setTab(p.includes('payments.verify') ? 'queue' : p.includes('payments.settings') ? 'settings' : null);
      })
      .catch(() => setPerms([]));
  }, []);

  if (perms === null) return <div className="pm-container pm-muted">Loading…</div>;
  const canVerify = perms.includes('payments.verify');
  const canSettings = perms.includes('payments.settings');

  return (
    <div className="pm-container">
      <Toast toast={toast} onClose={closeToast} />
      <div className="pm-header">
        <h2><i className="bi bi-wallet2" style={{ color: '#059669' }}></i> Payments</h2>
        <p>Document fees, payment checking and the treasurer's collections report.</p>
      </div>

      {!canVerify && !canSettings ? (
        <div className="pm-card pm-muted">
          <i className="bi bi-lock"></i> You don't have access to payments. The Super Admin can give it on Manage Admins (by position or per admin).
        </div>
      ) : (
        <>
          <div className="pm-tabs" role="tablist">
            {canVerify && <button type="button" role="tab" aria-selected={tab === 'queue'} className={tab === 'queue' ? 'is-active' : ''} onClick={() => setTab('queue')}><i className="bi bi-list-check"></i> To verify</button>}
            {canVerify && <button type="button" role="tab" aria-selected={tab === 'collections'} className={tab === 'collections' ? 'is-active' : ''} onClick={() => setTab('collections')}><i className="bi bi-cash-stack"></i> Collections</button>}
            {canSettings && <button type="button" role="tab" aria-selected={tab === 'settings'} className={tab === 'settings' ? 'is-active' : ''} onClick={() => setTab('settings')}><i className="bi bi-gear"></i> Fees & QR</button>}
          </div>
          {tab === 'queue' && <Queue notify={showToast} />}
          {tab === 'collections' && <Collections notify={showToast} />}
          {tab === 'settings' && <Settings notify={showToast} confirm={confirmToast} />}
        </>
      )}
    </div>
  );
};

const Queue = ({ notify }) => {
  const [status, setStatus] = useState('For Verification');
  const [rows, setRows] = useState([]);
  const [counts, setCounts] = useState({});
  const [open, setOpen] = useState(null);

  const load = useCallback(() => {
    axios.get(`${API_BASE}/admin_payments.php`, { params: { action: 'queue', status } })
      .then(({ data }) => {
        if (data.success) { setRows(data.payments || []); setCounts(data.counts || {}); }
        else notify('Not allowed', data.message, 'error');
      })
      .catch(() => notify('Error', 'Could not load payments.', 'error'));
  }, [status, notify]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="pm-card">
      <div className="pm-filters">
        {QUEUE_FILTERS.map((s) => (
          <button key={s} type="button" className={`pm-chip${status === s ? ' is-active' : ''}`} onClick={() => { setStatus(s); setOpen(null); }}>
            {s === 'all' ? 'All' : s}{s !== 'all' && counts[s] ? <span>{counts[s]}</span> : null}
          </button>
        ))}
      </div>
      {rows.length === 0 ? (
        <p className="pm-muted pm-empty">No payments here.</p>
      ) : (
        <div className="pm-table-wrap">
          <table className="pm-table">
            <thead><tr><th>Submitted</th><th>Tracking</th><th>Document</th><th>Resident</th><th>Fee</th><th>Method</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {rows.map((r) => {
                const st = PAYMENT_STATUS_STYLE[r.status] || PAYMENT_STATUS_STYLE.Unpaid;
                const isOpen = open === r.payment_id;
                return (
                  <React.Fragment key={r.payment_id}>
                    <tr className={isOpen ? 'is-open' : ''}>
                      <td>{r.created_at?.slice(0, 16)}</td>
                      <td className="pm-mono">{r.tracking_code}</td>
                      <td>{DOC_LABELS[r.request_type] || r.request_type}</td>
                      <td>{r.resident_name}<small>{r.control_num}</small></td>
                      <td>{peso(r.amount_due)}</td>
                      <td>{r.method === 'online' ? 'Online' : r.method === 'hall' ? 'At hall' : r.exemption_label}</td>
                      <td><span className={`pay-status ${st.cls}`}><i className={`bi ${st.icon}`}></i> {r.status}</span>{r.flags?.length > 0 && <i className="bi bi-flag-fill pm-flag" title={r.flags.join(' ')}></i>}</td>
                      <td><button type="button" className="pm-btn is-ghost" onClick={() => setOpen(isOpen ? null : r.payment_id)}>{isOpen ? 'Close' : 'Open'}</button></td>
                    </tr>
                    {isOpen && (
                      <tr className="pm-panel-row">
                        <td colSpan={8}>
                          <PaymentPanel requestType={r.request_type} requestId={r.request_id} notify={notify} onChange={load} />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

const Collections = ({ notify }) => {
  const [from, setFrom] = useState(todayStr());
  const [to, setTo] = useState(todayStr());
  const [report, setReport] = useState(null);

  const load = useCallback(() => {
    axios.get(`${API_BASE}/admin_payments.php`, { params: { action: 'collections', from, to } })
      .then(({ data }) => { if (data.success) setReport(data); else notify('Not allowed', data.message, 'error'); })
      .catch(() => notify('Error', 'Could not load the report.', 'error'));
  }, [from, to, notify]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="pm-card">
      <div className="pm-filters">
        <label>From <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></label>
        <label>To <input type="date" value={to} min={from} max={todayStr()} onChange={(e) => setTo(e.target.value)} /></label>
        <a className="pm-btn" href={`${API_BASE}/admin_payments.php?action=collections&format=csv&from=${from}&to=${to}`}><i className="bi bi-download"></i> Export CSV</a>
      </div>
      {report && (
        <>
          <div className="pm-total">
            <div><span>Payments confirmed</span><strong>{report.count}</strong></div>
            <div><span>Total collected</span><strong>{peso(report.total)}</strong></div>
          </div>
          {report.rows.length === 0 ? <p className="pm-muted pm-empty">No confirmed payments in this period.</p> : (
            <div className="pm-table-wrap">
              <table className="pm-table">
                <thead><tr><th>Confirmed</th><th>O.R. No.</th><th>Tracking</th><th>Document</th><th>Payor</th><th>Method</th><th>Amount</th><th>Reference</th><th>Confirmed by</th></tr></thead>
                <tbody>
                  {report.rows.map((r, i) => (
                    <tr key={i}>
                      <td>{r.verified_at?.slice(0, 16)}</td>
                      <td className="pm-mono">{r.or_number}</td>
                      <td className="pm-mono">{r.tracking_code}</td>
                      <td>{DOC_LABELS[r.request_type] || r.request_type}</td>
                      <td>{r.fName} {r.lName}<small>{r.control_num}</small></td>
                      <td>{r.method === 'hall' ? 'Cash at hall' : 'Online'}</td>
                      <td>{peso(r.amount_due)}</td>
                      <td className="pm-mono">{r.reference_no || '—'}</td>
                      <td>{r.verified_by}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="pm-muted">Reconcile this list with the Official Receipts issued and the barangay's e-wallet statement for the same dates.</p>
        </>
      )}
    </div>
  );
};

const Settings = ({ notify, confirm }) => {
  const [data, setData] = useState(null);
  const [fees, setFees] = useState([]);
  const [acct, setAcct] = useState(null);
  const [busy, setBusy] = useState(false);

  const apply = (d) => {
    setData(d);
    setFees(d.fees.map((f) => ({ ...f, amount: String(f.amount) })));
    setAcct({ channel: d.settings.channel, account_name: d.settings.account_name, account_number: d.settings.account_number, instructions: d.settings.instructions, allow_hall: d.settings.allow_hall });
  };

  useEffect(() => {
    axios.get(`${API_BASE}/payment_settings.php`)
      .then(({ data: d }) => { if (d.success) apply(d); else notify('Not allowed', d.message, 'error'); })
      .catch(() => notify('Error', 'Could not load payment settings.', 'error'));
  }, [notify]);

  if (!data || !acct) return <div className="pm-card pm-muted">Loading…</div>;

  const save = async () => {
    setBusy(true);
    try {
      const { data: d } = await axios.post(`${API_BASE}/payment_settings.php`, { action: 'save', fees, settings: acct });
      notify(d.success ? 'Saved' : 'Not saved', d.message, d.success ? 'success' : 'error');
      if (d.success) apply(d);
    } catch {
      notify('Error', 'Could not reach the server.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const uploadQr = async (file) => {
    if (!file) return;
    // Residents pay to whatever QR is shown: replacing it takes effect at once.
    const replacing = !!data.settings.qr_url;
    const ok = await confirm(replacing ? 'Replace the payment QR?' : 'Use this payment QR?',
      "Residents will pay to this QR from now on. Make sure it is the barangay's official account and matches the account name and number below.",
      { confirmLabel: replacing ? 'Replace QR' : 'Upload QR', danger: replacing });
    if (!ok) return;
    const body = new FormData();
    body.append('action', 'upload_qr');
    body.append('qr', file);
    setBusy(true);
    try {
      const { data: d } = await axios.post(`${API_BASE}/payment_settings.php`, body);
      notify(d.success ? 'QR updated' : 'Not saved', d.message, d.success ? 'success' : 'error');
      if (d.success) apply(d);
    } catch {
      notify('Error', 'Could not upload the QR.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const removeQr = async () => {
    const ok = await confirm('Remove the payment QR?', 'Online payment is turned off until a new QR is uploaded. Residents can only pay at the barangay hall.',
      { confirmLabel: 'Remove QR', danger: true });
    if (!ok) return;
    setBusy(true);
    try {
      const { data: d } = await axios.post(`${API_BASE}/payment_settings.php`, { action: 'remove_qr' });
      notify(d.success ? 'QR removed' : 'Not saved', d.message, d.success ? 'success' : 'error');
      if (d.success) apply(d);
    } finally {
      setBusy(false);
    }
  };

  const setFee = (idx, patch) => setFees((list) => list.map((f, i) => (i === idx ? { ...f, ...patch } : f)));
  const qr = data.settings.qr_url;

  return (
    <>
      <div className="pm-card">
        <h3>Official payment account</h3>
        <p className="pm-muted">Use the barangay's own account (in the barangay's name), never a personal number. Residents see these details next to the QR.</p>
        <div className="pm-account">
          <div className="pm-qr">
            {qr ? <img src={qr} alt="Current payment QR" /> : <div className="pm-qr-empty"><i className="bi bi-qr-code"></i><span>No QR yet. Online payment is off.</span></div>}
            <div className="pm-row">
              <label className="pm-btn is-ghost"><i className="bi bi-upload"></i> {qr ? 'Replace QR' : 'Upload QR'}
                <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; uploadQr(f); }} disabled={busy} />
              </label>
              {qr && <button type="button" className="pm-btn is-ghost" onClick={removeQr} disabled={busy}>Remove</button>}
            </div>
          </div>
          <div className="pm-form">
            <label>E-wallet / bank
              <input type="text" className="keep-case" maxLength={40} value={acct.channel} onChange={(e) => setAcct({ ...acct, channel: e.target.value })} placeholder="GCash" />
            </label>
            <label>Account name (as the app shows it)
              <input type="text" maxLength={120} value={acct.account_name} onChange={(e) => setAcct({ ...acct, account_name: e.target.value })} placeholder="BARANGAY PASONG BUAYA II" />
            </label>
            <label>Account / mobile number
              <input type="text" inputMode="numeric" maxLength={40} value={acct.account_number} onChange={(e) => setAcct({ ...acct, account_number: e.target.value })} placeholder="0917 123 4567" />
            </label>
            <label>Extra instructions (optional)
              <textarea rows={2} maxLength={500} value={acct.instructions} onChange={(e) => setAcct({ ...acct, instructions: e.target.value })} placeholder="e.g. Put your tracking code in the message field." />
            </label>
            <label className="pm-check">
              <input type="checkbox" checked={acct.allow_hall} onChange={(e) => setAcct({ ...acct, allow_hall: e.target.checked })} />
              Allow paying in cash at the barangay hall
            </label>
          </div>
        </div>
      </div>

      <div className="pm-card">
        <h3>Fees per document</h3>
        <p className="pm-muted">Enter the amounts from the barangay revenue ordinance. 0 means free. Ticked exemptions waive the fee: verified Indigent / Senior / PWD residents at once, First-Time Jobseekers (RA 11261, once per person) after staff check their oath. A fee change applies only to new requests.</p>
        <div className="pm-table-wrap">
          <table className="pm-table pm-fees">
            <thead><tr><th>Document</th><th>Fee (PHP)</th>{WAIVERS.map(([, l]) => <th key={l}>{l}</th>)}</tr></thead>
            <tbody>
              {fees.map((f, idx) => (
                <tr key={f.fee_key}>
                  <td>{f.label}{f.is_service && <small>Custom service</small>}</td>
                  <td><input type="number" inputMode="decimal" min="0" step="0.01" value={f.amount} onChange={(e) => setFee(idx, { amount: e.target.value })} aria-label={`Fee for ${f.label}`} /></td>
                  {WAIVERS.map(([k, l]) => (
                    <td key={k}><input type="checkbox" checked={!!f[k]} onChange={(e) => setFee(idx, { [k]: e.target.checked })} aria-label={`${l} exemption for ${f.label}`} /></td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="pm-row pm-save">
          <button type="button" className="pm-btn" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save fees & account'}</button>
        </div>
      </div>
    </>
  );
};

export default Payments;
