import React, { useState, useEffect } from 'react'; 
import Header from '../components/Header'; 
import Footer from '../components/Footer'; 

const API_BASE = '/api_backend'; 

function EditProfile() { 
  // Matched exactly with database columns from the 'residents' and 'users' table schema 
  const [formData, setFormData] = useState({ 
    fName: '', mName: '', lName: '', suffix: '', sector: '', gender: 'Male', birth_date: '', 
    religion: '', civil_status: 'Single', birth_city: '', birth_province: '', birth_country: '', 
    house_no: '', street: '', zone: '', subdivision: '', area: '', block_lot: '', 
    landmark: '', residency_status: 'Homeowner', years_in_PB2: '', contact_num: '', 
    contact_person: '', contactp_relationship: 'Family', contactp_num: '', email: '' 
  }); 

  const [originalData, setOriginalData] = useState({}); 
  const [pendingChanges, setPendingChanges] = useState([]); 
  const [loading, setLoading] = useState(true); 
  const [errors, setErrors] = useState({}); 

  // Identity Verification Modal states 
  const [showModal, setShowModal] = useState(false); 
  const [modalData, setModalData] = useState({ old_email: '', current_password: '', old_phone: '' }); 
  const [modalErrors, setModalErrors] = useState({}); 

  // --- REFACTORED STATES FOR SINGLE OTP LIFECYCLE --- 
  const [showOtpModal, setShowOtpModal] = useState(false); 
  const [otpInput, setOtpInput] = useState(''); 
  const [verifyingFieldsList, setVerifyingFieldsList] = useState([]); // tracks all changed fields together
  
  // Password change state
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordData, setPasswordData] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [passwordErrors, setPasswordErrors] = useState({});

  // Proof document state for admin approval fields
  const [proofFile, setProofFile] = useState(null);
  const [proofPreview, setProofPreview] = useState(null);
  const [proofBase64, setProofBase64] = useState('');
  const [showProofRequiredAlert, setShowProofRequiredAlert] = useState(false);

  // Toast notification state
  const [toast, setToast] = useState(null);

  // Regular expression data validation filters 
  const nameRegex = /^(?!\s*$)[A-Za-z\s]+(?: [A-Za-z\s]+)*$/; 
  const addressRegex = /^[A-Za-z0-9.,'\s-]+$/; 
  const alphanumericRegex = /^[A-Za-z0-9\s.,'-]+$/; 
  const number11 = /^09\d{9}$/; 
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[A-Za-z]{2,}$/; 
  const numberRegex = /^\d+$/; 

          useEffect(() => { 
            const fetchUserData = async () => { 
              try { 
                const response = await fetch(`${API_BASE}/get_profile.php`, { credentials: 'include' }); 
                const result = await response.json(); 
                if (result.success) { 
                  const dbFields = { 
                    fName: result.user.fName || '', mName: result.user.mName || '', lName: result.user.lName || '', 
                    suffix: result.user.suffix || '', sector: result.user.sector || '', gender: result.user.gender || 'Male', birth_date: result.user.birth_date || '', 
                    religion: result.user.religion || '', civil_status: result.user.civil_status || 'Single', 
                    birth_city: result.user.birth_city || '', birth_province: result.user.birth_province || '', birth_country: result.user.birth_country || '', 
                    house_no: result.user.house_no || '', street: result.user.street || '', zone: result.user.zone || '', 
                    subdivision: result.user.subdivision || '', area: result.user.area || '', block_lot: result.user.block_lot || '', 
                    landmark: result.user.landmark || '', residency_status: result.user.residency_status || 'Homeowner', 
                    years_in_PB2: result.user.years_in_PB2 || '', contact_num: result.user.contact_num || '', 
                    contact_person: result.user.contact_person || '', contactp_relationship: result.user.contactp_relationship || 'Family', 
                    contactp_num: result.user.contactp_num || '', email: result.user.email || '' 
                  }; 
          setFormData(dbFields); 
          setOriginalData(dbFields); 
          setPendingChanges(result.pending_changes || []); 
        } 
      } catch (err) { 
        console.error("Failed fetching database account data", err); 
      } finally { 
        setLoading(false); 
      } 
    }; 
    fetchUserData(); 
  }, []); 

  const formatPhoneNumber = (phone) => { 
    if (!phone) return ''; 
    const numeric = phone.replace(/\D/g, ''); 
    if (numeric.length === 11 && numeric.startsWith('09')) return numeric; 
    if (numeric.length === 10 && numeric.startsWith('9')) return '0' + numeric; 
    return numeric; 
  }; 

  const validateField = (name, value) => { 
    let hasError = false; 
    const trimmed = value.toString().trim(); 
    if (trimmed === "" && ['mName', 'subdivision', 'area', 'block_lot', 'landmark', 'religion'].includes(name)) { 
      return false; 
    } 
    switch (name) { 
      case 'fName': case 'mName': case 'lName': case 'religion': case 'birth_city': case 'birth_province': case 'birth_country': case 'contact_person': 
        hasError = !nameRegex.test(trimmed); 
        break; 
      case 'street': 
        hasError = !addressRegex.test(trimmed); 
        break; 
      case 'house_no': case 'subdivision': case 'area': case 'block_lot': case 'landmark': 
        hasError = !alphanumericRegex.test(trimmed); 
        break; 
      case 'contact_num': case 'contactp_num': 
        hasError = !number11.test(formatPhoneNumber(trimmed)); 
        break; 
      case 'email': 
        hasError = !emailRegex.test(trimmed); 
        break; 
      case 'zone': 
        hasError = !numberRegex.test(trimmed) || parseInt(trimmed, 10) < 1; 
        break; 
      case 'years_in_PB2': 
        hasError = parseInt(trimmed, 10) < 0 || isNaN(parseInt(trimmed, 10)); 
        break; 
      default: 
        break; 
    } 
    return hasError; 
  }; 

  const handleInputChange = (e) => { 
    const { name, value } = e.target; 
    setFormData(prev => ({ ...prev, [name]: value })); 
    const isInvalid = validateField(name, value); 
    setErrors(prev => ({ ...prev, [name]: isInvalid })); 

    // Show proof required alert if admin approval fields are changed
    const adminFields = ['fName', 'mName', 'lName', 'suffix', 'sector'];
    if (adminFields.includes(name) && value !== originalData[name]) {
      setShowProofRequiredAlert(true);
    } else {
      // Check if any admin field is changed
      const anyAdminChanged = adminFields.some(f => formData[f] !== originalData[f]);
      if (!anyAdminChanged) {
        setShowProofRequiredAlert(false);
      }
    }
  };

  // Handle proof document upload
  const handleProofFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) { // 5MB limit
        alert('File size must be less than 5MB');
        return;
      }
      setProofFile(file);

      const reader = new FileReader();
      reader.onloadend = () => {
        setProofBase64(reader.result);
        // Only set UI graphic previews if it's an actual image
        if (file.type.startsWith('image/')) {
          setProofPreview(reader.result);
        } else {
          setProofPreview(null);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Remove proof document
  const removeProofDocument = () => {
    setProofFile(null);
    setProofPreview(null);
    setProofBase64('');
  };

  // Show toast notification
  const showToast = (title, message, type = 'success') => {
    setToast({ title, message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const handleFormSubmit = (e) => { 
    e.preventDefault(); 
    const totalErrors = Object.values(errors).some(errorState => errorState === true); 
    if (totalErrors) { 
      showToast('Validation Error', 'Please correct validation issues before submitting details.', 'error');
      return; 
    } 

    // Check if admin approval fields are changed without proof
    const adminFields = ['fName', 'mName', 'lName', 'suffix', 'sector'];
    const adminFieldsChanged = adminFields.filter(f => formData[f] !== originalData[f]);
    
    if (adminFieldsChanged.length > 0 && !proofFile) {
      showToast('Proof Required', 'Please attach a valid ID or proof document to support your name/sector change request.', 'error');
      return;
    }

    const internalChangesDetected = Object.keys(formData).some( 
      key => formData[key].toString().trim() !== originalData[key]?.toString().trim() 
    ); 
    if (internalChangesDetected) { 
      setModalData({ old_email: '', current_password: '', old_phone: '' }); 
      setModalErrors({}); 
      setShowModal(true); 
    } else { 
      showToast('No Changes', 'No data changes detected.', 'info');
    }
  };

  const handleModalVerify = async () => { 
    let currentModalErrors = {}; 
    let valid = true; 
    
    // Validate email matches current email
    if (modalData.old_email.trim() !== originalData.email) { 
      currentModalErrors.old_email = 'Does not match current database entry email.'; 
      valid = false; 
    } 
    
    // Validate phone if changed
    const contactChanged = formatPhoneNumber(formData.contact_num) !== formatPhoneNumber(originalData.contact_num); 
    if (contactChanged) { 
      if (!modalData.old_phone.trim()) { 
        currentModalErrors.old_phone = 'Field required.'; 
        valid = false; 
      } else if (formatPhoneNumber(modalData.old_phone) !== formatPhoneNumber(originalData.contact_num)) { 
        currentModalErrors.old_phone = 'Does not match current database record phone.'; 
        valid = false; 
      } 
    } 
    
    // Validate password is provided
    if (!modalData.current_password) { 
      currentModalErrors.current_password = 'Password identification validation value required.'; 
      valid = false; 
    } 
    
    setModalErrors(currentModalErrors); 
    
    if (valid) { 
      // Verify password with backend
      try {
        const verifyRes = await fetch(`${API_BASE}/edit_profile.php`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            verify_password: '1',
            email: originalData.email,
            password: modalData.current_password
          }),
          credentials: 'include'
        });
        const verifyData = await verifyRes.json();
        
        if (!verifyData.success) {
          showToast('Verification Failed', verifyData.message || 'Incorrect password.', 'error');
          return;
        }
        
        setShowModal(false); 
        await submitPayloadToBackend({ 
          old_email: modalData.old_email, 
          current_password: modalData.current_password, 
          old_contact_num: modalData.old_phone 
        }); 
      } catch (err) {
        console.error("Password verification error", err);
        showToast('Error', 'Network error during verification.', 'error');
      }
    } 
  };

  const submitPayloadToBackend = async (verificationFields) => { 
    try { 
      // Check if admin approval fields are changed and include proof
      const adminFields = ['fName', 'mName', 'lName', 'suffix', 'sector'];
      const adminFieldsChanged = adminFields.some(f => formData[f] !== originalData[f]);
      
      const payload = { 
        ...formData, 
        ...verificationFields, 
        update_profile: '1',
        proof_document: adminFieldsChanged ? proofBase64 : null,
        proof_type: proofFile ? proofFile.type : null,
        proof_extension: proofFile ? proofFile.name.split('.').pop() : null
      }; 
      const response = await fetch(`${API_BASE}/edit_profile.php`, { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify(payload), 
        credentials: 'include' 
      }); 
      const resData = await response.json();

      if (resData.success) { 
        // 1. Gather ALL fields that were modified into an array
        const importantFields = ['email', 'contact_num', 'birth_city', 'birth_province', 'birth_country', 'house_no', 'street', 'zone', 'civil_status', 'gender', 'religion', 'residency_status', 'years_in_PB2']; 
        let changedFieldsDetected = []; 

        for (const field of importantFields) { 
          if (formData[field].toString().trim() !== originalData[field]?.toString().trim()) { 
            changedFieldsDetected.push(field); 
          } 
        } 

        // 2. Handle different response scenarios
        if (resData.hasAdminApproval && !resData.requiresOtp) {
          // Admin approval only (no OTP needed)
          showToast('Admin Approval Submitted', 'Your name/sector changes have been submitted for admin approval. You will receive an email once processed.', 'success');
          setTimeout(() => window.location.reload(), 2000);
        } else if (resData.requiresOtp) {
          // OTP required for email/phone or other changes
          setVerifyingFieldsList(changedFieldsDetected);
          showToast('OTP Sent', 'Please check your email for the verification code to complete your profile updates.', 'info');
          setShowOtpModal(true);
        } else {
          showToast('Success', 'Profile update request submitted successfully!', 'success');
          setTimeout(() => window.location.reload(), 2000);
        }
      } else { 
        showToast('Error', resData.message || 'Error processing your request.', 'error');
      }
    } catch (err) { 
      console.error("Networking connection tracking error", err); 
    } 
  };

  // Format field name for display
  const formatFieldName = (name) => {
    const fieldNames = {
      fName: 'First Name',
      mName: 'Middle Name',
      lName: 'Last Name',
      suffix: 'Suffix',
      sector: 'Sector'
    };
    return fieldNames[name] || name;
  };

  // Handle Password Change
  const handlePasswordChange = async () => {
    let errors = {};
    let valid = true;

    if (!passwordData.currentPassword) {
      errors.currentPassword = 'Current password is required.';
      valid = false;
    }
    if (!passwordData.newPassword || passwordData.newPassword.length < 8) {
      errors.newPassword = 'Password must be at least 8 characters.';
      valid = false;
    }
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      errors.confirmPassword = 'Passwords do not match.';
      valid = false;
    }

    setPasswordErrors(errors);
    if (!valid) return;

    try {
      const response = await fetch(`${API_BASE}/edit_profile.php`, {
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
      const result = await response.json();

      if (result.success) {
        showToast('Password Updated', 'Your password has been updated successfully!', 'success');
        setShowPasswordModal(false);
        setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
        setPasswordErrors({});
      } else {
        showToast('Error', result.message || 'Failed to update password.', 'error');
      }
    } catch (err) {
      console.error("Password change error", err);
      showToast('Network Error', 'Network error. Please try again.', 'error');
    }
  };

  // --- REFACTORED TO VERIFY ALL FIELDS AT ONCE --- 
  const handleVerifyOtpSubmit = async (e) => {
    e.preventDefault(); 
    try { 
      const response = await fetch(`${API_BASE}/verify_otp.php`, { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ 
          otp: otpInput, 
          fields: verifyingFieldsList // sends the complete list to verify altogether
        }), 
        credentials: 'include' 
      }); 
      const result = await response.json(); 
      if (result.success) { 
        showToast('Verification Successful', 'Profile modifications have been updated successfully!', 'success');
        setShowOtpModal(false); 
        setOtpInput(''); 
        setTimeout(() => window.location.reload(), 2000);
      } else { 
        showToast('Verification Failed', result.message || "Invalid security code. Please check your inbox.", 'error');
      }
    } catch (err) { 
      console.error("OTP network integration error", err); 
    } 
  }; 

  if (loading) return <div className="text-center my-5">Reading database registry states...</div>; 

return (
    <>
      <style>{`
        .profile-container-wrapper {
          max-width: 900px;
          margin: 3rem auto;
          padding: 3rem;
          background: #ffffff;
          border-radius: 1.5rem;
          border: 1px solid #e2e8f0;
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.02);
          margin-top:200px;
        }
        .profile-main-title {
          font-size: 2.2rem;
          color: #064e3b;
          font-weight: 700;
          margin-bottom: 2.5rem;
          border-bottom: 3px solid #047857;
          padding-bottom: 0.5rem;
          display: inline-block;
        }
        .section-divider-title {
          font-size: 1rem;
          color: #047857;
          font-weight: 700;
          margin-top: 2rem;
          margin-bottom: 1.25rem;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: 100%;
        }
        .section-divider-title small {
          text-transform: none;
          font-weight: 500;
          font-size: 0.85rem;
          color: #64748b;
        }
        .form-grid-layout {
          display: grid;
          grid-template-columns: repeat(12, 1fr);
          gap: 1.25rem;
        }
        .grid-col-3 { grid-column: span 3; }
        .grid-col-4 { grid-column: span 4; }
        .grid-col-5 { grid-column: span 5; }
        .grid-col-6 { grid-column: span 6; }
        .grid-col-8 { grid-column: span 8; }
        .grid-col-12 { grid-column: span 12; }

        @media (max-width: 768px) {
          .grid-col-3, .grid-col-4, .grid-col-5, .grid-col-6, .grid-col-8 {
            grid-column: span 12;
          }
          .profile-container-wrapper {
            padding: 1.5rem;
          }
        }

        .field-group {
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
        }
        .field-label {
          font-size: 0.85rem;
          font-weight: 600;
          color: #334155;
        }
        .custom-form-field {
          background: #f8fafc;
          border: 1px solid #cbd5e1;
          border-radius: 0.5rem;
          padding: 0.65rem 0.85rem;
          color: #1e293b;
          font-size: 0.95rem;
          transition: all 0.2s ease;
          width: 100%;
          box-sizing: border-box;
        }
        .custom-form-field:focus {
          border-color: #047857;
          box-shadow: 0 0 0 3px rgba(4, 120, 87, 0.12);
          background: #ffffff;
          outline: none;
        }
        .custom-form-field:disabled {
          background: #f1f5f9;
          border-color: #e2e8f0;
          color: #64748b;
          cursor: not-allowed;
        }
        .input-error-state {
          border-color: #ef4444 !important;
          background: #fef2f2 !important;
        }
        .btn-submit-verification {
          background: #047857;
          color: #ffffff;
          border: none;
          border-radius: 0.5rem;
          padding: 0.85rem;
          font-weight: 600;
          font-size: 1rem;
          cursor: pointer;
          transition: background 0.2s ease;
          margin-top: 2rem;
          width: 100%;
        }
        .btn-submit-verification:hover {
          background: #065f46;
        }
        .custom-modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          background: rgba(15, 23, 42, 0.4);
          backdrop-filter: blur(4px);
          z-index: 1050;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .custom-modal-card {
          background: #ffffff;
          border-radius: 1rem;
          padding: 2rem;
          width: 100%;
          max-width: 480px;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
        }
      `}</style>

      <Header />
      
      <div className="profile-container-wrapper">
        <h2 className="profile-main-title">Edit My Profile</h2>

        {/* --- REFACTORED STRUCTURAL CORRECTIONS LOG --- */}
        {pendingChanges.length > 0 && (
          <div 
            className="p-3 mb-4 shadow-sm" 
            style={{ 
              borderLeft: '5px solid #d97706', 
              borderRadius: '0.5rem', 
              background: '#fffbeb',
              fontFamily: "'Inter', system-ui, sans-serif"
            }}
          >
            <h4 className="h6 fw-bold mb-3 d-flex align-items-center" style={{ color: '#78350f' }}>
              <i className="bi bi-clock-history me-2"></i> Pending Structural Corrections Log
            </h4>
            
            <div className="d-flex flex-column gap-3">
              {pendingChanges.map((change, index) => {
                // Determine layout rules to fix word wraps and mismatch spacing perfectly
                let bgBadgeColor = '#f1f5f9';
                let textBadgeColor = '#475569';
                let labelText = change.status;

                if (change.status === 'pending_approval') {
                  bgBadgeColor = '#fef3c7';
                  textBadgeColor = '#d97706';
                  labelText = 'Pending Approval';
                } else if (change.status === 'pending_otp') {
                  bgBadgeColor = '#e0f2fe';
                  textBadgeColor = '#0369a1';
                  labelText = 'Pending OTP';
                }

                // Format database fields into readable labels (e.g. birth_city -> Birth City)
                const formatLabel = (name) => {
                  if (!name) return '';
                  return name.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());
                };

                return (
                  <div 
                    key={index} 
                    className="d-flex flex-column flex-sm-row align-items-start align-items-sm-center justify-content-between gap-2 pb-2"
                    style={{ borderBottom: index !== pendingChanges.length - 1 ? '1px dashed #fcd34d' : 'none' }}
                  >
                    <div className="d-flex flex-column text-start">
                      <strong style={{ color: '#1e293b', fontSize: '0.9rem' }}>
                        {formatLabel(change.field_name)}
                      </strong>
                      <div className="d-flex align-items-center flex-wrap gap-1 mt-1 small text-dark">
                        {change.old_value && (
                          <>
                            <span className="text-decoration-line-through text-muted bg-white px-1.5 py-0.5 rounded border border-light">
                              {change.old_value}
                            </span>
                            <i className="bi bi-arrow-right text-muted px-0.5"></i>
                          </>
                        )}
                        <span className="bg-white px-1.5 py-0.5 rounded fw-semibold border border-light" style={{ color: '#0f172a' }}>
                          {change.new_value}
                        </span>
                      </div>
                    </div>

                    <div className="mt-1 mt-sm-0">
                      <span 
                        style={{
                          backgroundColor: bgBadgeColor,
                          color: textBadgeColor,
                          fontSize: '0.75rem',
                          fontWeight: '700',
                          padding: '4px 12px',
                          borderRadius: '12px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          whiteSpace: 'nowrap' // Fixed clipping error completely
                        }}
                      >
                        <span 
                          style={{ 
                            width: '5px', 
                            height: '5px', 
                            backgroundColor: textBadgeColor, 
                            borderRadius: '50%', 
                            marginRight: '6px',
                            display: 'inline-block'
                          }}
                        ></span>
                        {labelText}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <form onSubmit={handleFormSubmit}>
          <div className="section-divider-title">
            Personal Details Identity Log 
            <small>(Changes require admin approval with proof)</small>
          </div>
          
          {showProofRequiredAlert && (
            <div className="alert alert-info p-3 mb-3" style={{ borderLeft: '5px solid #3b82f6', borderRadius: '0.5rem', background: '#eff6ff' }}>
              <i className="bi bi-info-circle me-2"></i> 
              <strong>Note:</strong> Changes to name or sector fields require a valid ID or proof document for verification. Please upload supporting documentation below.
            </div>
          )}

          <div className="form-grid-layout mb-4">
            <div className="field-group grid-col-4">
              <label className="field-label">First Name</label>
              <input type="text" name="fName" className={`custom-form-field ${errors.fName ? 'input-error-state' : ''}`} value={formData.fName} onChange={handleInputChange} required />
              {errors.fName && <div className="text-danger small">Alphabetic entries only.</div>}
            </div>
            
            <div className="field-group grid-col-4">
              <label className="field-label">Middle Name</label>
              <input type="text" name="mName" className={`custom-form-field ${errors.mName ? 'input-error-state' : ''}`} value={formData.mName} onChange={handleInputChange} />
              {errors.mName && <div className="text-danger small">Alphabetic entries only.</div>}
            </div>
            
            <div className="field-group grid-col-4">
              <label className="field-label">Last Name</label>
              <input type="text" name="lName" className={`custom-form-field ${errors.lName ? 'input-error-state' : ''}`} value={formData.lName} onChange={handleInputChange} required />
              {errors.lName && <div className="text-danger small">Alphabetic entries only.</div>}
            </div>
            
            <div className="field-group grid-col-3">
              <label className="field-label">Suffix</label>
              <select name="suffix" className="custom-form-field" value={formData.suffix || ''} onChange={handleInputChange}>
                <option value="">None</option>
                <option value="Jr.">Jr.</option>
                <option value="Sr.">Sr.</option>
                <option value="II">II</option>
                <option value="III">III</option>
                <option value="IV">IV</option>
              </select>
            </div>
            
            <div className="field-group grid-col-4">
              <label className="field-label">Sector</label>
              <select name="sector" className="custom-form-field" value={formData.sector || ''} onChange={handleInputChange}>
                <option value="">None</option>
                <option value="Senior Citizen">Senior Citizen</option>
                <option value="Solo Parent">Solo Parent</option>
                <option value="PWD">PWD (Person with Disability)</option>
                <option value="Indigent">Indigent</option>
              </select>
            </div>
            
            <div className="field-group grid-col-4">
              <label className="field-label">Gender</label>
              <select name="gender" className="custom-form-field" value={formData.gender} onChange={handleInputChange} required>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>
            
            <div className="field-group grid-col-5">
              <label className="field-label">Birth Date</label>
              <input type="date" name="birth_date" className="custom-form-field" value={formData.birth_date} onChange={handleInputChange} required />
            </div>
            
            <div className="field-group grid-col-4">
              <label className="field-label">Civil Status</label>
              <select name="civil_status" className="custom-form-field" value={formData.civil_status} onChange={handleInputChange} required>
                <option value="Single">Single</option>
                <option value="Married">Married</option>
                <option value="Widowed">Widowed</option>
                <option value="Separated">Separated</option>
              </select>
            </div>
            
            <div className="field-group grid-col-8">
              <label className="field-label">Religion</label>
              <input type="text" name="religion" className={`custom-form-field ${errors.religion ? 'input-error-state' : ''}`} value={formData.religion} onChange={handleInputChange} required />
              {errors.religion && <div className="text-danger small">Alphabetic entries only.</div>}
            </div>
          </div>

          <div className="section-divider-title">Origin & Birthplace Information</div>
          <div className="form-grid-layout mb-4">
            <div className="field-group grid-col-4">
              <label className="field-label">Birth City</label>
              <input type="text" name="birth_city" className="custom-form-field" value={formData.birth_city} onChange={handleInputChange} required />
            </div>
            <div className="field-group grid-col-4">
              <label className="field-label">Birth Province</label>
              <input type="text" name="birth_province" className="custom-form-field" value={formData.birth_province} onChange={handleInputChange} required />
            </div>
            <div className="field-group grid-col-4">
              <label className="field-label">Birth Country</label>
              <input type="text" name="birth_country" className="custom-form-field" value={formData.birth_country} onChange={handleInputChange} required />
            </div>
          </div>

          <div className="section-divider-title">
            Address Variables <small>(Requires administrative panel review)</small>
          </div>
          <div className="form-grid-layout mb-4">
            <div className="field-group grid-col-4">
              <label className="field-label">House No.</label>
              <input type="text" name="house_no" className="custom-form-field" value={formData.house_no} onChange={handleInputChange} required />
            </div>
            <div className="field-group grid-col-8">
              <label className="field-label">Street Name</label>
              <input type="text" name="street" className="custom-form-field" value={formData.street} onChange={handleInputChange} required />
            </div>
            <div className="field-group grid-col-4">
              <label className="field-label">Zone / Purok</label>
              <input type="text" name="zone" className="custom-form-field" value={formData.zone} onChange={handleInputChange} required />
            </div>
            <div className="field-group grid-col-8">
              <label className="field-label">Subdivision</label>
              <input type="text" name="subdivision" className="custom-form-field" value={formData.subdivision || ''} onChange={handleInputChange} />
            </div>
            <div className="field-group grid-col-6">
              <label className="field-label">Area / Village</label>
              <input type="text" name="area" className="custom-form-field" value={formData.area || ''} onChange={handleInputChange} />
            </div>
            <div className="field-group grid-col-6">
              <label className="field-label">Block / Lot No.</label>
              <input type="text" name="block_lot" className="custom-form-field" value={formData.block_lot || ''} onChange={handleInputChange} />
            </div>
            <div className="field-group grid-col-12">
              <label className="field-label">Landmark</label>
              <input type="text" name="landmark" className="custom-form-field" value={formData.landmark || ''} onChange={handleInputChange} />
            </div>
          </div>

          <div className="section-divider-title">Residency Tracker</div>
          <div className="form-grid-layout mb-4">
            <div className="field-group grid-col-4">
              <label className="field-label">Residency Status</label>
              <select name="residency_status" className="custom-form-field" value={formData.residency_status} onChange={handleInputChange} required>
                <option value="Homeowner">Homeowner</option>
                <option value="Tenant">Tenant</option>
                <option value="Sharer">Sharer</option>
              </select>
            </div>
            <div className="field-group grid-col-4">
              <label className="field-label">Years in Pasong Buaya 2</label>
              <input type="number" name="years_in_PB2" className="custom-form-field" value={formData.years_in_PB2} onChange={handleInputChange} required />
            </div>
          </div>

          <div className="section-divider-title">Emergency Next of Kin Records</div>
          <div className="form-grid-layout mb-4">
            <div className="field-group grid-col-12">
              <label className="field-label">Contact Person Name</label>
              <input type="text" name="contact_person" className="custom-form-field" value={formData.contact_person} onChange={handleInputChange} required />
            </div>
            <div className="field-group grid-col-6">
              <label className="field-label">Relationship Designation</label>
              <input type="text" name="contactp_relationship" className="custom-form-field" value={formData.contactp_relationship} onChange={handleInputChange} required />
            </div>
            <div className="field-group grid-col-6">
              <label className="field-label">Emergency Mobile No.</label>
              <input type="text" name="contactp_num" className={`custom-form-field ${errors.contactp_num ? 'input-error-state' : ''}`} value={formData.contactp_num} onChange={handleInputChange} required />
            </div>
          </div>

          <div className="section-divider-title">
            Account Management Link <small>(Modifications fire live context OTP flags)</small>
          </div>
          <div className="form-grid-layout mb-4">
            <div className="field-group grid-col-6">
              <label className="field-label">Email Address</label>
              <input type="email" name="email" className={`custom-form-field ${errors.email ? 'input-error-state' : ''}`} value={formData.email} onChange={handleInputChange} required />
            </div>
            <div className="field-group grid-col-6">
              <label className="field-label">Mobile Number</label>
              <input type="text" name="contact_num" className={`custom-form-field ${errors.contact_num ? 'input-error-state' : ''}`} value={formData.contact_num} onChange={handleInputChange} required />
              {errors.contact_num && <div className="text-danger small">Must be 11 digits starting with 09.</div>}
            </div>
          </div>

          <div className="section-divider-title"> Proof Document for Name/Sector Changes </div>
          <div className="form-grid-layout mb-4">
            <div className="field-group grid-col-12">
              <label className="field-label">Attach Valid ID or Proof Document</label>
              <div style={{ border: '2px dashed #cbd5e1', borderRadius: '0.5rem', padding: '1.5rem', textAlign: 'center', background: '#f8fafc' }}>
                {!proofFile ? (
                  <>
                    <i className="bi bi-cloud-upload" style={{ fontSize: '2rem', color: '#64748b' }}></i>
                    <p className="mt-2 mb-0" style={{ color: '#64748b', fontSize: '0.9rem' }}>Drag and drop or click to upload</p>
                    <p className="mb-2" style={{ color: '#94a3b8', fontSize: '0.8rem' }}>Accepted: ID cards, birth certificates, legal documents (Max 5MB)</p>
                    <input type="file" accept="image/*,.pdf" onChange={handleProofFileChange} style={{ display: 'none' }} id="proofUpload" />
                    <label htmlFor="proofUpload" style={{ cursor: 'pointer', color: '#047857', fontWeight: '600' }}>Browse Files</label>
                  </>
                ) : (
                  <div style={{ position: 'relative' }}>
                    {proofPreview && (
                      <img src={proofPreview} alt="Proof preview" style={{ maxWidth: '200px', maxHeight: '150px', borderRadius: '0.5rem', marginBottom: '0.5rem' }} />
                    )}
                    {!proofPreview && (
                      <div style={{ padding: '1rem', background: '#e0f2fe', borderRadius: '0.5rem', marginBottom: '0.5rem' }}>
                        <i className="bi bi-file-earmark-text me-2"></i> {proofFile.name}
                      </div>
                    )}
                    <p className="mb-2" style={{ color: '#059669', fontSize: '0.85rem' }}>
                      <i className="bi bi-check-circle me-1"></i> {proofFile.name} ({(proofFile.size / 1024).toFixed(1)} KB)
                    </p>
                    <button type="button" onClick={removeProofDocument} style={{ background: '#ef4444', color: 'white', border: 'none', padding: '0.4rem 0.8rem', borderRadius: '0.4rem', cursor: 'pointer', fontSize: '0.85rem' }}>
                      <i className="bi bi-x-circle me-1"></i>Remove
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="section-divider-title"> Security Settings </div>
          <div className="form-grid-layout mb-4">
            <div className="field-group grid-col-12">
              <button type="button" className="btn-submit-verification" onClick={() => setShowPasswordModal(true)} style={{ background: '#d97706', width: 'auto', padding: '0.75rem 1.5rem' }}>
                <i className="bi bi-key me-2"></i>Change Password
              </button>
            </div>
          </div>

          <button type="submit" className="btn-submit-verification">Submit Structural Profiles Request</button>
        </form>

        {/* CONFIRMATION VALIDATION INTERFACE */}
        {showModal && (
          <div className="custom-modal-overlay">
            <div className="custom-modal-card">
              <div style={{ display: 'flex', justifyBetween: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h5 style={{ margin: 0, fontWeight: '700', color: '#b45309' }}>Identity Authorization Check</h5>
                <button type="button" onClick={() => setShowModal(false)} style={{ border: 'none', background: 'transparent', fontSize: '1.5rem', cursor: 'pointer' }}>&times;</button>
              </div>
              <div>
                <div className="field-group mb-3">
                  <label className="field-label">Current Email Address</label>
                  <input type="email" className="custom-form-field" value={modalData.old_email} onChange={(e) => setModalData(prev => ({ ...prev, old_email: e.target.value }))} />
                  {modalErrors.old_email && <div className="text-danger small">{modalErrors.old_email}</div>}
                </div>
                <div className="field-group mb-3">
                  <label className="field-label">Verify Current Account Password</label>
                  <input type="password" className="custom-form-field" value={modalData.current_password} onChange={(e) => setModalData(prev => ({ ...prev, current_password: e.target.value }))} />
                  {modalErrors.current_password && <div className="text-danger small">{modalErrors.current_password}</div>}
                </div>
                {formatPhoneNumber(formData.contact_num) !== formatPhoneNumber(originalData.contact_num) && (
                  <div className="field-group mb-3">
                    <label className="field-label">Confirm Previous Phone String</label>
                    <input type="tel" className="custom-form-field" value={modalData.old_phone} onChange={(e) => setModalData(prev => ({ ...prev, old_phone: e.target.value }))} />
                    {modalErrors.old_phone && <div className="text-danger small">{modalErrors.old_phone}</div>}
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
                  <button type="button" className="custom-form-field" onClick={() => setShowModal(false)} style={{ width: 'auto' }}>Cancel</button>
                  <button type="button" className="btn-submit-verification" onClick={handleModalVerify} style={{ width: 'auto', margin: 0, background: '#d97706' }}>Verify Request</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* PASSWORD CHANGE MODAL */}
        {showPasswordModal && (
          <div className="custom-modal-overlay">
            <div className="custom-modal-card">
              <div style={{ display: 'flex', justifyBetween: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h5 style={{ margin: 0, fontWeight: '700', color: '#d97706' }}>Change Password</h5>
                <button type="button" onClick={() => { setShowPasswordModal(false); setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' }); setPasswordErrors({}); }} style={{ border: 'none', background: 'transparent', fontSize: '1.5rem', cursor: 'pointer' }}>&times;</button>
              </div>
              <div>
                <div className="field-group mb-3">
                  <label className="field-label">Current Password</label>
                  <input type="password" className="custom-form-field" value={passwordData.currentPassword} onChange={(e) => setPasswordData(prev => ({ ...prev, currentPassword: e.target.value }))} />
                  {passwordErrors.currentPassword && <div className="text-danger small">{passwordErrors.currentPassword}</div>}
                </div>
                <div className="field-group mb-3">
                  <label className="field-label">New Password</label>
                  <input type="password" className="custom-form-field" value={passwordData.newPassword} onChange={(e) => setPasswordData(prev => ({ ...prev, newPassword: e.target.value }))} />
                  {passwordErrors.newPassword && <div className="text-danger small">{passwordErrors.newPassword}</div>}
                </div>
                <div className="field-group mb-3">
                  <label className="field-label">Confirm New Password</label>
                  <input type="password" className="custom-form-field" value={passwordData.confirmPassword} onChange={(e) => setPasswordData(prev => ({ ...prev, confirmPassword: e.target.value }))} />
                  {passwordErrors.confirmPassword && <div className="text-danger small">{passwordErrors.confirmPassword}</div>}
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
                  <button type="button" className="custom-form-field" onClick={() => { setShowPasswordModal(false); setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' }); setPasswordErrors({}); }} style={{ width: 'auto' }}>Cancel</button>
                  <button type="button" className="btn-submit-verification" onClick={handlePasswordChange} style={{ width: 'auto', margin: 0, background: '#047857' }}>Update Password</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* --- REFACTORED OTP OPTIONS MODAL CARD INTERFACE --- */}
        {showOtpModal && (
          <div className="custom-modal-overlay">
            <div className="custom-modal-card">
              <div style={{ display: 'flex', justifyBetween: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h5 style={{ margin: 0, fontWeight: '700', color: '#047857' }}>Security OTP Verification</h5>
                <button type="button" onClick={() => { setShowOtpModal(false); setOtpInput(''); }} style={{ border: 'none', background: 'transparent', fontSize: '1.5rem', cursor: 'pointer' }}>&times;</button>
              </div>
              <p className="small text-muted mb-3 text-start">
                A single 6-digit verification code has been dispatched to your email address. Type it below to validate all pending modifications simultaneously.
              </p>
              <form onSubmit={handleVerifyOtpSubmit}>
                <div className="field-group mb-3">
                  <input type="text" maxLength={6} placeholder="000000" value={otpInput} onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, ''))} style={{ textAlign: 'center', fontSize: '1.75rem', letterSpacing: '4px', fontWeight: 'bold' }} className="custom-form-field" required />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
                  <button type="button" className="custom-form-field" onClick={() => { setShowOtpModal(false); setOtpInput(''); }} style={{ width: 'auto' }}>Close</button>
                  <button type="submit" className="btn-submit-verification" style={{ width: 'auto', margin: 0 }}>Confirm Code</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
      
      <Footer />
    </>
  );
} 

export default EditProfile;