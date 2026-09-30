import { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import axios from 'axios';
import Toast from '../components/Toast';
import { useToast } from '../lib/useToast';
import { ymd, to12h, longDate, stClass, amenityFileUrl, bookingWhen, verificationPhotosLabel } from '../lib/amenity';
import './AmenityDashboard.css';

const API_BASE = '/api_backend';

// Amenity bookings desk: calendar of bookings (get_amenity_reservations.php),
// approve / decline / complete / cancel (update_reservation_status.php), and the
// amenity catalogue (manage_amenities.php). Booking rules: backend/api/amenity_common.php.

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const STATUSES = ['Pending', 'Approved', 'Completed', 'Declined', 'Cancelled'];
const HOLDING = ['Pending', 'Approved'];
const DEFAULT_ICONS = ['bi-building', 'bi-dribbble', 'bi-house-door', 'bi-geo-alt', 'bi-people', 'bi-music-note-beamed',
  'bi-tools', 'bi-box-seam', 'bi-umbrella', 'bi-lightning-charge', 'bi-truck-front-fill', 'bi-car-front-fill'];
const EMPTY_AMENITY = {
  amenity_id: 0, name: '', category: 'Venue', booking_mode: 'online', hotline_number: '', total_quantity: '',
  open_time: '06:00', close_time: '22:00', description: '', icon_class: 'bi-building'
};

const pad = (n) => String(n).padStart(2, '0');

const AmenityDashboard = () => {
  const { toast, showToast, confirmToast, closeToast } = useToast();
  const [view, setView] = useState('calendar');
  const [bookings, setBookings] = useState([]);
  const [amenities, setAmenities] = useState([]);
  const [icons, setIcons] = useState(DEFAULT_ICONS);
  const [loading, setLoading] = useState(true);
  const [amenityFilter, setAmenityFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('active');
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [remarks, setRemarks] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);

  const today = ymd(new Date());

  const loadBookings = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE}/get_amenity_reservations.php`);
      if (res.data?.success) setBookings(res.data.data || []);
      else showToast('Unable to Load', res.data?.message || 'Unable to load bookings.', 'error');
    } catch (err) {
      if (err.response?.status !== 401) showToast('Connection Error', 'Unable to load bookings.', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  const loadAmenities = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE}/manage_amenities.php`);
      if (res.data?.success) {
        setAmenities(res.data.data || []);
        if (Array.isArray(res.data.icons) && res.data.icons.length) setIcons(res.data.icons);
      }
    } catch { /* the bookings call reports connection problems */ }
  }, []);

  useEffect(() => {
    loadBookings();
    loadAmenities();
  }, [loadBookings, loadAmenities]);

  // ---- Derived data -------------------------------------------------------------------
  const visible = useMemo(() => bookings.filter(b => {
    if (amenityFilter !== 'all' && String(b.amenity_id) !== amenityFilter) return false;
    if (statusFilter === 'active') return HOLDING.includes(b.status);
    if (statusFilter === 'all') return true;
    return b.status === statusFilter;
  }), [bookings, amenityFilter, statusFilter]);

  const byDate = useMemo(() => {
    const map = {};
    visible.forEach(b => { (map[b.reservation_date] = map[b.reservation_date] || []).push(b); });
    Object.values(map).forEach(list => list.sort((a, b) => (a.start_time || '').localeCompare(b.start_time || '') || a.amenity_name.localeCompare(b.amenity_name)));
    return map;
  }, [visible]);

  const stats = useMemo(() => ({
    pending: bookings.filter(b => b.status === 'Pending').length,
    today: bookings.filter(b => b.reservation_date === today && HOLDING.includes(b.status)).length,
    upcoming: bookings.filter(b => b.reservation_date >= today && b.status === 'Approved').length,
    amenities: amenities.filter(a => a.status === 'Available').length
  }), [bookings, amenities, today]);

  const pendingQueue = useMemo(() => bookings
    .filter(b => b.status === 'Pending' && (amenityFilter === 'all' || String(b.amenity_id) === amenityFilter))
    .sort((a, b) => a.reservation_date.localeCompare(b.reservation_date) || (a.start_time || '').localeCompare(b.start_time || '')),
  [bookings, amenityFilter]);

  const panelList = selectedDate ? (byDate[selectedDate] || []) : pendingQueue;
  const selected = bookings.find(b => b.request_id === selectedId) || null;

  // What approving the selected booking would run into.
  const conflict = useMemo(() => {
    if (!selected || selected.status !== 'Pending') return null;
    const same = bookings.filter(b => b.request_id !== selected.request_id && b.amenity_id === selected.amenity_id
      && b.reservation_date === selected.reservation_date && HOLDING.includes(b.status));
    if (selected.category === 'Equipment') {
      if (!selected.total_quantity) return null;
      const approved = same.filter(b => b.status === 'Approved').reduce((sum, b) => sum + Number(b.quantity || 0), 0);
      const left = Number(selected.total_quantity) - approved;
      return { kind: 'stock', left, blocked: Number(selected.quantity) > left };
    }
    if (!selected.start_time) return null;
    const overlaps = same.filter(b => b.start_time && b.start_time < selected.end_time && b.end_time > selected.start_time);
    return {
      kind: 'time',
      approved: overlaps.filter(b => b.status === 'Approved'),
      pending: overlaps.filter(b => b.status === 'Pending'),
      blocked: overlaps.some(b => b.status === 'Approved')
    };
  }, [selected, bookings]);

  // ---- Calendar -----------------------------------------------------------------------
  const cells = useMemo(() => {
    const y = month.getFullYear(); const m = month.getMonth();
    const out = Array.from({ length: new Date(y, m, 1).getDay() }, (_, i) => ({ key: `b${i}` }));
    for (let d = 1; d <= new Date(y, m + 1, 0).getDate(); d++) {
      const date = `${y}-${pad(m + 1)}-${pad(d)}`;
      out.push({ key: date, day: d, date, items: byDate[date] || [] });
    }
    return out;
  }, [month, byDate]);

  const selectBooking = (b) => {
    setSelectedId(b.request_id);
    setRemarks('');
  };
  const pickDate = (date) => {
    setSelectedDate(prev => (prev === date ? null : date));
    const first = byDate[date]?.[0];
    if (first && selectedDate !== date) selectBooking(first);
  };
  const shiftMonth = (n) => setMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + n, 1));
  const goToday = () => { const d = new Date(); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); setSelectedDate(today); };

  // ---- Actions ------------------------------------------------------------------------
  const updateStatus = async (status) => {
    if (!selected) return;
    const verbs = { Approved: 'Approve', Declined: 'Decline', Completed: 'Complete', Cancelled: 'Cancel' };
    if (status === 'Declined' || status === 'Cancelled') {
      const ok = await confirmToast(
        `${verbs[status]} this booking?`,
        `${selected.resident_name}'s booking of ${selected.amenity_name} on ${longDate(selected.reservation_date)} will be ${status.toLowerCase()} and the resident notified by email.${remarks.trim() ? '' : ' Consider adding a remark explaining why.'}`,
        { confirmLabel: `${verbs[status]} Booking`, cancelLabel: 'Go Back', danger: true }
      );
      if (!ok) return;
    } else if (status === 'Approved' && conflict?.kind === 'time' && conflict.pending.length) {
      const ok = await confirmToast(
        'Approve and decline overlapping requests?',
        `${conflict.pending.length} other pending request(s) overlap this time and will be declined automatically.`,
        { confirmLabel: 'Approve', cancelLabel: 'Go Back' }
      );
      if (!ok) return;
    }
    setBusy(true);
    try {
      const res = await axios.post(`${API_BASE}/update_reservation_status.php`, { request_id: selected.request_id, status, remarks: remarks.trim() });
      if (res.data?.success) {
        showToast('Booking Updated', res.data.message, 'success');
        setRemarks('');
        await loadBookings();
      } else {
        showToast('Not Updated', res.data?.message || 'Unable to update the booking.', 'error');
      }
    } catch (err) {
      if (err.response?.status !== 401) showToast('Connection Error', 'Unable to update the booking.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const saveAmenity = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await axios.post(`${API_BASE}/manage_amenities.php`, { action: 'save', ...editing });
      if (res.data?.success) {
        showToast(editing.amenity_id ? 'Amenity Updated' : 'Amenity Added', res.data.message, 'success');
        setEditing(null);
        await Promise.all([loadAmenities(), loadBookings()]);
      } else {
        showToast('Not Saved', res.data?.message || 'Unable to save the amenity.', 'error');
      }
    } catch (err) {
      if (err.response?.status !== 401) showToast('Connection Error', 'Unable to save the amenity.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const setAmenityStatus = async (a, status) => {
    if (status === a.status) return;
    if (status !== 'Available') {
      const upcoming = Number(a.upcoming_bookings || 0);
      const ok = await confirmToast(
        `Set "${a.name}" to ${status}?`,
        `Residents won't be able to book it until it's made Available again.${upcoming ? ` It still has ${upcoming} upcoming booking(s) — review and cancel them separately if needed.` : ''}`,
        { confirmLabel: status === 'Disabled' ? 'Disable' : 'Set Under Maintenance', cancelLabel: 'Go Back', danger: status === 'Disabled' }
      );
      if (!ok) return;
    }
    try {
      const res = await axios.post(`${API_BASE}/manage_amenities.php`, { action: 'set_status', amenity_id: a.amenity_id, status });
      if (res.data?.success) {
        showToast('Amenity Updated', res.data.message, 'success');
        loadAmenities();
      } else {
        showToast('Not Updated', res.data?.message || 'Unable to update the amenity.', 'error');
      }
    } catch (err) {
      if (err.response?.status !== 401) showToast('Connection Error', 'Unable to update the amenity.', 'error');
    }
  };

  const editField = (name, value) => setEditing(prev => ({ ...prev, [name]: value }));

  // ---- Render -------------------------------------------------------------------------
  const renderDetail = () => {
    if (!selected) return null;
    const s = selected;
    return (
      <div className="amd-detail">
        <div className="amd-detail-head">
          <div>
            <h4>{s.resident_name}</h4>
            <p>{s.tracking_code}</p>
          </div>
          <span className={`amd-tag ${stClass(s.status)}`}>{s.status}</span>
        </div>
        <div className="amd-info">
          <div className="is-wide"><label>Amenity</label><p><i className={`bi ${s.icon_class || 'bi-building'}`}></i> {s.amenity_name} <small style={{ color: '#94a3b8' }}>({s.category})</small></p></div>
          <div><label>Date</label><p>{longDate(s.reservation_date)}</p></div>
          <div><label>{s.category === 'Equipment' ? 'Quantity' : 'Time'}</label><p>{bookingWhen(s)}</p></div>
          {s.destination && <div className="is-wide"><label>Destination</label><p>{s.destination}</p></div>}
          <div><label>Contact</label><p>{s.contact_number || '—'}</p></div>
          <div><label>Control No.</label><p>{s.control_num || '—'}</p></div>
          <div className="is-wide"><label>Purpose</label><p style={{ fontWeight: 500 }}>{s.purpose || '—'}</p></div>
          {s.remarks && <div className="is-wide"><label>Remarks</label><p style={{ fontWeight: 500 }}>{s.remarks}</p></div>}
          {s.processed_by_name && <div className="is-wide"><label>Last Processed</label><p style={{ fontWeight: 500 }}>{s.processed_by_name}{s.processed_at ? ` · ${new Date(s.processed_at.replace(' ', 'T')).toLocaleString()}` : ''}</p></div>}
          <div className="is-wide">
            <label>{verificationPhotosLabel(s)}</label>
            <div className="amd-photos">
              {[['id_front', 'Valid ID'], ['id_holding', 'Selfie with ID']].map(([key, label]) => (s[key]
                ? <button type="button" key={key} className="amd-photo" onClick={() => setPreview({ src: amenityFileUrl(s[key]), label })}><img src={amenityFileUrl(s[key])} alt={label} /><span>{label}</span></button>
                : <span key={key} style={{ fontSize: '0.8rem', color: '#94a3b8' }}>No {label}</span>))}
            </div>
          </div>
        </div>

        {conflict?.kind === 'time' && conflict.blocked && (
          <div className="amd-note is-bad"><i className="bi bi-x-octagon-fill"></i><span>Overlaps an approved booking ({conflict.approved.map(b => `${to12h(b.start_time)}–${to12h(b.end_time)}`).join(', ')}). Decline it or ask the resident to rebook.</span></div>
        )}
        {conflict?.kind === 'time' && !conflict.blocked && conflict.pending.length > 0 && (
          <div className="amd-note is-warn"><i className="bi bi-exclamation-triangle-fill"></i><span>{conflict.pending.length} other pending request(s) overlap this time. Approving this one declines them automatically.</span></div>
        )}
        {conflict?.kind === 'stock' && (
          <div className={`amd-note ${conflict.blocked ? 'is-bad' : 'is-info'}`}><i className="bi bi-box-seam"></i><span>{Math.max(conflict.left, 0)} of {s.total_quantity} unit(s) not yet committed for this date{conflict.blocked ? ' — not enough to approve this request.' : '.'}</span></div>
        )}

        {(s.status === 'Pending' || s.status === 'Approved') && (
          <div className="amd-actions">
            <textarea className="amd-textarea" rows="2" maxLength={1000} placeholder="Remark for the resident (optional — included in the email)" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
            {s.status === 'Pending' ? (
              <div className="amd-actions-row">
                <button type="button" className="amd-btn amd-btn-primary" disabled={busy || conflict?.blocked} onClick={() => updateStatus('Approved')}><i className="bi bi-check2-circle"></i> Approve</button>
                <button type="button" className="amd-btn amd-btn-danger" disabled={busy} onClick={() => updateStatus('Declined')}><i className="bi bi-x-circle"></i> Decline</button>
              </div>
            ) : (
              <div className="amd-actions-row">
                <button type="button" className="amd-btn amd-btn-blue" disabled={busy} onClick={() => updateStatus('Completed')}><i className="bi bi-patch-check"></i> Mark Completed</button>
                <button type="button" className="amd-btn amd-btn-danger" disabled={busy} onClick={() => updateStatus('Cancelled')}><i className="bi bi-slash-circle"></i> Cancel</button>
              </div>
            )}
          </div>
        )}
        <div className="amd-actions">
          <Link className="amd-btn amd-btn-ghost" to={`/admin/amenities/view/${s.request_id}`}><i className="bi bi-folder2-open"></i> Open Full Case File</Link>
        </div>
      </div>
    );
  };

  return (
    <div className="amd-wrap">
      <Toast toast={toast} onClose={closeToast} />
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css" />

      <div className="amd-top">
        <div>
          <h2>Amenity Bookings</h2>
          <p>Review reservations of venues, equipment and vehicles, and manage what residents can book.</p>
        </div>
        <div className="amd-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={view === 'calendar'} className={`amd-tab ${view === 'calendar' ? 'is-active' : ''}`} onClick={() => setView('calendar')}>
            <i className="bi bi-calendar3"></i> Bookings {stats.pending > 0 && <span className="amd-count">{stats.pending}</span>}
          </button>
          <button type="button" role="tab" aria-selected={view === 'manage'} className={`amd-tab ${view === 'manage' ? 'is-active' : ''}`} onClick={() => setView('manage')}>
            <i className="bi bi-sliders"></i> Manage Amenities
          </button>
        </div>
      </div>

      <div className="amd-stats">
        <div className="amd-stat"><i className="bi bi-hourglass-split amd-i-pending"></i><div><strong>{stats.pending}</strong><span>Awaiting approval</span></div></div>
        <div className="amd-stat"><i className="bi bi-calendar-day amd-i-today"></i><div><strong>{stats.today}</strong><span>Booked for today</span></div></div>
        <div className="amd-stat"><i className="bi bi-calendar-check amd-i-upcoming"></i><div><strong>{stats.upcoming}</strong><span>Approved, upcoming</span></div></div>
        <div className="amd-stat"><i className="bi bi-building amd-i-amen"></i><div><strong>{stats.amenities}</strong><span>Amenities open for booking</span></div></div>
      </div>

      {view === 'calendar' ? (
        <>
          <div className="amd-toolbar">
            <select className="amd-select" value={amenityFilter} onChange={(e) => setAmenityFilter(e.target.value)} aria-label="Filter by amenity">
              <option value="all">All amenities</option>
              {amenities.map(a => <option key={a.amenity_id} value={String(a.amenity_id)}>{a.name} ({a.category}){a.status !== 'Available' ? ` — ${a.status}` : ''}</option>)}
            </select>
            <select className="amd-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter by status">
              <option value="active">Active (Pending + Approved)</option>
              <option value="all">All statuses</option>
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <div className="amd-legend">
              {STATUSES.map(s => <span key={s}><i className={stClass(s)} style={{ background: 'currentColor' }}></i>{s}</span>)}
            </div>
          </div>

          <div className="amd-work">
            <div className="amd-card">
              <div className="amd-cal-nav">
                <h3>{MONTHS[month.getMonth()]} {month.getFullYear()}</h3>
                <div className="amd-nav-btns">
                  <button type="button" className="amd-today-btn" onClick={goToday}>Today</button>
                  <button type="button" className="amd-icon-btn" onClick={() => shiftMonth(-1)} aria-label="Previous month"><i className="bi bi-chevron-left"></i></button>
                  <button type="button" className="amd-icon-btn" onClick={() => shiftMonth(1)} aria-label="Next month"><i className="bi bi-chevron-right"></i></button>
                </div>
              </div>
              <div className="amd-cal">
                {DOW.map(d => <div key={d} className="amd-cal-dow">{d}</div>)}
                {cells.map(c => (!c.day ? <div key={c.key} className="amd-cell is-blank" /> : (
                  <button type="button" key={c.key}
                    className={`amd-cell ${c.date === today ? 'is-today' : ''} ${c.date === selectedDate ? 'is-selected' : ''} ${c.date < today ? 'is-past' : ''}`}
                    onClick={() => pickDate(c.date)} aria-label={`${longDate(c.date)}: ${c.items.length} booking(s)`}>
                    <span className="amd-daynum">{c.day}</span>
                    {c.items.slice(0, 3).map(b => (
                      <span key={b.request_id} className={`amd-chip ${stClass(b.status)}`} title={`${b.amenity_name} · ${bookingWhen(b)} · ${b.resident_name} (${b.status})`}>
                        {b.category === 'Equipment' ? `${b.quantity}× ` : b.start_time ? `${to12h(b.start_time).replace(':00', '')} ` : ''}{b.amenity_name}
                      </span>
                    ))}
                    {c.items.length > 3 && <span className="amd-more">+{c.items.length - 3} more</span>}
                  </button>
                )))}
              </div>
            </div>

            <div className="amd-card amd-panel">
              <div className="amd-panel-title">
                <h3>{selectedDate ? longDate(selectedDate) : 'Needs Action'}</h3>
                {selectedDate && <button type="button" className="amd-link-btn" onClick={() => setSelectedDate(null)}>Show pending queue</button>}
              </div>
              {loading ? (
                <div className="amd-empty"><i className="bi bi-hourglass-split"></i>Loading bookings…</div>
              ) : panelList.length === 0 ? (
                <div className="amd-empty">
                  <i className={`bi ${selectedDate ? 'bi-calendar2' : 'bi-check2-all'}`}></i>
                  {selectedDate ? 'No bookings on this date for the current filters.' : 'No pending requests. Click a date to see its bookings.'}
                </div>
              ) : (
                <div className="amd-list">
                  {panelList.map(b => (
                    <button type="button" key={b.request_id} className={`amd-row ${b.request_id === selectedId ? 'is-active' : ''}`} onClick={() => selectBooking(b)}>
                      <span className="amd-row-icon"><i className={`bi ${b.icon_class || 'bi-building'}`}></i></span>
                      <span className="amd-row-main">
                        <strong>{b.amenity_name} · {b.resident_name}</strong>
                        <span>{selectedDate ? '' : `${longDate(b.reservation_date)} · `}{bookingWhen(b)}</span>
                      </span>
                      <span className={`amd-tag ${stClass(b.status)}`} style={{ padding: '3px 8px', fontSize: '0.62rem' }}>{b.status}</span>
                    </button>
                  ))}
                </div>
              )}
              {renderDetail()}
            </div>
          </div>
        </>
      ) : (
        <div className="amd-card">
          <div className="amd-panel-title">
            <h3>Amenities</h3>
            <button type="button" className="amd-btn amd-btn-primary" onClick={() => setEditing({ ...EMPTY_AMENITY })}><i className="bi bi-plus-lg"></i> Add Amenity</button>
          </div>
          <div className="amd-table-wrap">
            <table className="amd-table">
              <thead>
                <tr><th>Amenity</th><th>Booking</th><th>Hours / Stock</th><th>Upcoming</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {amenities.length === 0 && <tr><td colSpan="6"><div className="amd-empty">No amenities yet.</div></td></tr>}
                {amenities.map(a => (
                  <tr key={a.amenity_id} className={a.status !== 'Available' ? 'is-off' : ''}>
                    <td>
                      <div className="amd-amen-name">
                        <span className="amd-row-icon"><i className={`bi ${a.icon_class || 'bi-building'}`}></i></span>
                        <div><strong>{a.name}</strong><small>{a.category}</small></div>
                      </div>
                    </td>
                    <td>{a.booking_mode === 'hotline' ? <><i className="bi bi-telephone"></i> Hotline {a.hotline_number}</> : 'Online'}</td>
                    <td>{a.booking_mode === 'hotline' ? '—' : a.category === 'Equipment' ? `${a.total_quantity ?? '—'} unit(s)` : `${to12h(a.open_time)} – ${to12h(a.close_time)}`}</td>
                    <td>{a.upcoming_bookings}</td>
                    <td>
                      <select className="amd-select" value={a.status} onChange={(e) => setAmenityStatus(a, e.target.value)} aria-label={`Status of ${a.name}`}>
                        <option value="Available">Available</option>
                        <option value="Under Maintenance">Under Maintenance</option>
                        <option value="Disabled">Disabled</option>
                      </select>
                    </td>
                    <td>
                      <button type="button" className="amd-btn amd-btn-ghost" onClick={() => setEditing({
                        ...EMPTY_AMENITY, ...a,
                        hotline_number: a.hotline_number || '', total_quantity: a.total_quantity ?? '', description: a.description || ''
                      })}><i className="bi bi-pencil"></i> Edit</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ margin: '14px 0 0', fontSize: '0.8rem', color: '#64748b' }}>
            <i className="bi bi-info-circle"></i> Amenities are never deleted, because past bookings refer to them. Set one to <strong>Disabled</strong> to retire it.
          </p>
        </div>
      )}

      {preview && createPortal(
        <div className="amd-overlay" onClick={() => setPreview(null)} role="dialog" aria-label={preview.label}>
          <div className="amd-preview-wrap">
            <img className="amd-preview" src={preview.src} alt={preview.label} />
            <p>{preview.label} · click anywhere to close</p>
          </div>
        </div>,
        document.body
      )}

      {editing && createPortal(
        <div className="amd-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) setEditing(null); }}>
          <form className="amd-modal" onSubmit={saveAmenity} role="dialog" aria-modal="true" aria-labelledby="amd-edit-title">
            <h3 id="amd-edit-title">{editing.amenity_id ? `Edit ${editing.name || 'Amenity'}` : 'Add Amenity'}</h3>
            <p>Venues are booked by time, equipment by quantity, vehicles either online or through a hotline.</p>
            <div className="amd-form">
              <div className="is-wide">
                <label htmlFor="am-name">Name *</label>
                <input id="am-name" className="amd-input" required maxLength={100} value={editing.name} onChange={(e) => editField('name', e.target.value)} placeholder="e.g. Multi-Purpose Hall" />
              </div>
              <div>
                <label htmlFor="am-cat">Category *</label>
                <select id="am-cat" className="amd-select" value={editing.category} onChange={(e) => editField('category', e.target.value)}>
                  <option value="Venue">Venue</option>
                  <option value="Equipment">Equipment</option>
                  <option value="Vehicle">Vehicle</option>
                </select>
              </div>
              {editing.category === 'Vehicle' ? (
                <div>
                  <label htmlFor="am-mode">How residents request it</label>
                  <select id="am-mode" className="amd-select" value={editing.booking_mode} onChange={(e) => editField('booking_mode', e.target.value)}>
                    <option value="hotline">Hotline (emergency)</option>
                    <option value="online">Online booking</option>
                  </select>
                </div>
              ) : editing.category === 'Equipment' ? (
                <div>
                  <label htmlFor="am-qty">Units Owned *</label>
                  <input id="am-qty" className="amd-input" type="number" min="1" max="100000" required value={editing.total_quantity} onChange={(e) => editField('total_quantity', e.target.value)} placeholder="e.g. 150" />
                  <small>Bookings can't exceed what's left per date.</small>
                </div>
              ) : <div />}
              {editing.category === 'Vehicle' && editing.booking_mode === 'hotline' ? (
                <div className="is-wide">
                  <label htmlFor="am-hot">Hotline Number *</label>
                  <input id="am-hot" className="amd-input" required maxLength={30} value={editing.hotline_number} onChange={(e) => editField('hotline_number', e.target.value)} placeholder="e.g. (046) 123-4567" />
                </div>
              ) : editing.category !== 'Equipment' && (
                <>
                  <div>
                    <label htmlFor="am-open">Opens</label>
                    <input id="am-open" className="amd-input" type="time" value={editing.open_time} onChange={(e) => editField('open_time', e.target.value)} />
                  </div>
                  <div>
                    <label htmlFor="am-close">Closes</label>
                    <input id="am-close" className="amd-input" type="time" value={editing.close_time} onChange={(e) => editField('close_time', e.target.value)} />
                  </div>
                </>
              )}
              <div className="is-wide">
                <label htmlFor="am-desc">Description</label>
                <textarea id="am-desc" className="amd-textarea" rows="3" maxLength={1000} value={editing.description} onChange={(e) => editField('description', e.target.value)} placeholder="Shown to residents on the booking page" />
              </div>
              <div className="is-wide">
                <label>Icon</label>
                <div className="amd-icon-pick">
                  {icons.map(ic => (
                    <button type="button" key={ic} className={editing.icon_class === ic ? 'is-active' : ''} onClick={() => editField('icon_class', ic)} aria-label={ic} aria-pressed={editing.icon_class === ic}>
                      <i className={`bi ${ic}`}></i>
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="amd-modal-actions">
              <button type="button" className="amd-btn amd-btn-ghost" disabled={saving} onClick={() => setEditing(null)}>Cancel</button>
              <button type="submit" className="amd-btn amd-btn-primary" disabled={saving}>
                <i className={`bi ${saving ? 'bi-hourglass-split' : 'bi-check2'}`}></i> {saving ? 'Saving…' : editing.amenity_id ? 'Save Changes' : 'Add Amenity'}
              </button>
            </div>
          </form>
        </div>,
        document.body
      )}
    </div>
  );
};

export default AmenityDashboard;
