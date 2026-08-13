import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext'; 
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import Footer from '../components/Footer';
import Preloader from '../components/Preloader';
import '../styles/barangayDocuments.css'; 

const API_BASE = '/api_backend';

const BusinessClearance = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);
  const [requestMode, setRequestMode] = useState('Self');
  const [trackingCode, setTrackingCode] = useState('');
  const [toast, setToast] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState([]); // HCI: Tracks missing elements to trigger the .error-ring class styles

  const [formData, setFormData] = useState({
    resident_id: '',
    fName: '', mName: '', lName: '', suffix: '',
    age: '', birth_date: '', civil_status: '', gender: '',
    block_lot: '', houseNo: '', street: '', subdivision: '', zone: '',
    years_in_PB2: '', precinct: '', sector: '', contact_num: '',
    
    // Business Specific Fields mapped from req_business_clearance database schema
    business_name: '',
    business_type: '',
    nature_business: '',
    business_address: '',
    contact_person: '',
    business_contact_num: '',
    
    // Others (Beneficiary) mode boundaries
    other_fname: '', other_mname: '', other_lname: '', other_suffix: '',
    other_age: '', other_birth_date: '', other_gender: '', other_civil_status: '', other_sector: '',
    other_block_lot: '', other_houseNo: '', other_street: '', other_subdivision: '', other_zone: '',
    other_contact_num: '',
    
    // File upload targets
    dti_reg: null,
    owner_id: null
  });

  useEffect(() => {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const randomHash = Math.random().toString(36).substring(2, 8).toUpperCase();
    setTrackingCode(`BIZ-${date}-${randomHash}`);
  }, []);

  // Autofill profile linking logic
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
              sector: d.sector || 'N/A',
              contact_num: d.contact_num || '',
              
             
            }));
          }
        })
        .catch(err => console.error("Failed to fetch profile tracking arrays", err));
    }
  }, [user]);

  // Evaluates complete boundary states per step to enforce missing bounds validation
  const getMissingFields = () => {
    const missing = [];
    if (currentStep === 0) {
      if (requestMode === 'Others') {
        if (!formData.other_fname) missing.push('other_fname');
        if (!formData.other_lname) missing.push('other_lname');
        if (!formData.other_birth_date) missing.push('other_birth_date');
        if (!formData.other_gender) missing.push('other_gender');
        if (!formData.other_civil_status) missing.push('other_civil_status');
      }
    }
    if (currentStep === 1) {
      if (!formData.business_name) missing.push('business_name');
      if (!formData.business_type) missing.push('business_type');
      if (!formData.nature_business) missing.push('nature_business');
      if (!formData.business_address) missing.push('business_address');
     if (!formData.contact_person) missing.push('contact_person');
      if (!formData.business_contact_num) missing.push('business_contact_num');
      
      if (requestMode === 'Others') {
        if (!formData.other_block_lot) missing.push('other_block_lot');
        if (!formData.other_street) missing.push('other_street');
        if (!formData.other_subdivision) missing.push('other_subdivision');
      }
    }
    if (currentStep === 2) {
      if (!formData.owner_id) missing.push('owner_id');
    }
    return missing;
  };

  const handleNextStep = () => {
    const missingFields = getMissingFields();
    if (missingFields.length === 0) {
      setErrors([]);
      setCurrentStep(currentStep + 1);
    } else {
      setErrors(missingFields); // Commits layout keys to trigger red error rings instantly
      showToast('Incomplete Fields', 'Please complete the required fields highlighted in red.', 'error');
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
    
    data.append('business_name', formData.business_name);
    data.append('business_type', formData.business_type);
    data.append('nature_business', formData.nature_business);
    data.append('business_address', formData.business_address);
    data.append('contact_person', formData.contact_person);
    data.append('business_contact_num', formData.business_contact_num);

    const zoneSelf = formData.zone ? `, Zone ${formData.zone}` : '';
    const zoneOther = formData.other_zone ? `, Zone ${formData.other_zone}` : '';

    if (requestMode === 'Self') {
        data.append('fName', formData.fName);
        data.append('mName', formData.mName);
        data.append('lName', formData.lName);
        data.append('suffix', formData.suffix);
        data.append('address', `${formData.block_lot}, ${formData.street}, ${formData.subdivision}${zoneSelf}`);
        data.append('contact_num', formData.contact_num);
        data.append('beneficiary_name', `${formData.fName} ${formData.lName}`);
    } else {
        data.append('fName', formData.other_fname);
        data.append('mName', formData.other_mname);
        data.append('lName', formData.other_lname);
        data.append('suffix', formData.other_suffix);
        data.append('address', `${formData.other_block_lot}, ${formData.other_street}, ${formData.other_subdivision}${zoneOther}`);
        data.append('contact_num', formData.other_contact_num);
        data.append('beneficiary_name', `${formData.other_fname} ${formData.other_lname}`);
    }

    if (formData.dti_reg) data.append('dti_reg', formData.dti_reg);
    data.append('owner_id', formData.owner_id);

    try {
        const response = await fetch(`${API_BASE}/submit_business_clearance.php`, {
            method: 'POST',
            body: data,
        });
        const result = await response.json();
        
        if (result.success) {
            showToast('Success!', result.message, 'success');
            setTimeout(() => {
                setIsSubmitting(false); // FIX: Releases submitting button state
                navigate('/services');  // Navigates securely back to main Services tab
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
    { label: 'Business Info', icon: 'bi-shop' },
    { label: 'Uploads', icon: 'bi-cloud-arrow-up-fill' },
    { label: 'Review', icon: 'bi-clipboard2-check-fill' }
  ];

  const handleInputChange = (e) => {
    const { name, value } = e.target;
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
            <h2>Business Clearance Request</h2>
            <div className="ep-badge-official"><i className="bi bi-shield-check"></i> Barangay Business Hub</div>
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
                  <span className="ep-toggle-label" id="mode-label">Who is the business registered to?</span>
                  <div 
                    className="ep-toggle-container" 
                    onClick={() => setRequestMode(requestMode === 'Self' ? 'Others' : 'Self')}
                    role="button"
                    tabIndex="0"
                    aria-labelledby="mode-label"
                    title="Click to toggle between requesting for your own business or representing someone else"
                  >
                    <div className={`ep-toggle-option ${requestMode === 'Self' ? 'active' : ''}`}>Myself</div>
                    <div className={`ep-toggle-option ${requestMode === 'Others' ? 'active' : ''}`}>Someone Else</div>
                    <div className="ep-toggle-slider" style={{ transform: requestMode === 'Self' ? 'translateX(0)' : 'translateX(100%)' }}></div>
                  </div>
                </div>

                {requestMode === 'Self' ? (
                  <div className="slide-in">
                    <h4 className="ep-section-title"><i className="bi bi-person-bounding-box"></i> Business Owner Information</h4>
                    <div className="ep-grid">
                      <div className="ep-input-group"><label>First Name</label><input type="text" value={formData.fName} readOnly title="Your first name (Locked)" /></div>
                      <div className="ep-input-group"><label>Middle Name</label><input type="text" value={formData.mName} readOnly title="Your middle name (Locked)" /></div>
                      <div className="ep-input-group"><label>Last Name</label><input type="text" value={formData.lName} readOnly title="Your last name (Locked)" /></div>
                      <div className="ep-input-group"><label>Suffix</label><input type="text" value={formData.suffix} readOnly title="Your suffix (Locked)" /></div>
                      <div className="ep-input-group"><label>Age</label><input type="text" value={formData.age} readOnly title="Your age (Locked)" /></div>
                      <div className="ep-input-group"><label>Gender</label><input type="text" value={formData.gender} readOnly title="Your Gender (Locked)" /></div>
                      <div className="ep-input-group"><label>Civil Status</label><input type="text" value={formData.civil_status} readOnly title="Your civil status (Locked)" /></div>
                      <div className="ep-input-group"><label>Sector Identity</label><input type="text" value={formData.sector} readOnly title="Your special sector (Locked)" /></div>
                    </div>
                  </div>
                ) : (
                  <div className="slide-in">
                    <h4 className="ep-section-title"><i className="bi bi-person-add"></i> Registrant Representative Details</h4>
                    <div className="ep-grid">
                      <div className="ep-input-group">
                        <label htmlFor="other_fname">Owner First Name *</label>
                        <input type="text" id="other_fname" name="other_fname" value={formData.other_fname} onChange={handleInputChange} placeholder="Enter First Name" title="Type the business owner's first name" className={errors.includes('other_fname') ? 'error-ring' : ''} />
                      </div>
                      <div className="ep-input-group">
                        <label htmlFor="other_mname">Owner Middle Name</label>
                        <input type="text" id="other_mname" name="other_mname" value={formData.other_mname} onChange={handleInputChange} placeholder="Enter Middle Name" title="Type the business owner's middle name" />
                      </div>
                      <div className="ep-input-group">
                        <label htmlFor="other_lname">Owner Last Name *</label>
                        <input type="text" id="other_lname" name="other_lname" value={formData.other_lname} onChange={handleInputChange} placeholder="Enter Last Name" title="Type the business owner's last name" className={errors.includes('other_lname') ? 'error-ring' : ''} />
                      </div>
                      <div className="ep-input-group">
                        <label htmlFor="other_suffix">Suffix</label>
                        <input type="text" id="other_suffix" name="other_suffix" value={formData.other_suffix} onChange={handleInputChange} placeholder="Suffix" title="Type the business owner's suffix" />
                      </div>
                      <div className="ep-input-group">
                        <label htmlFor="other_birth_date">Owner Birthdate *</label>
                        <input type="date" id="other_birth_date" name="other_birth_date" value={formData.other_birth_date} onChange={handleInputChange} title="Select the business owner's birthdate" className={errors.includes('other_birth_date') ? 'error-ring' : ''} />
                      </div>
                      <div className="ep-input-group">
                        <label htmlFor="other_gender">Gender *</label>
                        <select id="other_gender" name="other_gender" value={formData.other_gender} onChange={handleInputChange} title="Select gender mapping" className={errors.includes('other_gender') ? 'error-ring' : ''}>
                          <option value="">Select Gender</option><option value="Male">Male</option><option value="Female">Female</option>
                        </select>
                      </div>
                      <div className="ep-input-group">
                        <label htmlFor="other_civil_status">Civil Status *</label>
                        <select id="other_civil_status" name="other_civil_status" value={formData.other_civil_status} onChange={handleInputChange} title="Select status parameters" className={errors.includes('other_civil_status') ? 'error-ring' : ''}>
                          <option value="">Select Status</option><option value="Single">Single</option><option value="Married">Married</option><option value="Widowed">Widowed</option><option value="Separated">Separated</option>
                        </select>
                      </div>
                      <div className="ep-input-group">
                        <label htmlFor="other_contact_num">Representative Mobile Line *</label>
                        <input type="text" id="other_contact_num" name="other_contact_num" value={formData.other_contact_num} onChange={handleInputChange} placeholder="Ex: 09XXXXXXXXX" title="Provide mobile number" className={errors.includes('other_contact_num') ? 'error-ring' : ''} />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* STEP 2: BUSINESS DETAILS */}
            {currentStep === 1 && (
              <div className="slide-in">
                <h4 className="ep-section-title"><i className="bi bi-shop-window"></i> Corporate & Enterprise Mapping</h4>
                <div className="ep-grid">
                  <div className="ep-input-group ep-full">
                    <label htmlFor="business_name">Registered Trade Name / Business Name *</label>
                    <input type="text" id="business_name" name="business_name" value={formData.business_name} onChange={handleInputChange} placeholder="Enter Business Name" title="Enter the complete business title" className={errors.includes('business_name') ? 'error-ring' : ''} />
                  </div>
                  <div className="ep-input-group">
                    <label htmlFor="business_type">Type of Business Organization *</label>
                    <select id="business_type" name="business_type" value={formData.business_type} onChange={handleInputChange} title="Select business scale setup" className={errors.includes('business_type') ? 'error-ring' : ''}>
                      <option value="">Select Corporate Structure</option>
                      <option value="Single Proprietorship">Single Proprietorship</option>
                      <option value="Partnership">Partnership</option>
                      <option value="Corporation">Corporation</option>
                      <option value="Cooperative">Cooperative</option>
                    </select>
                  </div>
                  <div className="ep-input-group">
                    <label htmlFor="nature_business">Nature of Business Operation *</label>
                    <input type="text" id="nature_business" name="nature_business" value={formData.nature_business} onChange={handleInputChange} placeholder="e.g. Retail Store, Sari-Sari, Carwash" title="Describe business scope parameters" className={errors.includes('nature_business') ? 'error-ring' : ''} />
                  </div>
                  <div className="ep-input-group ep-full">
                    <label htmlFor="business_address">Complete Business Location Address *</label>
                    <input type="text" id="business_address" name="business_address" value={formData.business_address} onChange={handleInputChange} placeholder="House No, Street, Subdivision, Barangay" title="Complete exact corporate location" className={errors.includes('business_address') ? 'error-ring' : ''} />
                  </div>
                  <div className="ep-input-group">
                    <label htmlFor="contact_person">Primary Contact Person *</label>
                    <input type="text" id="contact_person" name="contact_person" value={formData.contact_person} onChange={handleInputChange} placeholder="Enter Contact Name" title="Liaison or manager identity" className={errors.includes('contact_person') ? 'error-ring' : ''} />
                  </div>
                  <div className="ep-input-group">
                    <label htmlFor="business_contact_num">Business / Contact Phone Line *</label>
                    <input type="text" id="business_contact_num" name="business_contact_num" value={formData.business_contact_num} onChange={handleInputChange} placeholder="Enter Contact Number" title="Primary business line or mobile entry" className={errors.includes('business_contact_num') ? 'error-ring' : ''} />
                  </div>

                  {requestMode === 'Others' && (
                    <>
                      <div className="ep-full border-t pt-4 mt-2"><h5>Owner’s Barangay Home Address</h5></div>
                      <div className="ep-input-group"><label htmlFor="other_block_lot">Block/Lot *</label><input type="text" id="other_block_lot" name="other_block_lot" value={formData.other_block_lot} onChange={handleInputChange} placeholder="Blk 1 Lot 2" className={errors.includes('other_block_lot') ? 'error-ring' : ''} /></div>
                      <div className="ep-input-group"><label htmlFor="other_street">Street *</label><input type="text" id="other_street" name="other_street" value={formData.other_street} onChange={handleInputChange} placeholder="Street Name" className={errors.includes('other_street') ? 'error-ring' : ''} /></div>
                      <div className="ep-input-group"><label htmlFor="other_subdivision">Subdivision *</label><input type="text" id="other_subdivision" name="other_subdivision" value={formData.other_subdivision} onChange={handleInputChange} placeholder="Subdivision Name" className={errors.includes('other_subdivision') ? 'error-ring' : ''} /></div>
                      <div className="ep-input-group"><label htmlFor="other_zone">Zone Number</label><input type="text" id="other_zone" name="other_zone" value={formData.other_zone} onChange={handleInputChange} placeholder="e.g. 1" /></div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* STEP 3: UPLOADS */}
            {currentStep === 2 && (
              <div className="slide-in">
                <h4 className="ep-section-title"><i className="bi bi-file-earmark-lock"></i> Legal Mandated Attachments</h4>
                <div className="ep-grid">
                  {renderFilePreview('owner_id', 'Valid Owner ID Card *', 'Upload clear primary signature profile card', 'bi-person-badge-fill')}
                  {renderFilePreview('dti_reg', 'DTI Certification (Optional)', 'Upload business registry copy if available', 'bi-file-binary-fill')}
                </div>
                <p className="ep-accessibility-hint mt-3 text-slate-500">
                  <i className="bi bi-info-circle"></i> Government standards require at least one valid identity verification file to create the clearance index.
                </p>
              </div>
            )}

            {/* STEP 4: REVIEW */}
            {currentStep === 3 && (
              <div className="slide-in">
                <div className="ep-review-box" aria-live="polite">
                  <h4 className="ep-section-title" style={{ border: 'none', marginBottom: '5px' }}>
                    <i className="bi bi-file-earmark-text text-success me-2"></i> Review & Submit Application Trace
                  </h4>
                  
                  <div className="ep-review-category">
                    <h4>System Trace Metadata</h4>
                    <div className="ep-review-row">
                      <span className="ep-review-label">Generated Session Tracking Code</span>
                      <span className="ep-review-val highlight">{trackingCode}</span>
                    </div>
                  </div>

                  <div className="ep-review-category">
                    <h4>Owner Identity Matrix</h4>
                    <div className="ep-review-row">
                      <span className="ep-review-label">Owner Full Name</span>
                      <span className="ep-review-val">
                        {requestMode === 'Self' 
                          ? `${formData.fName} ${formData.mName} ${formData.lName} ${formData.suffix !== 'N/A' ? formData.suffix : ''}`.toUpperCase() 
                          : `${formData.other_fname} ${formData.other_mname} ${formData.other_lname} ${formData.other_suffix}`.toUpperCase()}
                      </span>
                    </div>
                    <div className="ep-review-row">
                      <span className="ep-review-label">Age Index</span>
                      <span className="ep-review-val">{requestMode === 'Self' ? formData.age : formData.other_age || 'N/A'}</span>
                    </div>
                    <div className="ep-review-row">
                      <span className="ep-review-label">Filing Status Category</span>
                      <span className="ep-review-val">{requestMode === 'Self' ? 'Direct Owner filing (Self)' : 'Representative Filing (Others)'}</span>
                    </div>
                  </div>

                  <div className="ep-review-category">
                    <h4>Corporate Mapping Context</h4>
                    <div className="ep-review-row">
                      <span className="ep-review-label">Enterprise Corporate Title</span>
                      <span className="ep-review-val font-bold">{formData.business_name}</span>
                    </div>
                    <div className="ep-review-row">
                      <span className="ep-review-label">Operation Scope Category</span>
                      <span className="ep-review-val">{formData.nature_business} [{formData.business_type}]</span>
                    </div>
                    <div className="ep-review-row">
                      <span className="ep-review-label">Exact Physical Plant Address</span>
                      <span className="ep-review-val italic">{formData.business_address}</span>
                    </div>
                    <div className="ep-review-row">
                      <span className="ep-review-label">Designated Business Contact</span>
                      <span className="ep-review-val">{formData.contact_person} ({formData.business_contact_num})</span>
                    </div>
                  </div>

                  <div className="ep-review-category">
                    <h4>Filing Attachments Registry</h4>
                    <div className="mt-2">
                      <span className="ep-attachment-tag"><i className="bi bi-paperclip"></i> Owner Identity Profile ID</span>
                      {formData.dti_reg && <span className="ep-attachment-tag"><i className="bi bi-paperclip"></i> Corporate DTI Index Cert</span>}
                    </div>
                  </div>
                  
                  <div className="ep-card-accent"></div>
                  <div className="ep-card-body">
                    <div className="ep-card-text">
                      <div className="ep-review-category">
                        <h4>Review & Approval Trajectory</h4>
                      </div>
                      <h5>
                        Your business application file is being safely committed to the index logs. 
                        The Barangay Captain and commercial processing unit will review the layout parameters. 
                        Updates follow via your registered account metrics.
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
                  setErrors([]); 
                  setCurrentStep(currentStep - 1);
                }}
              >
                <i className="bi bi-arrow-left"></i> Back
              </button>
              <button 
                type="button" 
                className="ep-btn ep-btn-next" 
                disabled={isSubmitting} 
                onClick={() => currentStep === 3 ? handleSubmit() : handleNextStep()} // FIX: Replaced the typo to fire validation
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

export default BusinessClearance;