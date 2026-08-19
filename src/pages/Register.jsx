import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import Footer from '../components/Footer';
import Preloader from '../components/Preloader';
import '../styles/register.css';

const API_BASE = '/api_backend';

const Register = () => {
  const [formData, setFormData] = useState({
    // Account Information
    email: '',
    password: '',
    confirmPassword: '',
    
    // Personal Information
    fName: '',
    mName: '',
    lName: '',
    suffix: '',
    birth_date: '',
    gender: '',
    height: '',
    contact_num: '',
    civil_status: 'Single',
    spouse_name_text: '',
    blood_type: '',
    religion: '',
    
    // Birth Place
    birth_city: '',
    birth_province: '',
    birth_country: 'Philippines',
    
    // Address (Base on Database Schema)
    house_no: '',
    street: '',
    zone: '',
    subdivision: '',
    area: '',
    block_lot: '',
    landmark: '',
    years_in_PB2: '1',
    residency_status: 'Homeowner',
    
    // Emergency Contact
    contact_person: '',
    contactp_num: '',
    contactp_relationship: '',
    
    // Smart Indicators / Sectoral Flags
    philsys_nat_id: '',
    valid_id: '',
    is_senior: false,
    is_pwd: false,
    is_4ps: false,
    is_solo_parent: false,
    is_indigent: false,
    privacy_agreed: false
  });

  const [files, setFiles] = useState({
    valid_id_img_front: null,
    valid_id_img_back: null,
    valid_id_img_holding: null,
    proof_pwd: null,
    proof_4ps: null,
    proof_solo_parent: null,
    proof_indigent: null
  });

  const [age, setAge] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [addrReq, setAddrReq] = useState({ house: true, block: true });
  const [success, setSuccess] = useState('');
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [otpValue, setOtpValue] = useState('');
  const [otpCooldown, setOtpCooldown] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();

  const [validations, setValidations] = useState({
    email: null,
    password: null,
    match: null,
    mobile: null
  });

  const [scannerState, setScannerState] = useState({
    file: null,
    previewUrl: '',
    rawText: '',
    extracted: null,
    suggestedIdType: '',
    isScanning: false,
    progress: 0,
    error: ''
  });
  const [scanTargets, setScanTargets] = useState({
    name: true,
    birth_date: true,
    gender: true,
    address: true,
    idNumber: true
  });
  const [currentStep, setCurrentStep] = useState(1);
  const totalSteps = 4;

  const getTargetDefaultsForIdType = (idType = formData.valid_id) => {
    const selected = (idType || '').toLowerCase();

    if (selected.includes('national')) {
      return { name: true, birth_date: true, gender: true, address: true, idNumber: false };
    }

    if (selected.includes('passport')) {
      return { name: true, birth_date: true, gender: true, address: true, idNumber: false };
    }

    if (selected.includes('driver')) {
      return { name: true, birth_date: true, gender: true, address: true, idNumber: true };
    }

    if (selected.includes('philhealth')) {
      return { name: true, birth_date: true, gender: true, address: false, idNumber: true };
    }

    if (selected.includes('umid') || selected.includes('voter') || selected.includes('postal') || selected.includes('prc') || selected.includes('tin')) {
      return { name: true, birth_date: true, gender: true, address: false, idNumber: true };
    }

    return { name: true, birth_date: true, gender: true, address: true, idNumber: true };
  };

  const normalizeText = (value = '') => value.replace(/\s+/g, ' ').replace(/[|]/g, ' ').trim();
  const applyScannedIdData = (scannedData) => {
    if (!scannedData) return;

    const safeFirstName = isValidPhilName(scannedData.fName) ? scannedData.fName : '';
    const safeMiddleName = isValidPhilName(scannedData.mName) ? scannedData.mName : '';
    const safeLastName = isValidPhilName(scannedData.lName) ? scannedData.lName : '';
    const safeBirthDate = isValidPhilBirthDate(scannedData.birth_date) ? scannedData.birth_date : '';
    const safeGender = isValidPhilGender(scannedData.gender) ? scannedData.gender.toUpperCase().replace(/[^A-Z]/g, '') : '';
    const safeAddress = isValidPhilAddress(scannedData.street) ? scannedData.street : '';
    const safeIdNumber = isValidPhilSysNumber(scannedData.philsys_nat_id) ? scannedData.philsys_nat_id : '';

    setFormData(prev => ({
      ...prev,
      valid_id: scannedData.valid_id || prev.valid_id,
      ...(scanTargets.name ? {
        fName: safeFirstName || prev.fName,
        mName: safeMiddleName || prev.mName,
        lName: safeLastName || prev.lName
      } : {}),
      ...(scanTargets.birth_date ? { birth_date: safeBirthDate || prev.birth_date } : {}),
      ...(scanTargets.gender ? { gender: safeGender || prev.gender } : {}),
      ...(scanTargets.address ? {
        house_no: scannedData.house_no || prev.house_no,
        street: safeAddress || prev.street,
        subdivision: scannedData.subdivision || prev.subdivision,
        area: scannedData.area || prev.area,
        birth_city: scannedData.birth_city || prev.birth_city,
        birth_province: scannedData.birth_province || prev.birth_province
      } : {}),
      ...(scanTargets.idNumber ? { philsys_nat_id: safeIdNumber || prev.philsys_nat_id } : {})
    }));

    setSuccess('Scanned ID details were applied to the form. You can still edit any field before submission.');
    setError('');
  };

  const toggleScanTarget = (targetKey) => {
    setScanTargets(prev => ({ ...prev, [targetKey]: !prev[targetKey] }));
  };

  const createImageBitmapFromFile = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Unable to read the uploaded ID image.'));
      image.src = reader.result;
    };
    reader.onerror = () => reject(new Error('Unable to read the uploaded ID image.'));
    reader.readAsDataURL(file);
  });

  const sendIdImageToBackendOcr = async (file) => {
    try {
      const formData = new FormData();
      formData.append('id_image', file);
      formData.append('id_type', 'national');

      setScannerState(prev => ({
        ...prev,
        isScanning: true,
        progress: 50,
        error: ''
      }));

      const response = await fetch(`${API_BASE}/ocr_id.php`, {
        method: 'POST',
        body: formData
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Backend OCR processing failed');
      }

      const extracted = processBackendOcrResult(result.data);

      setScannerState(prev => ({
        ...prev,
        isScanning: false,
        progress: 100,
        extracted,
        error: result.data.warnings && result.data.warnings.length > 0 ? result.data.warnings.join(' ') : ''
      }));

      if (extracted) {
        applyScannedIdData(extracted);
      }
    } catch (error) {
      console.error('Backend OCR error:', error);
      setScannerState(prev => ({
        ...prev,
        isScanning: false,
        error: error.message || 'Backend OCR service unavailable. Please try again or fill in the details manually.'
      }));
      setError(error.message || 'Backend OCR service unavailable. Please try again or fill in the details manually.');
    }
  };

  const processBackendOcrResult = (data) => {
    if (!data || !data.fields) {
      return null;
    }

    const fields = data.fields;
    const lName = fields.surName?.value || '';
    const fName = fields.firstName?.value || '';
    const mName = fields.middleName?.value || '';
    const sexValue = fields.sex?.value || '';
    const birthDate = fields.birthDate?.value || '';
    const cleanedAddress = fields.address?.value || '';

    const validLastName = isValidPhilName(lName) ? lName : '';
    const validFirstName = isValidPhilName(fName) ? fName : '';
    const validMiddleName = isValidPhilName(mName) ? mName : '';
    const validGender = isValidPhilGender(sexValue) ? sexValue : '';
    const validBirthDate = isValidPhilBirthDate(birthDate) ? birthDate : '';
    const validAddress = isValidPhilAddress(cleanedAddress) ? cleanedAddress : '';

    const hasReliableData = validLastName || validFirstName || validMiddleName || validGender || validBirthDate || validAddress;

    if (!hasReliableData) {
      return null;
    }

    return {
      philsys_nat_id: '',
      valid_id: formData.valid_id || 'National ID (PhilID/ePhilID)',
      fName: validFirstName,
      mName: validMiddleName,
      lName: validLastName,
      birth_date: validBirthDate,
      gender: validGender,
      house_no: '',
      street: validAddress,
      subdivision: '',
      area: '',
      birth_city: '',
      birth_province: '',
      age: validBirthDate ? Math.max(0, new Date().getFullYear() - new Date(validBirthDate).getFullYear()) : '',
      id_number_scanned: '',
      confidence: data.confidence || 0
    };
  };

  const isValidPhilSysNumber = (value = '') => {
    const cleaned = (value || '').replace(/\s+/g, '').replace(/[^A-Z0-9]/gi, '');
    return /^\d{4}\d{4}\d{4,5}$/.test(cleaned) || /^\d{4}-\d{4}-\d{4,5}$/.test((value || '').trim());
  };

  const isValidPhilGender = (value = '') => {
    const cleaned = normalizeText(value || '').toUpperCase();
    return ['M', 'F', 'MALE', 'FEMALE'].includes(cleaned.replace(/[^A-Z]/g, ''));
  };

  const isValidPhilName = (value = '') => {
    const cleaned = (value || '').trim();
    return cleaned.length >= 2 && /^[A-Z][A-Z\s.'-]{1,60}$/i.test(cleaned) && !/\d/.test(cleaned);
  };

  const isValidPhilAddress = (value = '') => {
    const cleaned = (value || '').trim();
    return cleaned.length >= 8 && !/^(?:ADDRESS|HOME\s*ADDRESS|CITY|PROVINCE|PHILIPPINES)$/i.test(cleaned);
  };

  const isValidPhilBirthDate = (value = '') => {
    if (!value) return false;
    const date = new Date(value);
    return !Number.isNaN(date.getTime()) && date.getFullYear() > 1900;
  };

  const handleIdScan = async (file) => {
    if (!file) return;

    if (!formData.valid_id) {
      setError('Please select the Philippine Government ID type before scanning.');
      return;
    }

    const quality = await checkIdCaptureQuality(file);
    if (!quality.ok) {
      setScannerState(prev => ({
        ...prev,
        file: null,
        previewUrl: '',
        rawText: '',
        extracted: null,
        isScanning: false,
        progress: 0,
        error: quality.reasons.join(' ')
      }));
      setError('Please upload a straight, centered, well-lit ID photo without glare or blur.');
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setScannerState(prev => ({
      ...prev,
      file,
      previewUrl,
      rawText: '',
      extracted: null,
      isScanning: true,
      progress: 25,
      error: ''
    }));

    setFiles(prev => ({ ...prev, valid_id_img_front: file }));

    // Send to backend OCR
    await sendIdImageToBackendOcr(file);
  };

  const checkIdCaptureQuality = async (file) => {
    try {
      const image = await createImageBitmapFromFile(file);
      const width = image.naturalWidth || image.width;
      const height = image.naturalHeight || image.height;
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        return { ok: false, reasons: ['Unable to inspect the image quality.'] };
      }

      const sampleWidth = 220;
      const sampleHeight = Math.max(1, Math.round((sampleWidth * height) / width));
      canvas.width = sampleWidth;
      canvas.height = sampleHeight;

      ctx.drawImage(image, 0, 0, sampleWidth, sampleHeight);
      const { data } = ctx.getImageData(0, 0, sampleWidth, sampleHeight);

      let totalBrightness = 0;
      let contrastSum = 0;
      let darkPixels = 0;

      for (let i = 0; i < data.length; i += 4) {
        const luminance = (data[i] * 0.299) + (data[i + 1] * 0.587) + (data[i + 2] * 0.114);
        totalBrightness += luminance;
        contrastSum += luminance * luminance;
        if (luminance < 35) darkPixels += 1;
      }

      const pixelCount = data.length / 4;
      const averageBrightness = totalBrightness / pixelCount;
      const contrast = Math.sqrt((contrastSum / pixelCount) - (averageBrightness * averageBrightness));
      const aspectRatio = width / height;
      const reasons = [];

      if (averageBrightness < 80) reasons.push('The ID is too dark. Use brighter lighting.');
      if (contrast < 30) reasons.push('The image is too blurry or flat. Make it sharper.');
      if (darkPixels / pixelCount > 0.25) reasons.push('There are too many dark/shadowed areas. Avoid glare and shadows.');
      if (aspectRatio < 1.2 || aspectRatio > 1.9) reasons.push('Keep the full ID centered in frame without strong cropping or rotation.');

      return {
        ok: reasons.length === 0,
        reasons
      };
    } catch {
      return { ok: false, reasons: ['Unable to inspect the image quality.'] };
    }
  };

  // Real-time Age Calculation & Senior Detection
  useEffect(() => {
    if (formData.birth_date) {
      const birthDate = new Date(formData.birth_date);
      const today = new Date();
      let calculatedAge = today.getFullYear() - birthDate.getFullYear();
      const m = today.getMonth() - birthDate.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
        calculatedAge--;
      }
      setAge(calculatedAge);
      setFormData(prev => ({ ...prev, is_senior: calculatedAge >= 60 }));
    }
  }, [formData.birth_date]);

  // Real-time Input Validation
  useEffect(() => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const passRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    const mobileRegex = /^09\d{9}$/;

    setValidations({
      email: formData.email === '' ? null : emailRegex.test(formData.email),
      password: formData.password === '' ? null : passRegex.test(formData.password),
      match: formData.confirmPassword === '' ? null : formData.password === formData.confirmPassword,
      mobile: formData.contact_num === '' ? null : mobileRegex.test(formData.contact_num)
    });
  }, [formData.email, formData.password, formData.confirmPassword, formData.contact_num]);


    // Real-time Cooldown Countdown Tracker for Resending OTP
    useEffect(() => {
      if (otpCooldown > 0) {
        const timer = setTimeout(() => setOtpCooldown(otpCooldown - 1), 1000);
        return () => clearTimeout(timer);
      }
    }, [otpCooldown]);


  useEffect(() => {
    setScanTargets(getTargetDefaultsForIdType(formData.valid_id));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- helper is pure w.r.t. formData.valid_id
  }, [formData.valid_id]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    
    if (name === 'house_no') {
      setAddrReq(prev => ({ ...prev, block: value.trim() === '' }));
    } else if (name === 'block_lot') {
      setAddrReq(prev => ({ ...prev, house: value.trim() === '' }));
    }

    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleFileChange = (e) => {
    setFiles(prev => ({ ...prev, [e.target.name]: e.target.files[0] }));
  };

 // 1. Core Request Dispatcher to send_otp.php
    const handleRequestOtp = async () => {
      setError('');
      try {
        const response = await fetch(`${API_BASE}/send_otp.php`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: formData.email })
        });
        const data = await response.json();
        if (data.success) {
          setOtpCooldown(120); // Pin a 2-minute lock instantly
          setShowOtpModal(true);
        } else {
          setError(data.message);
        }
      } catch {
        setError("Network Failure: Unable to connect with the identity authentication gateway.");
      }
    };

    const goNextStep = () => setCurrentStep(prev => Math.min(prev + 1, totalSteps));
    const goPrevStep = () => setCurrentStep(prev => Math.max(prev - 1, 1));

   // 2. Intercept submission to challenge the user with an OTP first
    const handleInitialSubmit = async (e) => {
      e.preventDefault();
      setError('');

      if (!formData.privacy_agreed) {
        setError('Regulatory Requirement: You must accept the Data Privacy Statement.');
        return;
      }

      if (validations.email === false || validations.password === false || validations.match === false || validations.mobile === false) {
        setError('Validation Error: Please correct the red-marked fields before submission.');
        return;
      }

      // Lock the main button before the modal opens to stop double clicks
      setIsSubmitting(true);
      try {
        const response = await fetch(`${API_BASE}/send_otp.php`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: formData.email })
        });
        const data = await response.json();
        if (data.success) {
          setOtpCooldown(120); 
          setShowOtpModal(true);
        } else {
          setError(data.message);
        }
      } catch {
        setError("Network Failure: Unable to connect with the identity authentication gateway.");
      } finally {
        setIsSubmitting(false); // Release lock state tracking
      }
    };

    // 3. Final execution bridge with full UI notification responses
    const handleVerifyAndRegister = async (e) => {
      e.preventDefault();
      setError('');
      setSuccess(''); // Clear any previous success notifications

      if (otpValue.length !== 6) {
        setError('Verification Failure: Please enter the complete 6-digit OTP code.');
        return;
      }

      setIsSubmitting(true); // Lock the modal button immediately

      try {
        // Validate code structure through your PHP verification gateway
        const verifyRes = await fetch(`${API_BASE}/email_verification_otp.php`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: formData.email, otp: otpValue })
        });
        const verifyData = await verifyRes.json();

        if (!verifyData.success) {
          // Precise notification instruction if OTP fails
          setError('Incorrect verification code. Please re-enter the correct code or request a new one after the cooldown.');
          setIsSubmitting(false);
          return;
        }

        // Token matched! Fire original database registration script
        const dataToSend = new FormData();
        Object.keys(formData).forEach(key => dataToSend.append(key, formData[key]));
        Object.keys(files).forEach(key => { if (files[key]) dataToSend.append(key, files[key]); });
        
        // --- NEW FIX: Append the OTP so the final registry script can verify it ---
        dataToSend.append('otp', otpValue);

       const registerRes = await fetch(`${API_BASE}/register.php`, {
          method: 'POST',
          body: dataToSend,
        });
        
        // Grab the raw response first to prevent JSON parse crashes
        const rawText = await registerRes.text();
        let registerData;
        try {
            registerData = JSON.parse(rawText);
        } catch {
            // If PHP outputs an HTML warning, catch it and log it!
            console.error("RAW PHP ERROR Output:", rawText);
            setError("Upload Error: Image files might be too large (exceeding PHP limits), or a server warning occurred. Press F12 and check the Console tab to see the exact error.");
            setIsSubmitting(false);
            return;
        }

        if (registerData.success) {
          // Clear error text and update success banner explicitly
          setError('');
          setSuccess('Official Profile Saved Successfully to the Database! Redirecting you to login portal...');
          
          // Keep the modal open briefly for 3 seconds so they can read the success notification
          setTimeout(() => {
            setShowOtpModal(false);
            navigate('/login');
          }, 3000);
        } else {
          setError(registerData.message);
          setIsSubmitting(false);
        }
      } catch {
        setError('Connection Failure: Server failed to synchronize profiling data parameters.');
        setIsSubmitting(false);
      }
    };

  return (
    <>
    <Preloader />
    <Header />
    <div className="reg-page-container">
      <div className="reg-wrapper">
        <div className="reg-card">
          <div className="reg-header">
            <h2>Government Resident Profiling Portal</h2>
            <p>Barangay Pasong Buaya II Digital Information Management System (BIMS)</p>
          </div>

          <div className="reg-body">
            {error && <div className="banner error-banner"><span>⚠️</span> SYSTEM ALERT: {error}</div>}
            {success && <div className="banner success-banner"><span>✅</span> SUCCESS: {success}</div>}

            <div className="stepper-wrap">
              <div className="stepper-head">
                {['ID Intake', 'Profile', 'Address & Contact', 'Review'].map((label, index) => (
                  <div key={label} className={`step-indicator ${currentStep === index + 1 ? 'active' : ''} ${currentStep > index + 1 ? 'done' : ''}`}>
                    <span>{index + 1}</span>
                    <small>{label}</small>
                  </div>
                ))}
              </div>

              <div className="progress-bar-track">
                <div className="progress-bar-fill" style={{ width: `${(currentStep / totalSteps) * 100}%` }} />
              </div>
            </div>

           <form onSubmit={handleInitialSubmit}>
              {currentStep === 1 && (
                <>
                  <div className="section-header">
                    <div className="badge">1</div>
                    <span className="title">Government ID Intake</span>
                  </div>

                  <div className="scanner-box">
                    <div className="scanner-top-row">
                      <div className="form-group scanner-group">
                        <label>Primary Government ID Type *</label>
                        <select name="valid_id" value={formData.valid_id} required onChange={(e) => {
                          handleChange(e);
                          setScannerState(prev => ({ ...prev, extracted: null, rawText: '', error: '' }));
                        }}>
                          <option value="">-- SELECT ID TYPE --</option>
                          <option value="National ID (PhilID/ePhilID)">NATIONAL ID (PHILID)</option>
                          <option value="Passport">PASSPORT</option>
                          <option value="Drivers License">DRIVER'S LICENSE</option>
                          <option value="UMID (SSS/GSIS)">UMID (SSS/GSIS)</option>
                          <option value="Voters ID">VOTER'S ID</option>
                          <option value="Postal ID">POSTAL ID</option>
                          <option value="PRC ID">PRC ID</option>
                          <option value="PhilHealth ID">PHILHEALTH ID</option>
                          <option value="TIN ID">TIN ID</option>
                        </select>
                      </div>

                      <div className="form-group scanner-group">
                        <label>Upload or Capture ID Image *</label>
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          onChange={(e) => handleIdScan(e.target.files?.[0])}
                        />
                      </div>
                    </div>

                    <div className="capture-guide">
                      <div className="capture-frame" aria-hidden="true">
                        <span className="frame-line frame-line-top" />
                        <span className="frame-line frame-line-right" />
                        <span className="frame-line frame-line-bottom" />
                        <span className="frame-line frame-line-left" />
                      </div>
                      <div className="capture-guide-copy">
                        <strong>Capture guide for best OCR accuracy</strong>
                        <ul>
                          <li>Hold the ID straight and centered in the frame.</li>
                          <li>Keep the whole card visible; no crop, no tilt, no angle.</li>
                          <li>Use bright light and avoid glare, shadows, and blur.</li>
                          <li>Place the card on a plain background.</li>
                        </ul>
                      </div>
                    </div>

                    {scannerState.previewUrl && (
                      <div className="scanner-preview-box">
                        <div className="scanner-preview-overlay" aria-hidden="true" />
                        <img src={scannerState.previewUrl} alt="Scanned identification card" />
                      </div>
                    )}

                    <div className="scanner-targets">
                      <strong>What to scan:</strong>
                      <div className="scanner-target-list">
                        {(formData.valid_id && formData.valid_id.toLowerCase().includes('national')
                          ? [
                              ['name', 'Surname / First / Middle Name'],
                              ['birth_date', 'Date of Birth'],
                              ['address', 'Address'],
                              ['idNumber', 'PhilSys Number']
                            ]
                          : [
                              ['name', 'Name'],
                              ['birth_date', 'Date of Birth'],
                              ['gender', 'Sex'],
                              ['address', 'Address'],
                              ['idNumber', 'ID Number']
                            ])
                          .map(([key, label]) => (
                            <label key={key} className="scanner-target-option">
                              <input
                                type="checkbox"
                                checked={scanTargets[key]}
                                onChange={() => toggleScanTarget(key)}
                              />
                              <span>{label}</span>
                            </label>
                          ))}
                      </div>
                    </div>

                    {scannerState.isScanning && (
                      <div className="scanner-progress">
                        <div className="scanner-progress-bar" style={{ width: `${scannerState.progress}%` }} />
                        <span>Scanning ID... {scannerState.progress}%</span>
                      </div>
                    )}

                    {scannerState.error && <div className="banner error-banner"><span>⚠️</span> SCANNER ALERT: {scannerState.error}</div>}

                    {scannerState.suggestedIdType && (
                      <div className="scanner-suggest-box">
                        <strong>ID match suggestion:</strong> {scannerState.suggestedIdType}
                        {!formData.valid_id && (
                          <button
                            type="button"
                            className="btn-secondary btn-small"
                            onClick={() => {
                              setFormData(prev => ({ ...prev, valid_id: scannerState.suggestedIdType }));
                              setScannerState(prev => ({ ...prev, suggestedIdType: '' }));
                            }}
                          >
                            Use suggested ID type
                          </button>
                        )}
                      </div>
                    )}

                    {scannerState.rawText && (
                      <div className="scanner-ocr-box">
                        <h4>OCR text extracted</h4>
                        <p>{scannerState.rawText.slice(0, 700)}</p>
                      </div>
                    )}

                    {scannerState.extracted && (
                      <button type="button" className="btn-secondary" onClick={() => applyScannedIdData(scannerState.extracted)}>
                        Review and apply scanned values to form
                      </button>
                    )}
                  </div>

                  <div className="step-actions">
                    <button type="button" className="btn-register secondary-action" disabled={!formData.valid_id || !scannerState.file} onClick={goNextStep}>
                      Continue to profile details
                    </button>
                  </div>
                </>
              )}

              {currentStep === 2 && (
                <>
                  <div className="section-header">
                    <div className="badge">2</div>
                    <span className="title">Official Account & Personal Profile</span>
                  </div>
                  <div className="input-grid">
                    <div className="form-group span-2">
                      <label>Official Email Address *</label>
                      <input 
                        type="email" name="email" required 
                        className={validations.email === true ? 'valid' : validations.email === false ? 'invalid' : ''}
                        placeholder="e.g., juandelacruz@gmail.com"
                        onChange={handleChange} 
                        value={formData.email}
                      />
                      <span className={`validation-hint ${validations.email === false ? 'error-text' : 'success-text'}`}>
                        {validations.email === false ? '✘ Please enter a valid email format.' : validations.email === true ? '✔ Valid email format.' : 'Email will be used for official notifications.'}
                      </span>
                    </div>
                    <div className="form-group">
                      <label>Mobile Number (Primary) *</label>
                      <input 
                        type="text" name="contact_num" placeholder="09171234567" maxLength="11" required 
                        className={validations.mobile === true ? 'valid' : validations.mobile === false ? 'invalid' : ''}
                        onChange={handleChange} 
                        value={formData.contact_num}
                      />
                      <span className={`validation-hint ${validations.mobile === false ? 'error-text' : 'success-text'}`}>
                        {validations.mobile === false ? '✘ Must be exactly 11 digits (09...)' : 'Used for SMS alerts.'}
                      </span>
                    </div>
                    <div className="form-group">
                      <label>Secure Password *</label>
                      <input 
                        type={showPassword ? "text" : "password"} name="password" required 
                        className={validations.password === true ? 'valid' : validations.password === false ? 'invalid' : ''}
                        placeholder="••••••••"
                        onChange={handleChange} 
                        value={formData.password}
                      />
                      <span className="eye-icon" onClick={() => setShowPassword(!showPassword)}>
                        {showPassword ? "👁️‍🗨️" : "👁️"}
                      </span>
                      <span className={`validation-hint ${validations.password === false ? 'error-text' : validations.password === true ? 'success-text' : ''}`}>
                        Requirements: 8+ chars, 1 Uppercase, 1 Number, 1 Special Char.
                      </span>
                    </div>
                    <div className="form-group">
                      <label>Re-type Password *</label>
                      <input 
                        type={showPassword ? "text" : "password"} name="confirmPassword" required 
                        className={validations.match === true ? 'valid' : validations.match === false ? 'invalid' : ''}
                        placeholder="••••••••"
                        onChange={handleChange} 
                        value={formData.confirmPassword}
                      />
                      {validations.match === false && <span className="validation-hint error-text">✘ Passwords do not match.</span>}
                    </div>
                    <div className="form-group"><label>Given Name *</label><input type="text" name="fName" required onChange={handleChange} value={formData.fName} /></div>
                    <div className="form-group"><label>Middle Name</label><input type="text" name="mName" onChange={handleChange} value={formData.mName} /></div>
                    <div className="form-group"><label>Surname *</label><input type="text" name="lName" required onChange={handleChange} value={formData.lName} /></div>
                    <div className="form-group">
                      <label>Suffix</label>
                      <select name="suffix" onChange={handleChange} value={formData.suffix}>
                        <option value="">-- N/A --</option>
                        <option value="Jr.">JR.</option>
                        <option value="Sr.">SR.</option>
                        <option value="II">II</option>
                        <option value="III">III</option>
                        <option value="IV">IV</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Date of Birth *</label>
                      <input type="date" name="birth_date" required onChange={handleChange} value={formData.birth_date} />
                      {age !== null && <span className="validation-hint success-text">System Detected Age: {age} Years</span>}
                    </div>
                    <div className="form-group">
                      <label>Sex at Birth *</label>
                      <select name="gender" required onChange={handleChange} value={formData.gender}>
                        <option value="">-- SELECT --</option>
                        <option value="Male">MALE</option>
                        <option value="Female">FEMALE</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Civil Status *</label>
                      <select name="civil_status" required onChange={handleChange} value={formData.civil_status}>
                        <option value="Single">SINGLE</option>
                        <option value="Married">MARRIED</option>
                        <option value="Widowed">WIDOWED</option>
                        <option value="Separated">SEPARATED</option>
                      </select>
                    </div>

                    {(formData.civil_status === 'Married' || formData.civil_status === 'Separated') && (
                      <div className="form-group span-3 animate-in">
                        <label>Legal Name of Spouse (First Middle Last) *</label>
                        <input type="text" name="spouse_name_text" required onChange={handleChange} placeholder="ENTER LEGAL NAME OF SPOUSE" value={formData.spouse_name_text} />
                      </div>
                    )}

                    <div className="form-group"><label>Height (in Centimeters) *</label><input type="number" name="height" required onChange={handleChange} value={formData.height} /></div>
                    <div className="form-group"><label>Religion / Belief *</label><input type="text" name="religion" required onChange={handleChange} value={formData.religion} /></div>
                    <div className="form-group">
                      <label>Blood Type (Optional)</label>
                      <select name="blood_type" onChange={handleChange} value={formData.blood_type}>
                        <option value="">-- UNKNOWN --</option>
                        {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div className="form-group"><label>Birth City *</label><input type="text" name="birth_city" required onChange={handleChange} value={formData.birth_city} /></div>
                    <div className="form-group"><label>Birth Province *</label><input type="text" name="birth_province" required onChange={handleChange} value={formData.birth_province} /></div>
                    <div className="form-group"><label>Birth Country *</label><input type="text" name="birth_country" value={formData.birth_country} onChange={handleChange} /></div>
                  </div>

                  <div className="step-actions">
                    <button type="button" className="btn-secondary" onClick={goPrevStep}>Back</button>
                    <button type="button" className="btn-register" onClick={goNextStep}>Continue to address</button>
                  </div>
                </>
              )}

              {currentStep === 3 && (
                <>
                  <div className="section-header">
                    <div className="badge">3</div>
                    <span className="title">Residential Address & Emergency Contact</span>
                  </div>
                  <div className="input-grid">
                    <div className="form-group">
                        <label>House No. {addrReq.house ? '*' : ''}</label>
                        <input type="text" name="house_no" required={addrReq.house} onChange={handleChange} value={formData.house_no} />
                    </div>
                    <div className="form-group">
                        <label>Street *</label>
                        <input type="text" name="street" required onChange={handleChange} value={formData.street} />
                    </div>
                    <div className="form-group">
                        <label>Subdivision / Zone *</label>
                        <input type="text" name="subdivision" required onChange={handleChange} value={formData.subdivision} />
                    </div>
                    <div className="form-group">
                        <label>Area</label>
                        <input type="text" name="area" onChange={handleChange} value={formData.area} />
                    </div>
                    <div className="form-group">
                        <label>Block & Lot {addrReq.block ? '*' : ''}</label>
                        <input type="text" name="block_lot" required={addrReq.block} onChange={handleChange} value={formData.block_lot} />
                    </div>
                    <div className="form-group">
                        <label>Zone / Purok</label>
                        <input type="text" name="zone" onChange={handleChange} value={formData.zone} />
                    </div>
                    <div className="form-group span-2"><label>Landmark</label><input type="text" name="landmark" onChange={handleChange} value={formData.landmark} /></div>
                    <div className="form-group"><label>Years in PB2 *</label><input type="number" name="years_in_PB2" required onChange={handleChange} value={formData.years_in_PB2} /></div>
                    <div className="form-group span-3">
                      <label>Residency Status *</label>
                      <select name="residency_status" required onChange={handleChange} value={formData.residency_status}>
                        <option value="Homeowner">HOMEOWNER</option>
                        <option value="Tenant">TENANT</option>
                        <option value="Sharer">SHARER</option>
                      </select>
                    </div>
                    <div className="form-group"><label>Contact Person *</label><input type="text" name="contact_person" required onChange={handleChange} value={formData.contact_person} /></div>
                    <div className="form-group"><label>Mobile Number *</label><input type="text" name="contactp_num" required onChange={handleChange} value={formData.contactp_num} /></div>
                    <div className="form-group"><label>Relationship *</label><input type="text" name="contactp_relationship" required onChange={handleChange} value={formData.contactp_relationship} /></div>
                  </div>

                  <div className="section-header">
                    <div className="badge">4</div>
                    <span className="title">Sectoral Classifications</span>
                  </div>
                  <div className="sector-checkbox-group">
                    <label className="sector-checkbox">
                      <input type="checkbox" checked={formData.is_senior} readOnly />
                      SENIOR CITIZEN {formData.is_senior ? "(AUTO-DETECTED)" : ""}
                    </label>
                    <label className="sector-checkbox">
                      <input type="checkbox" name="is_pwd" onChange={handleChange} checked={formData.is_pwd} />
                      PWD (PERSON WITH DISABILITY)
                    </label>
                    <label className="sector-checkbox">
                      <input type="checkbox" name="is_4ps" onChange={handleChange} checked={formData.is_4ps} />
                      4PS MEMBER / BENEFICIARY
                    </label>
                    <label className="sector-checkbox">
                      <input type="checkbox" name="is_solo_parent" onChange={handleChange} checked={formData.is_solo_parent} />
                      SOLO PARENT
                    </label>
                    <label className="sector-checkbox">
                      <input type="checkbox" name="is_indigent" onChange={handleChange} checked={formData.is_indigent} />
                      INDIGENT RESIDENT
                    </label>
                  </div>

                  <div className="input-grid mt-6">
                    {formData.is_pwd && (
                      <div className="form-group span-3 file-input-wrapper">
                        <label>Official PWD ID Card (Front Image) *</label>
                        <input type="file" name="proof_pwd" required onChange={handleFileChange} />
                      </div>
                    )}
                    {formData.is_4ps && (
                      <div className="form-group span-3 file-input-wrapper">
                        <label>4Ps Membership Certification (Scan/Photo) *</label>
                        <input type="file" name="proof_4ps" required onChange={handleFileChange} />
                      </div>
                    )}
                    {formData.is_solo_parent && (
                      <div className="form-group span-3 file-input-wrapper">
                        <label>Solo Parent ID / Social Worker Certification *</label>
                        <input type="file" name="proof_solo_parent" required onChange={handleFileChange} />
                      </div>
                    )}
                    {formData.is_indigent && (
                      <div className="form-group span-3 file-input-wrapper">
                        <label>Barangay Certificate of Indigency *</label>
                        <input type="file" name="proof_indigent" required onChange={handleFileChange} />
                      </div>
                    )}
                  </div>

                  <div className="step-actions">
                    <button type="button" className="btn-secondary" onClick={goPrevStep}>Back</button>
                    <button type="button" className="btn-register" onClick={goNextStep}>Review & submit</button>
                  </div>
                </>
              )}

              {currentStep === 4 && (
                <>
                  <div className="section-header">
                    <div className="badge">5</div>
                    <span className="title">Identification & Review</span>
                  </div>
                  <div className="input-grid">
                    <div className="form-group span-3">
                      <label>PhilSys National ID Number (Optional)</label>
                      <input type="text" name="philsys_nat_id" placeholder="1234-5678-9012" onChange={handleChange} value={formData.philsys_nat_id} />
                    </div>
                    <div className="form-group span-3">
                      <label>Primary ID Type to be Verified *</label>
                      <select name="valid_id" required onChange={handleChange} value={formData.valid_id}>
                        <option value="">-- SELECT ID TYPE --</option>
                        <option value="National ID (PhilID/ePhilID)">NATIONAL ID (PHILID)</option>
                        <option value="Passport">PASSPORT</option>
                        <option value="Drivers License">DRIVER'S LICENSE</option>
                        <option value="UMID (SSS/GSIS)">UMID (SSS/GSIS)</option>
                        <option value="Voters ID">VOTER'S ID</option>
                        <option value="Postal ID">POSTAL ID</option>
                        <option value="PRC ID">PRC ID</option>
                        <option value="PhilHealth ID">PHILHEALTH ID</option>
                        <option value="TIN ID">TIN ID</option>
                      </select>
                    </div>
                    <div className="form-group file-input-wrapper">
                      <label>ID Front View *</label>
                      <input type="file" name="valid_id_img_front" required onChange={handleFileChange} />
                    </div>
                    <div className="form-group file-input-wrapper">
                      <label>ID Back View *</label>
                      <input type="file" name="valid_id_img_back" required onChange={handleFileChange} />
                    </div>
                    <div className="form-group file-input-wrapper">
                      <label>Verification Selfie (Holding ID) *</label>
                      <input type="file" name="valid_id_img_holding" required onChange={handleFileChange} />
                      <span className="validation-hint">Ensure your face and the ID details are both clear.</span>
                    </div>
                  </div>

                  <div className="privacy-box">
                    <h4 style={{margin:'0 0 15px 0', color: '#064e3b', fontWeight: 800, textTransform: 'uppercase', fontSize: '0.9rem', letterSpacing:'1px'}}>
                      RA 10173: Data Privacy Act of 2012 Compliance
                    </h4>
                    <p>
                      By completing this form, you authorize <strong>Barangay Pasong Buaya II</strong> to collect, store, and process your personal and sensitive information for profiling and public service purposes. 
                      Your data is protected under the <strong>Data Privacy Act (RA 10173)</strong>. We implement strict organizational and technical security measures to ensure that your records remain confidential 
                      and are only accessed by authorized personnel for official government functions.
                    </p>
                    <label style={{marginTop:'25px', cursor:'pointer', display:'flex', alignItems: 'flex-start', gap: '12px'}}>
                      <input 
                        type="checkbox" 
                        name="privacy_agreed" 
                        checked={formData.privacy_agreed} 
                        onChange={handleChange} 
                        required 
                        style={{marginTop:'5px', width:'20px', height:'20px'}} 
                      />
                      <span style={{fontWeight:800, color: '#0f172a', fontSize: '0.9rem'}}>
                        I certify that all information provided is true and correct, and I agree to the Official Terms of Service and Data Privacy Policy. *
                      </span>
                    </label>
                  </div>

                  <div className="step-actions">
                    <button type="button" className="btn-secondary" onClick={goPrevStep}>Back</button>
                    <button type="submit" className="btn-register" disabled={isSubmitting}>
                      {isSubmitting ? "Processing Request..." : "Commit Profile to BIMS Official Registry"}
                    </button>
                  </div>
                </>
              )}
            </form>




    {/* TWO-FACTOR OTP POP-UP OVERLAY GATEWAY */}
    {showOtpModal && (
      <div style={{
        position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
        backgroundColor: 'rgba(15, 23, 42, 0.75)', display: 'flex',
        alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: '20px'
      }}>
        <div style={{ background: '#ffffff', padding: '40px', borderRadius: '4px', maxWidth: '450px', width: '100%', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}>
          <h3 style={{ color: '#064e3b', fontWeight: 800, margin: '0 0 10px 0', textTransform: 'uppercase', letterSpacing: '1px', fontSize: '1.1rem' }}>Identity Handshake Check</h3>
          <p style={{ color: '#64748b', fontSize: '0.85rem', lineHeight: '1.6', marginBottom: '25px' }}>
            An official verification code has been dispatched to <strong>{formData.email}</strong>. It remains valid for 10 minutes.
          </p>

          {/* Dynamic Error Status Banner Box Inside Modal */}
          {error && (
            <div style={{ padding: '12px', background: '#fef2f2', border: '1px solid #fee2e2', color: '#991b1b', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 700, marginBottom: '20px', lineHeight: '1.4' }}>
              ⚠️ STATUS: {error}
            </div>
          )}

          {/* Dynamic Success Database Registry Notification Banner Box Inside Modal */}
          {success && (
            <div style={{ padding: '12px', background: '#f0fdf4', border: '1px solid #dcfce7', color: '#166534', borderRadius: '4px', fontSize: '0.85rem', fontWeight: 700, marginBottom: '20px', lineHeight: '1.4' }}>
              ✅ SUCCESS: {success}
            </div>
          )}
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
            <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#334155', textTransform: 'uppercase' }}>Enter 6-Digit OTP *</label>
            <input 
              type="text" maxLength="6" placeholder="000000" value={otpValue} 
              disabled={isSubmitting || success}
              onChange={(e) => setOtpValue(e.target.value.replace(/\D/g,''))}
              style={{ padding: '14px', border: '2px solid #e2e8f0', borderRadius: '4px', fontSize: '1.3rem', letterSpacing: '6px', textAlign: 'center', fontWeight: 'bold' }}
            />
          </div>

          <button 
            type="button" 
            onClick={handleVerifyAndRegister} 
            className="btn-register" 
            disabled={isSubmitting || success}
            style={{ margin: '0 0 15px 0', padding: '16px' }}
          >
            {isSubmitting ? "Verifying and Compiling..." : "Confirm Identity & Complete Profile"}
          </button>

          <div style={{ textAlign: 'center', fontSize: '0.8rem', fontWeight: 600 }}>
            {otpCooldown > 0 ? (
              <span style={{ color: '#94a3b8' }}>Resend available in {otpCooldown}s</span>
            ) : (
              <button 
                type="button" 
                onClick={handleRequestOtp} 
                disabled={isSubmitting || success}
                style={{ background: 'none', border: 'none', color: '#059669', cursor: 'pointer', fontWeight: 700, textDecoration: 'underline' }}
              >
                Resend Code
              </button>
            )}
          </div>
        </div>
      </div>
    )}



          </div>
        </div>
      </div>
    </div>
    <Footer />
    </>
  );
};

export default Register;