import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import Header from '../components/Header';
import Footer from '../components/Footer';
import Toast from '../components/Toast';
import CameraCapture from '../components/CameraCapture';
import { useToast } from '../lib/useToast';
import { useAuth } from '../context/AuthContext';
import { getProfilePhotoUrl, getInitial } from '../lib/profilePhoto';
import '../styles/form-theme.css';
import '../styles/edit-profile.css';

const API_BASE = '/api_backend';

// Field groups mirror backend/api/edit_profile.php:
//  - APPROVAL_FIELDS: identity verified against the ID at registration → queued for admin approval
//  - OTP_FIELDS: login/contact details → confirmed with an emailed code
//  - everything else in the form → saved immediately
const APPROVAL_FIELDS = ['fName', 'mName', 'lName', 'suffix', 'birth_date', 'gender', 'philsys_nat_id', 'is_pwd', 'is_4ps', 'is_solo_parent', 'is_indigent'];
const PROOF_FIELDS = ['fName', 'mName', 'lName', 'suffix', 'is_pwd', 'is_4ps', 'is_solo_parent', 'is_indigent'];
const OTP_FIELDS = ['email', 'contact_num'];
const SECTOR_FLAGS = [
  { key: 'is_pwd', label: 'PWD (Person with Disability)' },
  { key: 'is_4ps', label: '4Ps Member / Beneficiary' },
  { key: 'is_solo_parent', label: 'Solo Parent' },
  { key: 'is_indigent', label: 'Indigent Resident' }
];

const FIELD_LABELS = {
  fName: 'First Name', mName: 'Middle Name', lName: 'Last Name', suffix: 'Suffix', birth_date: 'Birth Date',
  gender: 'Sex', philsys_nat_id: 'PhilSys Number', civil_status: 'Civil Status', spouse_name_text: 'Spouse Name',
  religion: 'Religion', height: 'Height', blood_type: 'Blood Type', birth_city: 'Birth City', birth_province: 'Birth Province',
  birth_country: 'Birth Country', house_no: 'House No.', block_lot: 'Block & Lot', street: 'Street', subdivision: 'Subdivision',
  zone: 'Zone / Purok', area: 'Area / Village', landmark: 'Landmark', residency_status: 'Residency Status',
  years_in_PB2: 'Years in PB2', contact_person: 'Emergency Contact', contactp_relationship: 'Relationship',
  contactp_num: 'Emergency Mobile', email: 'Email Address', contact_num: 'Mobile Number',
  is_pwd: 'PWD', is_4ps: '4Ps Member', is_solo_parent: 'Solo Parent', is_indigent: 'Indigent', sector: 'Sector (legacy)'
};

const ID_TYPES = ['National ID (PhilID/ePhilID)', 'Passport', 'Drivers License', 'UMID (SSS/GSIS)', 'Voters ID', 'Postal ID', 'PRC ID', 'PhilHealth ID', 'TIN ID'];
const ID_SLOTS = [
  { key: 'front', label: 'Front of ID' },
  { key: 'back', label: 'Back of ID' },
  { key: 'holding', label: 'Selfie Holding ID' }
];

