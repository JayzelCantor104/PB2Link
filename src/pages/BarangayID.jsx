import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext'; 
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import Footer from '../components/Footer';
import Preloader from '../components/Preloader';
import Toast from '../components/Toast';
import IdOnFileCard from '../components/IdOnFileCard';
import PaymentSection from '../components/PaymentSection';
import useExtraQuestions from '../lib/useExtraQuestions';
import { useServiceTitle } from '../lib/builtinServices';
import { appendPayment, emptyPayment, fetchPaymentInfo, paymentProblem } from '../lib/payment';
import { verificationBlocker } from '../lib/residency';
import AddressCombobox from '../components/AddressCombobox';
import { reportInvalid } from '../lib/formErrors';
import '../styles/barangayDocuments.css'; 
import ProcessingNote from '../components/ProcessingNote';
import { expectUpdate } from '../lib/processingTimes';
import useFormDraft from '../lib/useFormDraft';

const API_BASE = '/api_backend';

const BarangayID = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);
  const [requestMode, setRequestMode] = useState('Self');
  // Heading and extra questions from Services Management (BuiltinServiceGate).
  const extra = useExtraQuestions(requestMode);
  const serviceTitle = useServiceTitle('Barangay ID Request');
  // Fee for this request (src/lib/payment.js, migration 020). Exemptions depend
  // on who the request is for, so it reloads when that changes.
  const [paymentInfo, setPaymentInfo] = useState(null);
  const [payment, setPayment] = useState(emptyPayment);
  useEffect(() => {
    if (!user?.user_id) return undefined;
    let cancelled = false;
    fetchPaymentInfo('barangay_id', requestMode)
      .then((info) => { if (!cancelled) { setPaymentInfo(info); setPayment(emptyPayment()); } })
      .catch(() => { if (!cancelled) setPaymentInfo(null); });
    return () => { cancelled = true; };
  }, [user, requestMode]);
  const [trackingCode, setTrackingCode] = useState('');
  const [toast, setToast] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState([]);
  // Registration ID + residency state (get_user_profile.php); the Barangay ID
  // serves as proof of residency, so the under-6-months rule applies.
  const [idOnFile, setIdOnFile] = useState(null);
  const [residency, setResidency] = useState(null);

  const [formData, setFormData] = useState({
    resident_id: '',
    fName: '', mName: '', lName: '', suffix: '',
    age: '', birth_date: '', civil_status: '', gender: '',
    block_lot: '', houseNo: '', street: '', subdivision: '', zone: '',
    years_in_PB2: '', precinct: '', sector: '', contact_num: '',
    height: '', weight: '', blood_type: '', birth_city: '', birth_province: '', tin_no: '',
    contact_person: '', contactp_num: '', contactp_relationship: '', emergency_address: '',
    
    other_fname: '', other_mname: '', other_lname: '', other_suffix: '',
    other_age: '', other_birth_date: '', other_gender: '', other_civil_status: '', other_sector: '',
    other_block_lot: '', other_houseNo: '', other_street: '', other_subdivision: '', other_zone: '',
    other_years_in_PB2: '', other_precinct: '', other_contact_num: '',
    
    id_picture: null, signature: null
  });

  // Keeps what the resident filled in through a refresh or the Back button
  // (src/lib/useFormDraft.jsx); cleared once the request is submitted.
  const draft = useFormDraft('barangay_id', { formData, requestMode, currentStep, extra: extra.answers, payment }, (d) => {
    if (d.formData) setFormData((prev) => ({ ...prev, ...d.formData }));
    if (d.requestMode) setRequestMode(d.requestMode);
    if (Number.isInteger(d.currentStep)) setCurrentStep(d.currentStep);
    if (d.extra) extra.restoreAnswers(d.extra);
    if (d.payment) setPayment((p) => ({ ...p, ...d.payment }));
  });


  useEffect(() => {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const randomHash = Math.random().toString(36).substring(2, 8).toUpperCase();
    setTrackingCode(`BID-${date}-${randomHash}`);
  }, []);

  useEffect(() => {
    if (user?.user_id) {
      fetch(`${API_BASE}/get_user_profile.php`, { credentials: 'include' })
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            setIdOnFile(data.id_on_file || null);
            setResidency(data.residency || null);
            const d = data.data;
            setFormData(prev => ({
              ...prev,
              resident_id: d.resident_id, 
              fName: d.fName || '',
              mName: d.mName || '',
              lName: d.lName || '',
              suffix: d.suffix || 'N/A',
              age: d.age || '',
              birth_date: d.birth_date || '',
              birth_city: d.birth_city || '',
              birth_province: d.birth_province || '',
              civil_status: d.civil_status || 'Single',
              gender: d.gender || '',
              block_lot: d.block_lot || '',
              houseNo: d.house_no || '',
              street: d.street || '',
              subdivision: d.subdivision || '',
              zone: d.zone || '',
              years_in_PB2: d.years_in_PB2 || '',
              precinct: d.precinct_no || 'N/A',
              sector: d.sector || 'N/A',
              contact_num: d.contact_num || '',
              tin_no: d.tin_no || ''
            }));
          }
        })
        .catch(err => console.error("Failed to fetch profile", err));
    }
  }, [user]);

  const calculateAge = (birth_date) => {
    const today = new Date();
    const birth = new Date(birth_date);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  };

  const getRequiredFields = () => {
    if (currentStep === 0) {
      return requestMode === 'Self' 
      ? [ 'fName', 'lName', 'age', 'birth_city', 'birth_province', 'gender', 'civil_status']:
        ['other_fname', 'other_lname', 'other_birth_date', 'other_gender', 'other_civil_status','other_birth_city', 'other_birth_province'];
    }
    if (currentStep === 1) {
      const baseFields = ['height', 'weight', 'blood_type', 'contact_person', 'contactp_num', 'contactp_relationship', 'emergency_address'];
      if (requestMode === 'Others') {
        return [...baseFields, 'other_block_lot', 'other_street', 'other_subdivision', 'other_years_in_PB2'];
      }
      return baseFields;
    }
    if (currentStep === 2) {
      return ['id_picture', 'signature'];
    }
    return [];
  };

  const validateStep = () => {
    const missing = getRequiredFields().filter(field => !formData[field]);
    return missing.length === 0;
  };

  const handleNext = () => {
    if (currentStep === 2 && requestMode === 'Self') {
      const blocker = verificationBlocker({ idOnFile, residency, requireResidency: true });
      if (blocker) { showToast('Verification Needed', blocker, 'error'); return; }
    }
    if (validateStep()) {
      setCurrentStep(prev => prev + 1);
      setErrors([]);
    } else {
      const missing = getRequiredFields().filter(field => !formData[field]);
      setErrors(missing);
      reportInvalid(showToast, 'Wait!');
    }
  };

  const showToast = (title, message, type = 'success') => {
    setToast({ title, message, type });
    setTimeout(() => setToast(null), 8000);
  };

  const handleSubmit = async () => {
    const payProblem = paymentProblem(paymentInfo, payment);
    if (payProblem) { showToast('Payment Needed', payProblem, 'error'); return; }
    // Extra questions staff added in Services Management (migration 031).
    const extraProblem = extra.check();
    if (extraProblem) { showToast('Additional Questions', extraProblem, 'error'); return; }

    setIsSubmitting(true);
    const data = new FormData();
    extra.append(data);
    appendPayment(data, paymentInfo, payment);
    
    data.append('user_id', user.user_id); 
    data.append('tracking_code', trackingCode);
    data.append('request_mode', requestMode);
    data.append('birth_date', formData.birth_date);
    data.append('birth_place', `${formData.birth_city}, ${formData.birth_province}`);
    data.append('height', formData.height);
    data.append('weight', formData.weight);
    data.append('blood_type', formData.blood_type);
    data.append('tin_no', formData.tin_no);
    data.append('contact_person', formData.contact_person);
    data.append('contactp_num', formData.contactp_num);
    data.append('contactp_relationship', formData.contactp_relationship);
    data.append('emergency_address', formData.emergency_address);
    data.append('id_picture', formData.id_picture);
    data.append('signature', formData.signature);

    const zoneSelf = formData.zone ? `, Zone ${formData.zone}` : '';
    const zoneOther = formData.other_zone ? `, Zone ${formData.other_zone}` : '';

    if (requestMode === 'Self') {
      data.append('fName', formData.fName);
      data.append('mName', formData.mName);
      data.append('lName', formData.lName);
      data.append('suffix', formData.suffix);
      data.append('birth_date', formData.birth_date);
      data.append('birth_place', `${formData.birth_city}, ${formData.birth_province}`);
      data.append('birth_province', formData.birth_province);
      data.append('gender', formData.gender);
      data.append('civil_status', formData.civil_status);
      data.append('sector', formData.sector);
      data.append('contact_num', formData.contact_num);
      data.append('years_in_PB2', formData.years_in_PB2);
      data.append('precinct_no', formData.precinct);
      data.append('address', `${formData.block_lot}, ${formData.street}, ${formData.subdivision}${zoneSelf}`);
      data.append('beneficiary_name', `${formData.fName} ${formData.lName}`);
    } else {
      data.append('fName', formData.other_fname);
      data.append('mName', formData.other_mname);
      data.append('lName', formData.other_lname);
      data.append('suffix', formData.other_suffix);
      data.append('birth_date', formData.other_birth_date);
      data.append('birth_place', `${formData.other_birth_city}, ${formData.other_birth_province}`);
      data.append('birth_province', formData.other_birth_province);
      data.append('gender', formData.other_gender);
      data.append('civil_status', formData.other_civil_status);
      data.append('sector', formData.other_sector);
      data.append('contact_num', formData.other_contact_num);
      data.append('years_in_PB2', formData.other_years_in_PB2);
      data.append('precinct_no', formData.other_precinct);
      data.append('address', `${formData.other_block_lot}, ${formData.other_street}, ${formData.other_subdivision}${zoneOther}`);
      data.append('beneficiary_name', `${formData.other_fname} ${formData.other_lname}`);
    }

    try {
      const response = await fetch(`${API_BASE}/submit_barangay_id.php`, { method: 'POST', body: data, credentials: 'include' });
      const result = await response.json();
      if (result.success) {
        draft.clear();
        showToast('Success!', `${result.message} ${expectUpdate('documents')}`, 'success');
        setTimeout(() => navigate('/services'), 2000);
      } else {
        showToast('Error', result.message, 'error');
        setIsSubmitting(false);
      }
    } catch (error) {
      showToast('Server Error', 'Invalid response from server.', 'error');
      setIsSubmitting(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    if (name === "other_birth_date") {
      const calculatedAge = calculateAge(value);
      setFormData(prev => ({
        ...prev,
        [name]: value,        
        other_age: calculatedAge 
      }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
    if (errors.includes(name)) setErrors(errors.filter(err => err !== name));
  };

  const handleFileChange = (e) => {
    const { name, files } = e.target;
    if (files && files[0]) {
      setFormData(prev => ({ ...prev, [name]: files[0] }));
      if (errors.includes(name)) setErrors(errors.filter(err => err !== name));
    }
  };

  const renderFilePreview = (fileKey, label, subLabel, iconClass) => {
    const file = formData[fileKey];
    const isError = errors.includes(fileKey);
    return (
      <div 
        className={`ep-file-upload-box ${file ? 'has-file' : ''} ${isError ? 'error-ring' : ''}`} 
        onClick={() => document.getElementById(fileKey).click()}
        title={`Click to upload your ${label}`}
        aria-label={`Upload box for ${label}`}
      >
        <input 
          type="file" 
          id={fileKey} 
          name={fileKey} 
          style={{ display: 'none' }} 
          onChange={handleFileChange} 
          accept="image/*" 
        />
        {!file ? (
          <div className="ep-upload-content">
            <i className={`bi ${iconClass} ep-upload-icon`}></i>
            <h4>{label} *</h4>
            <p>{subLabel}</p>
          </div>
        ) : (
          <div className="ep-preview-container">
            <i className="bi bi-check-circle-fill ep-preview-icon"></i>
            <span className="ep-file-name">{file.name}</span>
            <span className="ep-file-change">Click to change file</span>
          </div>
        )}
      </div>
    );
  };

  const steps = [
    { label: 'Identity', icon: 'bi-person-badge' },
    { label: 'Details', icon: 'bi-card-list' },
    { label: 'Uploads', icon: 'bi-camera-fill' },
    { label: 'Review', icon: 'bi-clipboard2-check-fill' }
  ];

  return (
    <>
      <Preloader />
      <Header />
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css" />
      
      <Toast toast={toast} onClose={() => setToast(null)} />

      <div className="ep-page-wrapper">
        <div className="ep-form-card">
          <div className="ep-form-header">
            <h1>{serviceTitle}</h1>
            <div className="ep-badge-official"><i className="bi bi-shield-check"></i> Document Request</div>
          </div>

          {draft.notice}
          <div className="ep-stepper-container">
            <div className="ep-stepper" aria-label="Progress Stepper">
              <div className="ep-progress-bg"></div>
              <div className="ep-progress-fill" style={{ width: `${(currentStep / 3) * 90 + 5}%` }}></div>
              {steps.map((step, idx) => (
                <div key={idx} className={`ep-step-item ${idx === currentStep ? 'active' : ''} ${idx < currentStep ? 'completed' : ''}`}>
                  <div className="ep-step-circle"><i className={`bi ${step.icon}`}></i></div>
                  <div className="ep-step-label">{step.label}</div>
                </div>
              ))}
            </div>
          </div>

          <form onSubmit={(e) => e.preventDefault()}>
            {currentStep === 0 && (
              <div className="slide-in">
                <div className="ep-toggle-wrapper">
                  <span className="ep-toggle-label" id="mode-label">Who is this request for?</span>
                  <div
                    className="ep-toggle-container"
                    role="group"
                    aria-labelledby="mode-label"
                  >
                    <button type="button" aria-pressed={requestMode === 'Self'} className={`ep-toggle-option ${requestMode === 'Self' ? 'active' : ''}`}
                      onClick={() => { setRequestMode('Self'); setErrors([]); }}>Myself</button>
                    <button type="button" aria-pressed={requestMode === 'Others'} className={`ep-toggle-option ${requestMode === 'Others' ? 'active' : ''}`}
                      onClick={() => { setRequestMode('Others'); setErrors([]); }}>Someone Else</button>
                    <div className="ep-toggle-slider" style={{ transform: requestMode === 'Self' ? 'translateX(0)' : 'translateX(100%)' }}></div>
                  </div>
                </div>

                <h2 className="ep-section-title"><i className="bi bi-person-bounding-box"></i> {requestMode === 'Self' ? 'Your Information' : 'Beneficiary Details'}</h2>
                <div className="ep-grid">
                  {requestMode === 'Self' ? (
                    <>
                      <div className="ep-input-group"><label htmlFor="barangayID-f1">First Name</label><input id="barangayID-f1" type="text" value={formData.fName} readOnly title="Locked Field" /></div>
                      <div className="ep-input-group"><label htmlFor="barangayID-f3">Middle Name</label><input id="barangayID-f3" type="text" value={formData.mName} readOnly title="Locked Field" /></div>
                      <div className="ep-input-group"><label htmlFor="barangayID-f5">Last Name</label><input id="barangayID-f5" type="text" value={formData.lName} readOnly title="Locked Field" /></div>
                      <div className="ep-input-group"><label htmlFor="barangayID-f7">Age</label><input id="barangayID-f7" type="text" value={formData.age} readOnly title="Locked Field" /></div>
                      <div className="ep-input-group"><label htmlFor="barangayID-f9">Birth City</label><input id="barangayID-f9" type="text" value={formData.birth_city} readOnly title="Locked Field" /></div>
                      <div className="ep-input-group"><label htmlFor="barangayID-f11">Birth Province</label><input id="barangayID-f11" type="text" value={formData.birth_province} readOnly title="Locked Field" /></div>
                      <div className="ep-input-group"><label htmlFor="barangayID-f13">Gender</label><input id="barangayID-f13" type="text" value={formData.gender} readOnly title="Locked Field" /></div>
                      <div className="ep-input-group"><label htmlFor="barangayID-f15">Civil Status</label><input id="barangayID-f15" type="text" value={formData.civil_status} readOnly title="Locked Field" /></div>
                      
                    </>
                  ) : (
                    <>
                      <div className="ep-input-group"><label htmlFor="barangayID-other_fname">First Name *</label><input id="barangayID-other_fname" type="text" name="other_fname" onChange={handleInputChange} className={errors.includes('other_fname') ? 'error-ring' : ''} aria-invalid={errors.includes('other_fname') || undefined} value={formData.other_fname} title="Enter Beneficiary First Name" /></div>
                      <div className="ep-input-group"><label htmlFor="barangayID-other_mname">Middle Name </label><input id="barangayID-other_mname" type="text" name="other_mname" onChange={handleInputChange} value={formData.other_mname} title="Enter Beneficiary Middle Name" /></div>
                      <div className="ep-input-group"><label htmlFor="barangayID-other_lname">Last Name *</label><input id="barangayID-other_lname" type="text" name="other_lname" onChange={handleInputChange} className={errors.includes('other_lname') ? 'error-ring' : ''} aria-invalid={errors.includes('other_lname') || undefined} value={formData.other_lname} title="Enter Beneficiary Last Name" /></div>
                      <div className="ep-input-group"><label htmlFor="barangayID-other_birth_date">Birthdate *</label><input id="barangayID-other_birth_date" type="date" name="other_birth_date" value={formData.other_birth_date} onChange={handleInputChange} className={errors.includes('other_birth_date') ? 'error-ring' : ''} aria-invalid={errors.includes('other_birth_date') || undefined} title="Select Birthdate" /></div>
                      <div className="ep-input-group"><label htmlFor="barangayID-other_birth_city">Birth City *</label><input id="barangayID-other_birth_city" type="text" name="other_birth_city"  onChange={handleInputChange} value={formData.other_birth_city} className={errors.includes('other_birth_city') ? 'error-ring' : ''} aria-invalid={errors.includes('other_birth_city') || undefined} title="City of Birth" /></div>
                      <div className="ep-input-group"><label htmlFor="barangayID-other_birth_province">Birth Province *</label><input id="barangayID-other_birth_province" type="text" name="other_birth_province"  onChange={handleInputChange} value={formData.other_birth_province} className={errors.includes('other_birth_province') ? 'error-ring' : ''} aria-invalid={errors.includes('other_birth_province') || undefined} title="Province of Birth" /></div>
                      <div className="ep-input-group"><label htmlFor="barangayID-other_gender">Gender *</label><select id="barangayID-other_gender" name="other_gender" value={formData.other_gender} onChange={handleInputChange} className={errors.includes('other_gender') ? 'error-ring' : ''} aria-invalid={errors.includes('other_gender') || undefined}><option value="">Select</option><option value="Male">Male</option><option value="Female">Female</option></select></div>
                      <div className="ep-input-group"><label htmlFor="barangayID-other_civil_status">Civil Status *</label><select id="barangayID-other_civil_status" name="other_civil_status" value={formData.other_civil_status} onChange={handleInputChange} className={errors.includes('other_civil_status') ? 'error-ring' : ''} aria-invalid={errors.includes('other_civil_status') || undefined}><option value="">Select</option><option value="Single">Single</option><option value="Married">Married</option><option value="Widowed">Widowed</option><option value="Separated">Separated</option></select></div>
                    </>
                  )}
                
                </div>
              </div>
            )}

            {currentStep === 1 && (
              <div className="slide-in">
                <h2 className="ep-section-title"><i className="bi bi-card-list"></i> Physical, Address & Emergency Details</h2>
                <div className="ep-grid">
                  <div className="ep-input-group"><label htmlFor="barangayID-height">Height (cm) *</label><input id="barangayID-height" type="text" name="height" value={formData.height} onChange={handleInputChange} className={errors.includes('height') ? 'error-ring' : ''} aria-invalid={errors.includes('height') || undefined} title="Enter Height" /></div>
                  <div className="ep-input-group"><label htmlFor="barangayID-weight">Weight (kg) *</label><input id="barangayID-weight" type="text" name="weight" value={formData.weight} onChange={handleInputChange} className={errors.includes('weight') ? 'error-ring' : ''} aria-invalid={errors.includes('weight') || undefined} title="Enter Weight" /></div>
                  <div className="ep-input-group"><label htmlFor="barangayID-blood_type">Blood Type *</label><input id="barangayID-blood_type" type="text" name="blood_type" value={formData.blood_type} onChange={handleInputChange} className={errors.includes('blood_type') ? 'error-ring' : ''} aria-invalid={errors.includes('blood_type') || undefined} title="Ex: O+, A-" /></div>
                  <div className="ep-input-group"><label htmlFor="barangayID-tin_no">TIN No.</label><input id="barangayID-tin_no" type="text" name="tin_no" value={formData.tin_no} onChange={handleInputChange} title="Tax Identification Number" /></div>
                  
                  {requestMode === 'Self' ? (
                    <div className="ep-input-group ep-full">
                      <label htmlFor="barangayID-f29">Registered Address</label>
                      <input id="barangayID-f29" type="text" value={`${formData.block_lot}, ${formData.street}, ${formData.subdivision}, Zone ${formData.zone}`} readOnly title="Your current registered address (Locked)" />
                    </div>
                  ) : (
                    <>
                      <div className="ep-input-group"><label htmlFor="barangayID-other_block_lot">Block/Lot *</label><input id="barangayID-other_block_lot" type="text" name="other_block_lot" value={formData.other_block_lot} onChange={handleInputChange} className={errors.includes('other_block_lot') ? 'error-ring' : ''} aria-invalid={errors.includes('other_block_lot') || undefined} placeholder="Blk 1 Lot 2" /></div>
                      <div className="ep-input-group"><label htmlFor="barangayID-other_subdivision">Subdivision *</label><AddressCombobox id="barangayID-other_subdivision" kind="subdivision" name="other_subdivision" value={formData.other_subdivision} onChange={handleInputChange} className={errors.includes('other_subdivision') ? 'error-ring' : ''} placeholder="Subdivision Name" /></div>
                      <div className="ep-input-group"><label htmlFor="barangayID-other_street">Street *</label><AddressCombobox id="barangayID-other_street" kind="street" subdivision={formData.other_subdivision} name="other_street" value={formData.other_street} onChange={handleInputChange} className={errors.includes('other_street') ? 'error-ring' : ''} placeholder="Street Name" /></div>
                      <div className="ep-input-group"><label htmlFor="barangayID-other_zone">Zone</label><input id="barangayID-other_zone" type="text" name="other_zone" value={formData.other_zone} onChange={handleInputChange} placeholder="Zone No." /></div>
                      <div className="ep-input-group"><label htmlFor="barangayID-other_years_in_PB2">Years of Residency *</label><input id="barangayID-other_years_in_PB2" type="text" name="other_years_in_PB2" value={formData.other_years_in_PB2} onChange={handleInputChange} className={errors.includes('other_years_in_PB2') ? 'error-ring' : ''} aria-invalid={errors.includes('other_years_in_PB2') || undefined} placeholder="Ex: 5" /></div>
                      <div className="ep-input-group"><label htmlFor="barangayID-other_precinct">Precinct No. (Optional)</label><input id="barangayID-other_precinct" type="text" name="other_precinct" value={formData.other_precinct} onChange={handleInputChange} placeholder="Precinct No." /></div>
                    </>
                  )}

                  <div className="ep-input-group"><label htmlFor="barangayID-contact_person">Emergency Contact Person *</label><input id="barangayID-contact_person" type="text" name="contact_person" value={formData.contact_person} onChange={handleInputChange} className={errors.includes('contact_person') ? 'error-ring' : ''} aria-invalid={errors.includes('contact_person') || undefined} title="Full Name of Contact" /></div>
                  <div className="ep-input-group"><label htmlFor="barangayID-contactp_num">Emergency Contact No. *</label><input id="barangayID-contactp_num" type="text" name="contactp_num" value={formData.contactp_num} onChange={handleInputChange} className={errors.includes('contactp_num') ? 'error-ring' : ''} aria-invalid={errors.includes('contactp_num') || undefined} title="Phone number" /></div>
                  <div className="ep-input-group"><label htmlFor="barangayID-contactp_relationship">Relationship *</label><input id="barangayID-contactp_relationship" type="text" name="contactp_relationship" value={formData.contactp_relationship} onChange={handleInputChange} className={errors.includes('contactp_relationship') ? 'error-ring' : ''} aria-invalid={errors.includes('contactp_relationship') || undefined} title="Relationship to you" /></div>
                  <div className="ep-input-group ep-full"><label htmlFor="barangayID-emergency_address">Emergency Address *</label><input id="barangayID-emergency_address" type="text" name="emergency_address" value={formData.emergency_address} onChange={handleInputChange} className={errors.includes('emergency_address') ? 'error-ring' : ''} aria-invalid={errors.includes('emergency_address') || undefined} title="Home address of emergency contact" /></div>
                </div>
              </div>
            )}

            {currentStep === 2 && (
              <div className="slide-in">
                <h2 className="ep-section-title"><i className="bi bi-camera-fill"></i> ID Requirements</h2>
                {requestMode === 'Self' && (
                  <div style={{ marginBottom: '20px' }}>
                    <IdOnFileCard idOnFile={idOnFile} residency={residency} requireResidency onResidencyChange={setResidency} showToast={showToast} />
                  </div>
                )}
                <div className="ep-grid">
                  {renderFilePreview('id_picture', 'Upload 2x2 ID Photo', 'Clear front view photo with white background', 'bi-person-square')}
                  {renderFilePreview('signature', 'Upload Digital Signature', 'Clear image of wet signature on white paper', 'bi-pen-fill')}
                </div>
              </div>
            )}

            {currentStep === 3 && (
              <div className="slide-in">
                <div className="ep-review-box" aria-live="polite">
                  <h2 className="ep-section-title" style={{ border: 'none', marginBottom: '5px' }}>
                    <i className="bi bi-file-earmark-text text-success me-2"></i> Review & Submit Request
                  </h2>
                  
                  <div className="ep-review-category">
                    <h4>Request Details</h4>
                    <div className="ep-review-row">
                      <span className="ep-review-label">Tracking Code</span>
                      <span className="ep-review-val highlight">{trackingCode}</span>
                    </div>
                  </div>

                  <div className="ep-review-category">
                    <h4>Personal Details</h4>
                    <div className="ep-review-row">
                      <span className="ep-review-label">Requested For</span>
                      <span className="ep-review-val">{requestMode === 'Self' ? 'Myself' : 'Someone Else'}</span>
                    </div>
                    <div className="ep-review-row">
                      <span className="ep-review-label">Full Name</span>
                      <span className="ep-review-val">
                        {requestMode === 'Self' 
                          ? `${formData.fName} ${formData.mName} ${formData.lName} ${formData.suffix !== 'N/A' ? formData.suffix : ''}`.toUpperCase() 
                          : `${formData.other_fname} ${formData.other_mname} ${formData.other_lname} ${formData.other_suffix}`.toUpperCase()}
                      </span>
                    </div>
                    <div className="ep-review-row">
                      <span className="ep-review-label">Age</span>
                      <span className="ep-review-val">{requestMode === 'Self' ? formData.age : formData.other_age}</span>
                    </div>
                    <div className="ep-review-row">
                      <span className="ep-review-label">Date of Birth</span>
                      <span className="ep-review-val">{requestMode === 'Self' ? formData.birth_date : formData.other_birth_date}</span>
                    </div>
                    <div className="ep-review-row">
                      <span className="ep-review-label">Place of Birth</span>
                      <span className="ep-review-val">{requestMode === 'Self' ? `${formData.birth_city}, ${formData.birth_province}` : `${formData.other_birth_city}, ${formData.other_birth_province}`}</span>
                    </div>
                    <div className="ep-review-row">
                      <span className="ep-review-label">Sex</span>
                      <span className="ep-review-val">{requestMode === 'Self' ? formData.gender : formData.other_gender}</span>
                    </div>
                    <div className="ep-review-row">
                      <span className="ep-review-label">Height / Weight</span>
                      <span className="ep-review-val">{formData.height} cm / {formData.weight} kg</span>
                    </div>
                    <div className="ep-review-row">
                      <span className="ep-review-label">Blood Type</span>
                      <span className="ep-review-val">{formData.blood_type}</span>
                    </div>
                  </div>

                  <div className="ep-review-category">
                    <h4>Address & Sector</h4>
                    <div className="ep-review-row">
                      <span className="ep-review-label">Address</span>
                      <span className="ep-review-val">
                        {requestMode === 'Self' 
                          ? `${formData.block_lot}, ${formData.street}, ${formData.subdivision}, Zone ${formData.zone}` 
                          : `${formData.other_block_lot}, ${formData.other_street}, ${formData.other_subdivision}, ${formData.other_zone}`}
                      </span>
                    </div>
                    <div className="ep-review-row">
                      <span className="ep-review-label">Years of Residency</span>
                      <span className="ep-review-val">{requestMode === 'Self' ? formData.years_in_PB2 : formData.other_years_in_PB2}</span>
                    </div>
                  </div>

                  <div className="ep-review-category">
                    <h4>Emergency Contact</h4>
                    <div className="ep-review-row">
                      <span className="ep-review-label">Contact Person</span>
                      <span className="ep-review-val">{formData.contact_person} ({formData.contactp_relationship})</span>
                    </div>
                    <div className="ep-review-row">
                      <span className="ep-review-label">Contact Number</span>
                      <span className="ep-review-val">{formData.contactp_num}</span>
                    </div>
                  </div>

                  <div className="ep-info-note">
                    <i className="bi bi-info-circle"></i> 
                    <h5>Your request will be sent to the Barangay Admin for approval. You will get an email notification once your Barangay ID is ready for pick up.</h5>
                  </div>
                </div>
              </div>
            )}

            {currentStep === 3 && extra.section}
            {currentStep === 3 && (
              <PaymentSection info={paymentInfo} value={payment} onChange={setPayment} onError={(msg) => showToast('File Not Accepted', msg, 'error')} />
            )}

            {currentStep === 3 && <ProcessingNote kind="documents" />}

            <div className="ep-actions">
              <button type="button" className="ep-btn ep-btn-prev" disabled={currentStep === 0} onClick={() => { setCurrentStep(prev => prev - 1); setErrors([]); }}>
                <i className="bi bi-arrow-left"></i> Back
              </button>
              <button 
                type="button" 
                className="ep-btn ep-btn-next" 
                onClick={currentStep === 3 ? handleSubmit : handleNext}
                disabled={isSubmitting}
                title={currentStep === 3 ? "Submit Application" : "Go to Next Step"}
              >
                {currentStep === 3 ? (isSubmitting ? 'Submitting...' : 'Confirm & Submit') : 'Continue'}
                <i className={currentStep === 3 ? (isSubmitting ? "bi bi-hourglass-split" : "bi bi-send-fill") : "bi bi-arrow-right"}></i>
              </button>
            </div>
          </form>
        </div>
      </div>
      <Footer />
    </>
  );
};

export default BarangayID;