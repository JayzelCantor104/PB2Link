import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Header from '../components/Header';
import Footer from '../components/Footer';
import Preloader from '../components/Preloader';
import '../styles/barangayDocuments.css';

const API_BASE = 'http://localhost/PB2Link/backend/api'; // Adjust path if necessary

const DynamicRequestForm = () => {
  const { serviceId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [service, setService] = useState(null);
  const [fields, setFields] = useState([]);
  const [loading, setLoading] = useState(true);

  const [currentStep, setCurrentStep] = useState(0);
  const [requestMode, setRequestMode] = useState('Self');
  const [trackingCode, setTrackingCode] = useState('');
  const [toast, setToast] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState([]);

  // Form State Containers
  const [formData, setFormData] = useState({
    // User Profile Data
    resident_id: '', fName: '', mName: '', lName: '', suffix: '', age: '',
    birth_date: '', civil_status: '', gender: '', block_lot: '', houseNo: '',
    street: '', subdivision: '', zone: '', contact_num: '',
    // Beneficiary Data (For 'Others' mode)
    other_fname: '', other_mname: '', other_lname: '', other_suffix: '',
    other_age: '', other_birth_date: '', other_gender: '', other_civil_status: '',
    other_block_lot: '', other_street: '', other_subdivision: '', other_zone: '',
    other_contact_num: '',
    // Uploads & Dynamic values container
    owner_id: null,
    dynamicFields: {} // Dynamic form values stored here key-value
  });

  // 1. Generate Tracking Code & Fetch Service/Fields Metadata
  useEffect(() => {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const randomHash = Math.random().toString(36).substring(2, 8).toUpperCase();
    setTrackingCode(`REQ-${date}-${randomHash}`);

    if (serviceId) {
      loadServiceDetails();
    }
  }, [serviceId]);

  const loadServiceDetails = async () => {
    try {
      setLoading(true);
      // Fetch all services to identify current service
      const sRes = await fetch(`${API_BASE}/services.php?action=get_all`);
      const sData = await sRes.json();

      if (sData.success) {
        const found = sData.services.find(s => String(s.service_id) === String(serviceId));
        if (found) {
          setService(found);

          // Fetch dynamic custom fields for this service
          const fRes = await fetch(`${API_BASE}/services.php?action=get_fields&service_id=${found.service_id}`);
          const fData = await fRes.json();
          if (fData.success) {
            setFields(fData.fields || []);
          }
        } else {
          showToast('Service Not Found', 'The requested service does not exist.', 'error');
        }
      }
    } catch (err) {
      console.error('Error fetching service details:', err);
    } finally {
      setLoading(false);
    }
  };

  // 2. Fetch User Profile Info for Autofill
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
              contact_num: d.contact_num || '',
            }));
          }
        })
        .catch(err => console.error("Failed to fetch user profile", err));
    }
  }, [user]);

  // Stepper definition
  const steps = [
    { key: 'Identity', label: 'Identity', icon: 'bi-person-badge' },
    { key: 'Residency', label: 'Details', icon: 'bi-file-text' },
    { key: 'Uploads', label: 'Uploads', icon: 'bi-cloud-arrow-up-fill' },
    { key: 'Review', label: 'Review', icon: 'bi-clipboard2-check-fill' }
  ];

  // Helper function to calculate age
  const calculateAge = (birthDate) => {
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    if (errors.includes(name)) {
      setErrors(errors.filter(field => field !== name));
    }

    if (name === "other_birth_date") {
      setFormData(prev => ({
        ...prev,
        [name]: value,
        other_age: calculateAge(value)
      }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleDynamicInputChange = (fieldName, value) => {
    if (errors.includes(fieldName)) {
      setErrors(errors.filter(f => f !== fieldName));
    }
    setFormData(prev => ({
      ...prev,
      dynamicFields: {
        ...prev.dynamicFields,
        [fieldName]: value
      }
    }));
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

  // Field validation per wizard step
  const getMissingFields = () => {
    const missing = [];
    const currentStepKey = steps[currentStep].key;

    // Standard Identity validation
    if (currentStepKey === 'Identity' && requestMode === 'Others') {
      if (!formData.other_fname) missing.push('other_fname');
      if (!formData.other_lname) missing.push('other_lname');
      if (!formData.other_birth_date) missing.push('other_birth_date');
      if (!formData.other_gender) missing.push('other_gender');
      if (!formData.other_civil_status) missing.push('other_civil_status');
    }

    // Default Uploads step check
    if (currentStepKey === 'Uploads') {
      if (!formData.owner_id) missing.push('owner_id');
    }

    // Check dynamic required custom fields in the current step section
    const currentStepFields = fields.filter(f => f.step_section === currentStepKey);
    currentStepFields.forEach(f => {
      // Respect target visibility filtering
      if (
        f.show_for_target === 'all' ||
        (f.show_for_target === 'myself' && requestMode === 'Self') ||
        (f.show_for_target === 'third_party' && requestMode === 'Others')
      ) {
        if (f.is_required) {
          const val = formData.dynamicFields[f.field_name];
          if (!val || val.toString().trim() === '') {
            missing.push(f.field_name);
          }
        }
      }
    });

    return missing;
  };

  const handleNextStep = () => {
    const missingFields = getMissingFields();
    if (missingFields.length === 0) {
      setErrors([]);
      setCurrentStep(currentStep + 1);
    } else {
      setErrors(missingFields);
      showToast('Incomplete Fields', 'Please complete the required fields highlighted in red.', 'error');
    }
  };

  const showToast = (title, message, type = 'success') => {
    setToast({ title, message, type });
    setTimeout(() => setToast(null), 6000);
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    const data = new FormData();

    data.append('user_id', user.user_id);
    data.append('service_id', service.service_id);
    data.append('tracking_code', trackingCode);
    data.append('request_mode', requestMode);

    // Profile & Beneficiary fields
    if (requestMode === 'Self') {
      data.append('fName', formData.fName);
      data.append('mName', formData.mName);
      data.append('lName', formData.lName);
      data.append('suffix', formData.suffix);
      data.append('contact_num', formData.contact_num);
      data.append('beneficiary_name', `${formData.fName} ${formData.lName}`);
    } else {
      data.append('fName', formData.other_fname);
      data.append('mName', formData.other_mname);
      data.append('lName', formData.other_lname);
      data.append('suffix', formData.other_suffix);
      data.append('contact_num', formData.other_contact_num);
      data.append('beneficiary_name', `${formData.other_fname} ${formData.other_lname}`);
    }

    if (formData.owner_id) {
      data.append('owner_id', formData.owner_id);
    }

    // Pass custom dynamic fields payload as JSON string
    data.append('dynamic_fields', JSON.stringify(formData.dynamicFields));

    try {
      const response = await fetch(`${API_BASE}/submit_service_request.php`, {
        method: 'POST',
        body: data,
      });
      const result = await response.json();

      if (result.success) {
        showToast('Success!', result.message || 'Request submitted successfully!', 'success');
        setTimeout(() => {
          setIsSubmitting(false);
          navigate('/services');
        }, 2000);
      } else {
        showToast('Error', result.message || 'Failed to submit request.', 'error');
        setIsSubmitting(false);
      }
    } catch (error) {
      showToast('Server Error', 'Could not communicate with the backend.', 'error');
      setIsSubmitting(false);
    }
  };

  // Helper component to render individual dynamic custom fields
  const renderDynamicField = (field) => {
    // Target filter check
    if (
      (field.show_for_target === 'myself' && requestMode !== 'Self') ||
      (field.show_for_target === 'third_party' && requestMode !== 'Others')
    ) {
      return null;
    }

    const hasError = errors.includes(field.field_name);
    const value = formData.dynamicFields[field.field_name] || '';

    let options = [];
    if (field.field_options) {
      try {
        options = typeof field.field_options === 'string' ? JSON.parse(field.field_options) : field.field_options;
      } catch (e) {
        options = String(field.field_options).split(',');
      }
    }

    return (
      <div className={`ep-input-group ${field.field_type === 'textarea' ? 'ep-full' : ''}`} key={field.field_id}>
        <label htmlFor={field.field_name}>
          {field.field_label} {field.is_required === 1 && '*'}
        </label>

        {field.field_type === 'text' && (
          <input
            type="text"
            id={field.field_name}
            name={field.field_name}
            value={value}
            onChange={(e) => handleDynamicInputChange(field.field_name, e.target.value)}
            className={hasError ? 'error-ring' : ''}
          />
        )}

        {field.field_type === 'number' && (
          <input
            type="number"
            id={field.field_name}
            name={field.field_name}
            value={value}
            onChange={(e) => handleDynamicInputChange(field.field_name, e.target.value)}
            className={hasError ? 'error-ring' : ''}
          />
        )}

        {field.field_type === 'date' && (
          <input
            type="date"
            id={field.field_name}
            name={field.field_name}
            value={value}
            onChange={(e) => handleDynamicInputChange(field.field_name, e.target.value)}
            className={hasError ? 'error-ring' : ''}
          />
        )}

        {field.field_type === 'textarea' && (
          <textarea
            id={field.field_name}
            name={field.field_name}
            rows="3"
            value={value}
            onChange={(e) => handleDynamicInputChange(field.field_name, e.target.value)}
            className={hasError ? 'error-ring' : ''}
          ></textarea>
        )}

        {field.field_type === 'select' && (
          <select
            id={field.field_name}
            name={field.field_name}
            value={value}
            onChange={(e) => handleDynamicInputChange(field.field_name, e.target.value)}
            className={hasError ? 'error-ring' : ''}
          >
            <option value="">Select Option</option>
            {options.map((opt, i) => (
              <option key={i} value={typeof opt === 'string' ? opt.trim() : opt}>
                {typeof opt === 'string' ? opt.trim() : opt}
              </option>
            ))}
          </select>
        )}
      </div>
    );
  };

  const renderFilePreview = (fileKey, label, subLabel, iconClass) => {
    const file = formData[fileKey];
    const hasError = errors.includes(fileKey);
    return (
      <div
        className={`ep-file-upload-box ${file ? 'has-file' : ''} ${hasError ? 'error-ring' : ''}`}
        onClick={() => document.getElementById(fileKey).click()}
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

  if (loading) {
    return <Preloader />;
  }

  if (!service) {
    return (
      <>
        <Header />
        <div className="ep-page-wrapper" style={{ textAlign: 'center', padding: '100px 20px' }}>
          <h2>Service Not Found</h2>
          <button className="ep-btn ep-btn-next" style={{ margin: '20px auto' }} onClick={() => navigate('/services')}>
            Return to Services
          </button>
        </div>
        <Footer />
      </>
    );
  }

  const currentStepKey = steps[currentStep].key;
  const currentStepFields = fields.filter(f => f.step_section === currentStepKey);

  return (
    <>
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
            <h2>{service.title}</h2>
            <div className="ep-badge-official"><i className="bi bi-shield-check"></i> Barangay Official Portal</div>
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
                {service.allow_third_party === 1 && (
                  <div className="ep-toggle-wrapper">
                    <span className="ep-toggle-label" id="mode-label">Who is this request for?</span>
                    <div
                      className="ep-toggle-container"
                      onClick={() => setRequestMode(requestMode === 'Self' ? 'Others' : 'Self')}
                      role="button"
                    >
                      <div className={`ep-toggle-option ${requestMode === 'Self' ? 'active' : ''}`}>Myself</div>
                      <div className={`ep-toggle-option ${requestMode === 'Others' ? 'active' : ''}`}>Someone Else</div>
                      <div className="ep-toggle-slider" style={{ transform: requestMode === 'Self' ? 'translateX(0)' : 'translateX(100%)' }}></div>
                    </div>
                  </div>
                )}

                {requestMode === 'Self' ? (
                  <div className="slide-in">
                    <h4 className="ep-section-title"><i className="bi bi-person-bounding-box"></i> Applicant Information</h4>
                    <div className="ep-grid">
                      <div className="ep-input-group"><label>First Name</label><input type="text" value={formData.fName} readOnly /></div>
                      <div className="ep-input-group"><label>Middle Name</label><input type="text" value={formData.mName} readOnly /></div>
                      <div className="ep-input-group"><label>Last Name</label><input type="text" value={formData.lName} readOnly /></div>
                      <div className="ep-input-group"><label>Suffix</label><input type="text" value={formData.suffix} readOnly /></div>
                      <div className="ep-input-group"><label>Age</label><input type="text" value={formData.age} readOnly /></div>
                      <div className="ep-input-group"><label>Gender</label><input type="text" value={formData.gender} readOnly /></div>
                      <div className="ep-input-group"><label>Civil Status</label><input type="text" value={formData.civil_status} readOnly /></div>
                      <div className="ep-input-group"><label>Contact Line</label><input type="text" value={formData.contact_num} readOnly /></div>
                    </div>
                  </div>
                ) : (
                  <div className="slide-in">
                    <h4 className="ep-section-title"><i className="bi bi-person-add"></i> Beneficiary Details</h4>
                    <div className="ep-grid">
                      <div className="ep-input-group">
                        <label>First Name *</label>
                        <input type="text" name="other_fname" value={formData.other_fname} onChange={handleInputChange} className={errors.includes('other_fname') ? 'error-ring' : ''} />
                      </div>
                      <div className="ep-input-group">
                        <label>Middle Name</label>
                        <input type="text" name="other_mname" value={formData.other_mname} onChange={handleInputChange} />
                      </div>
                      <div className="ep-input-group">
                        <label>Last Name *</label>
                        <input type="text" name="other_lname" value={formData.other_lname} onChange={handleInputChange} className={errors.includes('other_lname') ? 'error-ring' : ''} />
                      </div>
                      <div className="ep-input-group">
                        <label>Suffix</label>
                        <input type="text" name="other_suffix" value={formData.other_suffix} onChange={handleInputChange} />
                      </div>
                      <div className="ep-input-group">
                        <label>Birthdate *</label>
                        <input type="date" name="other_birth_date" value={formData.other_birth_date} onChange={handleInputChange} className={errors.includes('other_birth_date') ? 'error-ring' : ''} />
                      </div>
                      <div className="ep-input-group">
                        <label>Gender *</label>
                        <select name="other_gender" value={formData.other_gender} onChange={handleInputChange} className={errors.includes('other_gender') ? 'error-ring' : ''}>
                          <option value="">Select Gender</option><option value="Male">Male</option><option value="Female">Female</option>
                        </select>
                      </div>
                      <div className="ep-input-group">
                        <label>Civil Status *</label>
                        <select name="other_civil_status" value={formData.other_civil_status} onChange={handleInputChange} className={errors.includes('other_civil_status') ? 'error-ring' : ''}>
                          <option value="">Select Status</option><option value="Single">Single</option><option value="Married">Married</option><option value="Widowed">Widowed</option>
                        </select>
                      </div>
                      <div className="ep-input-group">
                        <label>Mobile Number</label>
                        <input type="text" name="other_contact_num" value={formData.other_contact_num} onChange={handleInputChange} />
                      </div>
                    </div>
                  </div>
                )}

                {/* Render Dynamic Fields assigned to Identity Step */}
                {currentStepFields.length > 0 && (
                  <div className="mt-4">
                    <h4 className="ep-section-title"><i className="bi bi-list-check"></i> Service Custom Details</h4>
                    <div className="ep-grid">
                      {currentStepFields.map(f => renderDynamicField(f))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* STEP 2: RESIDENCY / DETAILS */}
            {currentStep === 1 && (
              <div className="slide-in">
                <h4 className="ep-section-title"><i className="bi bi-geo-alt-fill"></i> Address & Custom Parameters</h4>
                <div className="ep-grid mb-3">
                  <div className="ep-input-group ep-full">
                    <label>Registered Address</label>
                    <input
                      type="text"
                      readOnly
                      value={requestMode === 'Self'
                        ? `${formData.block_lot}, ${formData.street}, ${formData.subdivision}`
                        : `${formData.other_block_lot}, ${formData.other_street}, ${formData.other_subdivision}`}
                    />
                  </div>
                </div>

                {/* Render Dynamic Custom Fields for Residency/Details step */}
                {currentStepFields.length > 0 ? (
                  <div className="ep-grid">
                    {currentStepFields.map(f => renderDynamicField(f))}
                  </div>
                ) : (
                  <p className="text-slate-500 italic">No additional custom fields required for this step.</p>
                )}
              </div>
            )}

            {/* STEP 3: UPLOADS */}
            {currentStep === 2 && (
              <div className="slide-in">
                <h4 className="ep-section-title"><i className="bi bi-file-earmark-lock"></i> Verification & Attachments</h4>
                <div className="ep-grid">
                  {renderFilePreview('owner_id', 'Valid Identification Card *', 'Upload clear primary government ID card', 'bi-person-badge-fill')}
                  {currentStepFields.map(f => renderDynamicField(f))}
                </div>
              </div>
            )}

            {/* STEP 4: REVIEW */}
            {currentStep === 3 && (
              <div className="slide-in">
                <div className="ep-review-box" aria-live="polite">
                  <h4 className="ep-section-title" style={{ border: 'none', marginBottom: '5px' }}>
                    <i className="bi bi-file-earmark-text text-success me-2"></i> Review Application Summary
                  </h4>
                  <div className="ep-review-category">
                    <h4>Session Tracking Metadata</h4>
                    <div className="ep-review-row">
                      <span className="ep-review-label">Tracking Reference Code</span>
                      <span className="ep-review-val highlight">{trackingCode}</span>
                    </div>
                  </div>

                  <div className="ep-review-category">
                    <h4>Applicant Identity</h4>
                    <div className="ep-review-row">
                      <span className="ep-review-label">Full Name</span>
                      <span className="ep-review-val">
                        {requestMode === 'Self'
                          ? `${formData.fName} ${formData.mName} ${formData.lName}`.toUpperCase()
                          : `${formData.other_fname} ${formData.other_mname} ${formData.other_lname}`.toUpperCase()}
                      </span>
                    </div>
                    <div className="ep-review-row">
                      <span className="ep-review-label">Request Type</span>
                      <span className="ep-review-val">{requestMode === 'Self' ? 'Direct Application' : 'Representative Filing'}</span>
                    </div>
                  </div>

                  {Object.keys(formData.dynamicFields).length > 0 && (
                    <div className="ep-review-category">
                      <h4>Custom Application Entries</h4>
                      {Object.entries(formData.dynamicFields).map(([key, val]) => (
                        <div className="ep-review-row" key={key}>
                          <span className="ep-review-label">{key}</span>
                          <span className="ep-review-val font-bold">{String(val)}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="ep-review-category">
                    <h4>Attachments</h4>
                    <div className="mt-2">
                      <span className="ep-attachment-tag"><i className="bi bi-paperclip"></i> Government Valid Identification</span>
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

export default DynamicRequestForm;