import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Header from '../components/Header';
import Footer from '../components/Footer';
import Preloader from '../components/Preloader';
import Toast from '../components/Toast';
import { useToast } from '../lib/useToast';
import '../styles/form-theme.css';
import '../styles/incident-report.css';

const API_BASE = '/api_backend';

// Keep in sync with $INCIDENT_CLASSES / $REPORTING_CLASSES in backend/api/report_incident.php
const INCIDENT_CLASSES = ['Health & Safety', 'Security', 'Environmental & Infrastructure', 'Others'];
const REPORTING_CLASSES = ['Accident Report', 'Near Miss Report', 'Hazard Report', 'Complaint Report', 'Suspicious Activity Report', 'Others'];

const MAX_FILES = 10;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'video/mp4'];

const buildFullName = (r) => [r.fName, r.mName, r.lName, r.suffix].filter(Boolean).join(' ');
// Same format as report_incident.php: "3" -> "Zone 3", "PUROK 3" stays as typed.
const formatZone = (z) => (z ? (/^\d+$/.test(String(z)) ? `Zone ${z}` : z) : '');
const buildAddress = (r) => [r.house_no, r.block_lot, r.street, r.subdivision, formatZone(r.zone)].filter(Boolean).join(', ');

// Display only — the server assigns the final code if this one is taken.
const makeTrackingCode = () => `INC-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

const EMPTY_FORM = {
  contact_person_name: '',
  contact_person_number: '',
  incident_address: '',
  description: '',
  incident_class: '',
  reporting_class: '',
};

const IncidentReport = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast, showToast, closeToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [trackingCode] = useState(makeTrackingCode);
  const [reporter, setReporter] = useState({ fullname: '', address: '', contact_num: '', email: '' });
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [attachments, setAttachments] = useState([]); // [{ file, url }]
  const [fieldErrors, setFieldErrors] = useState([]);
  const [preview, setPreview] = useState(null);       // one of attachments
  const [submitted, setSubmitted] = useState(null);   // { track_code, created_at }

  // Reporter details come from the signed-in resident's own record (session),
  // the same record the server uses when it saves the report.
  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/get_profile.php`, { credentials: 'include' });
        const data = await res.json();
        if (cancelled) return;
        if (data.success && data.user) {
          const r = data.user;
          const address = buildAddress(r);
          setReporter({ fullname: buildFullName(r), address, contact_num: r.contact_num || '', email: r.email || '' });
          setFormData(prev => ({ ...prev, incident_address: prev.incident_address || address }));
        } else {
          showToast('Session Expired', 'Please log in again to file a report.', 'warning');
        }
      } catch {
        if (!cancelled) showToast('Connection Error', 'Unable to load your profile. Please refresh the page.', 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per signed-in user
  }, [user]);

  // Release preview object URLs when the page unmounts.
  useEffect(() => () => attachments.forEach(a => URL.revokeObjectURL(a.url)),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cleanup on unmount only
    []);

  const setField = (name, value) => {
    setFormData(prev => ({ ...prev, [name]: value }));
    setFieldErrors(prev => prev.filter(n => n !== name));
  };

  const errClass = (name) => (fieldErrors.includes(name) ? 'pf-error' : '');

  const handleFiles = (fileList) => {
    const incoming = Array.from(fileList || []);
    if (!incoming.length) return;

    const bad = incoming.find(f => !ACCEPTED_TYPES.includes(f.type));
    if (bad) return showToast('Unsupported File', `"${bad.name}" is not a JPG, PNG, or MP4 file.`, 'error');
    const big = incoming.find(f => f.size > MAX_FILE_BYTES);
    if (big) return showToast('File Too Large', `"${big.name}" exceeds the 10MB limit.`, 'error');

    const isDup = (f) => attachments.some(a => a.file.name === f.name && a.file.size === f.size && a.file.lastModified === f.lastModified);
    const fresh = incoming.filter(f => !isDup(f));
    if (attachments.length + fresh.length > MAX_FILES) {
      return showToast('Too Many Files', `You can attach up to ${MAX_FILES} files.`, 'error');
    }
    setAttachments(prev => [...prev, ...fresh.map(file => ({ file, url: URL.createObjectURL(file) }))]);
    setFieldErrors(prev => prev.filter(n => n !== 'attachment'));
  };

  const removeAttachment = (index) => {
    setAttachments(prev => {
      URL.revokeObjectURL(prev[index].url);
      return prev.filter((_, i) => i !== index);
    });
  };

  const validate = () => {
    const errs = [];
    if (!formData.incident_class) errs.push('incident_class');
    if (!formData.reporting_class) errs.push('reporting_class');
    if (!formData.incident_address.trim()) errs.push('incident_address');
    if (!formData.description.trim()) errs.push('description');
    if (formData.contact_person_number && !/^09\d{9}$/.test(formData.contact_person_number)) errs.push('contact_person_number');
    if (attachments.length === 0) errs.push('attachment');
    return errs;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user) {
      showToast('Login Required', 'Please log in to your resident account to submit a report.', 'warning');
      return;
    }

    const errs = validate();
    if (errs.length) {
      setFieldErrors(errs);
      const onlyNumber = errs.length === 1 && errs[0] === 'contact_person_number';
      const onlyFiles = errs.length === 1 && errs[0] === 'attachment';
      showToast(
        'Incomplete Report',
        onlyNumber ? "The involved person's number must be 11 digits starting with 09, or left blank."
          : onlyFiles ? 'Please attach at least one photo or video as evidence.'
          : 'Please complete the fields highlighted in red.',
        'error'
      );
      document.querySelector(`[data-field="${errs[0]}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    setSubmitting(true);
    try {
      const body = new FormData();
      Object.entries(formData).forEach(([k, v]) => body.append(k, v.trim ? v.trim() : v));
      body.append('track_code', trackingCode);
      attachments.forEach(a => body.append('attachment[]', a.file));

      const res = await fetch(`${API_BASE}/report_incident.php`, { method: 'POST', body, credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setSubmitted({ track_code: data.track_code || trackingCode, created_at: data.created_at });
      } else {
        showToast('Report Not Sent', data.message || 'Unable to submit your report.', 'error');
      }
    } catch {
      showToast('Connection Error', 'Could not reach the server. Please try again.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const isVideo = (a) => a.file.type.startsWith('video/');

  return (
    <>
      <Preloader />
      <Header />
      <Toast toast={toast} onClose={closeToast} />

      <div className="pf-form incident-page">
        <div className="pf-card">
          <div className="pf-header">
            <h1>Incident Report</h1>
            <span className="pf-badge"><i className="bi bi-shield-exclamation"></i> Barangay Public Safety Desk</span>
            <p>Help us keep Barangay Pasong Buaya II safe. Reports are reviewed by barangay officials.</p>
          </div>

          <div className="pf-body">
            <div className="ir-emergency">
              <div className="ir-emergency-icon"><i className="bi bi-telephone-inbound-fill"></i></div>
              <div>
                <strong>In an emergency, call the Response Team first</strong>
                <div className="ir-emergency-lines">
                  <a href="tel:09171571889"><i className="bi bi-phone"></i> 0917 157 1889</a>
                  <a href="tel:0465024058"><i className="bi bi-telephone"></i> (046) 502 4058</a>
                </div>
              </div>
            </div>

            {!user && (
              <div className="pf-note pf-note--warn ir-login-note">
                <i className="bi bi-lock-fill"></i>
                <div>
                  You're viewing this form without signing in. <Link to="/login">Log in</Link> to your resident account to submit a report.
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} noValidate>
              <div className="section-header">
                <div className="badge">1</div>
                <div className="title">Reporter Information</div>
                <span className="ir-section-note"><i className="bi bi-lock"></i> From your resident profile</span>
              </div>
              <div className="input-grid">
                <div className="form-group span-2">
                  <label>Full Name</label>
                  <input type="text" value={loading ? 'Loading...' : reporter.fullname} readOnly placeholder="Log in to view" />
                </div>
                <div className="form-group">
                  <label>Contact Number</label>
                  <input type="text" value={reporter.contact_num} readOnly placeholder="—" />
                </div>
                <div className="form-group span-2">
                  <label>Home Address</label>
                  <input type="text" value={reporter.address} readOnly placeholder="—" />
                </div>
                <div className="form-group">
                  <label>Email Address</label>
                  <input type="email" value={reporter.email} readOnly placeholder="—" />
                </div>
              </div>

              <div className="section-header">
                <div className="badge">2</div>
                <div className="title">Incident Details</div>
                <span className="ir-code-chip" title="Your tracking code (final code is confirmed after submission)"><i className="bi bi-upc-scan"></i> {trackingCode}</span>
              </div>
              <div className="input-grid">
                <div className="form-group" data-field="incident_class">
                  <label>Classification *</label>
                  <select className={errClass('incident_class')} value={formData.incident_class} onChange={(e) => setField('incident_class', e.target.value)}>
                    <option value="">-- Select Category --</option>
                    {INCIDENT_CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="form-group" data-field="reporting_class">
                  <label>Reporting Type *</label>
                  <select className={errClass('reporting_class')} value={formData.reporting_class} onChange={(e) => setField('reporting_class', e.target.value)}>
                    <option value="">-- Select Type --</option>
                    {REPORTING_CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="form-group" />

                <div className="form-group span-3" data-field="incident_address">
                  <label>Incident Location / Landmark *</label>
                  <input
                    type="text" maxLength="255" className={errClass('incident_address')}
                    value={formData.incident_address}
                    placeholder="Where did it happen? e.g. Blk 5 Lot 2, Main St., near the covered court"
                    onChange={(e) => setField('incident_address', e.target.value)}
                  />
                  <span className="pf-field-hint">Pre-filled with your home address — change it if the incident happened elsewhere.</span>
                </div>

                <div className="form-group span-2">
                  <label>Person Involved (Optional)</label>
                  <input
                    type="text" maxLength="100"
                    value={formData.contact_person_name}
                    placeholder="Name of the person involved, if known"
                    onChange={(e) => setField('contact_person_name', e.target.value.replace(/[^\p{L}\s.'-]/gu, ''))}
                  />
                </div>
                <div className="form-group" data-field="contact_person_number">
                  <label>Their Contact No. (Optional)</label>
                  <input
                    type="text" inputMode="numeric" maxLength="11" className={errClass('contact_person_number')}
                    value={formData.contact_person_number}
                    placeholder="09XXXXXXXXX"
                    onChange={(e) => setField('contact_person_number', e.target.value.replace(/\D/g, '').slice(0, 11))}
                  />
                </div>

                <div className="form-group span-3" data-field="description">
                  <label>Detailed Description *</label>
                  <textarea
                    className={errClass('description')} maxLength="5000"
                    value={formData.description}
                    placeholder="Describe what happened, when it happened, and anyone or anything involved..."
                    onChange={(e) => setField('description', e.target.value)}
                  />
                  <span className="pf-field-hint">{formData.description.length}/5000 characters</span>
                </div>
              </div>

              <div className="section-header">
                <div className="badge">3</div>
                <div className="title">Evidence</div>
                <span className="ir-section-note">{attachments.length}/{MAX_FILES} files</span>
              </div>

              <label
                className={`ir-dropzone ${fieldErrors.includes('attachment') ? 'pf-error' : ''} ${attachments.length ? 'has-files' : ''}`}
                data-field="attachment"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
              >
                <input type="file" multiple accept="image/jpeg,image/png,video/mp4" hidden
                  onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }} />
                <i className="bi bi-cloud-arrow-up"></i>
                <strong>Drag & drop photos or videos, or <span>browse</span></strong>
                <small>JPG, PNG, or MP4 · up to {MAX_FILES} files · 10MB each · at least 1 required</small>
              </label>

              {attachments.length > 0 && (
                <div className="ir-attachments">
                  {attachments.map((a, i) => (
                    <div key={a.url} className="ir-attachment">
                      <button type="button" className="ir-attachment-thumb" onClick={() => setPreview(a)} title="Preview">
                        {isVideo(a) ? <><video src={a.url} muted /><i className="bi bi-play-circle-fill"></i></> : <img src={a.url} alt={a.file.name} />}
                      </button>
                      <div className="ir-attachment-meta">
                        <span title={a.file.name}>{a.file.name}</span>
                        <small>{(a.file.size / (1024 * 1024)).toFixed(2)} MB</small>
                      </div>
                      <button type="button" className="ir-attachment-remove" onClick={() => removeAttachment(i)} aria-label={`Remove ${a.file.name}`}>
                        <i className="bi bi-x-lg"></i>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="pf-actions">
                <span className="ir-privacy"><i className="bi bi-shield-lock"></i> Your report is shared only with authorized barangay personnel.</span>
                <button type="submit" className="pf-btn-primary" disabled={submitting || !user}>
                  {submitting ? <><span className="ir-spinner" /> Sending Report...</> : <><i className="bi bi-send-fill"></i> Submit Report</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      {preview && createPortal(
        <div className="ir-modal-overlay" onClick={() => setPreview(null)}>
          <div className="ir-preview" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="ir-modal-close" onClick={() => setPreview(null)} aria-label="Close preview"><i className="bi bi-x-lg"></i></button>
            {isVideo(preview) ? <video controls autoPlay src={preview.url} /> : <img src={preview.url} alt="Attachment preview" />}
          </div>
        </div>,
        document.body
      )}

      {submitted && createPortal(
        <div className="ir-modal-overlay">
          <div className="ir-success" role="dialog" aria-modal="true" aria-labelledby="ir-success-title">
            <div className="ir-success-icon"><i className="bi bi-check-lg"></i></div>
            <h2 id="ir-success-title">Report Submitted</h2>
            <p>Your incident report has been recorded and sent to barangay officials for review. A confirmation was sent to your email.</p>
            <div className="ir-success-code">
              <small>Tracking Code</small>
              <strong>{submitted.track_code}</strong>
            </div>
            {submitted.created_at && (
              <p className="ir-success-date">Submitted on {new Date(submitted.created_at.replace(' ', 'T')).toLocaleString()}</p>
            )}
            <button type="button" className="ir-success-btn" onClick={() => navigate('/track-request')}>
              <i className="bi bi-search"></i> Track My Reports
            </button>
          </div>
        </div>,
        document.body
      )}

      <Footer />
    </>
  );
};

export default IncidentReport;
