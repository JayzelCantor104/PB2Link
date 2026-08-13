import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext'; 
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import Footer from '../components/Footer';
import Preloader from '../components/Preloader';
import '../styles/barangayDocuments.css'; 

const API_BASE = '/api_backend';

const BarangayClearance = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);
  const [requestMode, setRequestMode] = useState('Self');
  const [trackingCode, setTrackingCode] = useState('');
  const [toast, setToast] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState([]); // Array tracking empty required fields for red highlighting

  const [formData, setFormData] = useState({
    fName: '', mName: '', lName: '', suffix: '',
    age: '', birth_date: '', civil_status: '', gender: '',
    block_lot: '', houseNo: '', street: '', subdivision: '', zone: '',
    years_in_PB2: '', precinct: '', sector: '',
    purpose: '', otherPurposeText: '',
    other_fname: '', other_mname: '', other_lname: '', other_suffix: '',
    other_age: '', other_birth_date: '', other_gender: '', other_civil_status: '', other_sector: '',
    other_block_lot: '', other_houseNo: '', other_street: '', 
    other_subdivision: '', other_zone: '', other_years_in_PB2: '', 
    other_precinct: '',
    id_front: null, id_back: null, id_holding: null
  });

  useEffect(() => {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const randomHash = Math.random().toString(36).substring(2, 8).toUpperCase();
    setTrackingCode(`CLR-${date}-${randomHash}`);
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
              civil_status: d.civil_status || 'Single',
              gender: d.gender || '',
              block_lot: d.block_lot || '',
              houseNo: d.house_no || '',
              street: d.street || '',
              subdivision: d.subdivision || '',
              zone: d.zone || '',
              years_in_PB2: d.years_in_PB2 || '',
              precinct: d.precinct_no || 'N/A',
              sector: d.sector || 'N/A'
            }));
          }
        })
        .catch(err => console.error("Failed to fetch profile", err));
    }
  }, [user]);

  // Evaluates step and identifies missing entries precisely
  const getMissingFields = () => {
    const missing = [];
    if (currentStep === 0) {
      if (!formData.purpose) missing.push('purpose');
      if (formData.purpose === 'Other' && !formData.otherPurposeText) missing.push('otherPurposeText');
      if (requestMode === 'Others') {
        if (!formData.other_fname) missing.push('other_fname');
        if (!formData.other_lname) missing.push('other_lname');
        if (!formData.other_birth_date) missing.push('other_birth_date');
        if (!formData.other_gender) missing.push('other_gender');
        if (!formData.other_civil_status) missing.push('other_civil_status');
      }
    }
    if (currentStep === 1) {
      if (requestMode === 'Others') {
        if (!formData.other_block_lot) missing.push('other_block_lot');
        if (!formData.other_street) missing.push('other_street');
        if (!formData.other_subdivision) missing.push('other_subdivision');
        if (!formData.other_years_in_PB2) missing.push('other_years_in_PB2');
      }
    }
    if (currentStep === 2) {
      if (!formData.id_front) missing.push('id_front');
      if (!formData.id_back) missing.push('id_back');
      if (!formData.id_holding) missing.push('id_holding');
    }
    return missing;
  };

  const handleNextStep = () => {
    const missingFields = getMissingFields();
    if (missingFields.length === 0) {
      setErrors([]);
      setCurrentStep(currentStep + 1);
    } else {
      setErrors(missingFields);
      showToast('Incomplete Form', 'Please complete the fields highlighted in red before proceeding.', 'error');
    }
  };

  const showToast = (title, message, type = 'success') => {
    setToast({ title, message, type });
    setTimeout(() => setToast(null), 8000);
  };

  

 const handleSubmit = async () => {
    setIsSubmitting(true);
    const data = new FormData();
    // Safely pull the guaranteed user_id from your AuthContext
    data.append('user_id', user.user_id); 
    data.append('tracking_code', trackingCode);
    data.append('request_mode', requestMode);
    data.append('purpose', formData.purpose === 'Other' ? formData.otherPurposeText : formData.purpose);
    
    const zoneSelf = formData.zone ? `, Zone ${formData.zone}` : '';
    const zoneOther = formData.other_zone ? `, Zone ${formData.other_zone}` : '';

    if (requestMode === 'Self') {
        data.append('fName', formData.fName);
        data.append('mName', formData.mName);
        data.append('lName', formData.lName);
        data.append('suffix', formData.suffix);
        data.append('birth_date', formData.birth_date);
        data.append('civil_status', formData.civil_status);
        data.append('gender', formData.gender);
        data.append('address', `${formData.block_lot}, ${formData.street}, ${formData.subdivision}${zoneSelf}`);
        data.append('sector', formData.sector);
        data.append('years_in_PB2', formData.years_in_PB2);
        data.append('precinct_no', formData.precinct);
        data.append('beneficiary_name', `${formData.fName} ${formData.lName}`);
    } else {
        data.append('fName', formData.other_fname);
        data.append('mName', formData.other_mname);
        data.append('lName', formData.other_lname);
        data.append('suffix', formData.other_suffix);
        data.append('birth_date', formData.other_birth_date);
        data.append('gender', formData.other_gender);
        data.append('civil_status', formData.other_civil_status);
        data.append('address', `${formData.other_block_lot}, ${formData.other_street}, ${formData.other_subdivision}${zoneOther}`);
        data.append('sector', formData.other_sector);
        data.append('years_in_PB2', formData.other_years_in_PB2);
        data.append('precinct_no', formData.other_precinct);
        data.append('beneficiary_name', `${formData.other_fname} ${formData.other_lname}`);
    }

    data.append('id_front', formData.id_front);
    data.append('id_back', formData.id_back);
    data.append('id_holding', formData.id_holding);

    try {
        const response = await fetch(`${API_BASE}/submit_barangay_clearance.php`, {
            method: 'POST',
            body: data,
        });
        const result = await response.json();
        
        if (result.success) {
            showToast('Success!', result.message, 'success');
            setTimeout(() => {
                setIsSubmitting(false); // Clean termination
                navigate('/services'); // Graceful system relocation to main directory
            }, 2000);
        } else {
            showToast('Error', result.message, 'error');
            setIsSubmitting(false); 
        }
    } catch (error) {
        showToast('Server Error', 'Invalid response from server.', 'error');
        setIsSubmitting(false); 
    }
  };

  const steps = [
    { label: 'Identity', icon: 'bi-person-badge' },
    { label: 'Residency', icon: 'bi-geo-alt-fill' },
    { label: 'Uploads', icon: 'bi-cloud-arrow-up-fill' },
    { label: 'Review', icon: 'bi-clipboard2-check-fill' }
  ];

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    // Real-time clearance of field validation bounds
    if (errors.includes(name)) {
      setErrors(errors.filter(field => field !== name));
    }

    if (name === "other_birth_date") {
        setFormData({
            ...formData,
            [name]: value,        
            other_age: calculateAge(value) 
        });
    } else {
        setFormData({
            ...formData,
            [name]: value
        });
    }
  };

  const handleFileChange = (e) => {
    const { name, files } = e.target;
    if (files && files[0]) {
      if (errors.includes(name)) {
        setErrors(errors.filter(field => field !== name));
      }
      setFormData(prev => ({ ...prev, [name]: files[0] }));
    }
  };


  const renderFilePreview = (fileKey, label, subLabel, iconClass) => {
    const file = formData[fileKey];
    const hasError = errors.includes(fileKey);
    return (
      <div 
        className={`ep-file-upload-box ${file ? 'has-file' : ''} ${hasError ? 'error-ring' : ''}`} 
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
          accept="image/*,application/pdf" 
        />
        {!file ? (
          <div className="ep-upload-content">
            <i className={`bi ${iconClass} ep-upload-icon`}></i>
            <h4>{label}</h4>
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

  return (
    <>
      <Preloader />
      <Header />
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css" />
    
      {toast && (
        <div className="ep-toast" role="alert">
          <i className="bi bi-check-circle-fill ep-toast-icon"></i>
          <div>
            <h4>{toast.title}</h4>
            <p>{toast.message}</p>
          </div>
        </div>
      )}

      <div className="ep-page-wrapper">
        <div className="ep-form-card">
          <div className="ep-form-header">
            <h2>Barangay Clearance</h2>
            <div className="ep-badge-official"><i className="bi bi-shield-check"></i> Official Document Portal</div>
          </div>

          <div className="ep-stepper-container">
            <div className="ep-stepper" aria-label="Progress Stepper">
              <div className="ep-progress-bg"></div>
              <div className="ep-progress-fill" style={{ width: `${(currentStep / (steps.length - 1)) * 90 + 5}%` }}></div>
              {steps.map((step, idx) => (
                <div key={idx} className={`ep-step-item ${idx === currentStep ? 'active' : ''} ${idx < currentStep ? 'completed' : ''}`}>
                  <div className="ep-step-circle"><i className={`bi ${step.icon}`}></i></div>
                  <div className="ep-step-label">{step.label}</div>
                </div>
              ))}
            </div>
          </div>

          <form onSubmit={(e) => e.preventDefault()}>
            {/* STEP 1: IDENTITY */}
            {currentStep === 0 && (
              <div className="slide-in">
                <div className="ep-toggle-wrapper">
                  <span className="ep-toggle-label" id="mode-label">Who is this request for?</span>
                  <div 
                    className="ep-toggle-container" 
                    onClick={() => setRequestMode(requestMode === 'Self' ? 'Others' : 'Self')}
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

                {requestMode === 'Self' ? (
                  <div className="slide-in">
                    <h4 className="ep-section-title"><i className="bi bi-person-bounding-box"></i> Your Information</h4>
                    <div className="ep-grid">
                      <div className="ep-input-group"><label>First Name</label><input type="text" value={formData.fName} readOnly title="Your first name (Locked)" /></div>
                      <div className="ep-input-group"><label>Middle Name</label><input type="text" value={formData.mName} readOnly title="Your middle name (Locked)" /></div>
                      <div className="ep-input-group"><label>Last Name</label><input type="text" value={formData.lName} readOnly title="Your last name (Locked)" /></div>
                      <div className="ep-input-group"><label>Suffix</label><input type="text" value={formData.suffix} readOnly title="Your suffix (Locked)" /></div>
                      <div className="ep-input-group"><label>Age</label><input type="text" value={formData.age} readOnly title="Your age (Locked)" /></div>
                      <div className="ep-input-group"><label>Gender</label><input type="text" value={formData.gender} readOnly title="Your Gender (Locked)" /></div>
                      <div className="ep-input-group"><label>Civil Status</label><input type="text" value={formData.civil_status} readOnly title="Your civil status (Locked)" /></div>
                      <div className="ep-input-group"><label>Sector</label><input type="text" value={formData.sector} readOnly title="Your special sector (Locked)" /></div>
                    </div>
                  </div>
                ) : (
                  <div className="slide-in">
                    <h4 className="ep-section-title"><i className="bi bi-person-add"></i> Beneficiary Details</h4>
                    <div className="ep-grid">
                      <div className="ep-input-group">
                        <label htmlFor="other_fname">First Name *</label>
                        <input type="text" id="other_fname" name="other_fname" value={formData.other_fname} onChange={handleInputChange} placeholder="Enter First Name" title="Type the beneficiary's first name" className={errors.includes('other_fname') ? 'error-ring' : ''} />
                      </div>
                      <div className="ep-input-group">
                        <label htmlFor="other_mname">Middle Name</label>
                        <input type="text" id="other_mname" name="other_mname" value={formData.other_mname} onChange={handleInputChange} placeholder="Enter Middle Name" title="Type the beneficiary's middle name" />
                      </div>
                      <div className="ep-input-group">
                        <label htmlFor="other_lname">Last Name *</label>
                        <input type="text" id="other_lname" name="other_lname" value={formData.other_lname} onChange={handleInputChange} placeholder="Enter Last Name" title="Type the beneficiary's last name" className={errors.includes('other_lname') ? 'error-ring' : ''} />
                      </div>
                      <div className="ep-input-group">
                        <label htmlFor="other_suffix">Suffix</label>
                        <input type="text" id="other_suffix" name="other_suffix" value={formData.other_suffix} onChange={handleInputChange} placeholder="Suffix" title="Type the beneficiary's suffix (Jr, Sr, etc.)" />
                      </div>
                      <div className="ep-input-group">
                        <label htmlFor="other_birth_date">Birthdate *</label>
                        <input type="date" id="other_birth_date" name="other_birth_date" value={formData.other_birth_date} onChange={handleInputChange} title="Select the beneficiary's Birthdate" className={errors.includes('other_birth_date') ? 'error-ring' : ''} />
                      </div>
                      <div className="ep-input-group">
                        <label htmlFor="other_gender">Gender *</label>
                        <select id="other_gender" name="other_gender" value={formData.other_gender} onChange={handleInputChange} title="Select the beneficiary's gender" className={errors.includes('other_gender') ? 'error-ring' : ''}>
                          <option value="">Select Gender</option><option value="Male">Male</option><option value="Female">Female</option>
                        </select>
                      </div>
                      <div className="ep-input-group">
                        <label htmlFor="other_civil_status">Civil Status *</label>
                        <select id="other_civil_status" name="other_civil_status" value={formData.other_civil_status} onChange={handleInputChange} title="Select the beneficiary's civil status" className={errors.includes('other_civil_status') ? 'error-ring' : ''}>
                          <option value="">Select Status</option><option value="Single">Single</option><option value="Married">Married</option><option value="Widowed">Widowed</option><option value="Separated">Separated</option>
                        </select>
                      </div>
                      <div className="ep-input-group">
                        <label htmlFor="other_sector">Sector </label>
                        <select id="other_sector" name="other_sector" value={formData.other_sector} onChange={handleInputChange} title="Select the beneficiary's sector">
                          <option value="">Select Sector</option><option value="Senior Citizen">Senior Citizen</option><option value="PWD">PWD</option><option value="Solo Parent">Solo Parent</option><option value="4Ps">4Ps Beneficiary</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                <div className="ep-grid" style={{ marginTop: '30px' }}>
                 <div className="ep-input-group ep-full">
                    <label htmlFor="purpose">Purpose of Request *</label>
                    <select id="purpose" name="purpose" value={formData.purpose} onChange={handleInputChange} aria-required="true" title="Select the official reason for this clearance" className={errors.includes('purpose') ? 'error-ring' : ''}>
                      <option value="">Select Official Purpose</option>
                      <option value="Employment">Employment</option>
                      <option value="Postal ID">Postal ID Requirement</option>
                      <option value="NBI Clearance">NBI Clearance</option>
                      <option value="Police Clearance">Police Clearance</option>
                      <option value="Bank Account">Opening Bank Account</option>
                      <option value="Other">Other</option>
                    </select>
                    <p className="ep-accessibility-hint">
                      <i className="bi bi-info-circle"> Choose the reason why you need this document.</i> 
                    </p>
                  </div>
                  {formData.purpose === 'Other' && (
                    <div className="ep-input-group ep-full slide-in">
                      <label htmlFor="otherPurposeText">Please Specify Purpose *</label>
                      <input type="text" id="otherPurposeText" name="otherPurposeText" value={formData.otherPurposeText} onChange={handleInputChange} placeholder="Enter specific purpose" title="Type your specific reason for this request" className={errors.includes('otherPurposeText') ? 'error-ring' : ''} />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* STEP 2: RESIDENCY */}
            {currentStep === 1 && (
              <div className="slide-in">
                <h4 className="ep-section-title"><i className="bi bi-house-door"></i> Address Verification</h4>
                <div className="ep-grid">
                  {requestMode === 'Self' ? (
                    <>
                      <div className="ep-input-group ep-full">
                        <label>Registered Address</label>
                        <input type="text" value={`${formData.block_lot}, ${formData.street}, ${formData.subdivision}, Zone ${formData.zone}`} readOnly title="Your current registered address (Locked)" />
                      </div>
                      <div className="ep-input-group"><label>Years of Residency</label><input type="text" value={formData.years_in_PB2} readOnly title="Locked field" /></div>
                      <div className="ep-input-group"><label>Precinct No.</label><input type="text" value={formData.precinct} readOnly title="Locked field" /></div>
                    </>
                  ) : (
                    <>
                      <div className="ep-input-group"><label htmlFor="other_block_lot">Block/Lot *</label><input type="text" id="other_block_lot" name="other_block_lot" value={formData.other_block_lot} onChange={handleInputChange} placeholder="Blk 1 Lot 2" title="Type the beneficiary's block and lot number" className={errors.includes('other_block_lot') ? 'error-ring' : ''} /></div>
                      <div className="ep-input-group"><label htmlFor="other_street">Street *</label><input type="text" id="other_street" name="other_street" value={formData.other_street} onChange={handleInputChange} placeholder="Street Name" title="Type the street name" className={errors.includes('other_street') ? 'error-ring' : ''} /></div>
                      <div className="ep-input-group"><label htmlFor="other_subdivision">Subdivision *</label><input type="text" id="other_subdivision" name="other_subdivision" value={formData.other_subdivision} onChange={handleInputChange} placeholder="Subdivision Name" title="Type the subdivision name" className={errors.includes('other_subdivision') ? 'error-ring' : ''} /></div>
                      <div className="ep-input-group"><label htmlFor="other_zone">Zone </label><input type="text" id="other_zone" name="other_zone" value={formData.other_zone} onChange={handleInputChange} placeholder="Zone No." title="Type the zone number" /></div>
                      <div className="ep-input-group"><label htmlFor="other_years_in_PB2">Years of Residency *</label><input type="text" id="other_years_in_PB2" name="other_years_in_PB2" value={formData.other_years_in_PB2} onChange={handleInputChange} placeholder="Ex: 5" title="Number of years the beneficiary has lived here" className={errors.includes('other_years_in_PB2') ? 'error-ring' : ''} /></div>
                      <div className="ep-input-group"><label htmlFor="other_precinct">Precinct No. (Optional)</label><input type="text" id="other_precinct" name="other_precinct" value={formData.other_precinct} onChange={handleInputChange} placeholder="Precinct No." title="Beneficiary's precinct number" /></div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* STEP 3: UPLOADS */}
            {currentStep === 2 && (
              <div className="slide-in">
                <h4 className="ep-section-title"><i className="bi bi-file-earmark-lock"></i> Required Documents</h4>
                <div className="ep-grid">
                  {renderFilePreview('id_front', 'Valid ID (Front)', 'Upload clear image', 'bi-front')}
                  {renderFilePreview('id_back', 'Valid ID (Back)', 'Must show address', 'bi-back')}
                  <div className="ep-full">
                    {renderFilePreview('id_holding', 
                      requestMode === 'Self' ? 'Verification Selfie' : 'Authorization Letter', 
                      requestMode === 'Self' ? 'Hold ID near your face clearly' : 'Signed letter with ID', 
                      'bi-person-video2')}
                  </div>
                </div>
              </div>
            )}

            {/* STEP 4: REVIEW */}
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
                      <span className="ep-review-label">Gender</span>
                      <span className="ep-review-val">{requestMode === 'Self' ? formData.gender : formData.other_gender}</span>
                    </div>

                    <div className="ep-review-row">
                      <span className="ep-review-label">Sector</span>
                      <span className="ep-review-val">{requestMode === 'Self' ? formData.sector : formData.other_sector}</span>
                    </div>

                    <div className="ep-review-row">
                      <span className="ep-review-label">Civil Status</span>
                      <span className="ep-review-val">{requestMode === 'Self' ? formData.civil_status : formData.other_civil_status}</span>
                    </div>
                    <div className="ep-review-row">
                      <span className="ep-review-label">Request For</span>
                      <span className="ep-review-val">{requestMode === 'Self' ? 'Myself (Account Holder)' : 'Someone Else'}</span>
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
                      <span className="ep-review-label">Years in Barangay</span>
                      <span className="ep-review-val">{requestMode === 'Self' ? formData.years_in_PB2 : formData.other_years_in_PB2}</span>
                    </div>
                    <div className="ep-review-row">
                      <span className="ep-review-label">Special Sector</span>
                      <span className="ep-review-val">{requestMode === 'Self' ? (formData.sector || 'None') : (formData.other_sector || 'None')}</span>
                    </div>
                    <div className="ep-review-row">
                      <span className="ep-review-label">Precinct Number</span>
                      <span className="ep-review-val">{requestMode === 'Self' ? (formData.precinct || 'Not Provided') : (formData.other_precinct || 'Not Provided')}</span>
                    </div>
                  </div>

                  <div className="ep-review-category">
                    <h4>Request Purpose</h4>
                    <div className="ep-review-row">
                      <span className="ep-review-label">Main Purpose</span>
                      <span className="ep-review-val">{formData.purpose === 'Other' ? formData.otherPurposeText : formData.purpose}</span>
                    </div>
                  </div>

                  <div className="ep-review-category">
                    <h4>Attachments Summary</h4>
                    <div className="mt-2">
                      <span className="ep-attachment-tag"><i className="bi bi-paperclip"></i> ID Front Image</span>
                      <span className="ep-attachment-tag"><i className="bi bi-paperclip"></i> ID Back Image</span>
                      <span className="ep-attachment-tag">
                        <i className="bi bi-paperclip"></i> {requestMode === 'Self' ? 'Verification Selfie' : 'Authorization Letter'}
                      </span>
                    </div>
                  </div>
                  
                  <div className="ep-card-accent"></div>
                  <div className="ep-card-body">
                    <div className="ep-card-text">
                      <div className="ep-review-category">
                        <h4>Review & Approval Process</h4>
                      </div>
                      <h5>
                        Your request is now queued for <i>official verification</i>. 
                        An email notification will be sent to your registered address once the 
                        Barangay Admin has approved your clearance.
                      </h5>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="ep-actions">
              <button 
                type="button"
                className="ep-btn ep-btn-prev" 
                disabled={currentStep === 0} 
                onClick={() => {
                  setErrors([]); // Reset errors when navigating backward
                  setCurrentStep(currentStep - 1);
                }}
              >
                <i className="bi bi-arrow-left"></i> Back
              </button>
              <button 
                type="button" 
                className="ep-btn ep-btn-next" 
                disabled={isSubmitting} // Re-enabled interaction condition for custom error-mapping function
                onClick={() => currentStep === 3 ? handleSubmit() : handleNextStep()}
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

export default BarangayClearance;