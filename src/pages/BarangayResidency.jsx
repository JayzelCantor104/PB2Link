import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext'; 
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import Footer from '../components/Footer';
import Preloader from '../components/Preloader';
import '../styles/barangayDocuments.css'; 

const API_BASE = '/api_backend';

const BarangayResidency = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);
  const [requestMode, setRequestMode] = useState('Self');
  const [trackingCode, setTrackingCode] = useState('');
  const [toast, setToast] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    fName: '', mName: '', lName: '', suffix: '',
    age: '', birth_date: '', civilStatus: '', gender: '',
    block_lot: '', houseNo: '', street: '', subdivision: '', zone: '',
    years_in_PB2: '', residency_status: 'Homeowner', 
    precinct: '', sector: '',
    purpose: '', otherPurposeText: '',
    other_fname: '', other_mname: '', other_lname: '', other_suffix: '',
    other_age: '', other_birth_date: '', other_gender: '', other_civil_status: '', other_sector: '',
    other_block_lot: '', other_houseNo: '', other_street: '', 
    other_subdivision: '', other_zone: '', other_years_in_PB2: '', 
    other_precinct: '', other_residency_status: '',
    valid_id: null,
    proof_doc: null 
  });

  useEffect(() => {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const randomHash = Math.random().toString(36).substring(2, 8).toUpperCase();
    setTrackingCode(`RES-${date}-${randomHash}`);
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
              civilStatus: d.civil_status || 'Single',
              gender: d.gender || '',
              block_lot: d.block_lot || '',
              houseNo: d.house_no || '',
              street: d.street || '',
              subdivision: d.subdivision || '',
              zone: d.zone || '',
              years_in_PB2: d.years_in_PB2 || '',
              residency_status: d.residency_status || 'Homeowner',
              precinct: d.precinct_no || 'N/A',
              sector: d.sector || 'N/A'
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

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    if (name === "other_birth_date") {
        setFormData({ ...formData, [name]: value, other_age: calculateAge(value) });
    } else {
        setFormData({ ...formData, [name]: value });
    }
  };

  const handleFileChange = (e) => {
    const { name, files } = e.target;
    if (files && files[0]) { setFormData(prev => ({ ...prev, [name]: files[0] })); }
  };

  const validateStep = () => {
    if (currentStep === 0) {
      if (requestMode === 'Self') {
        return formData.purpose && (formData.purpose !== 'Other' || formData.otherPurposeText);
      } else {
        return (formData.other_fname && formData.other_lname && formData.other_gender && formData.other_birth_date && formData.purpose);
      }
    }
    if (currentStep === 1) {
      if (requestMode === 'Self') return true;
      return (formData.other_block_lot && formData.other_street && formData.other_subdivision && formData.other_years_in_PB2 && formData.other_residency_status);
    }
    if (currentStep === 2) {
      return formData.valid_id && formData.proof_doc;
    }
    return true;
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

    const zoneSuffix = (val) => val ? `, Zone ${val}` : '';

    if (requestMode === 'Self') {
        data.append('fName', formData.fName);
        data.append('mName', formData.mName);
        data.append('lName', formData.lName);
        data.append('suffix', formData.suffix);
        data.append('birth_date', formData.birth_date);
        data.append('gender', formData.gender);
        data.append('civil_status', formData.civilStatus);
        data.append('sector', formData.sector);
        data.append('address', `${formData.block_lot}, ${formData.street}, ${formData.subdivision}${zoneSuffix(formData.zone)}`);
        data.append('residency_status', formData.residency_status);
        data.append('years_in_PB2', formData.years_in_PB2);
        data.append('beneficiary_name', `${formData.fName} ${formData.lName}`);
    } else {
        data.append('fName', formData.other_fname);
        data.append('mName', formData.other_mname);
        data.append('lName', formData.other_lname);
        data.append('suffix', formData.other_suffix);
        data.append('birth_date', formData.other_birth_date);
        data.append('gender', formData.other_gender);
        data.append('civil_status', formData.other_civil_status);
        data.append('sector', formData.other_sector);
        data.append('address', `${formData.other_block_lot}, ${formData.other_street}, ${formData.other_subdivision}${zoneSuffix(formData.other_zone)}`);
        data.append('residency_status', formData.other_residency_status);
        data.append('years_in_PB2', formData.other_years_in_PB2);
        data.append('beneficiary_name', `${formData.other_fname} ${formData.other_lname}`);
    }

    data.append('valid_id', formData.valid_id);
    data.append('proof_doc', formData.proof_doc);

    try {
        const response = await fetch(`${API_BASE}/submit_certificate_residency.php`, {
            method: 'POST',
            body: data,
        });
        const result = await response.json();
        
        if (result.success) {
            showToast('Success!', result.message, 'success');
            setTimeout(() => {
                setIsSubmitting(false);
                navigate('/services'); 
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
    { label: 'Identity', icon: 'bi-person-vcard', title: 'Step 1: Identity Information' },
    { label: 'Residency', icon: 'bi-house-check-fill', title: 'Step 2: Residency Details' },
    { label: 'Uploads', icon: 'bi-cloud-upload-fill', title: 'Step 3: Document Uploads' },
    { label: 'Review', icon: 'bi-clipboard-check-fill', title: 'Step 4: Final Review' }
  ];

// --- ADD THIS HOVER LOGIC TO YOUR USEEFFECTS SECTION ---
  useEffect(() => {
    const tooltip = document.getElementById('custom-tooltip');
    if (!tooltip) return;

    const handleMouseOver = (e) => {
      const target = e.target.closest('[title]');
      if (target) {
        const titleText = target.getAttribute('title');
        if (titleText) {
          target.setAttribute('data-stored-title', titleText);
          target.removeAttribute('title'); // Prevent native browser tooltip
          tooltip.innerHTML = titleText;
          tooltip.style.display = 'block';
          tooltip.style.opacity = '1';
        }
      }
    };

    const handleMouseMove = (e) => {
      if (tooltip.style.display === 'block') {
        tooltip.style.left = `${e.clientX + 15}px`;
        tooltip.style.top = `${e.clientY + 15}px`;
      }
    };

    const handleMouseOut = (e) => {
      const target = e.target.closest('[data-stored-title]');
      if (target) {
        const originalTitle = target.getAttribute('data-stored-title');
        target.setAttribute('title', originalTitle);
        target.removeAttribute('data-stored-title');
        tooltip.style.display = 'none';
        tooltip.style.opacity = '0';
      }
    };

    document.addEventListener('mouseover', handleMouseOver);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseout', handleMouseOut);

    return () => {
      document.removeEventListener('mouseover', handleMouseOver);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseout', handleMouseOut);
    };
  }, []);











  const renderFilePreview = (fileKey, label, subLabel, iconClass) => {
    const file = formData[fileKey];
    return (
      <div 
        className={`ep-file-upload-box ${file ? 'has-file' : ''}`} 
        onClick={() => document.getElementById(fileKey).click()} 
        title={`Click to upload your ${label}`}
        role="button"
        tabIndex="0"
        aria-label={`Upload ${label}: ${subLabel}`}
      >
        <input type="file" id={fileKey} name={fileKey} style={{ display: 'none' }} onChange={handleFileChange} accept="image/*,application/pdf" />
        {!file ? (
          <div className="ep-upload-content">
            <i className={`bi ${iconClass} ep-upload-icon`}></i>
            <h4>{label}</h4>
            <p>{subLabel}</p>
          </div>
        ) : (
          <div className="ep-preview-container">
            <i className="bi bi-check-circle-fill ep-preview-icon"></i>
            <span className="ep-file-name text-truncate">{file.name}</span>
            <span className="ep-file-change font-bold text-emerald-600">Click to replace file</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <Preloader />
      <Header />
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css" />
    
      {toast && (
        <div className={`ep-toast ep-toast-${toast.type}`} role="alert" aria-live="assertive">
          <i className={`bi ${toast.type === 'success' ? 'bi-check-circle-fill' : 'bi-exclamation-triangle-fill'} ep-toast-icon`}></i>
          <div>
            <h4 title={toast.title}>{toast.title}</h4>
            <p>{toast.message}</p>
          </div>
        </div>
      )}

      <div className="ep-page-wrapper">
        <div className="ep-form-card">
          <div className="ep-form-header">
            <h2 title="Official Form for Certificate of Residency">Certificate of Residency</h2>
            <div className="ep-badge-official"><i className="bi bi-patch-check"></i> Official Verification Portal</div>
          </div>

          <div className="ep-stepper-container" aria-label="Progress tracker">
            <div className="ep-stepper">
              <div className="ep-progress-bg"></div>
              <div className="ep-progress-fill" style={{ width: `${(currentStep / (steps.length - 1)) * 90 + 5}%` }}></div>
              {steps.map((step, idx) => (
                <div key={idx} className={`ep-step-item ${idx === currentStep ? 'active' : ''} ${idx < currentStep ? 'completed' : ''}`} title={step.title}>
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
                  <span className="ep-toggle-label" id="mode-label">Who is this request for? (Choose one)</span>
                  <div 
                    className="ep-toggle-container" 
                    onClick={() => setRequestMode(requestMode === 'Self' ? 'Others' : 'Self')} 
                    role="button" 
                    aria-labelledby="mode-label"
                    title="Toggle between Myself or Someone Else"
                    style={{ minWidth: '44px', padding: '5px' }} // Fitts's Law
                  >
                    <div className={`ep-toggle-option ${requestMode === 'Self' ? 'active' : ''}`}>Myself</div>
                    <div className={`ep-toggle-option ${requestMode === 'Others' ? 'active' : ''}`}>Someone Else</div>
                    <div className="ep-toggle-slider" style={{ transform: requestMode === 'Self' ? 'translateX(0)' : 'translateX(100%)' }}></div>
                  </div>
                </div>

                {requestMode === 'Self' ? (
                  <div className="slide-in">
                    <h4 className="ep-section-title" title="Review your information below"><i className="bi bi-person-bounding-box"></i> Your Profile Information</h4>
                    <div className="ep-grid">
                      <div className="ep-input-group"><label>First Name</label><input type="text" value={formData.fName} readOnly title="Your first name" /></div>
                      <div className="ep-input-group"><label>Middle Name</label><input type="text" value={formData.mName} readOnly title="Your middle name" /></div>
                      <div className="ep-input-group"><label>Last Name</label><input type="text" value={formData.lName} readOnly title="Your last name" /></div>
                      <div className="ep-input-group"><label>Suffix</label><input type="text" value={formData.suffix} readOnly title="Your name suffix" /></div>
                      <div className="ep-input-group"><label>Age</label><input type="text" value={formData.age} readOnly title="Your calculated age" /></div>
                      <div className="ep-input-group"><label>Birthdate</label><input type="date" value={formData.birth_date} readOnly title="Your date of birth" /></div>
                      <div className="ep-input-group"><label>Gender</label><input type="text" value={formData.gender} readOnly title="Your gender" /></div>
                      <div className="ep-input-group"><label>Civil Status</label><input type="text" value={formData.civilStatus} readOnly title="Your civil status" /></div>
                      <div className="ep-input-group"><label>Sector</label><input type="text" value={formData.sector} readOnly title="Your social sector" /></div>
                    </div>
                  </div>
                ) : (
                  <div className="slide-in">
                    <h4 className="ep-section-title" title="Enter the details of the person you are requesting for"><i className="bi bi-person-add"></i> Beneficiary Details</h4>
                    <div className="ep-grid">
                      <div className="ep-input-group">
                        <label>First Name *</label>
                        <input type="text" name="other_fname" value={formData.other_fname} onChange={handleInputChange} placeholder="First Name" title="Enter beneficiary's first name" aria-required="true" />
                      </div>
                      <div className="ep-input-group">
                        <label>Middle Name </label>
                        <input type="text" name="other_mname" value={formData.other_mname} onChange={handleInputChange} placeholder="Middle Name" title="Enter beneficiary's middle name" />
                      </div>
                      <div className="ep-input-group">
                        <label>Last Name *</label>
                        <input type="text" name="other_lname" value={formData.other_lname} onChange={handleInputChange} placeholder="Last Name" title="Enter beneficiary's last name" aria-required="true" />
                      </div>
                       <div className="ep-input-group"><label>Suffix</label><input type="text" name="other_suffix" value={formData.other_suffix} onChange={handleInputChange} placeholder="Suffix" title="Ex. Jr., III" /></div>
                      <div className="ep-input-group"><label>Birthdate *</label><input type="date" name="other_birth_date" value={formData.other_birth_date} onChange={handleInputChange} title="Select beneficiary's birthdate" aria-required="true" /></div>
                      <div className="ep-input-group"><label>Gender *</label>
                        <select name="other_gender" value={formData.other_gender} onChange={handleInputChange} title="Select gender" aria-required="true">
                          <option value="">Select Gender</option><option value="Male">Male</option><option value="Female">Female</option>
                        </select>
                      </div>
                      <div className="ep-input-group"><label>Civil Status *</label>
                        <select name="other_civil_status" value={formData.other_civil_status} onChange={handleInputChange} title="Select status" aria-required="true">
                          <option value="Single">Single</option><option value="Married">Married</option><option value="Widowed">Widowed</option>
                        </select>
                      </div>
                      <div className="ep-input-group"><label>Sector</label>
                        <select name="other_sector" value={formData.other_sector} onChange={handleInputChange} title="Select group if applicable">
                          <option value="">Select Sector</option><option value="Senior Citizen">Senior Citizen</option><option value="PWD">PWD</option><option value="Solo Parent">Solo Parent</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                <div className="ep-grid" style={{ marginTop: '30px' }}>
                  <div className="ep-input-group ep-full">
                    <label>Purpose of Request *</label>
                    <select name="purpose" value={formData.purpose} onChange={handleInputChange} title="What will you use this certificate for?" aria-required="true">
                      <option value="">Select Purpose</option>
                      <option value="Employment">Employment Requirement</option>
                      <option value="Bank Account">Opening Bank Account</option>
                      <option value="ID Requirement">Valid ID Application</option>
                      <option value="Other">Other</option>
                    </select>
                    <p className="ep-accessibility-hint" aria-hidden="true"><i className="bi bi-info-circle"></i> Tell us why you need this proof of residency.</p>
                  </div>
                  {formData.purpose === 'Other' && (
                    <div className="ep-input-group ep-full slide-in">
                      <label>Specify Purpose *</label>
                      <input type="text" name="otherPurposeText" value={formData.otherPurposeText} onChange={handleInputChange} placeholder="Type your reason here" title="Please type your specific reason" aria-required="true" />
                    </div>
                  )}
                </div>
              </div>
            )}

            {currentStep === 1 && (
               <div className="slide-in">
                <h4 className="ep-section-title"><i className="bi bi-house-door"></i> Address Verification</h4>
                <div className="ep-grid">
                  {requestMode === 'Self' ? (
                    <>
                      <div className="ep-input-group ep-full">
                        <label>Registered Address</label>
                        <input type="text" value={`${formData.block_lot}, ${formData.street}, ${formData.subdivision}, Zone ${formData.zone}`} readOnly title="Your current registered address" />
                      </div>
                      <div className="ep-input-group">
                        <label>Years in Barangay</label>
                        <input type="text" value={formData.years_in_PB2} readOnly title="How long you lived here" />
                      </div>
                      <div className="ep-input-group">
                        <label>Residency Status</label>
                        <input type="text" value={formData.residency_status} readOnly title="Ownership type" />
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="ep-input-group"><label htmlFor="other_block_lot">Block/Lot *</label><input type="text" id="other_block_lot" name="other_block_lot" value={formData.other_block_lot} onChange={handleInputChange} placeholder="Blk 1 Lot 2" title="Type the beneficiary's block and lot number" /></div>
                      <div className="ep-input-group"><label htmlFor="other_street">Street *</label><input type="text" id="other_street" name="other_street" value={formData.other_street} onChange={handleInputChange} placeholder="Street Name" title="Type the street name" /></div>
                      <div className="ep-input-group"><label htmlFor="other_subdivision">Subdivision *</label><input type="text" id="other_subdivision" name="other_subdivision" value={formData.other_subdivision} onChange={handleInputChange} placeholder="Subdivision Name" title="Type the subdivision name" /></div>
                      <div className="ep-input-group"><label htmlFor="other_zone">Zone </label><input type="text" id="other_zone" name="other_zone" value={formData.other_zone} onChange={handleInputChange} placeholder="Zone No." title="Type the zone number" /></div>
                      <div className="ep-input-group"><label htmlFor="other_years_in_PB2">Years of Residency *</label><input type="text" id="other_years_in_PB2" name="other_years_in_PB2" value={formData.other_years_in_PB2} onChange={handleInputChange} placeholder="Ex: 5" title="Number of years the beneficiary has lived here" /></div>
                      <div className="ep-input-group"><label htmlFor="other_precinct">Precinct No. (Optional)</label><input type="text" id="other_precinct" name="other_precinct" value={formData.other_precinct} onChange={handleInputChange} placeholder="Precinct No." title="Beneficiary's precinct number" /></div>
                      <div className="ep-input-group"><label>Status *</label>
                        <select name="other_residency_status" value={formData.other_residency_status} onChange={handleInputChange} title="Homeowner, Tenant, or Boarder" aria-required="true">
                          <option value="">Select Status</option><option value="Homeowner">Homeowner</option><option value="Tenant">Tenant</option><option value="Boarder">Boarder</option>
                        </select>
                      </div>
                    
                    </>
                  )}
                </div>
              </div>
            )}
                  
        

            {currentStep === 2 && (
              <div className="slide-in">
                <h4 className="ep-section-title" title="Upload clear photos of your documents"><i className="bi bi-file-earmark-lock"></i> Verification Documents</h4>
                <div className="ep-grid" style={{ gap: '20px' }}>
                  {renderFilePreview('valid_id', 'Valid ID', 'Upload copy of your ID', 'bi-person-badge')}
                  {renderFilePreview('proof_doc', 'Proof of Residency', 'Utility bill or lease contract', 'bi-house-check')}
                </div>
                <p className="ep-accessibility-hint mt-3"><i className="bi bi-shield-lock"></i> All files are stored securely and used only for verification.</p>
              </div>
            )}

            {currentStep === 3 && (
              <div className="slide-in">
                <div className="ep-review-box" aria-live="polite">
                  <h4 className="ep-section-title" style={{ border: 'none', marginBottom: '5px' }} title="Please check if all info is correct">
                    <i className="bi bi-file-earmark-text text-success me-2"></i> Review & Submit Request
                  </h4>
                  
                  <div className="ep-review-category">
                    <h4 title="Tracking Details">System Details</h4>
                    <div className="ep-review-row">
                      <span className="ep-review-label">Tracking Number</span>
                      <span className="ep-review-val highlight" title={`Your code is ${trackingCode}`}>{trackingCode}</span>
                    </div>
                  </div>

                  <div className="ep-review-category">
                    <h4 title="Personal details summary">Identity Details</h4>

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
                      <span className="ep-review-label">Gender</span>
                      <span className="ep-review-val">{requestMode === 'Self' ? formData.gender : formData.other_gender}</span>
                    </div>

                    <div className="ep-review-row">
                      <span className="ep-review-label">Sector</span>
                      <span className="ep-review-val">{requestMode === 'Self' ? (formData.sector || 'None') : (formData.other_sector || 'None')}</span>
                    </div>
                    
                    <div className="ep-review-row">
                      <span className="ep-review-label">Postal Code</span>
                      <span className="ep-review-val">{requestMode === 'Self' ? formData.postalCode || 'N/A' : formData.other_postalCode || 'N/A'}</span>
                    </div>

                  </div>

                  <div className="ep-review-category">
                    <h4 title="Address details summary">Location & Group</h4>
                    <div className="ep-review-row">
                      <span className="ep-review-label">Complete Address</span>
                      <span className="ep-review-val">
                        {requestMode === 'Self' 
                          ? `${formData.block_lot}, ${formData.street}, ${formData.subdivision}, Zone ${formData.zone}` 
                          : `${formData.other_block_lot}, ${formData.other_street}, ${formData.other_subdivision}, ${formData.other_zone}`}
                      </span>
                    </div>
                  </div>

                   <div className="ep-review-row">
                      <span className="ep-review-label">Years of Residency</span>
                      <span className="ep-review-val">{requestMode === 'Self' ? formData.years_in_PB2 : formData.other_years_in_PB2}</span>
                    </div>

                  <div className="ep-review-category">
                    <h4 title="Why you need this certificate">Request Purpose</h4>
                    <div className="ep-review-row">
                      <span className="ep-review-label">Main Purpose</span>
                      <span className="ep-review-val">{formData.purpose === 'Other' ? formData.otherPurposeText : formData.purpose}</span>
                    </div>
                  </div>

                  <div className="ep-card-body mt-3">
                    <div className="ep-card-text">
                      <h5 title="What happens next">
                        Your request will be sent to the <i>Barangay Admin</i> for approval. 
                        You will get an email notification once it is ready.
                      </h5>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="ep-actions" style={{ display: 'flex', gap: '15px', marginTop: '30px' }}>
              <button 
                type="button"
                className="ep-btn ep-btn-prev" 
                disabled={currentStep === 0} 
                onClick={() => setCurrentStep(currentStep - 1)}
                title="Go back to previous page"
                style={{ padding: '15px 44px', minWidth: '44px' }} // Fitts's Law
              >
                <i className="bi bi-arrow-left"></i> Back
              </button>
              <button 
                type="button" 
                className="ep-btn ep-btn-next" 
                disabled={!validateStep() || isSubmitting}
                onClick={() => currentStep === 3 ? handleSubmit() : setCurrentStep(currentStep + 1)}
                title={currentStep === 3 ? "Send my request now" : "Go to next step"}
                style={{ padding: '3px 44px', minWidth: '44px'}} // Fitts's Law
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

export default BarangayResidency;