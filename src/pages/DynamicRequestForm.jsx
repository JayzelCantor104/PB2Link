import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Header from '../components/Header';
import Footer from '../components/Footer';
import Preloader from '../components/Preloader';
import Toast from '../components/Toast';
import { useToast } from '../lib/useToast';
import PaymentSection from '../components/PaymentSection';
import IdOnFileCard from '../components/IdOnFileCard';
import { verificationBlocker } from '../lib/residency';
import { appendPayment, emptyPayment, fetchPaymentInfo, paymentProblem } from '../lib/payment';
import { reportInvalid } from '../lib/formErrors';
import '../styles/barangayDocuments.css';

const API_BASE = '/api_backend';

// Renders an admin-defined service (Services & Form Builder, backend/api/services.php)
// and submits it to backend/api/submit_service_request.php.

const STEPS = [
  { key: 'Identity', label: 'Identity', icon: 'bi-person-badge' },
  { key: 'Residency', label: 'Details', icon: 'bi-file-text' },
  { key: 'Uploads', label: 'Uploads', icon: 'bi-cloud-arrow-up-fill' },
  { key: 'Review', label: 'Review', icon: 'bi-clipboard2-check-fill' }
];
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const FILE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

const parseOptions = (raw) => {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return String(raw).split(',').map(s => s.trim()).filter(Boolean);
  }
};

const formatZone = (z) => (z ? (/^\d+$/.test(String(z)) ? `Zone ${z}` : z) : '');

