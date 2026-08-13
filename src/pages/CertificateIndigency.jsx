import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext'; 
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import Footer from '../components/Footer';
import Preloader from '../components/Preloader';
import '../styles/barangayDocuments.css'; 

const API_BASE = '/api_backend';

const CertificateIndigency = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);
  const [requestMode, setRequestMode] = useState('Self');
  const [trackingCode, setTrackingCode] = useState('');
  const [toast, setToast] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState([]); // HCI Operator Validation: Tracks missing fields for real-time red highlighting

  const [formData, setFormData] = useState({
    resident_id: '',
    fName: '', mName: '', lName: '', suffix: '',
    age: '', birth_date: '', civil_status: '', gender: '',
    block_lot: '', houseNo: '', street: '', subdivision: '', zone: '',
    years_in_PB2: '', precinct: '', sector: '', contact_num: '',
    
    // Certificate of Indigency Schema-Specific Fields
    monthly_income: '',
    employment_status: '',
    purpose: '',
    purpose_details: '',
    
    // Others (Beneficiary) mode fields
    other_fname: '', other_mname: '', other_lname: '', other_suffix: '',
    other_age: '', other_birth_date: '', other_gender: '', other_civil_status: '', other_sector: '',
    other_block_lot: '', other_houseNo: '', other_street: '', other_subdivision: '', other_zone: '',
    
    // File Inputs required by Indigency table
    valid_id: null,
    proof_doc: null
  });

  // GOMS Automation: Generating tracking code automatically minimizes Keystroke (K) operators
  useEffect(() => {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const randomHash = Math.random().toString(36).substring(2, 8).toUpperCase();
    setTrackingCode(`IND-${date}-${randomHash}`);
  }, []);

  // Autofill profile linking logic matching Barangay Clearance
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
              contact_num: d.contact_num || ''
            }));
          }
        })
        .catch(err => console.error("Failed to fetch profile dataset indices", err));
    }
  }, [user]);

  // Evaluates validation bounds per step and populates error keys for the error-ring highlights
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
      if (!formData.monthly_income) missing.push('monthly_income');
      if (!formData.employment_status) missing.push('employment_status');
      
      if (requestMode === 'Others') {
        if (!formData.other_block_lot) missing.push('other_block_lot');
        if (!formData.other_street) missing.push('other_street');
        if (!formData.other_subdivision) missing.push('other_subdivision');
      }
    }
    if (currentStep === 2) {
      if (!formData.valid_id) missing.push('valid_id');
      if (!formData.proof_doc) missing.push('proof_doc');
    }
    return missing;
  };

  const handleNextStep = () => {
    const missingFields = getMissingFields();
    if (missingFields.length === 0) {
      setErrors([]);
      setCurrentStep(currentStep + 1);
    } else {
      setErrors(missingFields); // Commits targeted fields to view arrays for real-time red highlights
      showToast('Incomplete Fields', 'Please fill up all required fields highlighted in red.', 'error');
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
    data.append('purpose', formData.purpose === 'Other' ? formData.otherPurposeText : formData.purpose);
    data.append('purpose_details', formData.purpose_details);
    data.append('monthly_income', formData.monthly_income);
    data.append('employment_status', formData.employment_status);

    const zoneSelf = formData.zone ? `, Zone ${formData.zone}` : '';
    const zoneOther = formData.other_zone ? `, Zone ${formData.other_zone}` : '';

    if (requestMode === 'Self') {
        data.append('fName', formData.fName);
        data.append('mName', formData.mName);
        data.append('lName', formData.lName);
        data.append('suffix', formData.suffix);
        data.append('address', `${formData.block_lot}, ${formData.street}, ${formData.subdivision}${zoneSelf}`);
        data.append('civil_status', formData.civil_status);
        data.append('beneficiary_name', `${formData.fName} ${formData.lName}`);
    } else {
        data.append('fName', formData.other_fname);
        data.append('mName', formData.other_mname);
        data.append('lName', formData.other_lname);
        data.append('suffix', formData.other_suffix);
        data.append('address', `${formData.other_block_lot}, ${formData.other_street}, ${formData.other_subdivision}${zoneOther}`);
        data.append('civil_status', formData.other_civil_status);
        data.append('beneficiary_name', `${formData.other_fname} ${formData.other_lname}`);
    }

    data.append('valid_id', formData.valid_id);
    data.append('proof_doc', formData.proof_doc);

    try {
        const response = await fetch(`${API_BASE}/submit_certificate_indigency.php`, {
            method: 'POST',
            body: data,
        });
        const result = await response.json();
        
        if (result.success) {
            showToast('Success!', result.message, 'success');
            setTimeout(() => {
                setIsSubmitting(false); // FIX: Releases button submission hook state cleanly
                navigate('/services');  // Gracefully routes back to home services page directory
            }, 2000);
        } else {
            showToast('Error', result.message, 'error');
            setIsSubmitting(false);
        }
    } catch (error) {
        showToast('Server Error', 'Invalid response from server runtime ecosystem.', 'error');
        setIsSubmitting(false);
    }
  };

  const steps = [
    { label: 'Identity', icon: 'bi-person-badge' },
    { label: 'Financial Info', icon: 'bi-wallet2' },
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
            <h2>Certificate of Indigency</h2>
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
                    <label htmlFor="purpose">Purpose of Indigency Certificate *</label>
                    <select id="purpose" name="purpose" value={formData.purpose} onChange={handleInputChange} aria-required="true" title="Select the official reason for this clearance" className={errors.includes('purpose') ? 'error-ring' : ''}>
                      <option value="">Select Official Purpose</option>
                      <option value="Scholarship">Scholarship Application</option>
                      <option value="Medical Assistance">Medical Assistance / Hospitalization</option>
                      <option value="Financial Assistance">Social Welfare / Financial Aid</option>
                      <option value="Legal Aid">Public Attorney Office (PAO) Legal Aid</option>
                      <option value="School Requirement">Educational / School Enrollment</option>
                      <option value="Other">Other Reasons</option>
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

            {/* STEP 2: FINANCIAL & RESIDENCY DETAILS */}
            {currentStep === 1 && (
              <div className="slide-in">
                <h4 className="ep-section-title"><i className="bi bi-house-door"></i> Social & Financial Profile</h4>
                <div className="ep-grid">
                  <div className="ep-input-group">
                    <label htmlFor="monthly_income">Estimated Monthly Household Income (₱) *</label>
                    <input type="number" id="monthly_income" name="monthly_income" value={formData.monthly_income} onChange={handleInputChange} placeholder="Ex: 5000" title="Type your monthly home income estimate" className={errors.includes('monthly_income') ? 'error-ring' : ''} />
                  </div>
                  <div className="ep-input-group">
                    <label htmlFor="employment_status">Current Employment Status *</label>
                    <select id="employment_status" name="employment_status" value={formData.employment_status} onChange={handleInputChange} title="Select employment parameters" className={errors.includes('employment_status') ? 'error-ring' : ''}>
                      <option value="">Select Status</option>
                      <option value="Unemployed">Unemployed</option>
                      <option value="Self-Employed">Self-Employed</option>
                      <option value="Contractual">Contractual / Project-based</option>
                      <option value="Minimum Wage Earner">Minimum Wage Earner</option>
                      <option value="Student">Student / Dependent</option>
                    </select>
                  </div>
                  <div className="ep-input-group ep-full">
                    <label htmlFor="purpose_details">Additional Purpose Details / Explanations (Optional)</label>
                    <input type="text" id="purpose_details" name="purpose_details" value={formData.purpose_details} onChange={handleInputChange} placeholder="Describe any additional details regarding your case" title="Type optional purpose remarks here" />
                  </div>

                  {requestMode === 'Self' ? (
                    <>
                      <div className="ep-input-group ep-full">
                        <label>Registered Barangay Address</label>
                        <input type="text" value={`${formData.block_lot}, ${formData.street}, ${formData.subdivision}, Zone ${formData.zone}`} readOnly title="Your current registered address (Locked)" />
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="ep-full border-t pt-4 mt-2"><h5>Beneficiary Address Details</h5></div>
                      <div className="ep-input-group"><label htmlFor="other_block_lot">Block/Lot *</label><input type="text" id="other_block_lot" name="other_block_lot" value={formData.other_block_lot} onChange={handleInputChange} placeholder="Blk 1 Lot 2" title="Type the block and lot number" className={errors.includes('other_block_lot') ? 'error-ring' : ''} /></div>
                      <div className="ep-input-group"><label htmlFor="other_street">Street *</label><input type="text" id="other_street" name="other_street" value={formData.other_street} onChange={handleInputChange} placeholder="Street Name" title="Type the street name" className={errors.includes('other_street') ? 'error-ring' : ''} /></div>
                      <div className="ep-input-group"><label htmlFor="other_subdivision">Subdivision *</label><input type="text" id="other_subdivision" name="other_subdivision" value={formData.other_subdivision} onChange={handleInputChange} placeholder="Subdivision Name" title="Type the subdivision name" className={errors.includes('other_subdivision') ? 'error-ring' : ''} /></div>
                      <div className="ep-input-group"><label htmlFor="other_zone">Zone Number</label><input type="text" id="other_zone" name="other_zone" value={formData.other_zone} onChange={handleInputChange} placeholder="e.g. 1" /></div>
                    </>
                  )}
                </div>
              </div>
            )}

           
            {/* STEP 3: UPLOADS */}
            {currentStep === 2 && (
              <div className="slide-in">
                <h4 className="ep-section-title"><i className="bi bi-file-earmark-lock"></i> Verification Attachments</h4>
                <div className="ep-grid">
                  {renderFilePreview('valid_id', 'Valid Identification Card *', 'Upload clear front image of photo ID', 'bi-person-badge-fill')}
                  {renderFilePreview('proof_doc', 'Proof of Low Income *', 'Upload Certificate of Low Income, Case study or Brgy. profile', 'bi-file-earmark-medical-fill')}
                </div>
              </div>
            )}

            {/* STEP 4: REVIEW */}
            {currentStep === 3 && (
              <div className="slide-in">
                <div className="ep-review-box" aria-live="polite">
                  <h4 className="ep-section-title" style={{ border: 'none', marginBottom: '5px' }}>
                    <i className="bi bi-file-earmark-text text-success me-2"></i> Review & Submit Indigency Request
                  </h4>
                  
                  <div className="ep-review-category">
                    <h4>System Trace Info</h4>
                    <div className="ep-review-row">
                      <span className="ep-review-label">Tracking Sequence Number</span>
                      <span className="ep-review-val highlight">{trackingCode}</span>
                    </div>
                  </div>

                  <div className="ep-review-category">
                    <h4>Identity Breakdown</h4>
                    <div className="ep-review-row">
                      <span className="ep-review-label">Beneficiary Full Name</span>
                      <span className="ep-review-val">
                        {requestMode === 'Self' 
                          ? `${formData.fName} ${formData.mName} ${formData.lName} ${formData.suffix !== 'N/A' ? formData.suffix : ''}`.toUpperCase() 
                          : `${formData.other_fname} ${formData.other_mname} ${formData.other_lname} ${formData.other_suffix}`.toUpperCase()}
                      </span>
                    </div>
                    <div className="ep-review-row">
                      <span className="ep-review-label">Age Calculation</span>
                      <span className="ep-review-val">{requestMode === 'Self' ? formData.age : formData.other_age || 'N/A'}</span>
                    </div>
                    <div className="ep-review-row">
                      <span className="ep-review-label">Civil Status Context</span>
                      <span className="ep-review-val">{requestMode === 'Self' ? formData.civil_status : formData.other_civil_status}</span>
                    </div>
                  </div>

                  <div className="ep-review-category">
                    <h4>Financial Profile Details</h4>
                    <div className="ep-review-row">
                      <span className="ep-review-label">Estimated Monthly Household Earnings</span>
                      <span className="ep-review-val text-emerald-700 font-bold">₱ {formData.monthly_income}</span>
                    </div>
                    <div className="ep-review-row">
                      <span className="ep-review-label">Employment Metrics</span>
                      <span className="ep-review-val">{formData.employment_status}</span>
                    </div>
                    <div className="ep-review-row">
                      <span className="ep-review-label">Primary Declaration Purpose</span>
                      <span className="ep-review-val font-semibold">{formData.purpose === 'Other' ? formData.otherPurposeText : formData.purpose}</span>
                    </div>
                  </div>
                   <div className="ep-review-category">
                    <h4>Additional Purpose Details / Explanations</h4>
                    <div className="ep-review-row">
                      <span className="ep-review-val text-emerald-700 font-bold"> {formData.purpose_details}</span>
                    </div>
                    </div>

                  <div className="ep-review-category">
                    <h4>Filing Attachments Summary</h4>
                    <div className="mt-2">
                      <span className="ep-attachment-tag"><i className="bi bi-paperclip"></i> Valid Identity Card File</span>
                      <span className="ep-attachment-tag"><i className="bi bi-paperclip"></i> Low Income Proof Document</span>
                    </div>
                  </div>
                  
                  <div className="ep-card-accent"></div>
                  <div className="ep-card-body">
                    <div className="ep-card-text">
                      <div className="ep-review-category">
                        <h4>Review & Verification Flow</h4>
                      </div>
                      <h5>
                        Your indigency application file is being securely logged. 
                        The Barangay Admin unit will verify your socioeconomic profile against records. 
                        Tracking status updates follow via your registered account metrics.
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

export default CertificateIndigency;