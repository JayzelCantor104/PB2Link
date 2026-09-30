import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import Footer from '../components/Footer';
import Preloader from '../components/Preloader';
import Toast from '../components/Toast';
import IdOnFileCard from '../components/IdOnFileCard';
import { verificationBlocker } from '../lib/residency';
import { useToast } from '../lib/useToast';
import '../styles/barangayDocuments.css';
import '../styles/booking.css';

const API_BASE = '/api_backend';

// Amenity booking: submits to backend/api/submit_amenity_reservation.php.
// Venues and online vehicles book a time range; equipment books a quantity
// out of the barangay's stock; hotline vehicles (ambulance) show a number to call.
// Rules are enforced again on the server (amenity_common.php).

const STEPS = [
  { label: 'Amenity', icon: 'bi-building-gear' },
  { label: 'Schedule', icon: 'bi-calendar-week' },
  { label: 'Verification', icon: 'bi-shield-lock' },
  { label: 'Review', icon: 'bi-clipboard2-check-fill' }
];
const CATEGORIES = ['All', 'Venue', 'Equipment', 'Vehicle'];
const MAX_DAYS_AHEAD = 180;

const localDate = (d) => {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const nowHHMM = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const to12h = (hhmm) => {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};
const formatDate = (ymd) => (ymd ? new Date(`${ymd}T00:00:00`).toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : '');
const tagClass = (category) => `bk-tag is-${String(category || 'venue').toLowerCase()}`;

const BookingPage = () => {
  const navigate = useNavigate();
  const { toast, showToast, closeToast } = useToast();

  const [currentStep, setCurrentStep] = useState(0);
  const [trackingCode] = useState(() => {
    const date = localDate(new Date()).replace(/-/g, '');
    return `BK-${date}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  });
  const [amenities, setAmenities] = useState([]);
  const [loadingAmenities, setLoadingAmenities] = useState(true);
  const [filter, setFilter] = useState('All');
  const [selected, setSelected] = useState(null);
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({ reservation_date: '', start_time: '', end_time: '', quantity: 1, destination: '', purpose: '' });
  const [idOnFile, setIdOnFile] = useState(null); // registration ID, used instead of new photos
  const [availability, setAvailability] = useState(null); // { key, ... }
  const [errors, setErrors] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(null);

  const today = localDate(new Date());
  const maxDate = localDate(new Date(Date.now() + MAX_DAYS_AHEAD * 86400000));
  const category = selected?.category || 'Venue';
  const isHotline = selected?.booking_mode === 'hotline';
  const isTimed = category !== 'Equipment';

  useEffect(() => {
    fetch(`${API_BASE}/get_facilities.php`)
      .then(res => res.json())
      .then(data => { if (data.success && Array.isArray(data.data)) setAmenities(data.data); })
      .catch(() => showToast('Connection Error', 'Unable to load the list of amenities.', 'error'))
      .finally(() => setLoadingAmenities(false));
    fetch(`${API_BASE}/get_user_profile.php`, { credentials: 'include' })
      .then(res => res.json())
      .then(data => { if (data.success) { setProfile(data.data); setIdOnFile(data.id_on_file || null); } })
      .catch(() => {});
  }, [showToast]);

  // What's already booked for the chosen amenity + date.
  const availKey = selected && form.reservation_date && !isHotline ? `${selected.facility_id}|${form.reservation_date}` : null;
  useEffect(() => {
    if (!availKey) return undefined;
    let cancelled = false;
    const [id, date] = availKey.split('|');
    fetch(`${API_BASE}/get_amenity_availability.php?amenity_id=${encodeURIComponent(id)}&date=${encodeURIComponent(date)}`)
      .then(res => res.json())
      .then(data => { if (!cancelled && data.success) setAvailability({ ...data, key: availKey }); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [availKey]);
  const avail = availability && availability.key === availKey ? availability : null;

  const visibleAmenities = filter === 'All' ? amenities : amenities.filter(a => a.category === filter);
  const contactName = profile ? [profile.fName, profile.mName, profile.lName, profile.suffix && profile.suffix !== 'N/A' ? profile.suffix : ''].filter(Boolean).join(' ') : '';

  const clearError = (name) => setErrors(prev => prev.filter(e => e !== name));
  const errClass = (name) => (errors.includes(name) ? 'error-ring' : '');

  const handleChange = (e) => {
    const { name, value } = e.target;
    clearError(name);
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const selectAmenity = (a) => {
    setSelected(a);
    setErrors([]);
    setForm(prev => ({
      ...prev,
      start_time: '',
      end_time: '',
      quantity: 1,
      destination: a.category === 'Vehicle' ? prev.destination : ''
    }));
  };

  // Time conflicts with what's already booked (the server re-checks on submit).
  const overlapping = useMemo(() => {
    if (!avail?.taken || !form.start_time || !form.end_time) return [];
    return avail.taken.filter(t => form.start_time < t.end_time && form.end_time > t.start_time);
  }, [avail, form.start_time, form.end_time]);

  const validateStep = () => {
    const missing = [];
    let message = 'Please fill in all required fields.';
    if (currentStep === 0) {
      if (!selected) return { missing: ['amenity'], message: 'Please choose an amenity to book.' };
      if (isHotline) return { missing: ['hotline'], message: 'This vehicle is requested by calling the hotline shown.' };
    }
    if (currentStep === 1) {
      const d = form.reservation_date;
      if (!d) missing.push('reservation_date');
      else if (d < today || d > maxDate) { missing.push('reservation_date'); message = 'Please choose a date from today up to 6 months ahead.'; }
      if (isTimed) {
        const open = selected.open_time || '06:00';
        const close = selected.close_time || '22:00';
        if (!form.start_time) missing.push('start_time');
        if (!form.end_time) missing.push('end_time');
        if (form.start_time && form.end_time) {
          if (form.start_time >= form.end_time) { missing.push('end_time'); message = 'The end time must be later than the start time.'; }
          else if (form.start_time < open || form.end_time > close) { missing.push('start_time', 'end_time'); message = `Please book within ${to12h(open)} – ${to12h(close)}.`; }
          else if (d === today && form.start_time <= nowHHMM()) { missing.push('start_time'); message = 'That start time has already passed today.'; }
          else if (overlapping.length) { missing.push('start_time', 'end_time'); message = 'That time overlaps an existing booking. Please choose a free time.'; }
        }
        if (category === 'Vehicle' && !form.destination.trim()) missing.push('destination');
      } else {
        const q = Number(form.quantity);
        if (!Number.isInteger(q) || q < 1) { missing.push('quantity'); message = 'Please enter how many units you need.'; }
        else if (avail?.remaining_quantity != null && q > avail.remaining_quantity) {
          missing.push('quantity');
          message = avail.remaining_quantity > 0 ? `Only ${avail.remaining_quantity} unit(s) are left for that date.` : 'No units are left for that date.';
        }
      }
      if (!form.purpose.trim()) missing.push('purpose');
    }
    if (currentStep === 2) {
      const blocker = verificationBlocker({ idOnFile });
      if (blocker) return { missing: ['id_on_file'], message: blocker };
    }
    return { missing, message };
  };

  const handleNext = () => {
    const { missing, message } = validateStep();
    if (missing.length) {
      setErrors(missing);
      showToast('Check Your Booking', message, 'error');
      return;
    }
    setErrors([]);
    setCurrentStep(s => Math.min(s + 1, STEPS.length - 1));
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    const data = new FormData();
    data.append('amenity_id', selected.facility_id);
    data.append('tracking_code', trackingCode);
    data.append('reservation_date', form.reservation_date);
    if (isTimed) {
      data.append('start_time', form.start_time);
      data.append('end_time', form.end_time);
    } else {
      data.append('quantity', String(form.quantity));
    }
    if (category === 'Vehicle') data.append('destination', form.destination.trim());
    data.append('purpose', form.purpose.trim());
    // Verified with the resident's registration ID on file (no new photos).

    try {
      const res = await fetch(`${API_BASE}/submit_amenity_reservation.php`, { method: 'POST', body: data, credentials: 'include' });
      const result = await res.json();
      if (result.success) {
        setSubmitted({ tracking_code: result.tracking_code || trackingCode });
      } else {
        showToast('Booking Not Sent', result.message || 'Unable to submit your booking.', 'error');
      }
    } catch {
      showToast('Connection Error', 'Unable to reach the server. Please try again.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedStrip = selected && (
    <div className="bk-selected">
      <div className="bk-card-icon"><i className={`bi ${selected.icon_class || 'bi-building'}`}></i></div>
      <div>
        <strong>{selected.facility_name}</strong>
        <span>
          {category}
          {isTimed ? ` · Open ${to12h(selected.open_time)} – ${to12h(selected.close_time)}` : ''}
          {!isTimed && selected.total_quantity != null ? ` · ${selected.total_quantity} unit(s) in stock` : ''}
        </span>
      </div>
    </div>
  );

  const lastStep = currentStep === STEPS.length - 1;

  return (
    <>
      <Preloader />
      <Header />
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css" />
      <Toast toast={toast} onClose={closeToast} />

      <div className="ep-page-wrapper">
        <div className="ep-form-card">
          <div className="ep-form-header">
            <h2>Amenity Booking</h2>
            <div className="ep-badge-official"><i className="bi bi-calendar2-check"></i> Barangay Facilities & Equipment</div>
            <p className="ep-service-desc">Reserve a barangay venue, borrow equipment, or request a service vehicle. Bookings are reviewed by barangay staff.</p>
          </div>

          <div className="ep-stepper-container">
            <div className="ep-stepper" aria-label="Progress">
              <div className="ep-progress-bg"></div>
              <div className="ep-progress-fill" style={{ width: `${(currentStep / (STEPS.length - 1)) * 90}%` }}></div>
              {STEPS.map((step, idx) => (
                <div key={step.label} className={`ep-step-item ${idx === currentStep ? 'active' : ''} ${idx < currentStep ? 'completed' : ''}`}>
                  <div className="ep-step-circle"><i className={`bi ${idx < currentStep ? 'bi-check-lg' : step.icon}`}></i></div>
                  <div className="ep-step-label">{step.label}</div>
                </div>
              ))}
            </div>
          </div>

          <form onSubmit={(e) => e.preventDefault()} noValidate>
            {/* STEP 1: AMENITY */}
            {currentStep === 0 && (
              <div className="slide-in">
                <h4 className="ep-section-title"><i className="bi bi-grid"></i> Choose What to Book</h4>
                <div className="bk-filter" role="tablist" aria-label="Filter by category">
                  {CATEGORIES.map(c => (
                    <button type="button" key={c} role="tab" aria-selected={filter === c} className={filter === c ? 'is-active' : ''} onClick={() => setFilter(c)}>
                      {{ All: 'All', Venue: 'Venues', Equipment: 'Equipment', Vehicle: 'Vehicles' }[c]}
                    </button>
                  ))}
                </div>

                {loadingAmenities ? (
                  <div className="bk-empty"><i className="bi bi-hourglass-split"></i>Loading amenities…</div>
                ) : visibleAmenities.length === 0 ? (
                  <div className="bk-empty"><i className="bi bi-inbox"></i>No amenities are available for booking right now.</div>
                ) : (
                  <div className={`bk-grid ${errClass('amenity')}`}>
                    {visibleAmenities.map(a => {
                      const active = selected?.facility_id === a.facility_id;
                      return (
                        <button type="button" key={a.facility_id} className={`bk-card ${active ? 'is-active' : ''}`} aria-pressed={active} onClick={() => selectAmenity(a)}>
                          {active && <i className="bi bi-check-circle-fill bk-card-check"></i>}
                          <span className={tagClass(a.category)}>
                            {a.booking_mode === 'hotline' ? <><i className="bi bi-telephone-fill"></i> Hotline</> : a.category}
                          </span>
                          <div className="bk-card-icon"><i className={`bi ${a.icon_class || 'bi-building'}`}></i></div>
                          <h4>{a.facility_name}</h4>
                          {a.description && <p>{a.description}</p>}
                          <span className="bk-card-meta">
                            {a.booking_mode === 'hotline'
                              ? 'Call to request'
                              : a.category === 'Equipment'
                                ? (a.total_quantity != null ? `${a.total_quantity} unit(s) in stock` : 'Borrow by quantity')
                                : `${to12h(a.open_time)} – ${to12h(a.close_time)}`}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {isHotline && (
                  <div className="bk-hotline slide-in" style={{ marginTop: 24 }}>
                    <i className="bi bi-telephone-inbound-fill"></i>
                    <h4>{selected.facility_name} — Emergency Hotline</h4>
                    <div className="bk-hotline-number">{selected.hotline_number || 'Call the Barangay Hall'}</div>
                    {selected.hotline_number && (
                      <a href={`tel:${selected.hotline_number.replace(/[^0-9+]/g, '')}`} className="bk-call-btn">
                        <i className="bi bi-telephone-fill"></i> Call Now
                      </a>
                    )}
                    <p>{selected.description || 'This vehicle is for emergencies and is dispatched through the barangay hotline, not booked online.'}</p>
                  </div>
                )}
              </div>
            )}

            {/* STEP 2: SCHEDULE */}
            {currentStep === 1 && selected && (
              <div className="slide-in">
                {selectedStrip}
                <h4 className="ep-section-title"><i className="bi bi-calendar-week"></i> {isTimed ? 'Date & Time' : 'Date & Quantity'}</h4>
                <div className="ep-grid">
                  <div className="ep-input-group ep-full">
                    <label htmlFor="bk-date">{category === 'Equipment' ? 'Date Needed *' : 'Reservation Date *'}</label>
                    <input id="bk-date" type="date" name="reservation_date" min={today} max={maxDate} value={form.reservation_date} onChange={handleChange} className={errClass('reservation_date')} />
                  </div>

                  {isTimed ? (
                    <>
                      <div className="ep-input-group">
                        <label htmlFor="bk-start">Start Time *</label>
                        <input id="bk-start" type="time" name="start_time" step="1800" min={selected.open_time} max={selected.close_time} value={form.start_time} onChange={handleChange} className={errClass('start_time')} />
                      </div>
                      <div className="ep-input-group">
                        <label htmlFor="bk-end">End Time *</label>
                        <input id="bk-end" type="time" name="end_time" step="1800" min={selected.open_time} max={selected.close_time} value={form.end_time} onChange={handleChange} className={errClass('end_time')} />
                      </div>
                      {form.reservation_date && (
                        <div className="ep-full">
                          {!avail ? (
                            <div className="bk-avail"><i className="bi bi-hourglass-split"></i> Checking availability…</div>
                          ) : overlapping.length ? (
                            <div className="bk-avail is-warn"><i className="bi bi-exclamation-triangle-fill"></i> Your chosen time overlaps a booking below. Please pick a free time.</div>
                          ) : null}
                          {avail && (
                            <div className={`bk-avail ${avail.taken?.length ? '' : 'is-ok'}`} style={{ marginTop: overlapping.length ? 8 : 0 }}>
                              <div className="bk-avail-title"><i className="bi bi-clock-history"></i> Already booked on {formatDate(form.reservation_date)}</div>
                              {avail.taken?.length ? (
                                <div className="bk-avail-list">
                                  {avail.taken.map((t, i) => (
                                    <span key={i} className={`bk-slot ${t.status === 'Approved' ? 'is-approved' : 'is-pending'}`}>
                                      {to12h(t.start_time)} – {to12h(t.end_time)} · {t.status === 'Approved' ? 'Reserved' : 'On hold'}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span>Nothing yet — the whole day ({to12h(selected.open_time)} – {to12h(selected.close_time)}) is free.</span>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                      {category === 'Vehicle' && (
                        <div className="ep-input-group ep-full">
                          <label htmlFor="bk-dest">Destination *</label>
                          <input id="bk-dest" type="text" name="destination" maxLength={255} placeholder="e.g. Imus Doctors Hospital, Imus, Cavite" value={form.destination} onChange={handleChange} className={errClass('destination')} />
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="ep-input-group">
                        <label htmlFor="bk-qty">Quantity Needed *</label>
                        <input id="bk-qty" type="number" name="quantity" min="1" max={avail?.remaining_quantity ?? 1000} value={form.quantity} onChange={handleChange} className={errClass('quantity')} />
                      </div>
                      <div className="ep-input-group">
                        <label>Available on That Date</label>
                        {!form.reservation_date ? (
                          <div className="bk-avail">Choose a date to see how many are left.</div>
                        ) : !avail ? (
                          <div className="bk-avail"><i className="bi bi-hourglass-split"></i> Checking…</div>
                        ) : avail.remaining_quantity == null ? (
                          <div className="bk-avail is-ok">Available — the barangay will confirm the quantity.</div>
                        ) : (
                          <div className={`bk-avail ${avail.remaining_quantity > 0 ? 'is-ok' : 'is-warn'}`}>
                            <div className="bk-stock"><strong>{avail.remaining_quantity}</strong> of {avail.total_quantity} unit(s) left</div>
                          </div>
                        )}
                      </div>
                    </>
                  )}

                  <div className="ep-input-group ep-full">
                    <label htmlFor="bk-purpose">Purpose *</label>
                    <textarea id="bk-purpose" name="purpose" rows="3" maxLength={1000}
                      placeholder={category === 'Vehicle' ? 'e.g. Hospital check-up transport for a senior citizen' : category === 'Equipment' ? 'e.g. Chairs for a birthday celebration' : 'e.g. Basketball league practice'}
                      value={form.purpose} onChange={handleChange} className={errClass('purpose')} />
                    <span className="bk-counter">{form.purpose.length}/1000</span>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 3: VERIFICATION */}
            {currentStep === 2 && (
              <div className="slide-in">
                {selectedStrip}
                <h4 className="ep-section-title"><i className="bi bi-person-lines-fill"></i> Contact Person</h4>
                <div className="ep-grid">
                  <div className="ep-input-group"><label>Name</label><input type="text" value={contactName} readOnly /></div>
                  <div className="ep-input-group"><label>Mobile Number</label><input type="text" value={profile?.contact_num || ''} readOnly /></div>
                </div>
                <p className="ep-hint"><i className="bi bi-info-circle"></i> Taken from your resident profile. Update it in Edit Profile if anything is wrong.</p>

                <h4 className="ep-section-title" style={{ marginTop: 28 }}><i className="bi bi-shield-lock"></i> Identity Verification</h4>
                <IdOnFileCard idOnFile={idOnFile} showToast={showToast} />
              </div>
            )}

            {/* STEP 4: REVIEW */}
            {currentStep === 3 && (
              <div className="slide-in">
                <div className="ep-review-box" aria-live="polite">
                  <div className="ep-review-category">
                    <h4>Booking</h4>
                    <div className="ep-review-row"><span className="ep-review-label">Tracking Code</span><span className="ep-review-val highlight">{trackingCode}</span></div>
                    <div className="ep-review-row"><span className="ep-review-label">Amenity</span><span className="ep-review-val">{selected.facility_name} ({category})</span></div>
                    <div className="ep-review-row"><span className="ep-review-label">Date</span><span className="ep-review-val">{formatDate(form.reservation_date)}</span></div>
                    {isTimed
                      ? <div className="ep-review-row"><span className="ep-review-label">Time</span><span className="ep-review-val">{to12h(form.start_time)} – {to12h(form.end_time)}</span></div>
                      : <div className="ep-review-row"><span className="ep-review-label">Quantity</span><span className="ep-review-val">{form.quantity} unit(s)</span></div>}
                    {category === 'Vehicle' && <div className="ep-review-row"><span className="ep-review-label">Destination</span><span className="ep-review-val">{form.destination}</span></div>}
                    <div className="ep-review-row"><span className="ep-review-label">Purpose</span><span className="ep-review-val">{form.purpose}</span></div>
                  </div>
                  <div className="ep-review-category">
                    <h4>Contact Person</h4>
                    <div className="ep-review-row"><span className="ep-review-label">Name</span><span className="ep-review-val">{contactName.toUpperCase() || '—'}</span></div>
                    <div className="ep-review-row"><span className="ep-review-label">Mobile Number</span><span className="ep-review-val">{profile?.contact_num || '—'}</span></div>
                  </div>
                  <div className="ep-review-category">
                    <h4>Verification</h4>
                    <div className="ep-review-row"><span className="ep-review-label">Valid ID</span><span className="ep-review-val">On file — {idOnFile?.type || 'Registration ID'}</span></div>
                  </div>
                  <p className="ep-hint"><i className="bi bi-envelope"></i> Barangay staff will review your booking. You'll get an email when it's approved or declined, and you can follow it in Track Request.</p>
                </div>
              </div>
            )}

            <div className="ep-actions">
              <button type="button" className="ep-btn ep-btn-prev" disabled={currentStep === 0 || isSubmitting}
                onClick={() => { setErrors([]); setCurrentStep(s => s - 1); }}>
                <i className="bi bi-arrow-left"></i> Back
              </button>
              {currentStep === 0 && isHotline ? (
                <a className="ep-btn ep-btn-next" href={selected.hotline_number ? `tel:${selected.hotline_number.replace(/[^0-9+]/g, '')}` : undefined} style={{ textDecoration: 'none', background: '#dc2626' }}>
                  <i className="bi bi-telephone-fill"></i> Call Hotline
                </a>
              ) : (
                <button type="button" className="ep-btn ep-btn-next" disabled={isSubmitting}
                  onClick={() => (lastStep ? handleSubmit() : handleNext())}>
                  {lastStep ? (isSubmitting ? 'Submitting...' : 'Confirm & Submit') : 'Continue'}
                  <i className={lastStep ? (isSubmitting ? 'bi bi-hourglass-split' : 'bi bi-send-fill') : 'bi bi-arrow-right'}></i>
                </button>
              )}
            </div>
          </form>
        </div>
      </div>

      {submitted && createPortal(
        <div className="ep-success-overlay">
          <div className="ep-success-card" role="dialog" aria-modal="true" aria-labelledby="bk-success-title">
            <div className="ep-success-icon"><i className="bi bi-check-lg"></i></div>
            <h2 id="bk-success-title">Booking Submitted</h2>
            <p>Your booking for <strong>{selected.facility_name}</strong> on {formatDate(form.reservation_date)} is waiting for approval. A confirmation was sent to your email.</p>
            <div className="ep-success-code"><small>Tracking Code</small><strong>{submitted.tracking_code}</strong></div>
            <div className="ep-success-actions">
              <button type="button" className="ep-btn ep-btn-prev" onClick={() => navigate('/services')}>Services</button>
              <button type="button" className="ep-btn ep-btn-next" onClick={() => navigate('/track-request')}><i className="bi bi-search"></i> Track Request</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      <Footer />
    </>
  );
};

export default BookingPage;