const DynamicRequestForm = () => {
  const { serviceId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // "Send again" from Track Request: the earlier request, to fill the form in.
  const resubmitFrom = location.state?.resubmitFrom || null;
  const { toast, showToast, closeToast } = useToast();

  const [service, setService] = useState(null);
  const [fields, setFields] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentStep, setCurrentStep] = useState(0);
  const [requestMode, setRequestMode] = useState('Self');
  const [trackingCode] = useState(() => {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    return `REQ-${date}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState([]);
  const [submitted, setSubmitted] = useState(null); // { tracking_code }

  const [profile, setProfile] = useState(null);
  // The ID from registration, used for "Myself" requests instead of a new upload.
  const [idOnFile, setIdOnFile] = useState(null);
  const [residency, setResidency] = useState(null);
  const [prefilled, setPrefilled] = useState(false);
  const [other, setOther] = useState({
    fName: '', mName: '', lName: '', suffix: '', birth_date: '', gender: '', civil_status: '', contact_num: '', address: ''
  });
  const [answers, setAnswers] = useState({});   // field_name -> string | string[]
  const [files, setFiles] = useState({});       // 'owner_id' | 'dyn_<field_name>' -> File

  // ---- Load service + fields ---------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const sRes = await fetch(`${API_BASE}/services.php?action=get_all`);
        const sData = await sRes.json();
        const found = sData.success ? sData.services.find(s => String(s.service_id) === String(serviceId)) : null;
        if (cancelled) return;
        if (!found) {
          setService(null);
          return;
        }
        setService(found);
        const fRes = await fetch(`${API_BASE}/services.php?action=get_fields&service_id=${found.service_id}`);
        const fData = await fRes.json();
        if (!cancelled && fData.success) setFields(fData.fields || []);
      } catch {
        if (!cancelled) showToast('Connection Error', 'Unable to load this service. Please try again.', 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [serviceId, showToast]);

  // ---- Applicant profile (for "Myself") ----------------------------------------
  useEffect(() => {
    if (!user?.user_id) return;
    fetch(`${API_BASE}/get_user_profile.php`, { credentials: 'include' })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setProfile(data.data);
          setIdOnFile(data.id_on_file || null);
          setResidency(data.residency || null);
        }
      })
      .catch(() => {});
  }, [user]);

  // Fill the form in from the earlier request (answers are matched by question;
  // files have to be attached again).
  useEffect(() => {
    if (!resubmitFrom || prefilled || !fields.length) return;
    let earlier = [];
    try { earlier = JSON.parse(resubmitFrom.form_data || '[]') || []; } catch { earlier = []; }
    const next = {};
    fields.forEach((f) => {
      const old = earlier.find((a) => a.name === f.field_name);
      if (!old || f.field_type === 'file' || old.value === '' || old.value == null) return;
      if (f.field_type === 'checkbox') {
        const opts = parseOptions(f.field_options);
        const picked = String(old.value).split(', ').filter((v) => !opts.length || opts.includes(v));
        if (picked.length) next[f.field_name] = picked;
      } else {
        next[f.field_name] = String(old.value);
      }
    });
    setAnswers(next);
    if (resubmitFrom.request_mode === 'Others') {
      setRequestMode('Others');
      setOther({
        fName: resubmitFrom.fName || '', mName: resubmitFrom.mName || '', lName: resubmitFrom.lName || '',
        suffix: resubmitFrom.suffix || '', birth_date: resubmitFrom.birth_date || '', gender: resubmitFrom.gender || '',
        civil_status: resubmitFrom.civil_status || '', contact_num: resubmitFrom.contact_num || '', address: resubmitFrom.address || '',
      });
    }
    setPrefilled(true);
  }, [resubmitFrom, prefilled, fields]);

  const allowThirdParty = service?.allow_third_party === 1;
  const mode = allowThirdParty ? requestMode : 'Self';
  // Fee for this request (src/lib/payment.js, migration 020). Exemptions depend
  // on who the request is for, so it reloads when that changes.
  const [paymentInfo, setPaymentInfo] = useState(null);
  const [payment, setPayment] = useState(emptyPayment);
  useEffect(() => {
    if (!user?.user_id || !service?.service_id) return undefined;
    let cancelled = false;
    fetchPaymentInfo('service', mode, service.service_id)
      .then((info) => { if (!cancelled) { setPaymentInfo(info); setPayment(emptyPayment()); } })
      .catch(() => { if (!cancelled) setPaymentInfo(null); });
    return () => { cancelled = true; };
  }, [user, mode, service?.service_id]);

  // Admin form builder saves 'all' | 'myself_only' | 'someone_else_only'
  // (older rows may use 'myself' / 'third_party').
  const isVisible = (f) => {
    const t = f.show_for_target || 'all';
    if (t === 'all') return true;
    if (t === 'myself_only' || t === 'myself') return mode === 'Self';
    if (t === 'someone_else_only' || t === 'third_party') return mode === 'Others';
    return true;
  };
  const fieldsFor = (stepKey) => fields.filter(f => f.step_section === stepKey && isVisible(f));

  const selfAddress = profile
    ? [profile.house_no, profile.block_lot, profile.street, profile.subdivision, formatZone(profile.zone)].filter(Boolean).join(', ')
    : '';
  const applicantName = mode === 'Self'
    ? [profile?.fName, profile?.mName, profile?.lName, profile?.suffix].filter(Boolean).join(' ')
    : [other.fName, other.mName, other.lName, other.suffix].filter(Boolean).join(' ');

  // ---- Change handlers -------------------------------------------------------------
  const clearError = (key) => setErrors(prev => prev.filter(e => e !== key));
  const errClass = (key) => (errors.includes(key) ? 'error-ring' : '');

  const setOtherField = (e) => {
    const { name, value } = e.target;
    setOther(prev => ({ ...prev, [name]: name === 'contact_num' ? value.replace(/\D/g, '').slice(0, 11) : value }));
    clearError(`other_${name}`);
  };

  const setAnswer = (name, value) => {
    setAnswers(prev => ({ ...prev, [name]: value }));
    clearError(name);
  };

  const toggleCheckbox = (name, option) => {
    setAnswers(prev => {
      const current = Array.isArray(prev[name]) ? prev[name] : [];
      return { ...prev, [name]: current.includes(option) ? current.filter(o => o !== option) : [...current, option] };
    });
    clearError(name);
  };

  const setFile = (key, file) => {
    if (!file) return;
    if (!FILE_TYPES.includes(file.type)) {
      showToast('Unsupported File', 'Please upload a JPEG, PNG, WebP image, or a PDF.', 'error');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      showToast('File Too Large', 'Each file must be 10MB or smaller.', 'error');
      return;
    }
    setFiles(prev => ({ ...prev, [key]: file }));
    clearError(key);
  };

  // ---- Validation ----------------------------------------------------------------
  const isEmpty = (f) => {
    if (f.field_type === 'file') return !files[`dyn_${f.field_name}`];
    const v = answers[f.field_name];
    return Array.isArray(v) ? v.length === 0 : !v || String(v).trim() === '';
  };

  const missingFor = (stepKey) => {
    const missing = [];
    if (stepKey === 'Identity' && mode === 'Others') {
      ['fName', 'lName', 'birth_date', 'gender', 'civil_status', 'address'].forEach(k => {
        if (!String(other[k]).trim()) missing.push(`other_${k}`);
      });
      if (other.contact_num && !/^09\d{9}$/.test(other.contact_num)) missing.push('other_contact_num');
      if (other.birth_date && new Date(other.birth_date) > new Date()) missing.push('other_birth_date');
    }
    if (stepKey === 'Uploads' && mode === 'Others' && !files.owner_id) missing.push('owner_id');
    fieldsFor(stepKey).forEach(f => {
      if (Number(f.is_required) === 1 && isEmpty(f)) missing.push(f.field_type === 'file' ? `dyn_${f.field_name}` : f.field_name);
    });
    return missing;
  };

  // "Myself" uses the ID from registration; without one the request can't go through.
  const idBlocker = mode === 'Self' ? verificationBlocker({ idOnFile, residency, requireResidency: false }) : null;

  const handleNextStep = () => {
    if (STEPS[currentStep].key === 'Uploads' && idBlocker) {
      showToast('Valid ID Needed', idBlocker, 'error');
      return;
    }
    const missing = missingFor(STEPS[currentStep].key);
    if (missing.length) {
      setErrors(missing);
      reportInvalid(showToast, 'Incomplete Fields');
      return;
    }
    setErrors([]);
    setCurrentStep(s => s + 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // ---- Submit -------------------------------------------------------------------------
  const handleSubmit = async () => {
    if (idBlocker) { showToast('Valid ID Needed', idBlocker, 'error'); return; }
    const payProblem = paymentProblem(paymentInfo, payment);
    if (payProblem) { showToast('Payment Needed', payProblem, 'error'); return; }
    // Re-check every step (the Review step can hold required fields too).
    for (let i = 0; i < STEPS.length; i++) {
      const missing = missingFor(STEPS[i].key);
      if (missing.length) {
        setErrors(missing);
        setCurrentStep(i);
        reportInvalid(showToast, 'Incomplete Fields');
        return;
      }
    }

    setIsSubmitting(true);
    const data = new FormData();
    appendPayment(data, paymentInfo, payment);
    data.append('service_id', service.service_id);
    data.append('tracking_code', trackingCode);
    data.append('request_mode', mode);
    if (mode === 'Others') {
      Object.entries(other).forEach(([k, v]) => data.append(k, v));
    }
    const nonFileAnswers = {};
    fields.filter(f => f.field_type !== 'file' && isVisible(f)).forEach(f => {
      if (answers[f.field_name] !== undefined) nonFileAnswers[f.field_name] = answers[f.field_name];
    });
    data.append('dynamic_fields', JSON.stringify(nonFileAnswers));
    Object.entries(files).forEach(([key, file]) => {
      if (key === 'owner_id') { if (mode === 'Others') data.append(key, file); }
      else if (fields.some(f => `dyn_${f.field_name}` === key && isVisible(f))) data.append(key, file);
    });

    try {
      const response = await fetch(`${API_BASE}/submit_service_request.php`, { method: 'POST', body: data, credentials: 'include' });
      const result = await response.json();
      if (result.success) {
        setSubmitted({ tracking_code: result.tracking_code || trackingCode });
      } else {
        showToast('Request Not Sent', result.message || 'Failed to submit your request.', 'error');
      }
    } catch {
      showToast('Connection Error', 'Could not reach the server. Please try again.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ---- Field rendering ------------------------------------------------------------------
  const renderDynamicField = (field) => {
    const name = field.field_name;
    const required = Number(field.is_required) === 1;
    const options = parseOptions(field.field_options);
    const value = answers[name] ?? (field.field_type === 'checkbox' ? [] : '');
    const wide = ['textarea', 'checkbox', 'radio', 'file'].includes(field.field_type);

    let control;
    switch (field.field_type) {
      case 'textarea':
        control = <textarea id={name} rows="3" value={value} onChange={(e) => setAnswer(name, e.target.value)} className={errClass(name)} aria-invalid={errors.includes(name) || undefined} />;
        break;
      case 'select':
        control = (
          <select id={name} value={value} onChange={(e) => setAnswer(name, e.target.value)} className={errClass(name)} aria-invalid={errors.includes(name) || undefined}>
            <option value="">Select an option</option>
            {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
          </select>
        );
        break;
      case 'radio':
        control = (
          <div className={`ep-choice-group ${errClass(name)}`} role="radiogroup" aria-labelledby={`${name}-label`}>
            {options.map(opt => (
              <label key={opt} className={`ep-choice ${value === opt ? 'is-checked' : ''}`}>
                <input type="radio" name={name} value={opt} checked={value === opt} onChange={() => setAnswer(name, opt)} />
                <span>{opt}</span>
              </label>
            ))}
          </div>
        );
        break;
      case 'checkbox':
        control = options.length ? (
          <div className={`ep-choice-group ${errClass(name)}`}>
            {options.map(opt => (
              <label key={opt} className={`ep-choice ${value.includes(opt) ? 'is-checked' : ''}`}>
                <input type="checkbox" checked={value.includes(opt)} onChange={() => toggleCheckbox(name, opt)} />
                <span>{opt}</span>
              </label>
            ))}
          </div>
        ) : (
          <label className={`ep-choice ${value.length ? 'is-checked' : ''} ${errClass(name)}`}>
            <input type="checkbox" checked={value.length > 0} onChange={(e) => setAnswer(name, e.target.checked ? ['Yes'] : [])} />
            <span>Yes</span>
          </label>
        );
        break;
      case 'file': {
        const key = `dyn_${name}`;
        const file = files[key];
        control = (
          <label className={`ep-file-upload-box ${file ? 'has-file' : ''} ${errClass(key)}`}>
            <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" style={{ display: 'none' }}
              onChange={(e) => { setFile(key, e.target.files?.[0]); e.target.value = ''; }} />
            <div className="ep-upload-content">
              <i className={`bi ${file ? 'bi-check-circle-fill' : 'bi-cloud-arrow-up'} ep-upload-icon`}></i>
              <h4>{file ? file.name : 'Choose a file'}</h4>
              <p>{file ? 'Click to change' : 'JPEG, PNG, WebP, or PDF · max 10MB'}</p>
            </div>
          </label>
        );
        break;
      }
      default: {
        const type = ['number', 'date', 'time'].includes(field.field_type) ? field.field_type : 'text';
        control = <input type={type} id={name} value={value} onChange={(e) => setAnswer(name, e.target.value)} className={errClass(name)} aria-invalid={errors.includes(name) || undefined} />;
      }
    }

    return (
      <div className={`ep-input-group ${wide ? 'ep-full' : ''}`} key={field.field_id}>
        <label id={`${name}-label`} htmlFor={name}>{field.field_label} {required && '*'}</label>
        {control}
        {field.help_text && <small className="ep-field-hint">{field.help_text}</small>}
      </div>
    );
  };

  const renderStepFields = (stepKey, title = 'Additional Details') => {
    const list = fieldsFor(stepKey);
    if (!list.length) return null;
    return (
      <div className="mt-4">
        <h2 className="ep-section-title"><i className="bi bi-list-check"></i> {title}</h2>
        <div className="ep-grid">{list.map(renderDynamicField)}</div>
      </div>
    );
  };

  const reviewValue = (f) => {
    if (f.field_type === 'file') return files[`dyn_${f.field_name}`]?.name || '—';
    const v = answers[f.field_name];
    return (Array.isArray(v) ? v.join(', ') : v) || '—';
  };

  // ---- Page states --------------------------------------------------------------------------
  if (loading) return <Preloader />;

  if (!service || service.is_active !== 1) {
    return (
      <>
        <Header />
        <div className="ep-page-wrapper">
          <div className="ep-form-card" style={{ textAlign: 'center' }}>
            <div className="ep-form-header">
              <h1>{service ? 'Service Unavailable' : 'Service Not Found'}</h1>
              <p style={{ color: '#64748b' }}>
                {service ? 'This service is not accepting requests right now.' : 'The service you are looking for does not exist.'}
              </p>
            </div>
            <button className="ep-btn ep-btn-next" style={{ margin: '0 auto' }} onClick={() => navigate('/services')}>
              <i className="bi bi-arrow-left"></i> Back to Services
            </button>
          </div>
        </div>
        <Footer />
      </>
    );
  }

  const stepKey = STEPS[currentStep].key;
  const reviewFields = fields.filter(f => f.step_section !== 'Review' && isVisible(f));

  return (
    <>
      <Header />
      <Toast toast={toast} onClose={closeToast} />

      <div className="ep-page-wrapper">
        <div className="ep-form-card">
          <div className="ep-form-header">
            <h1>{service.title}</h1>
            <div className="ep-badge-official"><i className="bi bi-shield-check"></i> Barangay Official Portal</div>
            {service.description && <p className="ep-service-desc">{service.description}</p>}
          </div>

          {prefilled && (
            <p className="ep-hint ep-prefill-note">
              <i className="bi bi-arrow-repeat"></i> Filled in from your earlier request {resubmitFrom?.tracking_code}. Check the answers and attach the files again before sending.
            </p>
          )}

          <div className="ep-stepper-container">
            <div className="ep-stepper" aria-label="Progress">
              <div className="ep-progress-bg"></div>
              <div className="ep-progress-fill" style={{ width: `${(currentStep / (STEPS.length - 1)) * 90}%` }}></div>
              {STEPS.map((step, idx) => (
                <div key={step.key} className={`ep-step-item ${idx === currentStep ? 'active' : ''} ${idx < currentStep ? 'completed' : ''}`}>
                  <div className="ep-step-circle"><i className={`bi ${idx < currentStep ? 'bi-check-lg' : step.icon}`}></i></div>
                  <div className="ep-step-label">{step.label}</div>
                </div>
              ))}
            </div>
          </div>

          <form onSubmit={(e) => e.preventDefault()} noValidate>
            {/* STEP 1: IDENTITY */}
            {stepKey === 'Identity' && (
              <div className="slide-in">
                {allowThirdParty && (
                  <div className="ep-toggle-wrapper">
                    <span className="ep-toggle-label" id="mode-label">Who is this request for?</span>
                    <div className="ep-toggle-container" role="group" aria-labelledby="mode-label">
                      <button type="button" aria-pressed={mode === 'Self'} className={`ep-toggle-option ${mode === 'Self' ? 'active' : ''}`}
                        onClick={() => { setRequestMode('Self'); setErrors([]); }}>Myself</button>
                      <button type="button" aria-pressed={mode === 'Others'} className={`ep-toggle-option ${mode === 'Others' ? 'active' : ''}`}
                        onClick={() => { setRequestMode('Others'); setErrors([]); }}>Someone Else</button>
                      <div className="ep-toggle-slider" style={{ transform: mode === 'Self' ? 'translateX(0)' : 'translateX(100%)' }}></div>
                    </div>
                  </div>
                )}

                {mode === 'Self' ? (
                  <>
                    <h2 className="ep-section-title"><i className="bi bi-person-bounding-box"></i> Your Information</h2>
                    <div className="ep-grid">
                      <div className="ep-input-group"><label htmlFor="dynamicReque-f1">First Name</label><input id="dynamicReque-f1" type="text" value={profile?.fName || ''} readOnly /></div>
                      <div className="ep-input-group"><label htmlFor="dynamicReque-f3">Middle Name</label><input id="dynamicReque-f3" type="text" value={profile?.mName || ''} readOnly /></div>
                      <div className="ep-input-group"><label htmlFor="dynamicReque-f5">Last Name</label><input id="dynamicReque-f5" type="text" value={profile?.lName || ''} readOnly /></div>
                      <div className="ep-input-group"><label htmlFor="dynamicReque-f7">Suffix</label><input id="dynamicReque-f7" type="text" value={profile?.suffix || 'N/A'} readOnly /></div>
                      <div className="ep-input-group"><label htmlFor="dynamicReque-f9">Age</label><input id="dynamicReque-f9" type="text" value={profile?.age ?? ''} readOnly /></div>
                      <div className="ep-input-group"><label htmlFor="dynamicReque-f11">Sex</label><input id="dynamicReque-f11" type="text" value={profile?.gender || ''} readOnly /></div>
                      <div className="ep-input-group"><label htmlFor="dynamicReque-f13">Civil Status</label><input id="dynamicReque-f13" type="text" value={profile?.civil_status || ''} readOnly /></div>
                      <div className="ep-input-group"><label htmlFor="dynamicReque-f15">Mobile Number</label><input id="dynamicReque-f15" type="text" value={profile?.contact_num || ''} readOnly /></div>
                    </div>
                    <p className="ep-hint"><i className="bi bi-info-circle"></i> Taken from your resident profile. Update it in Edit Profile if anything is wrong.</p>
                  </>
                ) : (
                  <>
                    <h2 className="ep-section-title"><i className="bi bi-person-add"></i> Person You're Requesting For</h2>
                    <div className="ep-grid">
                      <div className="ep-input-group"><label htmlFor="dynamicReque-fName">First Name *</label><input id="dynamicReque-fName" type="text" name="fName" value={other.fName} onChange={setOtherField} className={errClass('other_fName')} aria-invalid={errors.includes('other_fName') || undefined} /></div>
                      <div className="ep-input-group"><label htmlFor="dynamicReque-mName">Middle Name</label><input id="dynamicReque-mName" type="text" name="mName" value={other.mName} onChange={setOtherField} /></div>
                      <div className="ep-input-group"><label htmlFor="dynamicReque-lName">Last Name *</label><input id="dynamicReque-lName" type="text" name="lName" value={other.lName} onChange={setOtherField} className={errClass('other_lName')} aria-invalid={errors.includes('other_lName') || undefined} /></div>
                      <div className="ep-input-group">
                        <label htmlFor="dynamicReque-suffix">Suffix</label>
                        <select id="dynamicReque-suffix" name="suffix" value={other.suffix} onChange={setOtherField}>
                          <option value="">None</option>
                          {['Jr.', 'Sr.', 'II', 'III', 'IV'].map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                      <div className="ep-input-group"><label htmlFor="dynamicReque-birth_date">Birth Date *</label><input id="dynamicReque-birth_date" type="date" name="birth_date" max={new Date().toISOString().slice(0, 10)} value={other.birth_date} onChange={setOtherField} className={errClass('other_birth_date')} aria-invalid={errors.includes('other_birth_date') || undefined} /></div>
                      <div className="ep-input-group">
                        <label htmlFor="dynamicReque-gender">Sex *</label>
                        <select id="dynamicReque-gender" name="gender" value={other.gender} onChange={setOtherField} className={errClass('other_gender')} aria-invalid={errors.includes('other_gender') || undefined}>
                          <option value="">Select</option><option value="Male">Male</option><option value="Female">Female</option>
                        </select>
                      </div>
                      <div className="ep-input-group">
                        <label htmlFor="dynamicReque-civil_status">Civil Status *</label>
                        <select id="dynamicReque-civil_status" name="civil_status" value={other.civil_status} onChange={setOtherField} className={errClass('other_civil_status')} aria-invalid={errors.includes('other_civil_status') || undefined}>
                          <option value="">Select</option>
                          {['Single', 'Married', 'Widowed', 'Separated'].map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                      <div className="ep-input-group"><label htmlFor="dynamicReque-contact_num">Mobile Number</label><input id="dynamicReque-contact_num" type="text" inputMode="numeric" name="contact_num" placeholder="09XXXXXXXXX" value={other.contact_num} onChange={setOtherField} className={errClass('other_contact_num')} aria-invalid={errors.includes('other_contact_num') || undefined} /></div>
                      <div className="ep-input-group ep-full"><label htmlFor="dynamicReque-address">Address *</label><input id="dynamicReque-address" type="text" name="address" placeholder="House No. / Blk & Lot, Street, Subdivision" value={other.address} onChange={setOtherField} className={errClass('other_address')} aria-invalid={errors.includes('other_address') || undefined} /></div>
                    </div>
                  </>
                )}
                {renderStepFields('Identity')}
              </div>
            )}

            {/* STEP 2: DETAILS */}
            {stepKey === 'Residency' && (
              <div className="slide-in">
                <h2 className="ep-section-title"><i className="bi bi-geo-alt-fill"></i> Address</h2>
                <div className="ep-grid">
                  <div className="ep-input-group ep-full">
                    <label htmlFor="dynamicReque-f26">{mode === 'Self' ? 'Registered Address' : "Person's Address"}</label>
                    <input id="dynamicReque-f26" type="text" readOnly value={mode === 'Self' ? selfAddress : other.address} />
                  </div>
                </div>
                {renderStepFields('Residency', 'Request Details') || (
                  <p className="ep-hint"><i className="bi bi-check2-circle"></i> No additional details are needed for this step.</p>
                )}
              </div>
            )}

            {/* STEP 3: UPLOADS */}
            {stepKey === 'Uploads' && (
              <div className="slide-in">
                <h2 className="ep-section-title"><i className="bi bi-file-earmark-lock"></i> Verification & Attachments</h2>
                {mode === 'Self' ? (
                  <IdOnFileCard idOnFile={idOnFile} residency={residency} requireResidency={false} onResidencyChange={setResidency} showToast={showToast} />
                ) : (
                <div className="ep-grid">
                  <div className="ep-input-group ep-full">
                    <label>Valid ID of the Person *</label>
                    <label className={`ep-file-upload-box ${files.owner_id ? 'has-file' : ''} ${errClass('owner_id')}`}>
                      <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" style={{ display: 'none' }}
                        onChange={(e) => { setFile('owner_id', e.target.files?.[0]); e.target.value = ''; }} />
                      <div className="ep-upload-content">
                        <i className={`bi ${files.owner_id ? 'bi-check-circle-fill' : 'bi-person-badge-fill'} ep-upload-icon`}></i>
                        <h4>{files.owner_id ? files.owner_id.name : "Upload the person's valid ID"}</h4>
                        <p>{files.owner_id ? 'Click to change' : 'JPEG, PNG, WebP, or PDF · max 10MB'}</p>
                      </div>
                    </label>
                  </div>
                </div>
                )}
                {renderStepFields('Uploads', 'Required Documents')}
              </div>
            )}

            {/* STEP 4: REVIEW */}
            {stepKey === 'Review' && (
              <div className="slide-in">
                <div className="ep-review-box" aria-live="polite">
                  <div className="ep-review-category">
                    <h4>Request</h4>
                    <div className="ep-review-row"><span className="ep-review-label">Service</span><span className="ep-review-val">{service.title}</span></div>
                    <div className="ep-review-row"><span className="ep-review-label">Tracking Code</span><span className="ep-review-val highlight">{trackingCode}</span></div>
                    <div className="ep-review-row"><span className="ep-review-label">Requested For</span><span className="ep-review-val">{mode === 'Self' ? 'Myself' : 'Someone else'}</span></div>
                  </div>
                  <div className="ep-review-category">
                    <h4>Applicant</h4>
                    <div className="ep-review-row"><span className="ep-review-label">Full Name</span><span className="ep-review-val">{applicantName.toUpperCase() || '—'}</span></div>
                    <div className="ep-review-row"><span className="ep-review-label">Address</span><span className="ep-review-val">{(mode === 'Self' ? selfAddress : other.address) || '—'}</span></div>
                  </div>
                  {reviewFields.length > 0 && (
                    <div className="ep-review-category">
                      <h4>Your Answers</h4>
                      {reviewFields.map(f => (
                        <div className="ep-review-row" key={f.field_id}>
                          <span className="ep-review-label">{f.field_label}</span>
                          <span className="ep-review-val">{reviewValue(f)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="ep-review-category">
                    <h4>Attachments</h4>
                    <div className="mt-2">
                      <span className="ep-attachment-tag">
                        <i className={`bi ${mode === 'Self' ? 'bi-person-vcard' : 'bi-paperclip'}`}></i>{' '}
                        {mode === 'Self' ? `Valid ID on file (${idOnFile?.type || 'Registration ID'})` : (files.owner_id?.name || 'Valid ID')}
                      </span>
                      {fields.filter((f) => f.field_type === 'file' && isVisible(f) && files[`dyn_${f.field_name}`]).map((f) => (
                        <span className="ep-attachment-tag" key={f.field_id}><i className="bi bi-paperclip"></i> {f.field_label}: {files[`dyn_${f.field_name}`].name}</span>
                      ))}
                    </div>
                  </div>
                </div>
                {renderStepFields('Review', 'Before You Submit')}
              </div>
            )}

            {currentStep === STEPS.length - 1 && (
              <PaymentSection info={paymentInfo} value={payment} onChange={setPayment} onError={(msg) => showToast('File Not Accepted', msg, 'error')} />
            )}

            <div className="ep-actions">
              <button type="button" className="ep-btn ep-btn-prev" disabled={currentStep === 0 || isSubmitting}
                onClick={() => { setErrors([]); setCurrentStep(s => s - 1); }}>
                <i className="bi bi-arrow-left"></i> Back
              </button>
              <button type="button" className="ep-btn ep-btn-next" disabled={isSubmitting}
                onClick={() => (currentStep === STEPS.length - 1 ? handleSubmit() : handleNextStep())}>
                {currentStep === STEPS.length - 1 ? (isSubmitting ? 'Submitting...' : 'Confirm & Submit') : 'Continue'}
                <i className={currentStep === STEPS.length - 1 ? (isSubmitting ? 'bi bi-hourglass-split' : 'bi bi-send-fill') : 'bi bi-arrow-right'}></i>
              </button>
            </div>
          </form>
        </div>
      </div>

      {submitted && createPortal(
        <div className="ep-success-overlay">
          <div className="ep-success-card" role="dialog" aria-modal="true" aria-labelledby="ep-success-title">
            <div className="ep-success-icon"><i className="bi bi-check-lg"></i></div>
            <h2 id="ep-success-title">Request Submitted</h2>
            <p>Your request for <strong>{service.title}</strong> was sent to the barangay for review. A confirmation was sent to your email.</p>
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

export default DynamicRequestForm;
