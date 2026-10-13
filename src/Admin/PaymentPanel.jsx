import React, { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { PAYMENT_STATUS_STYLE, peso } from '../lib/payment';
import Toast from '../components/Toast';
import { useToast } from '../lib/useToast';
import '../styles/payment.css';
import './PaymentPanel.css';

const API_BASE = '/api_backend';

/**
 * Staff view of one request's fee payment (admin_payments.php, migration 020).
 * Everyone sees the status; staff with the 'payments.verify' permission also
 * see the receipt and can:
 *   - Confirm (record the Official Receipt number the treasurer issued),
 *   - Reject (the resident is told why and can upload a new receipt),
 *   - Waive (e.g. confirm a First-Time Jobseeker oath), or Refund.
 * Before confirming, match the reference number, amount and date against the
 * barangay's own e-wallet transaction history — never the screenshot alone.
 *
 * props: requestType, requestId, notify(title, message, type)?, onChange()?
 */
const PaymentPanel = ({ requestType, requestId, notify, onChange }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [or, setOr] = useState('');
  const [reason, setReason] = useState('');
  const [mode, setMode] = useState(null); // 'reject' | 'waive' | 'refund'
  // Own confirmation dialog (the panel sits inside Documents and Payments).
  const { toast: confirmUi, confirmToast, closeToast } = useToast();
  const onChangeRef = useRef(onChange);
  const notifyRef = useRef(notify);
  useEffect(() => { onChangeRef.current = onChange; notifyRef.current = notify; });
  const say = useCallback((t, m, k) => notifyRef.current && notifyRef.current(t, m, k), []);

  useEffect(() => {
    let cancelled = false;
    axios.get(`${API_BASE}/admin_payments.php`, { params: { action: 'for_request', request_type: requestType, request_id: requestId } })
      .then(({ data: d }) => { if (!cancelled && d.success) setData(d); })
      .catch(() => { if (!cancelled) say('Error', 'Could not load the payment.', 'error'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [requestType, requestId, say]);

  if (loading) return <div className="pp-box pp-muted">Loading payment…</div>;
  if (!data?.payment) return null;
  const p = data.payment;
  const style = PAYMENT_STATUS_STYLE[p.status] || PAYMENT_STATUS_STYLE.Unpaid;
  const canVerify = data.can_verify;

  // Every payment decision is final from here: it is recorded, audit-logged and
  // the resident is notified (a confirmed O.R. number can't be reused).
  const CONFIRM = {
    verify: (x) => [`Confirm payment with O.R. No. ${x.or_number}?`, `${peso(p.amount_due)} is recorded as paid and the resident is notified. Make sure the reference number is in the barangay's e-wallet history.`, 'Confirm Payment', false],
    reject: () => ['Reject this payment?', 'The resident is told your reason and must send a new receipt or pay at the hall.', 'Reject Payment', true],
    waive: () => ['Waive this fee?', 'The resident will not be charged for this request.', 'Waive Fee', true],
    refund: () => ['Record a refund?', 'The payment is marked refunded and the resident is notified. Return the money first.', 'Record Refund', true],
  };
  const act = async (action, extra) => {
    const [title, message, confirmLabel, danger] = CONFIRM[action](extra);
    if (!(await confirmToast(title, message, { confirmLabel, danger }))) return;
    setBusy(true);
    try {
      const { data: d } = await axios.post(`${API_BASE}/admin_payments.php`, { action, payment_id: p.payment_id, ...extra });
      say(d.success ? 'Saved' : 'Not saved', d.message, d.success ? 'success' : 'error');
      if (d.success) {
        setData((prev) => ({ ...prev, payment: { ...prev.payment, ...d.payment }, events: d.events }));
        setOr('');
        setReason('');
        setMode(null);
        if (onChangeRef.current) onChangeRef.current();
      }
    } catch {
      say('Error', 'Could not reach the server.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const canConfirm = ['For Verification', 'Unpaid', 'Rejected'].includes(p.status);
  const isOnlineReceipt = p.method === 'online' && p.status === 'For Verification';
  const isFtjClaim = p.method === 'exempt' && p.exemption === 'first_time_jobseeker' && p.status === 'For Verification';

  return (
    <div className="pp-box">
      <Toast toast={confirmUi} onClose={closeToast} />
      <div className="pp-head">
        <div>
          <strong>{peso(p.amount_due)}</strong>
          <span className="pp-muted"> · {p.method === 'online' ? 'Online payment' : p.method === 'hall' ? 'Pay at the barangay hall' : `Exemption: ${p.exemption_label}`}</span>
        </div>
        <span className={`pay-status ${style.cls}`}><i className={`bi ${style.icon}`}></i> {p.status}</span>
      </div>

      <dl className="pp-facts">
        {p.reference_no && (<><dt>Reference No.</dt><dd className="pp-mono">{p.reference_no}</dd></>)}
        {p.amount_paid !== null && (<><dt>Amount entered</dt><dd>{peso(p.amount_paid)}</dd></>)}
        {p.paid_on && (<><dt>Date paid</dt><dd>{p.paid_on}</dd></>)}
        {p.or_number && (<><dt>O.R. No.</dt><dd className="pp-mono">{p.or_number}</dd></>)}
        {p.verified_by_name && (<><dt>{p.status === 'Paid' ? 'Confirmed by' : 'Handled by'}</dt><dd>{p.verified_by_name}{p.verified_at ? ` · ${p.verified_at}` : ''}</dd></>)}
        {p.remarks && (<><dt>Remarks</dt><dd>{p.remarks}</dd></>)}
      </dl>

      {p.flags?.length > 0 && (
        <ul className="pp-flags">{p.flags.map((f, i) => <li key={i}><i className="bi bi-flag-fill"></i> {f}</li>)}</ul>
      )}

      {canVerify ? (
        <div className="pp-files">
          {p.receipt_url && <a href={p.receipt_url} target="_blank" rel="noreferrer" className="pp-btn is-ghost"><i className="bi bi-receipt"></i> Open receipt</a>}
          {p.exemption_proof_url && <a href={p.exemption_proof_url} target="_blank" rel="noreferrer" className="pp-btn is-ghost"><i className="bi bi-file-earmark-text"></i> Open oath of undertaking</a>}
        </div>
      ) : (
        (p.has_receipt || p.has_exemption_proof) && <p className="pp-muted"><i className="bi bi-lock"></i> Only staff allowed to verify payments can open the receipt.</p>
      )}

      {canVerify && (
        <div className="pp-actions">
          {isOnlineReceipt && (
            <p className="pp-check"><i className="bi bi-shield-check"></i> Before confirming, find reference <strong>{p.reference_no}</strong> for {peso(p.amount_paid ?? p.amount_due)} in the barangay's e-wallet transaction history.</p>
          )}
          {canConfirm && !isFtjClaim && (
            <div className="pp-row">
              <input type="text" className="keep-case" maxLength={40} value={or} placeholder="O.R. No. issued" onChange={(e) => setOr(e.target.value)} aria-label="Official Receipt number" />
              <button type="button" className="pp-btn" disabled={busy || !or.trim()} onClick={() => act('verify', { or_number: or.trim() })}>
                <i className="bi bi-check2-circle"></i> {p.method === 'hall' ? 'Record cash payment' : 'Confirm payment'}
              </button>
            </div>
          )}
          {!mode && (
            <div className="pp-row">
              {p.status === 'For Verification' && <button type="button" className="pp-btn is-danger" onClick={() => setMode('reject')}><i className="bi bi-x-circle"></i> Reject</button>}
              {canConfirm && <button type="button" className="pp-btn is-ghost" onClick={() => setMode('waive')}><i className="bi bi-gift"></i> {isFtjClaim ? 'Confirm exemption (waive fee)' : 'Waive fee'}</button>}
              {p.status === 'Paid' && <button type="button" className="pp-btn is-ghost" onClick={() => setMode('refund')}><i className="bi bi-arrow-counterclockwise"></i> Record refund</button>}
            </div>
          )}
          {mode && (
            <div className="pp-reason">
              <label>
                {mode === 'reject' ? 'Why is it not accepted? (the resident sees this)' : mode === 'waive' ? 'Reason for waiving' : 'Refund details (how and when)'}
                <input type="text" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)}
                  placeholder={mode === 'reject' ? 'e.g. Reference number not found in our GCash history' : mode === 'waive' ? 'e.g. Oath of undertaking checked' : 'e.g. Returned in cash on Oct 20'} />
              </label>
              <div className="pp-row">
                <button type="button" className="pp-btn is-ghost" onClick={() => { setMode(null); setReason(''); }} disabled={busy}>Cancel</button>
                <button type="button" className={`pp-btn${mode === 'reject' ? ' is-danger' : ''}`} disabled={busy || !reason.trim()} onClick={() => act(mode, { reason: reason.trim() })}>
                  {mode === 'reject' ? 'Reject payment' : mode === 'waive' ? 'Waive fee' : 'Record refund'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {data.events?.length > 0 && (
        <details className="pp-history">
          <summary>History ({data.events.length})</summary>
          <ul>
            {data.events.map((e, i) => (
              <li key={i}>
                <span>{e.created_at}</span> {e.new_status || e.action}{e.detail ? ` · ${e.detail}` : ''}{e.admin_name ? ` · ${e.admin_name}` : ''}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
};

export default PaymentPanel;
