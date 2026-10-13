import React, { useState } from 'react';
import PaymentSection from './PaymentSection';
import { PAYMENT_STATUS_STYLE, appendPayment, emptyPayment, fetchPaymentInfo, paymentProblem, peso } from '../lib/payment';
import '../styles/payment.css';

const API_BASE = '/api_backend';
const TYPE_BY_LABEL = {
  'Barangay Clearance': 'clearance',
  'Certificate of Residency': 'residency',
  'Barangay ID': 'barangay_id',
  'Business Clearance': 'business_clearance',
  'Certificate of Indigency': 'indigency',
};
const CLOSED = ['Declined', 'Rejected', 'Claimed', 'Cancelled'];

/**
 * Track Request: the fee payment of one request (migration 020). Shows its
 * status, the O.R. number once paid, and — when the payment was not accepted
 * or is still unpaid — lets the resident send a new receipt (or claim an
 * exemption) without filing the request again (payment_resident.php resubmit).
 *
 * props: request (row from get_user_document_requests.php), onUpdated(), notify(message, type)
 */
const PaymentStatusCard = ({ request, onUpdated, notify }) => {
  const p = request.payment;
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState(null);
  const [value, setValue] = useState(emptyPayment);
  const [busy, setBusy] = useState(false);
  if (!p) return null;

  const style = PAYMENT_STATUS_STYLE[p.status] || PAYMENT_STATUS_STYLE.Unpaid;
  const canChange = p.can_resubmit && !CLOSED.includes(request.status);

  const start = async () => {
    const type = request.request_kind === 'service' ? 'service' : TYPE_BY_LABEL[request.type];
    try {
      const fresh = await fetchPaymentInfo(type, request.request_mode || 'Self', request.service_id);
      // The fee stays what it was when the request was filed.
      setInfo(fresh ? { ...fresh, required: true, amount: p.amount_due } : null);
      setValue(emptyPayment());
      setOpen(true);
    } catch {
      notify('Could not load the payment details. Please try again.', 'error');
    }
  };

  const submit = async () => {
    const problem = paymentProblem(info, value);
    if (problem) { notify(problem, 'error'); return; }
    setBusy(true);
    try {
      const body = new FormData();
      body.append('action', 'resubmit');
      body.append('payment_id', String(p.payment_id));
      appendPayment(body, info, value);
      const res = await fetch(`${API_BASE}/payment_resident.php`, { method: 'POST', body, credentials: 'include' });
      const data = await res.json();
      notify(data.message, data.success ? 'success' : 'error');
      if (data.success) { setOpen(false); onUpdated(); }
    } catch {
      notify('Could not reach the server. Please try again.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pay-track">
      <div className="pay-track-head">
        <span className="detail-label">Payment</span>
        <span className={`pay-status ${style.cls}`}><i className={`bi ${style.icon}`}></i> {style.label}</span>
      </div>
      <div className="pay-track-rows">
        <span>Fee</span><strong>{peso(p.amount_due)}</strong>
        <span>Method</span><strong>{p.method === 'online' ? 'Online' : p.method === 'hall' ? 'At the barangay hall' : p.exemption_label || 'Exemption'}</strong>
        {p.reference_no && (<><span>Reference No.</span><strong>{p.reference_no}</strong></>)}
        {p.or_number && (<><span>Official Receipt No.</span><strong>{p.or_number}</strong></>)}
      </div>
      {p.status === 'For Verification' && <p className="pay-note">The barangay treasurer is checking your payment. You will be notified once it is confirmed.</p>}
      {p.status === 'Unpaid' && <p className="pay-note">Pay {peso(p.amount_due)} at the Treasurer's window when you claim your document. You will get an Official Receipt.</p>}
      {p.status === 'Rejected' && (
        <p className="pay-warn"><i className="bi bi-x-circle-fill"></i> Your payment was not accepted{p.remarks ? `: ${p.remarks}` : ''}. Please send a valid receipt below or pay at the hall.</p>
      )}
      {p.status === 'Refunded' && p.remarks && <p className="pay-note">{p.remarks}</p>}
      {p.receipt_url && <a className="pay-link" href={p.receipt_url} target="_blank" rel="noreferrer"><i className="bi bi-receipt"></i> View the receipt you sent</a>}

      {canChange && !open && (
        <button type="button" className="pay-track-btn" onClick={start}>
          <i className="bi bi-upload"></i> {p.status === 'Rejected' ? 'Send a new receipt' : 'Pay online instead'}
        </button>
      )}
      {open && info && (
        <>
          <PaymentSection info={info} value={value} onChange={setValue} onError={(m) => notify(m, 'error')} idPrefix={`pay-${p.payment_id}`} />
          <div className="pay-track-actions">
            <button type="button" className="pay-track-btn is-ghost" onClick={() => setOpen(false)} disabled={busy}>Cancel</button>
            <button type="button" className="pay-track-btn" onClick={submit} disabled={busy}>{busy ? 'Sending…' : 'Send payment'}</button>
          </div>
        </>
      )}
    </div>
  );
};

export default PaymentStatusCard;
