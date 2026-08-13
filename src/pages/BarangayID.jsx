import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext'; 
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import Footer from '../components/Footer';
import Preloader from '../components/Preloader';
import '../styles/barangayDocuments.css'; 

const API_BASE = '/api_backend';

const BarangayID = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);
  const [requestMode, setRequestMode] = useState('Self');
  const [trackingCode, setTrackingCode] = useState('');
  const [toast, setToast] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState([]);

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

  useEffect(() => {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const randomHash = Math.random().toString(36).substring(2, 8).toUpperCase();
    setTrackingCode(`BID-${date}-${randomHash}`);
  }, []);

  useEffect(() => {
    if (user?.user_id) {
      fetch(`${API_BASE}/get_user_profile.php?user_id=${user.user_id}`)
        .then(res => res.json())
        .then(data => {
          if (data.success) {
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
    if (validateStep()) {
      setCurrentStep(prev => prev + 1);
      setErrors([]);
    } else {
      const missing = getRequiredFields().filter(field => !formData[field]);
      setErrors(missing);
      showToast('Wait!', 'Please fill up all required fields marked in red.', 'error');
    }
  };

  const showToast = (title, message, type = 'success') => {
    setToast({ title, message, type });
    setTimeout(() => setToast(null), 8000);
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    const data = new FormData();
    
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
      const response = await fetch(`${API_BASE}/submit_barangay_id.php`, { method: 'POST', body: data });
      const result = await response.json();
      if (result.success) {
        showToast('Success!', result.message, 'success');
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
      
      {toast && (
        <div className={`ep-toast ${toast.type}`} role="alert">
          <i className={`bi ${toast.type === 'error' ? 'bi-exclamation-circle-fill' : 'bi-check-circle-fill'} ep-toast-icon`}></i>
          <div>
            <h4>{toast.title}</h4>
            <p>{toast.message}</p>
          </div>
        </div>
      )}

      <div className="ep-page-wrapper">
        <div className="ep-form-card">
          <div className="ep-form-header">
            <h2>Barangay ID Request</h2>
            <div className="ep-badge-official"><i className="bi bi-shield-check"></i> Official Document Portal</div>
          </div>

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
                    onClick={() => {
                      setRequestMode(requestMode === 'Self' ? 'Others' : 'Self');
                      setErrors([]);
                    }}
                    role="button"
                    tabIndex="0"
                    aria-labelledby="mode-label"
                    title="Click to toggle between requesting for yourself or someone else"
                  >
                    <div className={`ep-toggle-option ${requestMode === 'Self' ? 'active' : ''}`}>Myself</div>
                    <div className={`ep-toggle-option ${requestMode === 'Others' ? 'active' : ''}`}>Someone Else</div>
                    <div className="ep-toggle-slider" style={{ transform: requestMode === 'Self' ? 'translateX(0)' : 'translateX(100%)' }}></div>
                  </div>
                </div>

                <h4 className="ep-section-title"><i className="bi bi-person-bounding-box"></i> {requestMode === 'Self' ? 'Your Information' : 'Beneficiary Details'}</h4>
                <div className="ep-grid">
                  {requestMode === 'Self' ? (
                    <>
                      <div className="ep-input-group"><label>First Name</label><input type="text" value={formData.fName} readOnly title="Locked Field" /></div>
                      <div className="ep-input-group"><label>Middle Name</label><input type="text" value={formData.mName} readOnly title="Locked Field" /></div>
                      <div className="ep-input-group"><label>Last Name</label><input type="text" value={formData.lName} readOnly title="Locked Field" /></div>
                      <div className="ep-input-group"><label>Age</label><input type="text" value={formData.age} readOnly title="Locked Field" /></div>
                      <div className="ep-input-group"><label>Birth City</label><input type="text" value={formData.birth_city} readOnly title="Locked Field" /></div>
                      <div className="ep-input-group"><label>Birth Province</label><input type="text" value={formData.birth_province} readOnly title="Locked Field" /></div>
                      <div className="ep-input-group"><label>Gender</label><input type="text" value={formData.gender} readOnly title="Locked Field" /></div>
                      <div className="ep-input-group"><label>Civil Status</label><input type="text" value={formData.civil_status} readOnly title="Locked Field" /></div>
                      
                    </>
                  ) : (
                    <>
                      <div className="ep-input-group"><label>First Name *</label><input type="text" name="other_fname" onChange={handleInputChange} className={errors.includes('other_fname') ? 'error-ring' : ''} value={formData.other_fname} title="Enter Beneficiary First Name" /></div>
                      <div className="ep-input-group"><label>Middle Name </label><input type="text" name="other_mname" onChange={handleInputChange} value={formData.other_mname} title="Enter Beneficiary Middle Name" /></div>
                      <div className="ep-input-group"><label>Last Name *</label><input type="text" name="other_lname" onChange={handleInputChange} className={errors.includes('other_lname') ? 'error-ring' : ''} value={formData.other_lname} title="Enter Beneficiary Last Name" /></div>
                      <div className="ep-input-group"><label>Birthdate *</label><input type="date" name="other_birth_date" value={formData.other_birth_date} onChange={handleInputChange} className={errors.includes('other_birth_date') ? 'error-ring' : ''} title="Select Birthdate" /></div>
                      <div className="ep-input-group"><label>Birth City *</label><input type="text" name="other_birth_city"  onChange={handleInputChange} value={formData.other_birth_city} className={errors.includes('other_birth_city') ? 'error-ring' : ''} title="City of Birth" /></div>
                      <div className="ep-input-group"><label>Birth Province *</label><input type="text" name="other_birth_province"  onChange={handleInputChange} value={formData.other_birth_province} className={errors.includes('other_birth_province') ? 'error-ring' : ''} title="Province of Birth" /></div>
                      <div className="ep-input-group"><label>Gender *</label><select name="other_gender" value={formData.other_gender} onChange={handleInputChange} className={errors.includes('other_gender') ? 'error-ring' : ''}><option value="">Select</option><option value="Male">Male</option><option value="Female">Female</option></select></div>
                      <div className="ep-input-group"><label>Civil Status *</label><select name="other_civil_status" value={formData.other_civil_status} onChange={handleInputChange} className={errors.includes('other_civil_status') ? 'error-ring' : ''}><option value="">Select</option><option value="Single">Single</option><option value="Married">Married</option><option value="Widowed">Widowed</option><option value="Separated">Separated</option></select></div>
                    </>
                  )}
                
                </div>
              </div>
            )}

            {currentStep === 1 && (
              <div className="slide-in">
                <h4 className="ep-section-title"><i className="bi bi-card-list"></i> Physical, Address & Emergency Details</h4>
                <div className="ep-grid">
                  <div className="ep-input-group"><label>Height (cm) *</label><input type="text" name="height" value={formData.height} onChange={handleInputChange} className={errors.includes('height') ? 'error-ring' : ''} title="Enter Height" /></div>
                  <div className="ep-input-group"><label>Weight (kg) *</label><input type="text" name="weight" value={formData.weight} onChange={handleInputChange} className={errors.includes('weight') ? 'error-ring' : ''} title="Enter Weight" /></div>
                  <div className="ep-input-group"><label>Blood Type *</label><input type="text" name="blood_type" value={formData.blood_type} onChange={handleInputChange} className={errors.includes('blood_type') ? 'error-ring' : ''} title="Ex: O+, A-" /></div>
                  <div className="ep-input-group"><label>TIN No.</label><input type="text" name="tin_no" value={formData.tin_no} onChange={handleInputChange} title="Tax Identification Number" /></div>
                  
                  {requestMode === 'Self' ? (
                    <div className="ep-input-group ep-full">
                      <label>Registered Address</label>
                      <input type="text" value={`${formData.block_lot}, ${formData.street}, ${formData.subdivision}, Zone ${formData.zone}`} readOnly title="Your current registered address (Locked)" />
                    </div>
                  ) : (
                    <>
                      <div className="ep-input-group"><label>Block/Lot *</label><input type="text" name="other_block_lot" value={formData.other_block_lot} onChange={handleInputChange} className={errors.includes('other_block_lot') ? 'error-ring' : ''} placeholder="Blk 1 Lot 2" /></div>
                      <div className="ep-input-group"><label>Street *</label><input type="text" name="other_street" value={formData.other_street} onChange={handleInputChange} className={errors.includes('other_street') ? 'error-ring' : ''} placeholder="Street Name" /></div>
                      <div className="ep-input-group"><label>Subdivision *</label><input type="text" name="other_subdivision" value={formData.other_subdivision} onChange={handleInputChange} className={errors.includes('other_subdivision') ? 'error-ring' : ''} placeholder="Subdivision Name" /></div>
                      <div className="ep-input-group"><label>Zone</label><input type="text" name="other_zone" value={formData.other_zone} onChange={handleInputChange} placeholder="Zone No." /></div>
                      <div className="ep-input-group"><label>Years of Residency *</label><input type="text" name="other_years_in_PB2" value={formData.other_years_in_PB2} onChange={handleInputChange} className={errors.includes('other_years_in_PB2') ? 'error-ring' : ''} placeholder="Ex: 5" /></div>
                      <div className="ep-input-group"><label>Precinct No. (Optional)</label><input type="text" name="other_precinct" value={formData.other_precinct} onChange={handleInputChange} placeholder="Precinct No." /></div>
                    </>
                  )}

                  <div className="ep-input-group"><label>Emergency Contact Person *</label><input type="text" name="contact_person" value={formData.contact_person} onChange={handleInputChange} className={errors.includes('contact_person') ? 'error-ring' : ''} title="Full Name of Contact" /></div>
                  <div className="ep-input-group"><label>Emergency Contact No. *</label><input type="text" name="contactp_num" value={formData.contactp_num} onChange={handleInputChange} className={errors.includes('contactp_num') ? 'error-ring' : ''} title="Phone number" /></div>
                  <div className="ep-input-group"><label>Relationship *</label><input type="text" name="contactp_relationship" value={formData.contactp_relationship} onChange={handleInputChange} className={errors.includes('contactp_relationship') ? 'error-ring' : ''} title="Relationship to you" /></div>
                  <div className="ep-input-group ep-full"><label>Emergency Address *</label><input type="text" name="emergency_address" value={formData.emergency_address} onChange={handleInputChange} className={errors.includes('emergency_address') ? 'error-ring' : ''} title="Home address of emergency contact" /></div>
                </div>
              </div>
            )}

            {currentStep === 2 && (
              <div className="slide-in">
                <h4 className="ep-section-title"><i className="bi bi-camera-fill"></i> ID Requirements</h4>
                <div className="ep-grid">
                  {renderFilePreview('id_picture', 'Upload 2x2 ID Photo', 'Clear front view photo with white background', 'bi-person-square')}
                  {renderFilePreview('signature', 'Upload Digital Signature', 'Clear image of wet signature on white paper', 'bi-pen-fill')}
                </div>
              </div>
            )}

            {currentStep === 3 && (
              <div className="slide-in">
                <div className="ep-review-box" aria-live="polite">
                  <h4 className="ep-section-title" style={{ border: 'none', marginBottom: '5px' }}>
                    <i className="bi bi-file-earmark-text text-success me-2"></i> Review & Submit Request
                  </h4>
                  
                  <div className="ep-review-category">
                    <h4>System Details</h4>
                    <div className="ep-review-row">
                      <span className="ep-review-label">Tracking Number</span>
                      <span className="ep-review-val highlight">{trackingCode}</span>
                    </div>
                  </div>

                  <div className="ep-review-category">
                    <h4>Identity Details</h4>
                    <div className="ep-review-row">
                      <span className="ep-review-label">Request For</span>
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
                      <span className="ep-review-label">Birthdate</span>
                      <span className="ep-review-val">{requestMode === 'Self' ? formData.birth_date : formData.other_birth_date}</span>
                    </div>
                    <div className="ep-review-row">
                      <span className="ep-review-label">Birthplace</span>
                      <span className="ep-review-val">{requestMode === 'Self' ? `${formData.birth_city}, ${formData.birth_province}` : `${formData.other_birth_city}, ${formData.other_birth_province}`}</span>
                    </div>
                    <div className="ep-review-row">
                      <span className="ep-review-label">Gender</span>
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
                    <h4>Location & Group</h4>
                    <div className="ep-review-row">
                      <span className="ep-review-label">Complete Address</span>
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