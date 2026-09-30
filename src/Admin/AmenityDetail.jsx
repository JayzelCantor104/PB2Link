import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';
import Toast from '../components/Toast';
import { useToast } from '../lib/useToast';
import { to12h, longDate, stClass, amenityFileUrl, bookingWhen, verificationPhotosLabel } from '../lib/amenity';
import './AmenityDashboard.css';

const API_BASE = '/api_backend';

// Full case file of one amenity booking (/admin/amenities/view/:id):
// details from get_amenity_details.php, status changes through
// update_reservation_status.php, overtime through update_amenity.php.

const AmenityDetail = () => {
  const { id } = useParams();
  const { toast, showToast, confirmToast, closeToast } = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [remarks, setRemarks] = useState('');
  const [overtime, setOvertime] = useState(1);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE}/get_amenity_details.php`, { params: { id } });
      if (res.data?.success) { setData(res.data.data); setError(''); }
      else setError(res.data?.message || 'Booking not found.');
    } catch (err) {
      if (err.response?.status !== 401) setError('Unable to load this booking.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const updateStatus = async (status) => {
    const verbs = { Approved: 'Approve', Declined: 'Decline', Completed: 'Complete', Cancelled: 'Cancel' };
    if (status === 'Declined' || status === 'Cancelled') {
      const ok = await confirmToast(`${verbs[status]} this booking?`,
        `The resident will be notified by email.${remarks.trim() ? '' : ' Consider adding a remark explaining why.'}`,
        { confirmLabel: `${verbs[status]} Booking`, cancelLabel: 'Go Back', danger: true });
      if (!ok) return;
    }
    setBusy(true);
    try {
      const res = await axios.post(`${API_BASE}/update_reservation_status.php`, { request_id: data.request_id, status, remarks: remarks.trim() });
      if (res.data?.success) {
        showToast('Booking Updated', res.data.message, 'success');
        setRemarks('');
        await load();
      } else {
        showToast('Not Updated', res.data?.message || 'Unable to update the booking.', 'error');
      }
    } catch (err) {
      if (err.response?.status !== 401) showToast('Connection Error', 'Unable to update the booking.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const extend = async () => {
    setBusy(true);
    try {
      const res = await axios.post(`${API_BASE}/update_amenity.php`, { request_id: data.request_id, extend_hours: overtime });
      if (res.data?.success) {
        showToast('Overtime Added', res.data.message, 'success');
        await load();
      } else {
        showToast('Overtime Not Added', res.data?.message || 'Unable to extend this booking.', 'error');
      }
    } catch (err) {
      if (err.response?.status !== 401) showToast('Connection Error', 'Unable to extend this booking.', 'error');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="amd-wrap"><div className="amd-empty"><i className="bi bi-hourglass-split"></i>Loading case file…</div></div>;
  if (!data) {
    return (
      <div className="amd-wrap amd-case">
        <Link className="amd-back" to="/admin/amenities"><i className="bi bi-arrow-left"></i> Back to Amenity Bookings</Link>
        <div className="amd-card"><div className="amd-empty"><i className="bi bi-exclamation-circle"></i>{error || 'Booking not found.'}</div></div>
      </div>
    );
  }

  const d = data;
  const timed = d.category !== 'Equipment' && d.start_time;
  const address = [d.house_no, d.street, d.subdivision].filter(Boolean).join(', ');

  return (
    <div className="amd-wrap amd-case">
      <Toast toast={toast} onClose={closeToast} />
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css" />
      <Link className="amd-back" to="/admin/amenities"><i className="bi bi-arrow-left"></i> Back to Amenity Bookings</Link>

      <div className="amd-top">
        <div>
          <h2>Booking Case File</h2>
          <p style={{ fontFamily: 'ui-monospace, monospace' }}>{d.tracking_code}</p>
        </div>
        <span className={`amd-tag ${stClass(d.status)}`} style={{ fontSize: '0.8rem', padding: '7px 16px' }}>{d.status}</span>
      </div>

      <div className="amd-case-grid">
        <div>
          <div className="amd-card">
            <h3><i className={`bi ${d.icon_class || 'bi-building'}`}></i> {d.amenity_name} <small style={{ color: '#94a3b8', fontWeight: 600 }}>({d.category})</small></h3>
            <div className="amd-info">
              <div><label>Date</label><p>{longDate(d.reservation_date)}</p></div>
              <div><label>{d.category === 'Equipment' ? 'Quantity' : 'Time'}</label><p>{bookingWhen(d)}</p></div>
              {d.destination && <div className="is-wide"><label>Destination</label><p>{d.destination}</p></div>}
              <div className="is-wide"><label>Purpose</label><p style={{ fontWeight: 500, whiteSpace: 'pre-wrap' }}>{d.purpose || '—'}</p></div>
              {d.remarks && <div className="is-wide"><label>Remarks</label><p style={{ fontWeight: 500, whiteSpace: 'pre-wrap' }}>{d.remarks}</p></div>}
              <div><label>Filed</label><p>{d.date_requested ? new Date(d.date_requested.replace(' ', 'T')).toLocaleString() : '—'}</p></div>
              <div><label>Last Processed</label><p>{d.processed_by_name ? `${d.processed_by_name}${d.processed_at ? ` · ${new Date(d.processed_at.replace(' ', 'T')).toLocaleString()}` : ''}` : '—'}</p></div>
              {d.date_claimed && <div><label>Completed</label><p>{new Date(d.date_claimed.replace(' ', 'T')).toLocaleString()}</p></div>}
            </div>
          </div>

          <div className="amd-card">
            <h3><i className="bi bi-person-vcard"></i> Resident</h3>
            <div className="amd-info">
              <div className="is-wide"><label>Name</label><p>{d.resident_name}</p></div>
              <div><label>Control No.</label><p>{d.control_num || '—'}</p></div>
              <div><label>Contact Number</label><p>{d.contact_number || '—'}</p></div>
              <div className="is-wide"><label>Email</label><p>{d.resident_email || '—'}</p></div>
              {address && <div className="is-wide"><label>Address</label><p>{address}</p></div>}
              <div className="is-wide">
                <label>{verificationPhotosLabel(d)}</label>
                <div className="amd-photos">
                  {[['id_front', 'Valid ID'], ['id_holding', 'Selfie with ID']].map(([key, label]) => (d[key]
                    ? <button type="button" key={key} className="amd-photo" onClick={() => setPreview({ src: amenityFileUrl(d[key]), label })}><img src={amenityFileUrl(d[key])} alt={label} /><span>{label}</span></button>
                    : <span key={key} style={{ fontSize: '0.8rem', color: '#94a3b8' }}>No {label}</span>))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div>
          {(d.status === 'Pending' || d.status === 'Approved') ? (
            <div className="amd-card">
              <h3><i className="bi bi-clipboard-check"></i> Decision</h3>
              <textarea className="amd-textarea" rows="3" maxLength={1000} placeholder="Remark for the resident (optional — included in the email)" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
              <div className="amd-actions">
                {d.status === 'Pending' ? (
                  <>
                    <button type="button" className="amd-btn amd-btn-primary" disabled={busy} onClick={() => updateStatus('Approved')}><i className="bi bi-check2-circle"></i> Approve</button>
                    <button type="button" className="amd-btn amd-btn-danger" disabled={busy} onClick={() => updateStatus('Declined')}><i className="bi bi-x-circle"></i> Decline</button>
                  </>
                ) : (
                  <>
                    <button type="button" className="amd-btn amd-btn-blue" disabled={busy} onClick={() => updateStatus('Completed')}><i className="bi bi-patch-check"></i> Mark Completed</button>
                    <button type="button" className="amd-btn amd-btn-danger" disabled={busy} onClick={() => updateStatus('Cancelled')}><i className="bi bi-slash-circle"></i> Cancel Booking</button>
                  </>
                )}
              </div>
              <p style={{ margin: '12px 0 0', fontSize: '0.78rem', color: '#64748b' }}>
                {d.status === 'Pending'
                  ? 'Approving re-checks the schedule and stock, and declines other pending requests that overlap this time.'
                  : 'Mark the booking completed once the amenity has been returned or the event is over.'}
              </p>
            </div>
          ) : (
            <div className="amd-card">
              <h3><i className="bi bi-archive"></i> Closed</h3>
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>This booking is {d.status.toLowerCase()} and can no longer be changed.</p>
            </div>
          )}

          {d.status === 'Approved' && timed && (
            <div className="amd-card">
              <h3><i className="bi bi-clock-history"></i> Overtime</h3>
              <p style={{ margin: '0 0 12px', fontSize: '0.82rem', color: '#64748b' }}>
                Extends the end time from {to12h(d.end_time)} and blocks the extra time for other bookings. Closing time is {to12h(d.close_time)}.
              </p>
              <div className="amd-actions-row">
                <select className="amd-select" value={overtime} onChange={(e) => setOvertime(Number(e.target.value))} aria-label="Overtime hours">
                  {[1, 2, 3, 4, 5, 6].map(h => <option key={h} value={h}>+{h} hour{h > 1 ? 's' : ''}</option>)}
                </select>
                <button type="button" className="amd-btn amd-btn-primary" disabled={busy} onClick={extend}><i className="bi bi-plus-circle"></i> Add Overtime</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {preview && createPortal(
        <div className="amd-overlay" onClick={() => setPreview(null)} role="dialog" aria-label={preview.label}>
          <div className="amd-preview-wrap">
            <img className="amd-preview" src={preview.src} alt={preview.label} />
            <p>{preview.label} · click anywhere to close</p>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default AmenityDetail;
