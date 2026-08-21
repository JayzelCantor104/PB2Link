import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Header from '../components/Header';
import Footer from '../components/Footer';
import Preloader from '../components/Preloader';

const API_BASE = '/api_backend';

const BookingPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState(0);
  const [trackingCode, setTrackingCode] = useState('');
  const [toast, setToast] = useState(null);
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    resident_id: '', 
    venue: 'Barangay Court', 
    date: '', 
    startTime: '08:00', 
    endTime: '12:00',
    purpose: '', 
    contactName: '', 
    contactNumber: '',
    id_front: null, 
    id_holding: null
  });

  const steps = [
    { label: 'Facility', icon: 'bi-building-gear' },
    { label: 'Schedule', icon: 'bi-calendar-week' },
    { label: 'Verification', icon: 'bi-file-earmark-lock' },
    { label: 'Review', icon: 'bi-clipboard2-check-fill' }
  ];

  // 1. Generate Unique Tracking Code
  const generateTrackingCode = () => {
    const timestamp = Date.now();
    const randomHash = Math.random().toString(36).substring(2, 7).toUpperCase();
    return `BK-${timestamp}-${randomHash}`;
  };

  useEffect(() => {
    setTrackingCode(generateTrackingCode());
  }, []);

  // 2. Fetch Profile Data using Auth Context user_id
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
              contactName: `${d.fName} ${d.lName}`,
              contactNumber: d.contact_num || ''
            }));
          }
        })
        .catch(err => console.error("Failed to fetch profile for booking", err));
    }
  }, [user]);

  const showToast = (title, message, type = 'success') => {
    setToast({ title, message, type });
    setTimeout(() => setToast(null), 5000);
  };

  // Helper to validate time variables against the actual clock right now
  const isTimeInPast = () => {
    const todayStr = new Date().toISOString().split('T')[0];
    if (formData.date === todayStr) {
      const now = new Date();
      const currentHours = String(now.getHours()).padStart(2, '0');
      const currentMinutes = String(now.getMinutes()).padStart(2, '0');
      const currentTimeStr = `${currentHours}:${currentMinutes}`;
      
      return formData.startTime < currentTimeStr;
    }
    return false;
  };

  // Check Schedule Availability in Backend
  const checkSlotAvailability = async () => {
    if (!formData.date || !formData.startTime || !formData.endTime) {
      showToast('Error', 'Please fill in the date, start time, and end time.', 'error');
      return;
    }

    // Guardrail 1: Chronological Order Check
    if (formData.startTime >= formData.endTime) {
      showToast('Time Error', 'End time must be later than the selected start time.', 'error');
      return;
    }

    // Guardrail 2: Dynamic Past-Time Check for "Today"
    if (isTimeInPast()) {
      showToast('Time Error', 'You cannot select a start time that has already passed today.', 'error');
      return;
    }

    setCheckingAvailability(true);
    const formattedTimeSlot = `${formData.startTime} - ${formData.endTime}`;

    try {
      const res = await fetch(`${API_BASE}/check_slot_availability.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          venue: formData.venue, 
          date: formData.date, 
          time_slot: formattedTimeSlot 
        })
      });
      const data = await res.json();
      if (!data.available) {
        showToast('Unavailable', 'This timeframe conflicts with an existing reservation.', 'error');
      } else {
        setCurrentStep(2);
      }
    } catch (err) {
      showToast('Error', 'Unable to verify slot availability at the moment.', 'error');
    } finally {
      setCheckingAvailability(false);
    }
  };

  // Validation Check per Step
  const validateStep = () => {
    if (currentStep === 0) return formData.venue;
    if (currentStep === 1) {
      const basicFieldsFilled = formData.date && formData.startTime && formData.endTime;
      const validDuration = formData.startTime < formData.endTime;
      return basicFieldsFilled && validDuration && !isTimeInPast();
    }
    if (currentStep === 2) return formData.purpose && formData.id_front && formData.id_holding;
    return true;
  };

  const handleNextStep = () => {
    if (currentStep === 1) {
      checkSlotAvailability();
    } else {
      setCurrentStep(prev => Math.min(prev + 1, steps.length - 1));
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (e) => {
    const { name, files } = e.target;
    if (files && files[0]) {
      setFormData(prev => ({ ...prev, [name]: files[0] }));
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);

    const data = new FormData();
    const formattedTimeSlot = `${formData.startTime} - ${formData.endTime}`;

    data.append('resident_id', formData.resident_id);
    data.append('tracking_code', trackingCode);
    data.append('venue', formData.venue);
    data.append('date', formData.date);
    data.append('time_slot', formattedTimeSlot);
    data.append('purpose', formData.purpose);
    data.append('contact_name', formData.contactName);
    data.append('contact_number', formData.contactNumber);
    data.append('id_front', formData.id_front);
    data.append('id_holding', formData.id_holding);

    try {
      const response = await fetch(`${API_BASE}/submit_amenity_reservation.php`, {
        method: 'POST',
        body: data,
      });
     const result = await response.json();
      if (result.success) {
        showToast('Success!', result.message, 'success');
        setTimeout(() => {
          setIsSubmitting(false);
          navigate('/services')}, 2500);
      } else {
        showToast('Error', result.message, 'error');
        setTrackingCode(generateTrackingCode()); // Generate fresh code on rejection
        setIsSubmitting(false);
      }
    } catch (error) {
      showToast('Server Error', 'Invalid response from server.', 'error');
      setTrackingCode(generateTrackingCode()); // Generate fresh code on server crash
      setIsSubmitting(false);
    }
  };

  const renderFilePreview = (fileKey, label, subLabel, iconClass) => {
    const file = formData[fileKey];
    return (
      <div className={`ep-file-upload-box ${file ? 'has-file' : ''}`} onClick={() => document.getElementById(fileKey).click()}>
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
            <span className="ep-file-name">{file.name}</span>
            <span className="ep-file-change">Click to change</span>
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
      
      <style>{`
        .ep-page-wrapper { min-height: 100vh; background-color: #011c16; background-image: radial-gradient(circle at 15% 50%, rgba(5, 150, 105, 0.15), transparent 40%), linear-gradient(180deg, #002e25 0%, #000000 100%); padding: 60px 20px; font-family: 'Inter', sans-serif; color: #1e293b; display: flex; justify-content: center; align-items: center; margin-top:100px;}
        .ep-form-card { background: rgba(255, 255, 255, 0.85); backdrop-filter: blur(30px); -webkit-backdrop-filter: blur(30px); border-radius: 30px; padding: 50px; width: 100%; max-width: 900px; border: 1px solid rgba(255, 255, 255, 0.6); box-shadow: 0 30px 60px -15px rgba(0, 0, 0, 0.5), inset 0 0 20px rgba(255, 255, 255, 0.8); }
        .ep-form-header { text-align: center; margin-bottom: 40px; }
        .ep-form-header h2 { margin: 0 0 10px; font-size: 2.5rem; font-weight: 800; color: #064e3b; letter-spacing: -1px; }
        .ep-badge-official { display: inline-flex; align-items: center; gap: 8px; background: #ecfdf5; color: #059669; padding: 6px 16px; border-radius: 50px; font-size: 0.85rem; font-weight: 600; border: 1px solid #a7f3d0; text-transform: uppercase; letter-spacing: 1px; }
        .ep-stepper-container { margin-bottom: 50px; position: relative; }
        .ep-stepper { display: flex; justify-content: space-between; position: relative; z-index: 1; }
        .ep-progress-bg { position: absolute; top: 25px; left: 5%; width: 90%; height: 4px; background: #e2e8f0; z-index: -1; }
        .ep-progress-fill { position: absolute; top: 25px; left: 5%; height: 4px; background: #059669; z-index: -1; transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1); box-shadow: 0 0 10px rgba(5, 150, 105, 0.4); }
        .ep-step-item { flex: 1; text-align: center; display: flex; flex-direction: column; align-items: center; }
        .ep-step-circle { width: 54px; height: 54px; border-radius: 50%; background: #ffffff; border: 2px solid #e2e8f0; display: flex; align-items: center; justify-content: center; color: #94a3b8; transition: 0.4s; }
        .ep-step-circle i { font-size: 1.5rem; }
        .ep-step-label { margin-top: 12px; font-size: 0.8rem; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 1px; }
        .ep-step-item.active .ep-step-circle { border-color: #059669; color: #059669; transform: scale(1.15); box-shadow: 0 10px 20px rgba(5, 150, 105, 0.15); background: #ffffff; }
        .ep-step-item.active .ep-step-label { color: #059669; }
        .ep-step-item.completed .ep-step-circle { background: #059669; border-color: #059669; color: #fff; }
        .ep-venue-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 25px; }
        .ep-venue-card { border: 2px solid #cbd5e1; border-radius: 20px; padding: 35px 25px; text-align: center; cursor: pointer; background: rgba(255, 255, 255, 0.6); transition: all 0.3s ease; }
        .ep-venue-card:hover { border-color: #059669; background: #ecfdf5; transform: translateY(-5px); }
        .ep-venue-card.active { border-color: #059669; background: #ecfdf5; box-shadow: 0 10px 25px rgba(5, 150, 105, 0.15); }
        .ep-venue-card i { font-size: 3rem; color: #94a3b8; }
        .ep-venue-card.active i { color: #059669; }
        .ep-venue-card h4 { margin: 15px 0 5px; font-weight: 700; color: #0f172a; }
        .ep-venue-card p { margin: 0; color: #64748b; font-size: 0.85rem; }
        .ep-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 25px; }
        .ep-full { grid-column: span 2; }
        .ep-input-group label { display: block; font-size: 0.8rem; font-weight: 600; color: #475569; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 1px; }
        .ep-input-group input, .ep-input-group select, .ep-input-group textarea { width: 100%; padding: 16px 20px; border-radius: 14px; border: 1px solid #cbd5e1; background: rgba(255, 255, 255, 0.6); color: #0f172a; font-family: 'Inter', sans-serif; font-size: 1rem; outline: none; box-sizing: border-box; transition: 0.3s; }
        .ep-input-group input:focus, .ep-input-group select:focus, .ep-input-group textarea:focus { border-color: #059669; background: #ffffff; box-shadow: 0 0 0 4px rgba(5, 150, 105, 0.1); }
        .ep-input-group input[readOnly] { background: #f8fafc; color: #64748b; border-style: dashed; cursor: not-allowed; }
        .ep-section-title { font-size: 1.2rem; color: #0f172a; border-bottom: 1px solid #e2e8f0; padding-bottom: 15px; margin-bottom: 25px; display: flex; align-items: center; gap: 10px; font-weight: 700; }
        .ep-section-title i { color: #059669; }
        .ep-file-upload-box { border: 2px dashed #cbd5e1; border-radius: 16px; padding: 40px 20px; text-align: center; cursor: pointer; transition: 0.3s; background: rgba(255, 255, 255, 0.5); }
        .ep-file-upload-box:hover { border-color: #059669; background: #ecfdf5; }
        .ep-file-upload-box.has-file { border-color: #059669; border-style: solid; background: #ecfdf5; }
        .ep-upload-content h4 { margin: 15px 0 5px; color: #0f172a; }
        .ep-upload-icon { font-size: 3rem; color: #94a3b8; }
        .ep-review-box { background: #ffffff; border-radius: 10px; padding: 20px; }
        .ep-review-category { margin-top: 25px; }
        .ep-review-category h5 { color: #059669; font-size: 0.85rem; font-weight: 800; text-transform: uppercase; border-bottom: 1px solid #eee; padding-bottom: 8px; margin-bottom: 12px; }
        .ep-review-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px dotted #f1f5f9; }
        .ep-review-label { color: #64748b; font-size: 0.9rem; }
        .ep-review-val { color: #0f172a; font-weight: 700; font-size: 0.95rem; text-align: right; }
        .ep-review-val.highlight { color: #d97706; font-family: monospace; }
        .ep-attachment-tag { display: inline-flex; align-items: center; gap: 5px; background: #f0f9ff; color: #0369a1; padding: 4px 12px; border-radius: 50px; font-size: 0.8rem; border: 1px solid #bae6fd; margin-right: 8px; }
        .ep-actions { display: flex; justify-content: space-between; margin-top: 50px; }
        .ep-btn { padding: 16px 35px; border-radius: 14px; font-weight: 700; font-size: 1.05rem; border: none; cursor: pointer; display: flex; align-items: center; gap: 10px; transition: 0.3s; text-transform: uppercase; letter-spacing: 1px; }
        .ep-btn-prev { background: #f1f5f9; color: #475569; }
        .ep-btn-prev:disabled { opacity: 0.5; cursor: not-allowed; }
        .ep-btn-next { background: #059669; color: white; box-shadow: 0 10px 25px rgba(5, 150, 105, 0.3); }
        .ep-toast { position: fixed; top: 30px; right: 30px; z-index: 9999; background: #ffffff; border-left: 5px solid #059669; padding: 20px 25px; border-radius: 12px; box-shadow: 0 20px 50px rgba(0,0,0,0.15); display: flex; gap: 15px; align-items: center; animation: slideInRight 0.4s ease forwards; }
        .ep-toast.error-toast { border-left-color: #ef4444; }
        .slide-in { animation: fadeSlideUp 0.5s ease forwards; }
        @keyframes fadeSlideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideInRight { from { opacity: 0; transform: translateX(50px); } to { opacity: 1; transform: translateX(0); } }
      `}</style>

      {toast && (
        <div className={`ep-toast ${toast.type === 'error' ? 'error-toast' : ''}`}>
          <i className={`bi ${toast.type === 'error' ? 'bi-exclamation-triangle-fill' : 'bi-check-circle-fill'}`} style={{ fontSize: '1.8rem', color: toast.type === 'error' ? '#ef4444' : '#059669' }}></i>
          <div>
            <h4 style={{ margin: '0 0 4px', color: '#0f172a' }}>{toast.title}</h4>
            <p style={{ margin: 0, color: '#64748b', fontSize: '0.9rem' }}>{toast.message}</p>
          </div>
        </div>
      )}

      <div className="ep-page-wrapper">
        <div className="ep-form-card">
          <div className="ep-form-header">
            <h2>Facility Reservation</h2>
            <div className="ep-badge-official"><i className="bi bi-shield-check"></i> Official Registration Portal</div>
          </div>

          <div className="ep-stepper-container">
            <div className="ep-stepper">
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
            {/* STEP 1: VENUE */}
            {currentStep === 0 && (
              <div className="slide-in">
                <h4 className="ep-section-title"><i className="bi bi-building"></i> Select Venue</h4>
                <div className="ep-venue-grid">
                  {[
                    { name: 'Barangay Court', icon: 'bi-dribbble', desc: 'Covered court for sports activities or assemblies.' },
                    { name: 'Function Hall', icon: 'bi-people-fill', desc: 'Air-conditioned hall for events and community meetings.' }
                  ].map((v) => (
                    <div key={v.name} onClick={() => setFormData({ ...formData, venue: v.name })} className={`ep-venue-card ${formData.venue === v.name ? 'active' : ''}`}>
                      <i className={`bi ${v.icon}`}></i>
                      <h4>{v.name}</h4>
                      <p>{v.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* STEP 2: DATE & DYNAMIC TIME RANGES */}
            {currentStep === 1 && (
              <div className="slide-in">
                <h4 className="ep-section-title"><i className="bi bi-calendar-week"></i> Select Date & Custom Timeline</h4>
                <div className="ep-grid">
                  <div className="ep-input-group ep-full">
                    <label>Preferred Date *</label>
                    <input type="date" name="date" min={new Date().toISOString().split('T')[0]} value={formData.date} onChange={handleInputChange} />
                  </div>
                  
                  <div className="ep-input-group">
                    <label>Start Time *</label>
                    <input type="time" name="startTime" value={formData.startTime} onChange={handleInputChange} />
                  </div>
                  <div className="ep-input-group">
                    <label>End Time *</label>
                    <input type="time" name="endTime" value={formData.endTime} onChange={handleInputChange} />
                  </div>
                </div>
              </div>
            )}

            {/* STEP 3: DETAILS & UPLOAD */}
            {currentStep === 2 && (
              <div className="slide-in">
                <h4 className="ep-section-title"><i className="bi bi-file-text"></i> Event Detail Verification</h4>
                <div className="ep-grid">
                  <div className="ep-input-group ep-full">
                    <label>Purpose / Description of Activity *</label>
                    <textarea name="purpose" rows="2" value={formData.purpose} onChange={handleInputChange} placeholder="Ex: General Assembly or Birthday Party" />
                  </div>
                  <div className="ep-input-group">
                    <label>Contact Person</label>
                    <input type="text" value={formData.contactName} readOnly />
                  </div>
                  <div className="ep-input-group">
                    <label>Mobile Number</label>
                    <input type="text" value={formData.contactNumber} readOnly />
                  </div>
                </div>

                <h4 className="ep-section-title" style={{ marginTop: '35px' }}><i className="bi bi-file-earmark-arrow-up"></i> Document Proof</h4>
                <div className="ep-grid">
                  {renderFilePreview('id_front', 'Valid ID (Front)', 'Upload a valid government-issued ID', 'bi-person-vcard')}
                  {renderFilePreview('id_holding', 'Verification Selfie', 'Selfie while clearly holding your valid ID', 'bi-camera-fill')}
                </div>
              </div>
            )}

            {/* STEP 4: REVIEW */}
            {currentStep === 3 && (
              <div className="slide-in">
                <div className="ep-review-box">
                  <h4 className="ep-section-title" style={{ border: 'none', marginBottom: '5px' }}>
                    <i className="bi bi-file-earmark-text text-success me-2"></i> Confirm Your Entries
                  </h4>
                  <div className="ep-review-category">
                    <h5>Tracking Detail</h5>
                    <div className="ep-review-row">
                      <span className="ep-review-label">Tracking ID</span>
                      <span className="ep-review-val highlight">{trackingCode}</span>
                    </div>
                  </div>
                  <div className="ep-review-category">
                    <h5>Booking Particulars</h5>
                    <div className="ep-review-row">
                      <span className="ep-review-label">Facility Selected</span>
                      <span className="ep-review-val">{formData.venue}</span>
                    </div>
                    <div className="ep-review-row">
                      <span className="ep-review-label">Target Date</span>
                      <span className="ep-review-val">{formData.date}</span>
                    </div>
                    <div className="ep-review-row">
                      <span className="ep-review-label">Time Frame</span>
                      <span className="ep-review-val">{formData.startTime} to {formData.endTime}</span>
                    </div>
                  </div>
                  <div className="ep-review-category">
                    <h5>Applicant Info</h5>
                    <div className="ep-review-row">
                      <span className="ep-review-label">Resident Name</span>
                      <span className="ep-review-val">{formData.contactName.toUpperCase()}</span>
                    </div>
                    <div className="ep-review-row">
                      <span className="ep-review-label">Contact Reference</span>
                      <span className="ep-review-val">{formData.contactNumber}</span>
                    </div>
                    <div className="ep-review-row">
                      <span className="ep-review-label">Event Purpose</span>
                      <span className="ep-review-val">{formData.purpose}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

           <div className="ep-actions">
              <button type="button" className="ep-btn ep-btn-prev" disabled={currentStep === 0 || checkingAvailability || isSubmitting} onClick={() => setCurrentStep(currentStep - 1)}>
                <i className="bi bi-arrow-left"></i> Back
              </button>
              <button type="button" className="ep-btn ep-btn-next" disabled={!validateStep() || checkingAvailability || isSubmitting} onClick={() => currentStep === 3 ? handleSubmit() : handleNextStep()}>
                {checkingAvailability ? 'Verifying...' : currentStep === 3 ? (isSubmitting ? 'Submitting...' : 'Confirm & Submit') : 'Continue'}
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

export default BookingPage;