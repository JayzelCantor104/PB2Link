import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext'; 
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import Footer from '../components/Footer';
import Preloader from '../components/Preloader';
import '../styles/barangayDocuments.css'; 

const API_BASE = '/api_backend';

const VolunteerRegistration = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);
  const [requestMode, setRequestMode] = useState('Self');
  const [trackingCode, setTrackingCode] = useState('');
  const [toast, setToast] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState([]); // HCI Operator Validation: Maps out unselected input bounding wrappers

  const [formData, setFormData] = useState({
    resident_id: '',
    fName: '', mName: '', lName: '', suffix: '',
    age: '', birth_date: '', civil_status: '', gender: '',
    block_lot: '', houseNo: '', street: '', subdivision: '', zone: '',
    years_in_PB2: '', precinct: '', sector: '', contact_num: '',
    
    // Volunteer Registration Specific Fields mapped from your schema
    email: '',
    program_area: '',
    availability: '',
    occupation: '',
    skills: '',
    
    // Others (Beneficiary) mode parameters
    other_fname: '', other_mname: '', other_lname: '', other_suffix: '',
    other_age: '', other_birth_date: '', other_gender: '', other_civil_status: '', other_sector: '',
    other_block_lot: '', other_houseNo: '', other_street: '', other_subdivision: '', other_zone: '',
    other_contact_num: '',
    
    // File upload target fields
    valid_id: null
  });

 const generateTrackingCode = () => {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const randomHash = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `VOL-${date}-${randomHash}`;
  };

  useEffect(() => {
    setTrackingCode(generateTrackingCode());
  }, []);

  // Autofill profile datasets mirroring your core template
  useEffect(() => {
    if (user?.user_id) {
      fetch(`${API_BASE}/get_user_profile.php?user_id=${user.user_id}`)
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            const d = data.data;
            setFormData(prev => ({
              ...prev,
              resident_id: d.resident_id || '',
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
              email: d.email || ''
            }));
          }
        })
        .catch(err => console.error("Failed to map volunteer profile tracking tokens", err));
    }
  }, [user]);

  // Evaluates empty fields per sequence step to enforce red-highlight error boundaries
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
      if (!formData.email) missing.push('email');
      if (!formData.program_area) missing.push('program_area');
      if (!formData.availability) missing.push('availability');
      if (!formData.occupation) missing.push('occupation');
      if (!formData.skills) missing.push('skills');
      
      if (requestMode === 'Others') {
        if (!formData.other_block_lot) missing.push('other_block_lot');
        if (!formData.other_street) missing.push('other_street');
        if (!formData.other_subdivision) missing.push('other_subdivision');
        if (!formData.other_contact_num) missing.push('other_contact_num');
      }
    }
    if (currentStep === 2) {
      if (!formData.valid_id) missing.push('valid_id');
    }
    return missing;
  };

  const handleNextStep = () => {
    const missingFields = getMissingFields();
    if (missingFields.length === 0) {
      setErrors([]);
      setCurrentStep(currentStep + 1);
    } else {
      setErrors(missingFields); // Applies .error-ring class to missing bounds instantly
      showToast('Incomplete Fields', 'Please complete the required fields highlighted in red.', 'error');
    }
  };

  const showToast = (title, message, type = 'success') => {
    setToast({ title, message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    const data = new FormData();
    data.append('user_id', user.user_id); 
    data.append('tracking_code', trackingCode);
    data.append('request_mode', requestMode);
    
    // Bind unique structural table context parameters
    data.append('email', formData.email);
    data.append('program_area', formData.program_area);
    data.append('availability', formData.availability);
    data.append('occupation', formData.occupation);
    data.append('skills', formData.skills);

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

    if (formData.valid_id) data.append('valid_id', formData.valid_id);

    try {
        const response = await fetch(`${API_BASE}/submit_volunteer_registration.php`, {
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
            setTrackingCode(generateTrackingCode()); // Generate fresh code so the user isn't stuck
            setIsSubmitting(false);
        }
    } catch (error) {
        showToast('Server Error', 'Invalid response from server runtime system configuration.', 'error');
        setTrackingCode(generateTrackingCode()); // Generate fresh code so the user isn't stuck
        setIsSubmitting(false);
    }
  };

  const steps = [
    { label: 'Identity', icon: 'bi-person-badge' },
    { label: 'Volunteer Profile', icon: 'bi-clipboard-heart' },
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
            <h2>Volunteer Action Registration</h2>
            <div className="ep-badge-official"><i className="bi bi-shield-check"></i> Barangay Support Network</div>
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
                  <span className="ep-toggle-label" id="mode-label">Who is being registered as a volunteer?</span>
                  <div 
                    className="ep-toggle-container" 
                    onClick={() => setRequestMode(requestMode === 'Self' ? 'Others' : 'Self')}
                    role="button"
                    tabIndex="0"
                    aria-labelledby="mode-label"
                    title="Click to toggle between registering yourself or someone else"
                  >
                    <div className={`ep-toggle-option ${requestMode === 'Self' ? 'active' : ''}`}>Myself</div>
                    <div className={`ep-toggle-option ${requestMode === 'Others' ? 'active' : ''}`}>Someone Else</div>
                    <div className="ep-toggle-slider" style={{ transform: requestMode === 'Self' ? 'translateX(0)' : 'translateX(100%)' }}></div>
                  </div>
                </div>

                {requestMode === 'Self' ? (
                  <div className="slide-in">
                    <h4 className="ep-section-title"><i className="bi bi-person-bounding-box"></i> Personal Profile Information</h4>
                    <div className="ep-grid">
                      <div className="ep-input-group"><label>First Name</label><input type="text" value={formData.fName} readOnly title="Your first name (Locked)" /></div>
                      <div className="ep-input-group"><label>Middle Name</label><input type="text" value={formData.mName} readOnly title="Your middle name (Locked)" /></div>
                      <div className="ep-input-group"><label>Last Name</label><input type="text" value={formData.lName} readOnly title="Your last name (Locked)" /></div>
                      <div className="ep-input-group"><label>Suffix</label><input type="text" value={formData.suffix} readOnly title="Your suffix (Locked)" /></div>
                      <div className="ep-input-group"><label>Age</label><input type="text" value={formData.age} readOnly title="Your age (Locked)" /></div>
                      <div className="ep-input-group"><label>Gender</label><input type="text" value={formData.gender} readOnly title="Your Gender (Locked)" /></div>
                      <div className="ep-input-group"><label>Civil Status</label><input type="text" value={formData.civil_status} readOnly title="Your civil status (Locked)" /></div>
                      <div className="ep-input-group"><label>Sector Status</label><input type="text" value={formData.sector} readOnly title="Your special sector (Locked)" /></div>
                    </div>
                  </div>
                ) : (
                  <div className="slide-in">
                    <h4 className="ep-section-title"><i className="bi bi-person-add"></i> Volunteer Registrant Details</h4>
                    <div className="ep-grid">
                      <div className="ep-input-group">
                        <label htmlFor="other_fname">Volunteer First Name *</label>
                        <input type="text" id="other_fname" name="other_fname" value={formData.other_fname} onChange={handleInputChange} placeholder="Enter First Name" title="Type the volunteer's first name" className={errors.includes('other_fname') ? 'error-ring' : ''} />
                      </div>
                      <div className="ep-input-group">
                        <label htmlFor="other_mname">Volunteer Middle Name</label>
                        <input type="text" id="other_mname" name="other_mname" value={formData.other_mname} onChange={handleInputChange} placeholder="Enter Middle Name" title="Type the volunteer's middle name" />
                      </div>
                      <div className="ep-input-group">
                        <label htmlFor="other_lname">Volunteer Last Name *</label>
                        <input type="text" id="other_lname" name="other_lname" value={formData.other_lname} onChange={handleInputChange} placeholder="Enter Last Name" title="Type the volunteer's last name" className={errors.includes('other_lname') ? 'error-ring' : ''} />
                      </div>
                      <div className="ep-input-group">
                        <label htmlFor="other_suffix">Suffix</label>
                        <input type="text" id="other_suffix" name="other_suffix" value={formData.other_suffix} onChange={handleInputChange} placeholder="Suffix" title="Type the volunteer's suffix" />
                      </div>
                      <div className="ep-input-group">
                        <label htmlFor="other_birth_date">Volunteer Birthdate *</label>
                        <input type="date" id="other_birth_date" name="other_birth_date" value={formData.other_birth_date} onChange={handleInputChange} title="Select the volunteer's birthdate" className={errors.includes('other_birth_date') ? 'error-ring' : ''} />
                      </div>
                      <div className="ep-input-group">
                        <label htmlFor="other_gender">Gender *</label>
                        <select id="other_gender" name="other_gender" value={formData.other_gender} onChange={handleInputChange} title="Select gender" className={errors.includes('other_gender') ? 'error-ring' : ''}>
                          <option value="">Select Gender</option><option value="Male">Male</option><option value="Female">Female</option>
                        </select>
                      </div>
                      <div className="ep-input-group">
                        <label htmlFor="other_civil_status">Civil Status *</label>
                        <select id="other_civil_status" name="other_civil_status" value={formData.other_civil_status} onChange={handleInputChange} title="Select civil status" className={errors.includes('other_civil_status') ? 'error-ring' : ''}>
                          <option value="">Select Status</option><option value="Single">Single</option><option value="Married">Married</option><option value="Widowed">Widowed</option><option value="Separated">Separated</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* STEP 2: VOLUNTEER PROFILING DETAILS */}
            {currentStep === 1 && (
              <div className="slide-in">
                <h4 className="ep-section-title"><i className="bi bi-briefcase"></i> Program & Skills Metrics</h4>
                <div className="ep-grid">
                  <div className="ep-input-group">
                    <label htmlFor="email">Personal / Contact Email *</label>
                    <input type="email" id="email" name="email" value={formData.email} onChange={handleInputChange} placeholder="example@domain.com" title="Type an active communication email address" className={errors.includes('email') ? 'error-ring' : ''} />
                  </div>
                  <div className="ep-input-group">
                    <label htmlFor="program_area">Preferred Volunteer Program Area *</label>
                    <select id="program_area" name="program_area" value={formData.program_area} onChange={handleInputChange} title="Choose preferred civic support program layout" className={errors.includes('program_area') ? 'error-ring' : ''}>
                      <option value="">Select Program Unit</option>
                      <option value="Disaster Response">Disaster Response & Relief</option>
                      <option value="Health Programs">Community Health & Cleanups</option>
                      <option value="Youth & Education">Youth Tutoring & Education Support</option>
                      <option value="Administrative">Barangay Event Administration</option>
                    </select>
                  </div>
                  <div className="ep-input-group">
                    <label htmlFor="availability">Time Availability Options *</label>
                    <select id="availability" name="availability" value={formData.availability} onChange={handleInputChange} title="Select scheduling framework boundaries" className={errors.includes('availability') ? 'error-ring' : ''}>
                      <option value="">Select Availability</option>
                      <option value="Weekends">Weekends Only</option>
                      <option value="Weekdays">Weekdays Only</option>
                      <option value="On-Call">Flexible / Emergency On-Call</option>
                    </select>
                  </div>
                  <div className="ep-input-group">
                    <label htmlFor="occupation">Current Professional Occupation *</label>
                    <input type="text" id="occupation" name="occupation" value={formData.occupation} onChange={handleInputChange} placeholder="e.g. Student, Teacher, Engineer" title="Type current livelihood role" className={errors.includes('occupation') ? 'error-ring' : ''} />
                  </div>
                  <div className="ep-input-group ep-full">
                    <label htmlFor="skills">Special Talents / Technical Skills Summary *</label>
                    <input type="text" id="skills" name="skills" value={formData.skills} onChange={handleInputChange} placeholder="e.g. First Aid, Driving, Computing, Public Speaking" title="Provide descriptive summaries of capabilities" className={errors.includes('skills') ? 'error-ring' : ''} />
                  </div>

                  {requestMode === 'Others' && (
                    <>
                      <div className="ep-full border-t pt-4 mt-2"><h5>Volunteer Barangay Residential Address</h5></div>
                      <div className="ep-input-group"><label htmlFor="other_block_lot">Block/Lot *</label><input type="text" id="other_block_lot" name="other_block_lot" value={formData.other_block_lot} onChange={handleInputChange} placeholder="Blk 1 Lot 2" className={errors.includes('other_block_lot') ? 'error-ring' : ''} /></div>
                      <div className="ep-input-group"><label htmlFor="other_street">Street Name *</label><input type="text" id="other_street" name="other_street" value={formData.other_street} onChange={handleInputChange} placeholder="Street" className={errors.includes('other_street') ? 'error-ring' : ''} /></div>
                      <div className="ep-input-group"><label htmlFor="other_subdivision">Subdivision Name *</label><input type="text" id="other_subdivision" name="other_subdivision" value={formData.other_subdivision} onChange={handleInputChange} placeholder="Subdivision" className={errors.includes('other_subdivision') ? 'error-ring' : ''} /></div>
                      <div className="ep-input-group"><label htmlFor="other_zone">Zone Number</label><input type="text" id="other_zone" name="other_zone" value={formData.other_zone} onChange={handleInputChange} placeholder="Zone" /></div>
                      <div className="ep-input-group"><label htmlFor="other_contact_num">Mobile Line *</label><input type="text" id="other_contact_num" name="other_contact_num" value={formData.other_contact_num} onChange={handleInputChange} placeholder="09XXXXXXXXX" className={errors.includes('other_contact_num') ? 'error-ring' : ''} /></div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* STEP 3: UPLOADS */}
            {currentStep === 2 && (
              <div className="slide-in">
                <h4 className="ep-section-title"><i className="bi bi-shield-check"></i> Identity Verification</h4>
                <div className="ep-grid">
                  {renderFilePreview('valid_id', 'Valid Identification Card *', 'Upload clear front copy of photo ID for structural credential index checks', 'bi-person-badge-fill')}
                </div>
              </div>
            )}

            {/* STEP 4: REVIEW */}
            {currentStep === 3 && (
              <div className="slide-in">
                <div className="ep-review-box" aria-live="polite">
                  <h4 className="ep-section-title" style={{ border: 'none', marginBottom: '5px' }}>
                    <i className="bi bi-file-earmark-text text-success me-2"></i> Review & Submit Registration Details
                  </h4>
                  
                  <div className="ep-review-category">
                    <h4>Registration Metadata Trace</h4>
                    <div className="ep-review-row">
                      <span className="ep-review-label">Tracking Sequence Token Code</span>
                      <span className="ep-review-val highlight">{trackingCode}</span>
                    </div>
                  </div>

                  <div className="ep-review-category">
                    <h4>Volunteer Identity Information</h4>
                    <div className="ep-review-row">
                      <span className="ep-review-label">Volunteer Full Name</span>
                      <span className="ep-review-val">
                        {requestMode === 'Self' 
                          ? `${formData.fName} ${formData.mName} ${formData.lName} ${formData.suffix !== 'N/A' ? formData.suffix : ''}`.toUpperCase() 
                          : `${formData.other_fname} ${formData.other_mname} ${formData.other_lname} ${formData.other_suffix}`.toUpperCase()}
                      </span>
                    </div>
                    <div className="ep-review-row">
                      <span className="ep-review-label">Age Metric</span>
                      <span className="ep-review-val">{requestMode === 'Self' ? formData.age : formData.other_age || 'N/A'}</span>
                    </div>
                    <div className="ep-review-row">
                      <span className="ep-review-label">Contact Email Address</span>
                      <span className="ep-review-val">{formData.email}</span>
                    </div>
                  </div>

                  <div className="ep-review-category">
                    <h4>Engagement Portfolio</h4>
                    <div className="ep-review-row">
                      <span className="ep-review-label">Assigned Civic Target Program</span>
                      <span className="ep-review-val font-bold text-emerald-800">{formData.program_area}</span>
                    </div>
                    <div className="ep-review-row">
                      <span className="ep-review-label">Availability Schedule Setting</span>
                      <span className="ep-review-val">{formData.availability}</span>
                    </div>
                    <div className="ep-review-row">
                      <span className="ep-review-label">Capabilities Summary</span>
                      <span className="ep-review-val italic">{formData.skills}</span>
                    </div>
                  </div>

                  <div className="ep-review-category">
                    <h4>Filing Attachments Summary</h4>
                    <div className="mt-2">
                      <span className="ep-attachment-tag"><i className="bi bi-paperclip"></i> Verified Identity Card File Attachment</span>
                    </div>
                  </div>
                  
                  <div className="ep-card-accent"></div>
                  <div className="ep-card-body">
                    <div className="ep-card-text">
                      <div className="ep-review-category">
                        <h4>Review & System Registration Path</h4>
                      </div>
                      <h5>
                        Your volunteer operational profile file is being securely indexed into the log database. 
                        The Barangay Administration will evaluate resource allocation variables based on specified capability blocks. 
                        Status track parameters follow via system email indexes.
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

export default VolunteerRegistration;