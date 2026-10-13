import React, { useState } from 'react';
import { checkPaymentFile, peso } from '../lib/payment';
import '../styles/payment.css';

/**
 * Payment step for a request with a fee (migration 020, src/lib/payment.js).
 * The amount comes from the server; the resident chooses how to pay:
 *   online  - scan the barangay's official QR, then enter the reference
 *             number, amount and date and attach the receipt;
 *   hall    - pay in cash at the barangay hall when claiming (if allowed);
 *   exempt  - First-Time Jobseeker (with oath) or verified Indigent / Senior / PWD.
 *
 * props: info (from fetchPaymentInfo), value, onChange(nextValue), onError(message)?, idPrefix
 */
const PaymentSection = ({ info, value, onChange, onError, idPrefix = 'pay' }) => {
  const [qrOpen, setQrOpen] = useState(false);
  if (!info || !info.required) return null;

  const s = info.settings || {};
  const exemptions = info.exemptions || {};
  const exemptionKeys = Object.keys(exemptions);
  const set = (patch) => onChange({ ...value, ...patch });
  const pickFile = (key, file) => {
    const problem = checkPaymentFile(file);
    if (problem) { if (onError) onError(problem); return; }
    set({ [key]: file });
  };
  const methods = [
    info.online_ready && { key: 'online', icon: 'bi-qr-code-scan', title: `Pay online (${s.channel || 'e-wallet'})`, sub: 'Scan the barangay QR, then attach your receipt' },
    s.allow_hall && { key: 'hall', icon: 'bi-building', title: 'Pay at the barangay hall', sub: 'Pay in cash when you claim your document' },
    exemptionKeys.length > 0 && { key: 'exempt', icon: 'bi-gift', title: "I'm exempt from the fee", sub: exemptionKeys.map((k) => exemptions[k].label).join(' / ') },
  ].filter(Boolean);

  return (
    <div className="pay-box">
      <div className="pay-head">
        <div>
          <h4><i className="bi bi-wallet2"></i> Payment</h4>
          <p>This document has a fee set by the barangay ordinance.</p>
        </div>
        <div className="pay-amount"><span>Fee</span><strong>{peso(info.amount)}</strong></div>
      </div>

      {methods.length === 0 ? (
        <p className="pay-warn"><i className="bi bi-exclamation-triangle-fill"></i> Payment is not set up yet for this document. Please contact the barangay hall.</p>
      ) : (
        <div className="pay-methods" role="radiogroup" aria-label="Payment method">
          {methods.map((m) => (
            <button
              key={m.key}
              type="button"
              role="radio"
              aria-checked={value.method === m.key}
              className={`pay-method${value.method === m.key ? ' is-active' : ''}`}
              onClick={() => set({ method: m.key })}
            >
              <i className={`bi ${m.icon}`}></i>
              <span><strong>{m.title}</strong><small>{m.sub}</small></span>
            </button>
          ))}
        </div>
      )}

      {value.method === 'online' && (
        <div className="pay-online">
          <div className="pay-qr">
            <button type="button" className="pay-qr-img" onClick={() => setQrOpen(true)} aria-label="Enlarge the QR code">
              <img src={s.qr_url} alt={`${s.channel} QR code of ${s.account_name}`} />
            </button>
            <div className="pay-account">
              <span className="pay-label">Pay only to the official barangay account</span>
              <strong>{s.account_name}</strong>
              <span>{s.channel} · {s.account_number}</span>
              <a href={s.qr_url} download="barangay-payment-qr.png" className="pay-link"><i className="bi bi-download"></i> Save QR</a>
            </div>
          </div>
          <ol className="pay-steps">
            <li>Scan the QR in your {s.channel || 'e-wallet'} app and pay exactly <strong>{peso(info.amount)}</strong>.</li>
            <li>Check that the name shown before you pay is <strong>{s.account_name}</strong>.</li>
            <li>Enter the details from your receipt below and attach a screenshot of it.</li>
          </ol>
          {s.instructions && <p className="pay-note">{s.instructions}</p>}
          <p className="pay-note"><i className="bi bi-shield-check"></i> Barangay staff never ask you to send money to a personal number. Your receipt is checked against the barangay's records, and an Official Receipt is issued once confirmed.</p>

          <div className="pay-grid">
            <label htmlFor={`${idPrefix}-ref`}>
              Reference No. *
              <input id={`${idPrefix}-ref`} type="text" maxLength={40} value={value.reference} placeholder="e.g. 1012 345 678901" onChange={(e) => set({ reference: e.target.value })} />
            </label>
            <label htmlFor={`${idPrefix}-amt`}>
              Amount paid *
              <input id={`${idPrefix}-amt`} type="number" inputMode="decimal" min="0" step="0.01" value={value.amount} placeholder={String(info.amount)} onChange={(e) => set({ amount: e.target.value })} />
            </label>
            <label htmlFor={`${idPrefix}-date`}>
              Date paid *
              <input id={`${idPrefix}-date`} type="date" max={new Date().toISOString().slice(0, 10)} value={value.date} onChange={(e) => set({ date: e.target.value })} />
            </label>
          </div>
          {value.amount !== '' && Number(value.amount) !== Number(info.amount) && (
            <p className="pay-warn"><i className="bi bi-exclamation-circle"></i> The fee is {peso(info.amount)}. A different amount may delay your request.</p>
          )}
          <div className="pay-file">
            <label htmlFor={`${idPrefix}-receipt`} className="pay-file-btn"><i className="bi bi-receipt"></i> {value.receipt ? 'Change receipt' : 'Attach receipt screenshot *'}</label>
            <input id={`${idPrefix}-receipt`} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" hidden onChange={(e) => pickFile('receipt', e.target.files?.[0] || null)} />
            {value.receipt && <span className="pay-file-name"><i className="bi bi-check-circle-fill"></i> {value.receipt.name}</span>}
          </div>
        </div>
      )}

      {value.method === 'hall' && (
        <div className="pay-info">
          <i className="bi bi-info-circle-fill"></i>
          <p>Pay <strong>{peso(info.amount)}</strong> at the Treasurer's window of the barangay hall when you claim your document. You will receive an Official Receipt. Your request is processed in the meantime, but the document is released only after payment.</p>
        </div>
      )}

      {value.method === 'exempt' && (
        <div className="pay-exempt">
          {exemptionKeys.map((k) => (
            <label key={k} className={`pay-exempt-opt${value.exemption === k ? ' is-active' : ''}`}>
              <input type="radio" name={`${idPrefix}-exemption`} checked={value.exemption === k} onChange={() => set({ exemption: k })} />
              <span>
                <strong>{exemptions[k].label}</strong>
                <small>
                  {exemptions[k].auto
                    ? 'Your verified status on file waives this fee.'
                    : 'Free once under RA 11261. Attach your signed Oath of Undertaking; barangay staff will confirm it.'}
                </small>
              </span>
            </label>
          ))}
          {value.exemption && !exemptions[value.exemption]?.auto && (
            <div className="pay-file">
              <label htmlFor={`${idPrefix}-oath`} className="pay-file-btn"><i className="bi bi-file-earmark-text"></i> {value.exemptionProof ? 'Change file' : 'Attach Oath of Undertaking *'}</label>
              <input id={`${idPrefix}-oath`} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" hidden onChange={(e) => pickFile('exemptionProof', e.target.files?.[0] || null)} />
              {value.exemptionProof && <span className="pay-file-name"><i className="bi bi-check-circle-fill"></i> {value.exemptionProof.name}</span>}
            </div>
          )}
        </div>
      )}

      {qrOpen && (
        <div className="pay-qr-modal" role="dialog" aria-modal="true" aria-label="QR code" onClick={() => setQrOpen(false)}>
          <img src={s.qr_url} alt={`${s.channel} QR code of ${s.account_name}`} />
          <span>{s.account_name} · {s.account_number}</span>
          <button type="button" onClick={() => setQrOpen(false)}>Close</button>
        </div>
      )}
    </div>
  );
};

export default PaymentSection;