const NAME_RE = /^[\p{L}\s.'-]+$/u;
const MOBILE_RE = /^09\d{9}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;

const toFlag = (v) => v === true || v === 1 || v === '1';

const fromProfile = (u) => ({
  fName: u.fName || '', mName: u.mName || '', lName: u.lName || '', suffix: u.suffix || '',
  birth_date: u.birth_date || '', gender: u.gender || 'Male', philsys_nat_id: u.philsys_nat_id || '',
  civil_status: u.civil_status || 'Single', spouse_name_text: u.spouse_name_text || '', religion: u.religion || '',
  height: u.height || '', blood_type: u.blood_type || '',
  birth_city: u.birth_city || '', birth_province: u.birth_province || '', birth_country: u.birth_country || '',
  house_no: u.house_no || '', block_lot: u.block_lot || '', street: u.street || '', subdivision: u.subdivision || '',
  zone: u.zone || '', area: u.area || '', landmark: u.landmark || '',
  residency_status: u.residency_status || 'Homeowner', years_in_PB2: u.years_in_PB2 ?? '',
  contact_person: u.contact_person || '', contactp_relationship: u.contactp_relationship || '', contactp_num: u.contactp_num || '',
  email: u.email || '', contact_num: u.contact_num || '',
  is_pwd: toFlag(u.is_pwd), is_4ps: toFlag(u.is_4ps), is_solo_parent: toFlag(u.is_solo_parent), is_indigent: toFlag(u.is_indigent)
});

const ageFrom = (iso) => {
  if (!iso) return null;
  const b = new Date(iso);
  if (Number.isNaN(b.getTime())) return null;
  const t = new Date();
  let a = t.getFullYear() - b.getFullYear();
  if (t.getMonth() < b.getMonth() || (t.getMonth() === b.getMonth() && t.getDate() < b.getDate())) a--;
  return a;
};

const same = (a, b) => String(a ?? '').trim().toUpperCase() === String(b ?? '').trim().toUpperCase();

function EditProfile() {
  const { updateUser } = useAuth();
  const { toast, showToast, confirmToast, closeToast } = useToast(6000);

  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState(null);
  const [originalData, setOriginalData] = useState(null);
  const [errors, setErrors] = useState({});
  const [pendingChanges, setPendingChanges] = useState([]);
  const [saving, setSaving] = useState(false);

  // Profile photo (applied immediately — update_profile_picture.php)
  const [profilePhoto, setProfilePhoto] = useState(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  // 'profile' | 'id-front' | 'id-back' | 'id-holding' | null
  const [cameraTarget, setCameraTarget] = useState(null);

  // Valid ID on file + replacement request (request_id_change.php)
  const [idOnFile, setIdOnFile] = useState(null);
  const [idForm, setIdForm] = useState(null);
  const [idSubmitting, setIdSubmitting] = useState(false);

  // Supporting document for name/sector changes
  const [proofFile, setProofFile] = useState(null);
  const [proofPreview, setProofPreview] = useState(null);
  const [proofBase64, setProofBase64] = useState('');

  // Dialogs
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otpOpen, setOtpOpen] = useState(false);
  const [otpInput, setOtpInput] = useState('');
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwordData, setPasswordData] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [passwordErrors, setPasswordErrors] = useState({});

  const loadProfile = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/get_profile.php`, { credentials: 'include' });
      const result = await res.json();
      if (result.success && result.user) {
        const data = fromProfile(result.user);
        setFormData(data);
        setOriginalData(data);
        setErrors({});
        setProfilePhoto(result.user.profile_picture || null);
        setPendingChanges(result.pending_changes || []);
        setIdOnFile({
          valid_id: result.user.valid_id || '',
          front: result.user.valid_id_img_front || '',
          back: result.user.valid_id_img_back || '',
          holding: result.user.valid_id_img_holding || ''
        });
      } else {
        showToast('Session Expired', result.message || 'Please log in again.', 'warning');
      }
    } catch {
      showToast('Connection Error', 'Unable to load your profile. Please refresh the page.', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { loadProfile(); }, [loadProfile]);

  // ---------------------------------------------------------------------------
  // Field editing + validation
  // ---------------------------------------------------------------------------
  const validateField = (name, value, data) => {
    const v = String(value ?? '').trim();
    switch (name) {
      case 'fName': case 'lName': case 'religion': case 'birth_city': case 'birth_province': case 'birth_country': case 'contact_person':
        if (!v) return 'Required.';
        return NAME_RE.test(v) ? '' : 'Letters, spaces, periods, apostrophes and hyphens only.';
      case 'mName': case 'contactp_relationship':
        if (name === 'contactp_relationship' && !v) return 'Required.';
        return !v || NAME_RE.test(v) ? '' : 'Letters, spaces, periods, apostrophes and hyphens only.';
      case 'spouse_name_text':
        return ['Married', 'Separated'].includes(data.civil_status) && !v ? "Required when married or separated." : '';
      case 'street': case 'subdivision':
        return v ? '' : 'Required.';
      case 'house_no': case 'block_lot':
        return !data.house_no.trim() && !data.block_lot.trim() ? 'Enter a House No. or a Block & Lot.' : '';
      case 'contact_num': case 'contactp_num':
        return MOBILE_RE.test(v) ? '' : 'Must be 11 digits starting with 09.';
      case 'email':
        return EMAIL_RE.test(v) ? '' : 'Enter a valid email address.';
      case 'height': {
        const n = Number(v);
        return Number.isInteger(n) && n >= 50 && n <= 250 ? '' : 'Whole number between 50 and 250 cm.';
      }
      case 'years_in_PB2': {
        const n = Number(v);
        return v !== '' && Number.isInteger(n) && n >= 0 && n <= 120 ? '' : 'Enter a whole number of years.';
      }
      case 'birth_date': {
        if (!v) return 'Required.';
        const d = new Date(v);
        return !Number.isNaN(d.getTime()) && d <= new Date() && d.getFullYear() >= 1900 ? '' : 'Enter a valid birth date.';
      }
      case 'philsys_nat_id':
        return !v || v.replace(/\D/g, '').length === 16 ? '' : 'PhilSys number must be 16 digits.';
      default:
        return '';
    }
  };

  const handleChange = (e) => {
    const { name, type, checked } = e.target;
    let value = type === 'checkbox' ? checked : e.target.value;
    if (name === 'contact_num' || name === 'contactp_num') value = value.replace(/\D/g, '').slice(0, 11);
    if (name === 'philsys_nat_id') value = value.replace(/[^\d-]/g, '').slice(0, 19);

    setFormData(prev => {
      const next = { ...prev, [name]: value };
      if (name === 'civil_status' && !['Married', 'Separated'].includes(value)) next.spouse_name_text = '';
      setErrors(errs => {
        const upd = { ...errs, [name]: validateField(name, value, next) };
        if (name === 'house_no' || name === 'block_lot') {
          upd.house_no = validateField('house_no', next.house_no, next);
          upd.block_lot = '';
        }
        if (name === 'civil_status') upd.spouse_name_text = validateField('spouse_name_text', next.spouse_name_text, next);
        return upd;
      });
      return next;
    });
  };

  const changedFields = formData && originalData
    ? Object.keys(formData).filter(k => (typeof formData[k] === 'boolean' ? formData[k] !== originalData[k] : !same(formData[k], originalData[k])))
    : [];
  const approvalChanged = changedFields.filter(k => APPROVAL_FIELDS.includes(k));
  const proofNeeded = changedFields.some(k => PROOF_FIELDS.includes(k));
  const otpChanged = changedFields.filter(k => OTP_FIELDS.includes(k));

  const errClass = (name) => (errors[name] ? 'pf-error' : '');
  const hint = (name, text) => (errors[name]
    ? <span className="pf-field-hint is-error">{errors[name]}</span>
    : text ? <span className="pf-field-hint">{text}</span> : null);
  const changedMark = (name) => (changedFields.includes(name)
    ? <span className={`ep2-changed ${APPROVAL_FIELDS.includes(name) ? 'is-approval' : ''}`}>{APPROVAL_FIELDS.includes(name) ? 'needs approval' : 'edited'}</span>
    : null);

  const discardChanges = () => {
    setFormData(originalData);
    setErrors({});
    removeProofDocument();
  };

  // ---------------------------------------------------------------------------
  // Supporting document (name / sector changes)
  // ---------------------------------------------------------------------------
  const handleProofFileChange = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.type)) {
      showToast('Unsupported File', 'Please attach a JPEG, PNG, WebP image or a PDF.', 'error');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast('File Too Large', 'Your supporting document must be 5MB or smaller.', 'error');
      return;
    }
    setProofFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setProofBase64(reader.result);
      setProofPreview(file.type.startsWith('image/') ? reader.result : null);
    };
    reader.readAsDataURL(file);
  };

  const removeProofDocument = () => {
    setProofFile(null);
    setProofPreview(null);
    setProofBase64('');
  };

  // ---------------------------------------------------------------------------
  // Save flow: validate → confirm with password → edit_profile.php → (OTP)
  // ---------------------------------------------------------------------------
  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData) return;

    const nextErrors = {};
    Object.keys(formData).forEach(k => {
      const msg = validateField(k, formData[k], formData);
      if (msg) nextErrors[k] = msg;
    });
    setErrors(nextErrors);
    const firstError = Object.keys(nextErrors)[0];
    if (firstError) {
      showToast('Please Check Your Entries', `${FIELD_LABELS[firstError] || firstError}: ${nextErrors[firstError]}`, 'error');
      document.querySelector(`[name="${firstError}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (changedFields.length === 0) {
      showToast('No Changes', 'You have not changed anything yet.', 'info');
      return;
    }
    if (proofNeeded && !proofFile) {
      showToast('Supporting Document Needed', 'Name and sector changes need a supporting document. Please attach one below.', 'warning');
      document.querySelector('.ep2-proof')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setConfirmPassword('');
    setConfirmOpen(true);
  };

  const submitChanges = async (e) => {
    e?.preventDefault();
    if (!confirmPassword) {
      showToast('Password Required', 'Enter your current password to confirm these changes.', 'error');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...formData,
        philsys_nat_id: formData.philsys_nat_id.replace(/\D/g, ''),
        is_pwd: formData.is_pwd ? '1' : '0',
        is_4ps: formData.is_4ps ? '1' : '0',
        is_solo_parent: formData.is_solo_parent ? '1' : '0',
        is_indigent: formData.is_indigent ? '1' : '0',
        update_profile: '1',
        current_password: confirmPassword,
        proof_document: proofNeeded ? proofBase64 : null
      };
      const res = await fetch(`${API_BASE}/edit_profile.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'include'
      });
      const data = await res.json();
      if (!data.success) {
        showToast('Not Saved', data.message || 'Unable to save your changes.', 'error');
        return;
      }

      setConfirmOpen(false);
      setConfirmPassword('');
      removeProofDocument();
      if (data.requiresOtp) {
        setOtpInput('');
        setOtpOpen(true);
        showToast('Verification Code Sent', 'Enter the code we emailed you to finish updating your email or mobile number.', 'info');
      } else if (data.hasAdminApproval) {
        showToast('Submitted for Approval', 'Your other changes are saved. Identity and sector changes will apply once an administrator approves them.', 'success');
      } else {
        showToast('Profile Updated', 'Your changes have been saved.', 'success');
      }
      await loadProfile();
    } catch {
      showToast('Connection Error', 'Unable to reach the server. Please try again.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const verifyOtp = async (e) => {
    e.preventDefault();
    if (otpInput.length !== 6) {
      showToast('Incomplete Code', 'Please enter the 6-digit code from your email.', 'error');
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/verify_otp.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otp: otpInput }),
        credentials: 'include'
      });
      const data = await res.json();
      if (data.success) {
        setOtpOpen(false);
        setOtpInput('');
        showToast('Verified', 'Your email / mobile number has been updated.', 'success');
        await loadProfile();
        if (formData?.email) updateUser({ email: formData.email.toLowerCase() });
      } else {
        showToast('Verification Failed', data.message || 'Invalid code. Please check your inbox.', 'error');
      }
    } catch {
      showToast('Connection Error', 'Unable to reach the server. Please try again.', 'error');
    }
  };

  const changePassword = async (e) => {
    e?.preventDefault();
    const errs = {};
    if (!passwordData.currentPassword) errs.currentPassword = 'Current password is required.';
    if (!PASSWORD_RE.test(passwordData.newPassword)) errs.newPassword = '8+ characters with an uppercase letter, a number, and a special character (@$!%*?&).';
    if (passwordData.newPassword !== passwordData.confirmPassword) errs.confirmPassword = 'Passwords do not match.';
    setPasswordErrors(errs);
    if (Object.keys(errs).length) return;

    try {
      const res = await fetch(`${API_BASE}/edit_profile.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          update_profile: '1',
          change_password: '1',
          current_password: passwordData.currentPassword,
          new_password: passwordData.newPassword
        }),
        credentials: 'include'
      });
      const data = await res.json();
      if (data.success) {
        showToast('Password Updated', 'Your password has been changed.', 'success');
        closePasswordDialog();
      } else {
        showToast('Password Not Changed', data.message || 'Failed to update password.', 'error');
      }
    } catch {
      showToast('Connection Error', 'Unable to reach the server. Please try again.', 'error');
    }
  };

  const closePasswordDialog = () => {
    setPasswordOpen(false);
    setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
    setPasswordErrors({});
  };

  // ---------------------------------------------------------------------------
  // Profile photo
  // ---------------------------------------------------------------------------
  const uploadProfilePhoto = async (file) => {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      showToast('Unsupported File', 'Please choose a JPEG, PNG, or WebP image.', 'error');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      showToast('File Too Large', 'Your photo must be 10MB or smaller.', 'error');
      return;
    }
    setPhotoUploading(true);
    try {
      const body = new FormData();
      body.append('profile_picture', file);
      const res = await fetch(`${API_BASE}/update_profile_picture.php`, { method: 'POST', body, credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setProfilePhoto(data.profile_picture);
        updateUser({ profile_picture: data.profile_picture });
        showToast('Photo Updated', data.message || 'Your profile photo has been updated.', 'success');
      } else {
        showToast('Upload Failed', data.message || 'Unable to update your photo.', 'error');
      }
    } catch {
      showToast('Connection Error', 'Unable to reach the server. Please try again.', 'error');
    } finally {
      setPhotoUploading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Valid ID on file
  // ---------------------------------------------------------------------------
  const pendingIdRequest = (() => {
    const row = pendingChanges.find(c => c.field_name === 'valid_id_documents' && c.status === 'pending_approval');
    if (!row) return null;
    try { return { ...JSON.parse(row.new_value), created_at: row.created_at }; } catch { return null; }
  })();

  const openIdForm = () => setIdForm({ valid_id: idOnFile?.valid_id || '', front: null, back: null, holding: null });
  const closeIdForm = () => {
    if (idForm) ['front', 'back', 'holding'].forEach(k => idForm[k]?.url && URL.revokeObjectURL(idForm[k].url));
    setIdForm(null);
  };

  const setIdSlotFile = (slot, file) => {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      showToast('Unsupported File', 'Please use a JPEG, PNG, or WebP photo.', 'error');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      showToast('File Too Large', 'Each photo must be 10MB or smaller.', 'error');
      return;
    }
    setIdForm(prev => {
      if (!prev) return prev;
      if (prev[slot]?.url) URL.revokeObjectURL(prev[slot].url);
      return { ...prev, [slot]: { file, url: URL.createObjectURL(file) } };
    });
  };

  const submitIdRequest = async () => {
    if (!idForm) return;
    const missing = [];
    if (!idForm.valid_id) missing.push('ID type');
    ID_SLOTS.forEach(s => { if (!idForm[s.key]) missing.push(s.label); });
    if (missing.length) {
      showToast('Incomplete ID Update', `Please provide: ${missing.join(', ')}.`, 'error');
      return;
    }
    setIdSubmitting(true);
    try {
      const body = new FormData();
      body.append('valid_id', idForm.valid_id);
      body.append('valid_id_img_front', idForm.front.file);
      body.append('valid_id_img_back', idForm.back.file);
      body.append('valid_id_img_holding', idForm.holding.file);
      const res = await fetch(`${API_BASE}/request_id_change.php`, { method: 'POST', body, credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        if (data.request) setPendingChanges(prev => [data.request, ...prev]);
        closeIdForm();
        showToast('Submitted for Approval', data.message, 'success');
      } else {
        showToast('Request Not Sent', data.message || 'Unable to submit your ID update.', 'error');
      }
    } catch {
      showToast('Connection Error', 'Unable to reach the server. Please try again.', 'error');
    } finally {
      setIdSubmitting(false);
    }
  };

  const cancelIdRequest = async () => {
    const ok = await confirmToast('Cancel ID Update?', 'Your pending ID update request will be withdrawn and its photos deleted.', { confirmLabel: 'Cancel Request', cancelLabel: 'Keep It', danger: true });
    if (!ok) return;
    try {
      const body = new FormData();
      body.append('action', 'cancel');
      const res = await fetch(`${API_BASE}/request_id_change.php`, { method: 'POST', body, credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setPendingChanges(prev => prev.filter(c => c.field_name !== 'valid_id_documents'));
        showToast('Request Cancelled', data.message, 'info');
      } else {
        showToast('Unable to Cancel', data.message, 'error');
      }
    } catch {
      showToast('Connection Error', 'Unable to reach the server. Please try again.', 'error');
    }
  };

  const handleCameraCapture = (file) => {
    if (cameraTarget === 'profile') uploadProfilePhoto(file);
    else if (cameraTarget?.startsWith('id-')) setIdSlotFile(cameraTarget.slice(3), file);
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  const pendingFieldChanges = pendingChanges.filter(c => c.field_name !== 'valid_id_documents');
  const formatPendingValue = (field, value) => (/^is_/.test(field) ? (String(value) === '1' ? 'Yes' : 'No') : (value || '—'));
  const age = formData ? ageFrom(formData.birth_date) : null;
  const isSenior = age !== null && age >= 60;

  const inputProps = (name, extra = {}) => ({
    name,
    className: errClass(name),
    value: formData[name],
    onChange: handleChange,
    ...extra
  });

  return (
    <>
      <Header />
      <Toast toast={toast} onClose={closeToast} />
      <CameraCapture
        open={cameraTarget !== null}
        mode={cameraTarget === 'id-front' || cameraTarget === 'id-back' ? 'id' : 'face'}
        title={cameraTarget === 'profile' ? 'Take Profile Photo'
          : cameraTarget === 'id-holding' ? 'Selfie Holding Your ID'
          : cameraTarget === 'id-back' ? 'Capture Back of ID' : 'Capture Front of ID'}
        hint={cameraTarget === 'id-holding' ? 'Hold your ID beside your face so both your face and the ID details are clearly visible.' : undefined}
        onCapture={handleCameraCapture}
        onClose={() => setCameraTarget(null)}
      />

      <div className="pf-form profile-page">
        <div className="pf-card">
          <div className="pf-header">
            <h1>My Profile</h1>
            <span className="pf-badge"><i className="bi bi-person-badge"></i> Resident Record</span>
            <p>Keep your barangay record up to date. Some changes need verification before they take effect.</p>
          </div>

          <div className="pf-body">
            {loading || !formData ? (
              <div className="ep2-loading"><span className="ep2-spinner" /> Loading your profile...</div>
            ) : (
              <>
                {/* ---- Identity card + photo ---- */}
                <div className="ep2-identity">
                  <div className="ep2-identity-photo">
                    {profilePhoto ? <img src={getProfilePhotoUrl(profilePhoto)} alt="Your profile" /> : <span>{getInitial(originalData)}</span>}
                  </div>
                  <div className="ep2-identity-info">
                    <strong>{[originalData.fName, originalData.mName, originalData.lName, originalData.suffix].filter(Boolean).join(' ')}</strong>
                    <span>{originalData.email}</span>
                    <div className="ep2-identity-tags">
                      {age !== null && <span className="ep2-tag">{age} yrs old</span>}
                      {isSenior && <span className="ep2-tag ep2-tag--gold"><i className="bi bi-star-fill"></i> Senior Citizen</span>}
                      {SECTOR_FLAGS.filter(f => originalData[f.key]).map(f => <span key={f.key} className="ep2-tag">{FIELD_LABELS[f.key]}</span>)}
                    </div>
                    <div className="ep2-photo-actions">
                      <label className={`ep2-mini-btn ${photoUploading ? 'is-disabled' : ''}`}>
                        <i className="bi bi-image"></i> {photoUploading ? 'Uploading...' : profilePhoto ? 'Change Photo' : 'Upload Photo'}
                        <input type="file" accept="image/jpeg,image/png,image/webp" hidden disabled={photoUploading}
                          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; uploadProfilePhoto(f); }} />
                      </label>
                      <button type="button" className="ep2-mini-btn" onClick={() => setCameraTarget('profile')} disabled={photoUploading}>
                        <i className="bi bi-camera"></i> Take Photo
                      </button>
                    </div>
                  </div>
                </div>

                {/* ---- Pending requests ---- */}
                {pendingFieldChanges.length > 0 && (
                  <div className="pf-note pf-note--warn ep2-pending">
                    <i className="bi bi-hourglass-split"></i>
                    <div>
                      <strong>Waiting for approval or verification</strong>
                      <ul>
                        {pendingFieldChanges.map(c => (
                          <li key={c.change_id ?? `${c.field_name}-${c.new_value}`}>
                            <span className="ep2-pending-field">{FIELD_LABELS[c.field_name] || c.field_name}</span>
                            <span className="ep2-pending-old">{formatPendingValue(c.field_name, c.old_value)}</span>
                            <i className="bi bi-arrow-right"></i>
                            <span className="ep2-pending-new">{formatPendingValue(c.field_name, c.new_value)}</span>
                            <span className={`ep2-pending-badge ${c.status === 'pending_otp' ? 'is-otp' : ''}`}>
                              {c.status === 'pending_otp' ? 'Needs email code' : 'Admin review'}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}

                <form onSubmit={handleSubmit} noValidate>
                  {/* ---- 1. Identity (admin approval) ---- */}
                  <div className="section-header">
                    <div className="badge">1</div>
                    <div className="title">Personal Identity</div>
                    <span className="ep2-section-rule"><i className="bi bi-shield-check"></i> Changes need admin approval</span>
                  </div>
                  <div className="input-grid">
                    <div className="form-group"><label>First Name * {changedMark('fName')}</label><input type="text" {...inputProps('fName')} />{hint('fName')}</div>
                    <div className="form-group"><label>Middle Name {changedMark('mName')}</label><input type="text" {...inputProps('mName')} />{hint('mName')}</div>
                    <div className="form-group"><label>Last Name * {changedMark('lName')}</label><input type="text" {...inputProps('lName')} />{hint('lName')}</div>
                    <div className="form-group">
                      <label>Suffix {changedMark('suffix')}</label>
                      <select {...inputProps('suffix')}>
                        <option value="">None</option>
                        {['Jr.', 'Sr.', 'II', 'III', 'IV'].map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Birth Date * {changedMark('birth_date')}</label>
                      <input type="date" max={new Date().toISOString().slice(0, 10)} {...inputProps('birth_date')} />
                      {hint('birth_date', age !== null ? `Age: ${age}${isSenior ? ' — Senior Citizen' : ''}` : '')}
                    </div>
                    <div className="form-group">
                      <label>Sex * {changedMark('gender')}</label>
                      <select {...inputProps('gender')}>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        {originalData.gender === 'Other' && <option value="Other">Other</option>}
                      </select>
                    </div>
                    <div className="form-group span-3">
                      <label>PhilSys National ID Number {changedMark('philsys_nat_id')}</label>
                      <input type="text" inputMode="numeric" placeholder="1234-5678-9012-3456" {...inputProps('philsys_nat_id')} />
                      {hint('philsys_nat_id', 'Optional. 16-digit PhilSys Card Number.')}
                    </div>
                  </div>

                  {/* ---- 2. Other personal details (saved immediately) ---- */}
                  <div className="section-header">
                    <div className="badge">2</div>
                    <div className="title">Personal Details</div>
                    <span className="ep2-section-rule is-direct"><i className="bi bi-lightning-charge"></i> Saved immediately</span>
                  </div>
                  <div className="input-grid">
                    <div className="form-group">
                      <label>Civil Status * {changedMark('civil_status')}</label>
                      <select {...inputProps('civil_status')}>
                        {['Single', 'Married', 'Widowed', 'Separated'].map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    {['Married', 'Separated'].includes(formData.civil_status) ? (
                      <div className="form-group span-2">
                        <label>Spouse's Full Name * {changedMark('spouse_name_text')}</label>
                        <input type="text" placeholder="First Middle Last" {...inputProps('spouse_name_text')} />
                        {hint('spouse_name_text')}
                      </div>
                    ) : (
                      <div className="form-group span-2">
                        <label>Religion * {changedMark('religion')}</label>
                        <input type="text" {...inputProps('religion')} />{hint('religion')}
                      </div>
                    )}
                    {['Married', 'Separated'].includes(formData.civil_status) && (
                      <div className="form-group">
                        <label>Religion * {changedMark('religion')}</label>
                        <input type="text" {...inputProps('religion')} />{hint('religion')}
                      </div>
                    )}
                    <div className="form-group">
                      <label>Height (cm) * {changedMark('height')}</label>
                      <input type="number" min="50" max="250" inputMode="numeric" {...inputProps('height')} />{hint('height')}
                    </div>
                    <div className="form-group">
                      <label>Blood Type {changedMark('blood_type')}</label>
                      <select {...inputProps('blood_type')}>
                        <option value="">Unknown</option>
                        {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div className="form-group"><label>Birth City * {changedMark('birth_city')}</label><input type="text" {...inputProps('birth_city')} />{hint('birth_city')}</div>
                    <div className="form-group"><label>Birth Province * {changedMark('birth_province')}</label><input type="text" {...inputProps('birth_province')} />{hint('birth_province')}</div>
                    <div className="form-group"><label>Birth Country * {changedMark('birth_country')}</label><input type="text" {...inputProps('birth_country')} />{hint('birth_country')}</div>
                  </div>

                  {/* ---- 3. Address (saved immediately) ---- */}
                  <div className="section-header">
                    <div className="badge">3</div>
                    <div className="title">Residential Address</div>
                    <span className="ep2-section-rule is-direct"><i className="bi bi-lightning-charge"></i> Saved immediately</span>
                  </div>
                  <div className="input-grid">
                    <div className="form-group"><label>House No. {changedMark('house_no')}</label><input type="text" {...inputProps('house_no')} />{hint('house_no', 'Or fill in Block & Lot.')}</div>
                    <div className="form-group"><label>Block & Lot {changedMark('block_lot')}</label><input type="text" {...inputProps('block_lot')} />{hint('block_lot')}</div>
                    <div className="form-group"><label>Zone / Purok {changedMark('zone')}</label><input type="text" {...inputProps('zone')} /></div>
                    <div className="form-group span-2"><label>Street * {changedMark('street')}</label><input type="text" {...inputProps('street')} />{hint('street')}</div>
                    <div className="form-group"><label>Subdivision * {changedMark('subdivision')}</label><input type="text" {...inputProps('subdivision')} />{hint('subdivision')}</div>
                    <div className="form-group"><label>Area / Village {changedMark('area')}</label><input type="text" {...inputProps('area')} /></div>
                    <div className="form-group span-2"><label>Landmark {changedMark('landmark')}</label><input type="text" {...inputProps('landmark')} /></div>
                    <div className="form-group">
                      <label>Residency Status * {changedMark('residency_status')}</label>
                      <select {...inputProps('residency_status')}>
                        {['Homeowner', 'Tenant', 'Sharer'].map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div className="form-group"><label>Years in Pasong Buaya II * {changedMark('years_in_PB2')}</label><input type="number" min="0" max="120" {...inputProps('years_in_PB2')} />{hint('years_in_PB2')}</div>
                  </div>

                  {/* ---- 4. Sectors (admin approval + proof) ---- */}
                  <div className="section-header">
                    <div className="badge">4</div>
                    <div className="title">Sector Membership</div>
                    <span className="ep2-section-rule"><i className="bi bi-shield-check"></i> Changes need admin approval</span>
                  </div>
                  <div className="pf-check-grid">
                    <label className="pf-check is-locked" title="Set automatically from your birth date">
                      <input type="checkbox" checked={isSenior} readOnly disabled />
                      Senior Citizen {isSenior ? '(auto)' : ''}
                    </label>
                    {SECTOR_FLAGS.map(f => (
                      <label key={f.key} className="pf-check">
                        <input type="checkbox" name={f.key} checked={formData[f.key]} onChange={handleChange} />
                        {f.label} {changedMark(f.key)}
                      </label>
                    ))}
                  </div>

                  {/* ---- 5. Emergency contact (saved immediately) ---- */}
                  <div className="section-header">
                    <div className="badge">5</div>
                    <div className="title">Emergency Contact</div>
                    <span className="ep2-section-rule is-direct"><i className="bi bi-lightning-charge"></i> Saved immediately</span>
                  </div>
                  <div className="input-grid">
                    <div className="form-group span-2"><label>Contact Person * {changedMark('contact_person')}</label><input type="text" {...inputProps('contact_person')} />{hint('contact_person')}</div>
                    <div className="form-group"><label>Relationship * {changedMark('contactp_relationship')}</label><input type="text" placeholder="e.g. Mother" {...inputProps('contactp_relationship')} />{hint('contactp_relationship')}</div>
                    <div className="form-group"><label>Mobile Number * {changedMark('contactp_num')}</label><input type="text" inputMode="numeric" placeholder="09XXXXXXXXX" {...inputProps('contactp_num')} />{hint('contactp_num')}</div>
                  </div>

                  {/* ---- 6. Account (OTP) ---- */}
                  <div className="section-header">
                    <div className="badge">6</div>
                    <div className="title">Login & Contact</div>
                    <span className="ep2-section-rule is-otp"><i className="bi bi-envelope-check"></i> Confirmed with an email code</span>
                  </div>
                  <div className="input-grid">
                    <div className="form-group span-2"><label>Email Address * {changedMark('email')}</label><input type="email" {...inputProps('email')} />{hint('email', 'Used for login and official notifications.')}</div>
                    <div className="form-group"><label>Mobile Number * {changedMark('contact_num')}</label><input type="text" inputMode="numeric" placeholder="09XXXXXXXXX" {...inputProps('contact_num')} />{hint('contact_num')}</div>
                  </div>

                  {/* ---- Supporting document (only when a name/sector field changed) ---- */}
                  {(proofNeeded || proofFile) && (
                    <div className="ep2-proof">
                      <div className="pf-note pf-note--info">
                        <i className="bi bi-info-circle-fill"></i>
                        <div>Name and sector changes need a supporting document (e.g. valid ID, PSA certificate, PWD / Solo Parent ID, 4Ps certification). Max 5MB.</div>
                      </div>
                      {!proofFile ? (
                        <label className="ep2-dropzone">
                          <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" hidden onChange={handleProofFileChange} />
                          <i className="bi bi-cloud-arrow-up"></i>
                          <strong>Attach supporting document</strong>
                          <small>JPEG, PNG, WebP, or PDF</small>
                        </label>
                      ) : (
                        <div className="ep2-proof-file">
                          {proofPreview ? <img src={proofPreview} alt="Supporting document" /> : <i className="bi bi-file-earmark-pdf"></i>}
                          <div>
                            <strong>{proofFile.name}</strong>
                            <small>{(proofFile.size / 1024).toFixed(1)} KB</small>
                          </div>
                          <button type="button" className="ep2-mini-btn ep2-mini-btn--danger" onClick={removeProofDocument}><i className="bi bi-x-lg"></i> Remove</button>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="pf-actions ep2-save-bar">
                    <span className="ep2-change-count">
                      {changedFields.length === 0 ? 'No unsaved changes'
                        : `${changedFields.length} unsaved change${changedFields.length > 1 ? 's' : ''}${approvalChanged.length ? ` · ${approvalChanged.length} need approval` : ''}${otpChanged.length ? ' · email code needed' : ''}`}
                    </span>
                    <div className="ep2-save-buttons">
                      <button type="button" className="pf-btn-secondary" onClick={discardChanges} disabled={!changedFields.length || saving}>Discard</button>
                      <button type="submit" className="pf-btn-primary" disabled={!changedFields.length || saving}>
                        <i className="bi bi-check2-circle"></i> Save Changes
                      </button>
                    </div>
                  </div>
                </form>

                {/* ---- Valid ID on file ---- */}
                <div className="section-header">
                  <div className="badge"><i className="bi bi-person-vcard"></i></div>
                  <div className="title">Valid ID on File</div>
                  <span className="ep2-section-rule"><i className="bi bi-shield-check"></i> Updates need admin approval</span>
                </div>
                <div className="ep2-id-card">
                  <div className="ep2-id-head">
                    <div>
                      <span className="ep2-id-label">Submitted ID Type</span>
                      <strong>{idOnFile?.valid_id || 'Not specified'}</strong>
                    </div>
                    {!pendingIdRequest && !idForm && (
                      <button type="button" className="ep2-mini-btn" onClick={openIdForm}><i className="bi bi-arrow-repeat"></i> Request ID Update</button>
                    )}
                  </div>
                  <div className="ep2-thumb-grid">
                    {ID_SLOTS.map(slot => (
                      <figure key={slot.key} className="ep2-thumb">
                        {idOnFile?.[slot.key] ? (
                          <a href={getProfilePhotoUrl(idOnFile[slot.key])} target="_blank" rel="noreferrer" title="Open full size">
                            <img src={getProfilePhotoUrl(idOnFile[slot.key])} alt={slot.label} />
                          </a>
                        ) : (
                          <div className="ep2-thumb-empty"><i className="bi bi-image"></i> No photo</div>
                        )}
                        <figcaption>{slot.label}</figcaption>
                      </figure>
                    ))}
                  </div>

                  {pendingIdRequest && (
                    <div className="ep2-id-pending">
                      <div className="ep2-id-pending-head">
                        <span className="ep2-pending-badge"><span></span> Pending Approval</span>
                        <span>New {pendingIdRequest.valid_id}{pendingIdRequest.created_at ? ` · submitted ${new Date(String(pendingIdRequest.created_at).replace(' ', 'T')).toLocaleDateString()}` : ''}</span>
                      </div>
                      <div className="ep2-thumb-grid">
                        {ID_SLOTS.map(slot => (
                          <figure key={slot.key} className="ep2-thumb">
                            <a href={getProfilePhotoUrl(pendingIdRequest[slot.key])} target="_blank" rel="noreferrer" title="Open full size">
                              <img src={getProfilePhotoUrl(pendingIdRequest[slot.key])} alt={`Requested ${slot.label}`} />
                            </a>
                            <figcaption>{slot.label}</figcaption>
                          </figure>
                        ))}
                      </div>
                      <p>Your current ID stays on file until an administrator approves this update.</p>
                      <button type="button" className="ep2-mini-btn ep2-mini-btn--danger" onClick={cancelIdRequest}><i className="bi bi-x-circle"></i> Cancel Request</button>
                    </div>
                  )}

                  {idForm && (
                    <div className="ep2-id-form">
                      <div className="form-group">
                        <label>New ID Type *</label>
                        <select value={idForm.valid_id} onChange={(e) => setIdForm(prev => ({ ...prev, valid_id: e.target.value }))}>
                          <option value="">-- Select ID Type --</option>
                          {ID_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                      <div className="ep2-thumb-grid">
                        {ID_SLOTS.map(slot => (
                          <div key={slot.key} className={`ep2-upload-tile ${idForm[slot.key] ? 'has-file' : ''}`}>
                            <div className="ep2-upload-preview">
                              {idForm[slot.key] ? <img src={idForm[slot.key].url} alt={slot.label} /> : <i className={`bi ${slot.key === 'holding' ? 'bi-person-bounding-box' : 'bi-person-vcard'}`}></i>}
                            </div>
                            <span className="ep2-upload-label">{slot.label} *</span>
                            <div className="ep2-upload-actions">
                              <label className="ep2-mini-btn">
                                <i className="bi bi-upload"></i> Upload
                                <input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; setIdSlotFile(slot.key, f); }} />
                              </label>
                              <button type="button" className="ep2-mini-btn" onClick={() => setCameraTarget(`id-${slot.key}`)}><i className="bi bi-camera"></i> Camera</button>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="ep2-id-form-actions">
                        <button type="button" className="pf-btn-secondary" onClick={closeIdForm} disabled={idSubmitting}>Cancel</button>
                        <button type="button" className="pf-btn-primary" onClick={submitIdRequest} disabled={idSubmitting}>
                          {idSubmitting ? 'Submitting...' : 'Submit for Approval'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* ---- Security ---- */}
                <div className="section-header">
                  <div className="badge"><i className="bi bi-key"></i></div>
                  <div className="title">Security</div>
                </div>
                <div className="ep2-security">
                  <div>
                    <strong>Password</strong>
                    <span>Use 8+ characters with an uppercase letter, a number, and a special character.</span>
                  </div>
                  <button type="button" className="pf-btn-secondary" onClick={() => setPasswordOpen(true)}><i className="bi bi-key"></i> Change Password</button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ---- Dialogs (portaled so they sit above the header) ---- */}
      {confirmOpen && createPortal(
        <div className="ep2-overlay">
          <form className="ep2-dialog" onSubmit={submitChanges} role="dialog" aria-modal="true" aria-labelledby="ep2-confirm-title">
            <div className="ep2-dialog-head">
              <div className="ep2-dialog-icon"><i className="bi bi-shield-lock"></i></div>
              <div>
                <h3 id="ep2-confirm-title">Confirm Your Changes</h3>
                <p>Enter your current password to save {changedFields.length} change{changedFields.length > 1 ? 's' : ''}.</p>
              </div>
              <button type="button" className="ep2-dialog-close" onClick={() => setConfirmOpen(false)} aria-label="Close"><i className="bi bi-x-lg"></i></button>
            </div>
            <ul className="ep2-change-list">
              {changedFields.map(k => (
                <li key={k}>
                  <span>{FIELD_LABELS[k] || k}</span>
                  <em className={APPROVAL_FIELDS.includes(k) ? 'is-approval' : OTP_FIELDS.includes(k) ? 'is-otp' : ''}>
                    {APPROVAL_FIELDS.includes(k) ? 'Admin approval' : OTP_FIELDS.includes(k) ? 'Email code' : 'Saved now'}
                  </em>
                </li>
              ))}
            </ul>
            <label className="ep2-dialog-label" htmlFor="ep2-confirm-password">Current Password</label>
            <input id="ep2-confirm-password" type="password" className="ep2-dialog-input" autoComplete="current-password" autoFocus
              value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
            <div className="ep2-dialog-actions">
              <button type="button" className="ep2-dialog-btn" onClick={() => setConfirmOpen(false)}>Cancel</button>
              <button type="submit" className="ep2-dialog-btn is-primary" disabled={saving}>{saving ? 'Saving...' : 'Confirm & Save'}</button>
            </div>
          </form>
        </div>,
        document.body
      )}

      {otpOpen && createPortal(
        <div className="ep2-overlay">
          <form className="ep2-dialog" onSubmit={verifyOtp} role="dialog" aria-modal="true" aria-labelledby="ep2-otp-title">
            <div className="ep2-dialog-head">
              <div className="ep2-dialog-icon"><i className="bi bi-envelope-check"></i></div>
              <div>
                <h3 id="ep2-otp-title">Enter Verification Code</h3>
                <p>We sent a 6-digit code to your current email address. It expires in 15 minutes.</p>
              </div>
              <button type="button" className="ep2-dialog-close" onClick={() => setOtpOpen(false)} aria-label="Close"><i className="bi bi-x-lg"></i></button>
            </div>
            <input type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000" autoFocus
              className="ep2-dialog-input ep2-otp-input" value={otpInput} onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, ''))} />
            <div className="ep2-dialog-actions">
              <button type="button" className="ep2-dialog-btn" onClick={() => setOtpOpen(false)}>Later</button>
              <button type="submit" className="ep2-dialog-btn is-primary">Verify</button>
            </div>
          </form>
        </div>,
        document.body
      )}

      {passwordOpen && createPortal(
        <div className="ep2-overlay">
          <form className="ep2-dialog" onSubmit={changePassword} role="dialog" aria-modal="true" aria-labelledby="ep2-pw-title">
            <div className="ep2-dialog-head">
              <div className="ep2-dialog-icon"><i className="bi bi-key"></i></div>
              <div>
                <h3 id="ep2-pw-title">Change Password</h3>
                <p>Use at least 8 characters with an uppercase letter, a number, and a special character (@$!%*?&).</p>
              </div>
              <button type="button" className="ep2-dialog-close" onClick={closePasswordDialog} aria-label="Close"><i className="bi bi-x-lg"></i></button>
            </div>
            {[
              ['currentPassword', 'Current Password', 'current-password'],
              ['newPassword', 'New Password', 'new-password'],
              ['confirmPassword', 'Confirm New Password', 'new-password']
            ].map(([key, label, ac]) => (
              <div key={key} className="ep2-dialog-field">
                <label className="ep2-dialog-label" htmlFor={`ep2-${key}`}>{label}</label>
                <input id={`ep2-${key}`} type="password" autoComplete={ac}
                  className={`ep2-dialog-input ${passwordErrors[key] ? 'is-error' : ''}`}
                  value={passwordData[key]} onChange={(e) => setPasswordData(prev => ({ ...prev, [key]: e.target.value }))} />
                {passwordErrors[key] && <span className="ep2-dialog-error">{passwordErrors[key]}</span>}
              </div>
            ))}
            <div className="ep2-dialog-actions">
              <button type="button" className="ep2-dialog-btn" onClick={closePasswordDialog}>Cancel</button>
              <button type="submit" className="ep2-dialog-btn is-primary">Update Password</button>
            </div>
          </form>
        </div>,
        document.body
      )}

      <Footer />
    </>
  );
}

export default EditProfile;
