// Fees and payments for document requests (migration 020). Mirrors
// backend/api/payment_common.php, which is what actually enforces the rules;
// this only drives the payment step on the request forms and Track Request.

const API_BASE = '/api_backend';

export const RECEIPT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
export const MAX_FILE_BYTES = 8 * 1024 * 1024;

export const PAYMENT_STATUS_STYLE = {
  Unpaid: { cls: 'is-unpaid', icon: 'bi-cash-coin', label: 'Pay at the hall' },
  'For Verification': { cls: 'is-checking', icon: 'bi-hourglass-split', label: 'Being checked' },
  Paid: { cls: 'is-paid', icon: 'bi-check-circle-fill', label: 'Paid' },
  Rejected: { cls: 'is-rejected', icon: 'bi-x-circle-fill', label: 'Not accepted' },
  Waived: { cls: 'is-waived', icon: 'bi-gift-fill', label: 'Fee waived' },
  Refunded: { cls: 'is-refunded', icon: 'bi-arrow-counterclockwise', label: 'Refunded' },
};

export const peso = (n) => `PHP ${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const emptyPayment = () => ({ method: '', reference: '', amount: '', date: '', receipt: null, exemption: '', exemptionProof: null });

/** Fee, QR/account and the exemptions this resident may claim. */
export async function fetchPaymentInfo(requestType, requestMode = 'Self', serviceId = null) {
  const params = new URLSearchParams({ action: 'info', request_type: requestType, request_mode: requestMode });
  if (serviceId) params.set('service_id', String(serviceId));
  const res = await fetch(`${API_BASE}/payment_resident.php?${params}`, { credentials: 'include' });
  const data = await res.json();
  return data.success ? data.payment : null;
}

const today = () => new Date().toISOString().slice(0, 10);

/** Why the payment part can't be submitted yet, or null. */
export function paymentProblem(info, v) {
  if (!info || !info.required) return null;
  const canOnline = info.online_ready;
  const canHall = info.settings?.allow_hall;
  const exemptions = info.exemptions || {};
  if (!canOnline && !canHall && Object.keys(exemptions).length === 0) {
    return 'Payment is not set up yet for this document. Please contact the barangay hall.';
  }
  if (!v.method) return `Please choose how you will pay the ${peso(info.amount)} fee.`;
  if (v.method === 'online') {
    if (v.reference.replace(/[^A-Za-z0-9]/g, '').length < 6) return 'Enter the reference number from your payment receipt.';
    if (!(Number(v.amount) > 0)) return 'Enter the amount you paid.';
    if (!v.date) return 'Enter the date you paid.';
    if (v.date > today()) return 'The payment date cannot be in the future.';
    if (!v.receipt) return 'Attach a photo or screenshot of your payment receipt.';
  }
  if (v.method === 'exempt') {
    if (!v.exemption || !exemptions[v.exemption]) return 'Choose the exemption that applies to you.';
    if (!exemptions[v.exemption].auto && !v.exemptionProof) return 'Attach your signed Oath of Undertaking.';
  }
  return null;
}

/** Adds the payment fields (names the server expects) to a request's FormData. */
export function appendPayment(formData, info, v) {
  if (!info || !info.required) return;
  formData.append('payment_method', v.method);
  if (v.method === 'online') {
    formData.append('payment_reference', v.reference.trim());
    formData.append('payment_amount', String(v.amount));
    formData.append('payment_date', v.date);
    if (v.receipt) formData.append('payment_receipt', v.receipt);
  }
  if (v.method === 'exempt') {
    formData.append('payment_exemption', v.exemption);
    if (v.exemptionProof) formData.append('payment_exemption_proof', v.exemptionProof);
  }
}

export function checkPaymentFile(file) {
  if (!file) return null;
  if (!RECEIPT_TYPES.includes(file.type)) return 'Please choose a JPEG, PNG, WebP or PDF file.';
  if (file.size > MAX_FILE_BYTES) return 'The file must be 8 MB or smaller.';
  return null;
}
