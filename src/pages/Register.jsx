import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import Footer from '../components/Footer';
import Preloader from '../components/Preloader';
import Toast from '../components/Toast';
import CameraCapture from '../components/CameraCapture';
import '../styles/form-theme.css';
import '../styles/register.css';
import { scanIdImageViaBackend } from '../lib/backendOcr';
import { extractIdFields, getIdProfile, parseAddressComponents } from '../lib/idOcrExtraction';

const API_BASE = '/api_backend';
// Matches register.php / ocr_id.php's per-file cap.
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

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
    profile_picture: null,
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
  const [addrReq, setAddrReq] = useState({ house: true, block: true });
  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);
  // Field names that failed the current step's check — rendered with the
  // same red ring the request forms use, cleared as soon as the field changes.
  const [fieldErrors, setFieldErrors] = useState([]);
  const [profilePreview, setProfilePreview] = useState('');
  // Which in-page camera is open: 'id' (Step 1 scanner), 'face' (Step 4 profile photo), or null.
  const [cameraMode, setCameraMode] = useState(null);
  const [showOtpModal, setShowOtpModal] = useState(false);
  // The OTP dialog keeps its own messages so they aren't duplicated on the
  // page behind the overlay.
  const [otpError, setOtpError] = useState('');
  const [otpSuccess, setOtpSuccess] = useState('');
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
    extracted: null,
    isScanning: false,
    progress: 0,
    error: ''
  });
  // A ref, not state: handleIdScan's re-entrancy guard must be readable
  // synchronously by a second call that arrives before React commits the
  // isScanning state update (e.g. a rapid re-pick of the file input during
  // the async capture-quality check) — a plain state read would still see
  // the stale value in that window.
  const isScanningRef = useRef(false);
  const [scanTargets, setScanTargets] = useState({
    name: true,
    birth_date: true,
    gender: true,
    address: true,
    idNumber: true,
    bloodType: true,
    civilStatus: true,
    height: true
  });
  const [currentStep, setCurrentStep] = useState(1);
  const totalSteps = 4;

  const getIdTypeSlug = (idType = formData.valid_id) => {
    const selected = (idType || '').toLowerCase();
    if (selected.includes('national')) return 'national';
    if (selected.includes('passport')) return 'passport';
    if (selected.includes('driver')) return 'drivers_license';
    if (selected.includes('umid')) return 'umid';
    if (selected.includes('voter')) return 'voters';
    if (selected.includes('postal')) return 'postal';
    if (selected.includes('prc')) return 'prc';
    if (selected.includes('philhealth')) return 'philhealth';
    if (selected.includes('tin')) return 'tin';
    return 'generic';
  };

  // Sourced from src/lib/idOcrExtraction.js's ID_PROFILES — the single
  // source of truth for which fields actually exist on a given ID type
  // (e.g. PhilHealth's card face has no DOB/sex/address at all, confirmed
  // directly against the 2010 PhilHealth circular's own card-design image;
  // PRC's 2019 redesign removed DOB). Replaces a hand-guessed mapping that
  // had drifted out of sync with real card layouts for several ID types.
  const getTargetDefaultsForIdType = (idType = formData.valid_id) => {
    return { ...getIdProfile(getIdTypeSlug(idType)).fieldsPresent };
  };

  const normalizeText = (value = '') => value.replace(/\s+/g, ' ').replace(/[|]/g, ' ').trim();
  const applyScannedIdData = (scannedData) => {
    if (!scannedData) return;

    const safeFirstName = isValidPhilName(scannedData.fName) ? scannedData.fName : '';
    const safeMiddleName = isValidPhilName(scannedData.mName) ? scannedData.mName : '';
    const safeLastName = isValidPhilName(scannedData.lName) ? scannedData.lName : '';
    const safeBirthDate = isValidPhilBirthDate(scannedData.birth_date) ? scannedData.birth_date : '';
    const safeGender = (() => {
      if (!isValidPhilGender(scannedData.gender)) return '';
      const cleaned = scannedData.gender.toUpperCase().replace(/[^A-Z]/g, '');
      // The <select name="gender"> options are "Male"/"Female", not "M"/"F" —
      // map whatever the scanner extracted onto the exact option value.
      if (cleaned.startsWith('F')) return 'Female';
      if (cleaned.startsWith('M')) return 'Male';
      return '';
    })();
    const safeAddress = isValidPhilAddress(scannedData.street) ? scannedData.street : '';
    const safeIdNumber = isValidPhilSysNumber(scannedData.philsys_nat_id) ? scannedData.philsys_nat_id : '';
    // cleanFieldValue in idOcrExtraction.js already normalized these to
    // exactly the <select> option values, or '' if it couldn't — just
    // re-validate against the option sets here rather than trusting the
    // scanned data blindly at the point it's actually written to the form.
    const safeBloodType = isValidPhilBloodType(scannedData.blood_type) ? scannedData.blood_type : '';
    const safeCivilStatus = isValidPhilCivilStatus(scannedData.civil_status) ? scannedData.civil_status : '';
    const safeHeight = isValidPhilHeight(scannedData.height) ? scannedData.height : '';

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
        block_lot: scannedData.block_lot || prev.block_lot,
        subdivision: scannedData.subdivision || prev.subdivision,
        area: scannedData.area || prev.area,
        birth_city: scannedData.birth_city || prev.birth_city,
        birth_province: scannedData.birth_province || prev.birth_province
      } : {}),
      ...(scanTargets.idNumber ? { philsys_nat_id: safeIdNumber || prev.philsys_nat_id } : {}),
      ...(scanTargets.bloodType ? { blood_type: safeBloodType || prev.blood_type } : {}),
      ...(scanTargets.civilStatus ? { civil_status: safeCivilStatus || prev.civil_status } : {}),
      ...(scanTargets.height ? { height: safeHeight || prev.height } : {})
    }));

    // Kept so the final submission can send admins what the scan actually found,
    // for server-side comparison against what the citizen ends up typing.
    setScannerState(prev => ({ ...prev, appliedSnapshot: scannedData }));

    showToast('ID Scanned', 'Scanned ID details were applied to the form. You can still edit any field before submission.', 'success');
  };

  // Only include a field in what gets sent to the server if the form's
  // current value for it is still exactly what the scan applied — this is
  // what makes an unchecked scan-target, a manual correction after
  // applying, or a stale snapshot from an earlier scan all correctly drop
  // out instead of being compared as if they still reflected the scan.
  const buildVerifiedOcrSnapshot = () => {
    const snap = scannerState.appliedSnapshot;
    if (!snap) return null;

    const verified = { confidence: snap.confidence };

    if (
      formData.fName === snap.fName &&
      formData.mName === snap.mName &&
      formData.lName === snap.lName
    ) {
      verified.fName = snap.fName;
      verified.mName = snap.mName;
      verified.lName = snap.lName;
    }

    if (formData.birth_date === snap.birth_date) {
      verified.birth_date = snap.birth_date;
    }

    const hasComparableField = 'fName' in verified || 'birth_date' in verified;
    return hasComparableField ? verified : null;
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

  const scanIdImageViaGoogleVision = async (file) => {
    // Captured once, before the multi-second OCR call — the ID-type dropdown
    // stays interactive while scanning, so this must not re-read
    // formData.valid_id after the fact or a mid-scan dropdown change would
    // apply the wrong ID type's extraction rules to this photo's result.
    const idTypeSlug = getIdTypeSlug();

    try {
      setScannerState(prev => ({
        ...prev,
        isScanning: true,
        progress: 0,
        error: ''
      }));

      const lines = await scanIdImageViaBackend(file, idTypeSlug, (percent) => {
        setScannerState(prev => ({ ...prev, progress: percent }));
      });

      const data = extractIdFields(lines, idTypeSlug);
      const extracted = processBackendOcrResult(data);

      // Applied immediately — the whole point of scanning is to have the
      // next step already filled in, not to make the citizen click a
      // second button before that happens. Every field it touches is still
      // a normal editable input on the next step, so a wrong OCR read is
      // just as easy to fix there as it would be in a separate review
      // panel first. The "Review and apply" button below stays available
      // as a manual re-sync (e.g. after toggling a scan-target checkbox).
      applyScannedIdData(extracted);

      setScannerState(prev => ({
        ...prev,
        isScanning: false,
        progress: 100,
        extracted,
        extractedFields: data.fields || null,
        error: data.warnings && data.warnings.length > 0 ? data.warnings.join(' ') : ''
      }));
    } catch (error) {
      // Every OCR failure mode (network error, rate limit, unavailable
      // backend, Vision API error) funnels through here to the same honest
      // message — manual entry always remains fully available.
      console.error('ID scan error:', error);
      setScannerState(prev => ({
        ...prev,
        isScanning: false,
        error: 'ID scanning is temporarily unavailable — please fill in the ID details manually below.'
      }));
    } finally {
      isScanningRef.current = false;
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
    const idNumberValue = fields.idNumber?.value || '';
    // No single "full name" input exists on this form (fName/mName/lName are
    // separate fields), so this never auto-applies — it only needs to reach
    // the review panel below so the citizen can see it and split it manually
    // into those fields themselves, instead of it being silently dropped.
    const fullNameUnparsed = fields.fullNameUnparsed?.value || '';
    const bloodTypeValue = fields.bloodType?.value || '';
    const civilStatusValue = fields.civilStatus?.value || '';
    const heightValue = fields.height?.value || '';

    const validLastName = isValidPhilName(lName) ? lName : '';
    const validFirstName = isValidPhilName(fName) ? fName : '';
    const validMiddleName = isValidPhilName(mName) ? mName : '';
    const validGender = isValidPhilGender(sexValue) ? sexValue : '';
    const validBirthDate = isValidPhilBirthDate(birthDate) ? birthDate : '';
    const validAddress = isValidPhilAddress(cleanedAddress) ? cleanedAddress : '';
    const validIdNumber = getIdTypeSlug() === 'national' && isValidPhilSysNumber(idNumberValue) ? idNumberValue : '';
    const validBloodType = isValidPhilBloodType(bloodTypeValue) ? bloodTypeValue : '';
    const validCivilStatus = isValidPhilCivilStatus(civilStatusValue) ? civilStatusValue : '';
    const validHeight = isValidPhilHeight(heightValue) ? heightValue : '';

    // Pulls out House No. / Block & Lot only where the address has a clear,
    // unambiguous marker for them (e.g. "BLK 26 LOT 20 ..." or a leading
    // bare number) — otherwise the whole address stays in Street rather
    // than guessing where to split it, same "don't guess an ambiguous
    // split" rule already applied to combined names and place of birth.
    const addressParts = validAddress ? parseAddressComponents(validAddress) : { houseNo: '', blockLot: '', street: '' };

    const hasReliableData = validLastName || validFirstName || validMiddleName || validGender || validBirthDate || validAddress || validIdNumber || fullNameUnparsed || validBloodType || validCivilStatus || validHeight;

    if (!hasReliableData) {
      return null;
    }

    return {
      philsys_nat_id: validIdNumber,
      valid_id: formData.valid_id || 'National ID (PhilID/ePhilID)',
      fName: validFirstName,
      mName: validMiddleName,
      lName: validLastName,
      birth_date: validBirthDate,
      gender: validGender,
      house_no: addressParts.houseNo,
      street: addressParts.street || validAddress,
      block_lot: addressParts.blockLot,
      subdivision: '',
      area: '',
      birth_city: '',
      birth_province: '',
      age: validBirthDate ? Math.max(0, new Date().getFullYear() - new Date(validBirthDate).getFullYear()) : '',
      id_number_scanned: idNumberValue,
      blood_type: validBloodType,
      civil_status: validCivilStatus,
      height: validHeight,
      confidence: data.confidence || 0
    };
  };

  const isValidPhilSysNumber = (value = '') => {
    // The real PhilSys Card Number (PCN) is 16 digits, printed as four
    // groups of four (e.g. "3974-0169-3591-0287") — confirmed against an
    // actual PhilID. Accept that shape, whether OCR/typing kept the dashes
    // or not.
    const cleaned = (value || '').replace(/\s+/g, '').replace(/[^A-Z0-9]/gi, '');
    return /^\d{16}$/.test(cleaned) || /^\d{4}-\d{4}-\d{4}-\d{4}$/.test((value || '').trim());
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

  const isValidPhilBloodType = (value = '') => ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].includes(value);

  const isValidPhilCivilStatus = (value = '') => ['Single', 'Married', 'Widowed', 'Separated'].includes(value);

  // Sanity range for an adult resident, in centimeters — the scanner's own
  // findStandaloneHeightInCm already constrains its source (1.0-2.5m), this
  // just re-validates the value actually written to the form.
  const isValidPhilHeight = (value = '') => {
    const num = parseInt(value, 10);
    return Number.isFinite(num) && num >= 100 && num <= 250;
  };

  const handleIdScan = async (file) => {
    if (!file) return;
    // Ref check, not state — closes the window a second rapid file-pick
    // could otherwise slip through before React commits isScanning: true.
    if (isScanningRef.current) return;

    if (!formData.valid_id) {
      markFieldErrors(['valid_id']);
      showToast('Select ID Type', 'Please select your Philippine Government ID type before uploading its photo.', 'error');
      return;
    }

    // Must match backend/api/ocr_id.php's own 10MB cap — this pre-check just
    // saves an upload round-trip for a file the server will reject anyway.
    if (file.size > MAX_UPLOAD_BYTES) {
      showToast('Image Too Large', 'That image is too large (max 10MB). Please use a smaller photo or lower camera resolution.', 'error');
      return;
    }

    isScanningRef.current = true;

    const quality = await checkIdCaptureQuality(file);
    if (!quality.ok) {
      isScanningRef.current = false;
      // The photo is still kept as the ID front image: automatic reading is
      // skipped, but the citizen can continue and type the details manually
      // (an admin reviews the photo either way). Retaking is still offered.
      setScannerState(prev => ({
        ...prev,
        file,
        previewUrl: URL.createObjectURL(file),
        extracted: null,
        extractedFields: null,
        appliedSnapshot: null,
        isScanning: false,
        progress: 0,
        error: `${quality.reasons.join(' ')} The photo was kept, but its details could not be read automatically — you can retake it for auto-fill, or continue and fill in your details manually.`
      }));
      setFiles(prev => ({ ...prev, valid_id_img_front: file }));
      clearFieldError('valid_id_img_front');
      showToast('Photo Quality', 'We could not read this ID photo automatically. Retake it for auto-fill, or continue and enter your details manually.', 'warning');
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setScannerState(prev => ({
      ...prev,
      file,
      previewUrl,
      extracted: null,
      extractedFields: null,
      appliedSnapshot: null,
      isScanning: true,
      progress: 25,
      error: ''
    }));

    setFiles(prev => ({ ...prev, valid_id_img_front: file }));
    clearFieldError('valid_id_img_front');

    // The ID photo is uploaded to our backend, which forwards it to Google
    // Cloud Vision for OCR and returns only the recognized text lines.
    await scanIdImageViaGoogleVision(file);
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
      let darkPixels = 0;
      const pixelCount = data.length / 4;
      const gray = new Float32Array(pixelCount);

      for (let i = 0; i < data.length; i += 4) {
        const luminance = (data[i] * 0.299) + (data[i + 1] * 0.587) + (data[i + 2] * 0.114);
        gray[i / 4] = luminance;
        totalBrightness += luminance;
        if (luminance < 35) darkPixels += 1;
      }

      const averageBrightness = totalBrightness / pixelCount;

      // Sharpness/content check via variance of the Laplacian — the same
      // core technique behind OpenCV's standard cv2.Laplacian().var() blur
      // metric. A photo with real printed content has strong, varied edges
      // (high variance) no matter how blurred it is; only a genuinely blank
      // or content-less capture (pointed at a wall, a solid-color surface)
      // produces a near-zero, uniform response. Calibrated empirically
      // against synthetic test images: a blank/near-blank capture measured
      // 0-60, while every tested case with real content — including heavily
      // blurred photos — measured 2900+, and a fully sharp photo ~12,000.
      // Deliberately does NOT reject moderate/heavy blur on its own: Google
      // Vision's ML model already reads blurred text far better than this
      // (or any) client-side heuristic could judge in advance, so gating on
      // blur here would only produce false rejections of usable photos.
      // This check exists solely to catch captures with no discernible ID
      // content at all, before spending a Vision API call on them.
      let laplacianSum = 0;
      let laplacianSumSq = 0;
      let laplacianCount = 0;

      for (let y = 1; y < sampleHeight - 1; y++) {
        for (let x = 1; x < sampleWidth - 1; x++) {
          const idx = y * sampleWidth + x;
          const laplacian =
            (4 * gray[idx]) -
            gray[idx - 1] -
            gray[idx + 1] -
            gray[idx - sampleWidth] -
            gray[idx + sampleWidth];
          laplacianSum += laplacian;
          laplacianSumSq += laplacian * laplacian;
          laplacianCount += 1;
        }
      }

      const laplacianMean = laplacianCount ? laplacianSum / laplacianCount : 0;
      const edgeVariance = laplacianCount
        ? (laplacianSumSq / laplacianCount) - (laplacianMean * laplacianMean)
        : 0;

      const aspectRatio = width / height;
      const reasons = [];

      if (averageBrightness < 80) reasons.push('The ID is too dark. Use brighter lighting.');
      if (edgeVariance < 300) reasons.push('No readable ID content was detected. Make sure the card fills the frame and try again.');
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

    clearFieldError(name);
    if (name === 'house_no' || name === 'block_lot') {
      clearFieldError('house_no');
      clearFieldError('block_lot');
    }

    // Mobile numbers: digits only, so a stray space or dash can't fail the 09XXXXXXXXX check.
    const nextValue = (name === 'contact_num' || name === 'contactp_num') ? value.replace(/D/g, '') : value;

    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : nextValue
    }));
  };

  // --- Notifications -------------------------------------------------------
  const showToast = (title, message, type = 'success') => {
    // One timer at a time: an older toast's timer must not close a newer one early.
    clearTimeout(toastTimerRef.current);
    setToast({ title, message, type });
    toastTimerRef.current = setTimeout(() => setToast(null), 8000);
  };

  useEffect(() => () => clearTimeout(toastTimerRef.current), []);

  const markFieldErrors = (names) => setFieldErrors(names);
  const clearFieldError = (name) => setFieldErrors(prev => (prev.includes(name) ? prev.filter(n => n !== name) : prev));
  const hasError = (name) => fieldErrors.includes(name);
  const errClass = (name, base = '') => `${base} ${hasError(name) ? 'reg-field-error' : ''}`.trim();

  // --- Files ---------------------------------------------------------------
  const FILE_RULES = {
    image: { types: ['image/jpeg', 'image/png', 'image/webp'], label: 'JPEG, PNG, or WebP image' },
    imageOrPdf: { types: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'], label: 'JPEG, PNG, WebP, or PDF file' }
  };

  const acceptFile = (file, rule) => {
    if (!file) return false;
    if (!rule.types.includes(file.type)) {
      showToast('Unsupported File', `Please upload a ${rule.label}.`, 'error');
      return false;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      showToast('File Too Large', 'Each file must be 10MB or smaller.', 'error');
      return false;
    }
    return true;
  };

  const handleFileChange = (e) => {
    const { name } = e.target;
    const file = e.target.files?.[0];
    const rule = name.startsWith('proof_') ? FILE_RULES.imageOrPdf : FILE_RULES.image;
    if (!file) return;
    if (!acceptFile(file, rule)) {
      e.target.value = '';
      return;
    }
    setFiles(prev => ({ ...prev, [name]: file }));
    clearFieldError(name);
  };

  const handleProfilePhoto = (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file after removing it
    applyProfileFile(file);
  };

  const applyProfileFile = (file) => {
    if (!file || !acceptFile(file, FILE_RULES.image)) return;
    setFiles(prev => ({ ...prev, profile_picture: file }));
    setProfilePreview(prev => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
    clearFieldError('profile_picture');
  };

  // Step 1: a picked file and a camera shot both go through the same scan path.
  const handleIdFileSelected = (file) => {
    if (!file) return;
    if (!FILE_RULES.image.types.includes(file.type)) {
      showToast('Unsupported File', 'Please upload a JPEG, PNG, or WebP photo of your ID.', 'error');
      return;
    }
    handleIdScan(file);
  };

  const openIdCamera = () => {
    // The ID type decides which extraction rules the scan uses — ask first,
    // rather than letting someone frame and shoot their ID for nothing.
    if (!formData.valid_id) {
      markFieldErrors(['valid_id']);
      showToast('Select ID Type', 'Please select your Philippine Government ID type before capturing it.', 'error');
      focusField('valid_id');
      return;
    }
    setCameraMode('id');
  };

  const closeCamera = useCallback(() => setCameraMode(null), []);

  const removeProfilePhoto = () => {
    setFiles(prev => ({ ...prev, profile_picture: null }));
    setProfilePreview(prev => {
      if (prev) URL.revokeObjectURL(prev);
      return '';
    });
  };

  // --- Per-step validation -------------------------------------------------
  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
  const MOBILE_REGEX = /^09\d{9}$/;
  const todayIso = new Date().toISOString().slice(0, 10);

  const FIELD_LABELS = {
    valid_id: 'ID Type', valid_id_img_front: 'ID Front Photo',
    email: 'Email Address', contact_num: 'Mobile Number', password: 'Password', confirmPassword: 'Re-typed Password',
    fName: 'Given Name', lName: 'Surname', birth_date: 'Date of Birth', gender: 'Sex at Birth',
    civil_status: 'Civil Status', spouse_name_text: 'Spouse Name', height: 'Height', religion: 'Religion',
    birth_city: 'Birth City', birth_province: 'Birth Province', birth_country: 'Birth Country',
    house_no: 'House No. or Block & Lot', block_lot: 'House No. or Block & Lot', street: 'Street', subdivision: 'Subdivision',
    years_in_PB2: 'Years in PB2', residency_status: 'Residency Status', contact_person: 'Contact Person',
    contactp_num: 'Contact Person Mobile', contactp_relationship: 'Relationship',
    proof_pwd: 'PWD ID', proof_4ps: '4Ps Certification', proof_solo_parent: 'Solo Parent ID', proof_indigent: 'Certificate of Indigency',
    profile_picture: 'Profile Photo', valid_id_img_back: 'ID Back Photo', valid_id_img_holding: 'Selfie Holding ID',
    privacy_agreed: 'Data Privacy Agreement'
  };

  // Returns [{ name, reason? }] for every field on `step` that blocks moving on.
  // `reason` is set when the field is filled but wrong (shown instead of the
  // generic "please complete" message).
  const getStepErrors = (step) => {
    const errs = [];
    const blank = (key) => String(formData[key] ?? '').trim() === '';
    const need = (key) => { if (blank(key)) errs.push({ name: key }); };

    if (step === 1) {
      need('valid_id');
      if (!files.valid_id_img_front) errs.push({ name: 'valid_id_img_front' });
    }

    if (step === 2) {
      if (blank('email')) errs.push({ name: 'email' });
      else if (!EMAIL_REGEX.test(formData.email)) errs.push({ name: 'email', reason: 'Please enter a valid email address.' });

      if (blank('contact_num')) errs.push({ name: 'contact_num' });
      else if (!MOBILE_REGEX.test(formData.contact_num)) errs.push({ name: 'contact_num', reason: 'Mobile number must be 11 digits starting with 09.' });

      if (blank('password')) errs.push({ name: 'password' });
      else if (!PASSWORD_REGEX.test(formData.password)) errs.push({ name: 'password', reason: 'Password must have 8+ characters, an uppercase letter, a number, and a special character (@$!%*?&).' });

      if (blank('confirmPassword')) errs.push({ name: 'confirmPassword' });
      else if (formData.password !== formData.confirmPassword) errs.push({ name: 'confirmPassword', reason: 'Passwords do not match.' });

      need('fName');
      need('lName');

      if (blank('birth_date')) errs.push({ name: 'birth_date' });
      else {
        const bd = new Date(formData.birth_date);
        if (Number.isNaN(bd.getTime()) || formData.birth_date > todayIso || bd.getFullYear() < 1900) {
          errs.push({ name: 'birth_date', reason: 'Please enter a valid date of birth.' });
        }
      }

      need('gender');
      need('civil_status');
      if (['Married', 'Separated'].includes(formData.civil_status)) need('spouse_name_text');

      if (blank('height')) errs.push({ name: 'height' });
      else {
        const h = Number(formData.height);
        if (!Number.isInteger(h) || h < 50 || h > 250) errs.push({ name: 'height', reason: 'Height must be a whole number of centimeters between 50 and 250.' });
      }

      need('religion');
      need('birth_city');
      need('birth_province');
      need('birth_country');
    }

    if (step === 3) {
      if (blank('house_no') && blank('block_lot')) {
        errs.push({ name: 'house_no' });
        errs.push({ name: 'block_lot' });
      }
      need('street');
      need('subdivision');

      if (blank('years_in_PB2')) errs.push({ name: 'years_in_PB2' });
      else {
        const y = Number(formData.years_in_PB2);
        if (!Number.isInteger(y) || y < 0 || y > 120) errs.push({ name: 'years_in_PB2', reason: 'Years in PB2 must be a whole number.' });
      }

      need('residency_status');
      need('contact_person');
      if (blank('contactp_num')) errs.push({ name: 'contactp_num' });
      else if (!MOBILE_REGEX.test(formData.contactp_num)) errs.push({ name: 'contactp_num', reason: "Emergency contact's mobile number must be 11 digits starting with 09." });
      need('contactp_relationship');

      if (formData.is_pwd && !files.proof_pwd) errs.push({ name: 'proof_pwd' });
      if (formData.is_4ps && !files.proof_4ps) errs.push({ name: 'proof_4ps' });
      if (formData.is_solo_parent && !files.proof_solo_parent) errs.push({ name: 'proof_solo_parent' });
      if (formData.is_indigent && !files.proof_indigent) errs.push({ name: 'proof_indigent' });
    }

    if (step === 4) {
      if (!files.profile_picture) errs.push({ name: 'profile_picture' });
      if (!files.valid_id_img_front) errs.push({ name: 'valid_id_img_front' });
      if (!files.valid_id_img_back) errs.push({ name: 'valid_id_img_back' });
      if (!files.valid_id_img_holding) errs.push({ name: 'valid_id_img_holding' });
      if (!formData.privacy_agreed) errs.push({ name: 'privacy_agreed', reason: 'You must accept the Data Privacy Statement to continue.' });
    }

    return errs;
  };

  const focusField = (name) => {
    // Let React paint the step first (the field may have just mounted).
    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-field="${name}"], [name="${name}"]`);
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (typeof el.focus === 'function') el.focus({ preventScroll: true });
    });
  };

  const reportStepErrors = (errs) => {
    markFieldErrors(errs.map(e => e.name));
    const labels = [...new Set(errs.map(e => FIELD_LABELS[e.name] || e.name))];

    // Only "filled but wrong" problems: say exactly what's wrong.
    if (errs.every(e => e.reason)) {
      showToast('Please Check Your Entry', errs[0].reason, 'error');
    } else {
      const list = labels.slice(0, 4).join(', ') + (labels.length > 4 ? `, and ${labels.length - 4} more` : '');
      showToast('Incomplete Fields', `Please complete or correct the fields highlighted in red: ${list}.`, 'error');
    }
    focusField(errs[0].name);
  };

  const scrollToCardTop = () => {
    document.querySelector('.reg-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const goNextStep = () => {
    const errs = getStepErrors(currentStep);
    if (errs.length > 0) {
      reportStepErrors(errs);
      return;
    }
    setFieldErrors([]);
    setCurrentStep(prev => Math.min(prev + 1, totalSteps));
    scrollToCardTop();
  };

  const goPrevStep = () => {
    setFieldErrors([]);
    setCurrentStep(prev => Math.max(prev - 1, 1));
    scrollToCardTop();
  };

  // --- OTP + submission ----------------------------------------------------
  const sendOtp = async () => {
    const response = await fetch(`${API_BASE}/send_otp.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: formData.email })
    });
    return response.json();
  };

  const handleRequestOtp = async () => {
    setOtpError('');
    try {
      const data = await sendOtp();
      if (data.success) {
        setOtpCooldown(120);
        showToast('Code Sent', `A new verification code was sent to ${formData.email}.`, 'info');
      } else {
        setOtpError(data.message || 'Unable to send a new code. Please try again.');
      }
    } catch {
      setOtpError('Unable to reach the server. Please check your connection and try again.');
    }
  };

  // Every step is re-checked on submit — a later edit (e.g. going Back and
  // clearing a field) must not slip through just because that step was
  // passed once.
  const handleInitialSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    for (let step = 1; step <= totalSteps; step++) {
      const errs = getStepErrors(step);
      if (errs.length > 0) {
        if (step !== currentStep) setCurrentStep(step);
        reportStepErrors(errs);
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const data = await sendOtp();
      if (data.success) {
        setOtpCooldown(120);
        setOtpValue('');
        setOtpError('');
        setOtpSuccess('');
        setShowOtpModal(true);
      } else {
        // send_otp.php rejects an already-registered email here.
        if (/email/i.test(data.message || '')) {
          setCurrentStep(2);
          markFieldErrors(['email']);
          focusField('email');
        }
        showToast('Verification Failed', data.message || 'Unable to send a verification code.', 'error');
      }
    } catch {
      showToast('Connection Error', 'Unable to reach the server. Please check your connection and try again.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const closeOtpModal = () => {
    if (isSubmitting || otpSuccess) return;
    setShowOtpModal(false);
    setOtpError('');
  };

  const handleVerifyAndRegister = async (e) => {
    e.preventDefault();
    setOtpError('');

    if (otpValue.length !== 6) {
      setOtpError('Please enter the complete 6-digit code.');
      return;
    }

    setIsSubmitting(true);

    try {
      const verifyRes = await fetch(`${API_BASE}/email_verification_otp.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: formData.email, otp: otpValue })
      });
      const verifyData = await verifyRes.json();

      if (!verifyData.success) {
        setOtpError('Incorrect verification code. Please re-enter the correct code or request a new one after the cooldown.');
        setIsSubmitting(false);
        return;
      }

      const dataToSend = new FormData();
      Object.keys(formData).forEach(key => dataToSend.append(key, formData[key]));
      Object.keys(files).forEach(key => { if (files[key]) dataToSend.append(key, files[key]); });

      // Append the OTP so the final registry script can verify it
      dataToSend.append('otp', otpValue);

      // Let the backend compare what the scanner found against what was finally
      // typed — but only for fields still identical to what the scan actually
      // applied. If a scan target was unchecked (so the field was never written
      // from OCR), or the citizen edited a field afterward, or a later
      // rescan/ID-type-change left a stale snapshot around, that field's
      // current form value no longer equals the cached snapshot value and is
      // correctly excluded here, instead of being compared as if it still
      // reflected the scan.
      const verifiedOcrSnapshot = buildVerifiedOcrSnapshot();
      if (verifiedOcrSnapshot) {
        dataToSend.append('id_ocr_snapshot', JSON.stringify(verifiedOcrSnapshot));
      }

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
        console.error('register.php returned non-JSON output:', rawText);
        setOtpError('The server could not process your upload. Your photos may exceed the server upload limit — try smaller images and submit again.');
        setIsSubmitting(false);
        return;
      }

      if (registerData.success) {
        setOtpSuccess('Your profile was submitted for verification. Redirecting you to the login page...');
        showToast('Registration Submitted', 'An administrator will review your profile. You can log in once it is approved.', 'success');

        setTimeout(() => {
          setShowOtpModal(false);
          navigate('/login');
        }, 3000);
      } else {
        setOtpError(registerData.message || 'Registration failed. Please try again.');
        setIsSubmitting(false);
      }
    } catch {
      setOtpError('Unable to reach the server. Please check your connection and try again.');
      setIsSubmitting(false);
    }
  };

  return (
    <>
    <Preloader />
    <Header />
    <Toast toast={toast} onClose={() => setToast(null)} />
    <CameraCapture
      open={cameraMode !== null}
      mode={cameraMode || 'face'}
      title={cameraMode === 'id' ? 'Scan Your ID' : 'Take Profile Photo'}
      hint={cameraMode === 'id' ? `Hold your ${formData.valid_id || 'ID'} flat inside the frame, in bright light without glare. The details will be read automatically.` : undefined}
      onCapture={(file) => (cameraMode === 'id' ? handleIdFileSelected(file) : applyProfileFile(file))}
      onClose={closeCamera}
    />
    <div className="pf-form reg-page-container">
      <div className="reg-wrapper">
        <div className="reg-card">
          <div className="reg-header">
            <h2>Resident Registration</h2>
            <span className="pf-badge"><i className="bi bi-person-vcard"></i> Official Resident Profiling</span>
            <p>Create your Barangay Pasong Buaya II account. Your profile is reviewed by barangay staff before you can log in.</p>
          </div>

          <div className="reg-body">
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

           <form onSubmit={handleInitialSubmit} noValidate>
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
                        <select name="valid_id" className={errClass('valid_id')} value={formData.valid_id} required disabled={scannerState.isScanning} onChange={(e) => {
                          handleChange(e);
                          setScannerState(prev => ({ ...prev, extracted: null, extractedFields: null, appliedSnapshot: null, error: '' }));
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
                        <div className="reg-id-source">
                          <input
                            type="file"
                            name="valid_id_img_front"
                            className={errClass('valid_id_img_front')}
                            accept="image/jpeg,image/png,image/webp"
                            disabled={scannerState.isScanning}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              e.target.value = ''; // re-picking the same photo should re-run the scan
                              handleIdFileSelected(file);
                            }}
                          />
                          <button type="button" className="reg-camera-btn" onClick={openIdCamera} disabled={scannerState.isScanning}>
                            <i className="bi bi-camera-fill"></i> Use Camera
                          </button>
                        </div>
                        {files.valid_id_img_front && (
                          <span className="reg-file-picked"><i className="bi bi-check-circle-fill"></i> {files.valid_id_img_front.name}</span>
                        )}
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
                        {/* Rows are filtered to fields that actually exist on the
                            selected ID type (ID_PROFILES.fieldsPresent) — a checkbox
                            for a field the card structurally can't contain (e.g. Sex
                            on a PhilHealth card) is misleading, not just harmless. */}
                        {(() => {
                          const slug = getIdTypeSlug();
                          const fieldsPresent = getIdProfile(slug).fieldsPresent;
                          const allTargets = [
                            ['name', slug === 'national' ? 'Surname / First / Middle Name' : 'Name'],
                            ['birth_date', 'Date of Birth'],
                            ['gender', 'Sex'],
                            ['address', 'Address'],
                            ['idNumber', slug === 'national' ? 'PhilSys Number' : 'ID Number'],
                            ['bloodType', 'Blood Type'],
                            ['civilStatus', 'Civil Status'],
                            ['height', 'Height']
                          ];
                          return allTargets.filter(([key]) => fieldsPresent[key]);
                        })().map(([key, label]) => (
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

                    {scannerState.error && (
                      <div className="reg-inline-alert reg-inline-alert--warning" role="status">
                        <i className="bi bi-exclamation-triangle-fill"></i>
                        <span>{scannerState.error}</span>
                      </div>
                    )}

                    {scannerState.extracted && (
                      <div className="scanner-review-box">
                        {scannerState.extractedFields && (
                          <div className="scanner-review-fields">
                            <strong>Scanned values (already applied to the form below):</strong>
                            <ul>
                              {Object.entries(scannerState.extractedFields).map(([key, field]) => (
                                <li key={key}>
                                  <span className="scanner-review-key">{key}:</span>{' '}
                                  <span className="scanner-review-val">{field.value || '—'}</span>{' '}
                                  <span className="scanner-review-conf">({Math.round(field.confidence)}% confidence)</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        <button type="button" className="btn-secondary" onClick={() => applyScannedIdData(scannerState.extracted)}>
                          Re-apply scanned values to form
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="step-actions">
                    <button type="button" className="btn-register secondary-action" disabled={scannerState.isScanning} onClick={goNextStep}>
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
                        className={errClass('email', validations.email === true ? 'valid' : validations.email === false ? 'invalid' : '')}
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
                        type="text" inputMode="numeric" name="contact_num" placeholder="09171234567" maxLength="11" required 
                        className={errClass('contact_num', validations.mobile === true ? 'valid' : validations.mobile === false ? 'invalid' : '')}
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
                        className={errClass('password', validations.password === true ? 'valid' : validations.password === false ? 'invalid' : '')}
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
                        className={errClass('confirmPassword', validations.match === true ? 'valid' : validations.match === false ? 'invalid' : '')}
                        placeholder="••••••••"
                        onChange={handleChange} 
                        value={formData.confirmPassword}
                      />
                      {validations.match === false && <span className="validation-hint error-text">✘ Passwords do not match.</span>}
                    </div>
                    <div className="form-group"><label>Given Name *</label><input type="text" name="fName" className={errClass('fName')} required onChange={handleChange} value={formData.fName} /></div>
                    <div className="form-group"><label>Middle Name</label><input type="text" name="mName" className={errClass('mName')} onChange={handleChange} value={formData.mName} /></div>
                    <div className="form-group"><label>Surname *</label><input type="text" name="lName" className={errClass('lName')} required onChange={handleChange} value={formData.lName} /></div>
                    <div className="form-group">
                      <label>Suffix</label>
                      <select name="suffix" className={errClass('suffix')} onChange={handleChange} value={formData.suffix}>
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
                      <input type="date" name="birth_date" className={errClass('birth_date')} required max={todayIso} onChange={handleChange} value={formData.birth_date} />
                      {age !== null && <span className="validation-hint success-text">System Detected Age: {age} Years</span>}
                    </div>
                    <div className="form-group">
                      <label>Sex at Birth *</label>
                      <select name="gender" className={errClass('gender')} required onChange={handleChange} value={formData.gender}>
                        <option value="">-- SELECT --</option>
                        <option value="Male">MALE</option>
                        <option value="Female">FEMALE</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Civil Status *</label>
                      <select name="civil_status" className={errClass('civil_status')} required onChange={handleChange} value={formData.civil_status}>
                        <option value="Single">SINGLE</option>
                        <option value="Married">MARRIED</option>
                        <option value="Widowed">WIDOWED</option>
                        <option value="Separated">SEPARATED</option>
                      </select>
                    </div>

                    {(formData.civil_status === 'Married' || formData.civil_status === 'Separated') && (
                      <div className="form-group span-3 animate-in">
                        <label>Legal Name of Spouse (First Middle Last) *</label>
                        <input type="text" name="spouse_name_text" className={errClass('spouse_name_text')} required onChange={handleChange} placeholder="ENTER LEGAL NAME OF SPOUSE" value={formData.spouse_name_text} />
                      </div>
                    )}

                    <div className="form-group"><label>Height (in Centimeters) *</label><input type="number" min="50" max="250" inputMode="numeric" name="height" className={errClass('height')} required onChange={handleChange} value={formData.height} /></div>
                    <div className="form-group"><label>Religion / Belief *</label><input type="text" name="religion" className={errClass('religion')} required onChange={handleChange} value={formData.religion} /></div>
                    <div className="form-group">
                      <label>Blood Type (Optional)</label>
                      <select name="blood_type" className={errClass('blood_type')} onChange={handleChange} value={formData.blood_type}>
                        <option value="">-- UNKNOWN --</option>
                        {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div className="form-group"><label>Birth City *</label><input type="text" name="birth_city" className={errClass('birth_city')} required onChange={handleChange} value={formData.birth_city} /></div>
                    <div className="form-group"><label>Birth Province *</label><input type="text" name="birth_province" className={errClass('birth_province')} required onChange={handleChange} value={formData.birth_province} /></div>
                    <div className="form-group"><label>Birth Country *</label><input type="text" name="birth_country" className={errClass('birth_country')} required value={formData.birth_country} onChange={handleChange} /></div>
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
                        <input type="text" name="house_no" className={errClass('house_no')} required={addrReq.house} onChange={handleChange} value={formData.house_no} />
                    </div>
                    <div className="form-group">
                        <label>Street *</label>
                        <input type="text" name="street" className={errClass('street')} required onChange={handleChange} value={formData.street} />
                    </div>
                    <div className="form-group">
                        <label>Subdivision *</label>
                        <input type="text" name="subdivision" className={errClass('subdivision')} required onChange={handleChange} value={formData.subdivision} />
                    </div>
                    <div className="form-group">
                        <label>Area</label>
                        <input type="text" name="area" className={errClass('area')} onChange={handleChange} value={formData.area} />
                    </div>
                    <div className="form-group">
                        <label>Block & Lot {addrReq.block ? '*' : ''}</label>
                        <input type="text" name="block_lot" className={errClass('block_lot')} required={addrReq.block} onChange={handleChange} value={formData.block_lot} />
                    </div>
                    <div className="form-group">
                        <label>Zone / Purok</label>
                        <input type="text" name="zone" className={errClass('zone')} onChange={handleChange} value={formData.zone} />
                    </div>
                    <div className="form-group span-2"><label>Landmark</label><input type="text" name="landmark" className={errClass('landmark')} onChange={handleChange} value={formData.landmark} /></div>
                    <div className="form-group"><label>Years in PB2 *</label><input type="number" name="years_in_PB2" className={errClass('years_in_PB2')} required onChange={handleChange} value={formData.years_in_PB2} /></div>
                    <div className="form-group span-3">
                      <label>Residency Status *</label>
                      <select name="residency_status" className={errClass('residency_status')} required onChange={handleChange} value={formData.residency_status}>
                        <option value="Homeowner">HOMEOWNER</option>
                        <option value="Tenant">TENANT</option>
                        <option value="Sharer">SHARER</option>
                      </select>
                    </div>
                    <div className="form-group"><label>Contact Person *</label><input type="text" name="contact_person" className={errClass('contact_person')} required onChange={handleChange} value={formData.contact_person} /></div>
                    <div className="form-group"><label>Mobile Number *</label><input type="text" inputMode="numeric" maxLength="11" placeholder="09171234567" name="contactp_num" className={errClass('contactp_num')} required onChange={handleChange} value={formData.contactp_num} /></div>
                    <div className="form-group"><label>Relationship *</label><input type="text" name="contactp_relationship" className={errClass('contactp_relationship')} required onChange={handleChange} value={formData.contactp_relationship} /></div>
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
                        <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" name="proof_pwd" className={errClass('proof_pwd')} required onChange={handleFileChange} />
                        {files.proof_pwd && <span className="reg-file-picked"><i className="bi bi-check-circle-fill"></i> {files.proof_pwd.name}</span>}
                      </div>
                    )}
                    {formData.is_4ps && (
                      <div className="form-group span-3 file-input-wrapper">
                        <label>4Ps Membership Certification (Scan/Photo) *</label>
                        <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" name="proof_4ps" className={errClass('proof_4ps')} required onChange={handleFileChange} />
                        {files.proof_4ps && <span className="reg-file-picked"><i className="bi bi-check-circle-fill"></i> {files.proof_4ps.name}</span>}
                      </div>
                    )}
                    {formData.is_solo_parent && (
                      <div className="form-group span-3 file-input-wrapper">
                        <label>Solo Parent ID / Social Worker Certification *</label>
                        <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" name="proof_solo_parent" className={errClass('proof_solo_parent')} required onChange={handleFileChange} />
                        {files.proof_solo_parent && <span className="reg-file-picked"><i className="bi bi-check-circle-fill"></i> {files.proof_solo_parent.name}</span>}
                      </div>
                    )}
                    {formData.is_indigent && (
                      <div className="form-group span-3 file-input-wrapper">
                        <label>Barangay Certificate of Indigency *</label>
                        <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" name="proof_indigent" className={errClass('proof_indigent')} required onChange={handleFileChange} />
                        {files.proof_indigent && <span className="reg-file-picked"><i className="bi bi-check-circle-fill"></i> {files.proof_indigent.name}</span>}
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
                    <span className="title">Profile Photo, Identification & Review</span>
                  </div>

                  <div className={errClass('profile_picture', 'reg-photo-card')} data-field="profile_picture" tabIndex={-1}>
                    <div className="reg-photo-preview">
                      {profilePreview ? (
                        <img src={profilePreview} alt="Your profile preview" />
                      ) : (
                        <i className="bi bi-person-bounding-box" aria-hidden="true"></i>
                      )}
                    </div>
                    <div className="reg-photo-body">
                      <label className="reg-photo-title">Profile Photo *</label>
                      <p>
                        This photo will appear on your resident profile. Use a recent, front-facing photo with your
                        whole face visible, plain background, no sunglasses or face covering.
                      </p>
                      <div className="reg-photo-actions">
                        <label className="reg-photo-btn">
                          <i className="bi bi-image"></i> {files.profile_picture ? 'Choose Another' : 'Choose Photo'}
                          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleProfilePhoto} hidden />
                        </label>
                        <button type="button" className="reg-photo-btn" onClick={() => setCameraMode('face')}>
                          <i className="bi bi-camera"></i> Take Photo
                        </button>
                        {files.profile_picture && (
                          <button type="button" className="reg-photo-btn reg-photo-btn--ghost" onClick={removeProfilePhoto}>
                            <i className="bi bi-trash3"></i> Remove
                          </button>
                        )}
                      </div>
                      <span className="validation-hint">JPEG, PNG, or WebP · max 10MB</span>
                    </div>
                  </div>

                  <div className="input-grid mt-6">
                    <div className="form-group span-3">
                      <label>PhilSys National ID Number (Optional)</label>
                      <input type="text" name="philsys_nat_id" placeholder="1234-5678-9012-3456" onChange={handleChange} value={formData.philsys_nat_id} />
                    </div>
                    <div className="form-group span-3">
                      <label>Primary ID Type to be Verified</label>
                      {/* Chosen in Step 1, where it drives the scanner's extraction rules —
                          changing it here would silently disagree with the scanned photo. */}
                      <div className="file-already-provided">
                        <i className="bi bi-person-vcard" aria-hidden="true"></i> {formData.valid_id || 'Not selected'}
                        <button type="button" className="reg-link-btn" onClick={() => { setFieldErrors([]); setCurrentStep(1); scrollToCardTop(); }}>Change in Step 1</button>
                      </div>
                    </div>
                    {files.valid_id_img_front && !hasError('valid_id_img_front') ? (
                      // The Step 1 photo already populated this — asking again
                      // here would make the citizen upload the same front-of-ID
                      // photo twice.
                      <div className="form-group file-input-wrapper">
                        <label>ID Front View</label>
                        <div className="file-already-provided">
                          <span aria-hidden="true">✓</span> Already provided in Step 1
                        </div>
                      </div>
                    ) : (
                      <div className="form-group file-input-wrapper">
                        <label>ID Front View *</label>
                        <input type="file" accept="image/jpeg,image/png,image/webp" name="valid_id_img_front" className={errClass('valid_id_img_front')} onChange={handleFileChange} />
                      </div>
                    )}
                    <div className="form-group file-input-wrapper">
                      <label>ID Back View *</label>
                      <input type="file" accept="image/jpeg,image/png,image/webp" name="valid_id_img_back" className={errClass('valid_id_img_back')} onChange={handleFileChange} />
                      {files.valid_id_img_back && <span className="reg-file-picked"><i className="bi bi-check-circle-fill"></i> {files.valid_id_img_back.name}</span>}
                    </div>
                    <div className="form-group file-input-wrapper">
                      <label>Verification Selfie (Holding ID) *</label>
                      <input type="file" accept="image/jpeg,image/png,image/webp" name="valid_id_img_holding" className={errClass('valid_id_img_holding')} onChange={handleFileChange} />
                      {files.valid_id_img_holding
                        ? <span className="reg-file-picked"><i className="bi bi-check-circle-fill"></i> {files.valid_id_img_holding.name}</span>
                        : <span className="validation-hint">Ensure your face and the ID details are both clear.</span>}
                    </div>
                  </div>

                  <div className={errClass('privacy_agreed', 'privacy-box')}>
                    <h4 style={{margin:'0 0 15px 0', color: '#064e3b', fontWeight: 800, textTransform: 'uppercase', fontSize: '0.9rem', letterSpacing:'1px'}}>
                      RA 10173: Data Privacy Act of 2012 Compliance
                    </h4>
                    <p>
                      By completing this form, you authorize <strong>Barangay Pasong Buaya II</strong> to collect, store, and process your personal and sensitive information for profiling and public service purposes.
                      Your data is protected under the <strong>Data Privacy Act (RA 10173)</strong>. We implement strict organizational and technical security measures to ensure that your records remain confidential
                      and are only accessed by authorized personnel for official government functions.
                    </p>
                    <p>
                      If you use the ID-scanning feature, the photo of your ID is sent to <strong>Google Cloud Vision</strong>, a third-party OCR service, solely to read and pre-fill the ID details shown to you for review before you submit. You may skip the scanner and fill in the form manually if you prefer.
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

    {/* EMAIL OTP VERIFICATION DIALOG — portaled to <body>: .reg-card's backdrop-filter
        would otherwise trap this fixed overlay inside the card, under the site header. */}
    {showOtpModal && createPortal(
      <div className="reg-modal-overlay" role="presentation">
        <form className="reg-modal-card" role="dialog" aria-modal="true" aria-labelledby="reg-otp-title" onSubmit={handleVerifyAndRegister} noValidate>
          <div className="reg-modal-header">
            <div className="reg-modal-icon"><i className="bi bi-envelope-check-fill" aria-hidden="true"></i></div>
            <div>
              <h3 id="reg-otp-title">Verify Your Email</h3>
              <p>
                We sent a 6-digit code to <strong>{formData.email}</strong>. It stays valid for 10 minutes.
              </p>
            </div>
            <button type="button" className="reg-modal-close" onClick={closeOtpModal} disabled={isSubmitting || !!otpSuccess} aria-label="Close">
              <i className="bi bi-x-lg"></i>
            </button>
          </div>

          {otpError && (
            <div className="reg-inline-alert reg-inline-alert--error" role="alert">
              <i className="bi bi-exclamation-octagon-fill"></i>
              <span>{otpError}</span>
            </div>
          )}
          {otpSuccess && (
            <div className="reg-inline-alert reg-inline-alert--success" role="status">
              <i className="bi bi-check-circle-fill"></i>
              <span>{otpSuccess}</span>
            </div>
          )}

          <label className="reg-otp-label" htmlFor="reg-otp-input">Enter 6-Digit Code *</label>
          <input
            id="reg-otp-input"
            className={`reg-otp-input ${otpError ? 'reg-field-error' : ''}`}
            type="text" inputMode="numeric" autoComplete="one-time-code" maxLength="6" placeholder="000000"
            value={otpValue}
            disabled={isSubmitting || !!otpSuccess}
            autoFocus
            onChange={(e) => { setOtpValue(e.target.value.replace(/\D/g, '')); setOtpError(''); }}
          />

          <button type="submit" className="reg-modal-submit" disabled={isSubmitting || !!otpSuccess}>
            {isSubmitting ? "Verifying..." : "Confirm & Complete Registration"}
          </button>

          <div className="reg-modal-footer">
            {otpCooldown > 0 ? (
              <span>Resend available in {otpCooldown}s</span>
            ) : (
              <button type="button" className="reg-link-btn" onClick={handleRequestOtp} disabled={isSubmitting || !!otpSuccess}>
                Resend Code
              </button>
            )}
          </div>
        </form>
      </div>,
      document.body
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