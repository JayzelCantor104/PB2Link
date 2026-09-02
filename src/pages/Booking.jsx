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
  const [isSubmitting, setIsSubmitting] = useState(false); 
  const [facilities, setFacilities] = useState([]); 
  const [loadingFacilities, setLoadingFacilities] = useState(true); 

  // Selected Amenity State 
  const [selectedFacility, setSelectedFacility] = useState(null); 
  const [selectedCategory, setSelectedCategory] = useState('Venue'); 

  // Dynamic Form State 
  const [formData, setFormData] = useState({ 
    resident_id: '', 
    facility_id: '', 
    venue_name: '', 
    reservation_date: '', 
    start_time: '08:00', 
    end_time: '12:00', 
    quantity: 1, 
    destination: '', 
    purpose: '', 
    contact_name: '', 
    contact_number: '', 
    id_front: null, 
    id_holding: null 
  }); 

  const steps = [ 
    { label: 'Amenity', icon: 'bi-building-gear' }, 
    { label: 'Details', icon: 'bi-calendar-week' }, 
    { label: 'Verification', icon: 'bi-file-earmark-lock' }, 
    { label: 'Review', icon: 'bi-clipboard2-check-fill' } 
  ]; 

  const generateTrackingCode = () => { 
    const timestamp = Date.now(); 
    const randomHash = Math.random().toString(36).substring(2, 7).toUpperCase(); 
    return `BK-${timestamp}-${randomHash}`; 
  }; 

  useEffect(() => { 
    setTrackingCode(generateTrackingCode()); 
  }, []); 

  // Fetch Amenities 
  useEffect(() => { 
    fetch(`${API_BASE}/get_facilities.php`) 
      .then(res => res.json()) 
      .then(data => { 
        if (data.success && Array.isArray(data.data) && data.data.length > 0) { 
          setFacilities(data.data); 
          const first = data.data[0]; 
          setSelectedFacility(first); 
          setFormData(prev => ({ ...prev, facility_id: first.facility_id, venue_name: first.facility_name })); 
          setSelectedCategory(first.category || 'Venue'); 
        } 
      }) 
      .catch(err => showToast('Error', 'Failed to load amenities list.', 'error')) 
      .finally(() => setLoadingFacilities(false)); 
  }, []); 

  // Fetch User Details 
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
              contact_name: `${d.fName || ''} ${d.lName || ''}`.trim(), 
              contact_number: d.contact_num || '' 
            })); 
          } 
        }) 
        .catch(err => console.error("Failed to fetch user profile:", err)); 
    } 
  }, [user]); 

  const showToast = (title, message, type = 'success') => { 
    setToast({ title, message, type }); 
    setTimeout(() => setToast(null), 5000); 
  }; 

  const handleFacilitySelect = (facility) => { 
    setSelectedFacility(facility); 
    setFormData(prev => ({ ...prev, facility_id: facility.facility_id, venue_name: facility.facility_name })); 
    setSelectedCategory(facility.category || 'Venue'); 
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

  const validateStep = () => { 
    if (currentStep === 0) return Boolean(formData.facility_id); 
    if (currentStep === 1) { 
      if (selectedCategory === 'Vehicle') return false; 
      if (!formData.reservation_date) return false; 
      if (selectedCategory === 'Venue') { 
        return formData.start_time && formData.end_time && (formData.start_time < formData.end_time); 
      } 
      if (selectedCategory === 'Equipment') { 
        return formData.quantity > 0; 
      } 
    } 
    if (currentStep === 2) return Boolean(formData.purpose && formData.id_front && formData.id_holding); 
    return true; 
  }; 

  const handleNextStep = () => { 
    setCurrentStep(prev => Math.min(prev + 1, steps.length - 1)); 
  }; 

  const handleSubmit = async () => { 
    setIsSubmitting(true); 
    const data = new FormData(); 
    const formattedTimeSlot = selectedCategory === 'Venue' 
      ? `${formData.start_time} - ${formData.end_time}` 
      : 'Full Day / On-Demand'; 

    data.append('resident_id', formData.resident_id || ''); 
    data.append('amenity_id', formData.facility_id || ''); 
    data.append('tracking_code', trackingCode); 
    data.append('reservation_date', formData.reservation_date || new Date().toISOString().split('T')[0]); 
    data.append('time_slot', formattedTimeSlot); 
    data.append('quantity', formData.quantity || 1); 
    data.append('destination', formData.destination || ''); 
    data.append('purpose', formData.purpose || ''); 
    data.append('contact_name', formData.contact_name || ''); 
    data.append('contact_number', formData.contact_number || ''); 

    if (formData.id_front) {
      data.append('id_front', formData.id_front); 
    }
    if (formData.id_holding) {
      data.append('id_holding', formData.id_holding); 
    }

    try { 
      const response = await fetch(`${API_BASE}/submit_amenity_reservation.php`, { 
        method: 'POST', 
        body: data, 
      }); 

      const result = await response.json(); 

      if (result.success) { 
        showToast('Success!', result.message || 'Request submitted successfully!', 'success'); 
        setTimeout(() => { 
          setIsSubmitting(false); 
          navigate('/services'); 
        }, 2500); 
      } else { 
        showToast('Error', result.message || 'Failed to complete submission.', 'error'); 
        setIsSubmitting(false); 
      } 
    } catch (error) { 
      console.error("Submission Failure Log:", error);
      showToast('Server Error', 'Could not complete request.', 'error'); 
      setIsSubmitting(false); 
    } 
  }; 

  return ( 
    <> 
      <Preloader /> 
      <Header /> 
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css" /> 
      <style>{` 
        .ep-page-wrapper { min-height: 100vh; background-color: #011c16; background-image: radial-gradient(circle at 15% 50%, rgba(5, 150, 105, 0.15), transparent 40%), linear-gradient(180deg, #002e25 0%, #000000 100%); padding: 60px 20px; font-family: 'Inter', sans-serif; color: #1e293b; display: flex; justify-content: center; align-items: center; margin-top: 100px; } 
        .ep-form-card { background: rgba(255, 255, 255, 0.95); backdrop-filter: blur(30px); border-radius: 30px; padding: 50px; width: 100%; max-width: 900px; border: 1px solid rgba(255, 255, 255, 0.6); box-shadow: 0 30px 60px -15px rgba(0, 0, 0, 0.5); } 
        .ep-form-header { text-align: center; margin-bottom: 40px; } 
        .ep-form-header h2 { margin: 0 0 10px; font-size: 2.5rem; font-weight: 800; color: #064e3b; } 
        .ep-badge-official { display: inline-flex; align-items: center; gap: 8px; background: #ecfdf5; color: #059669; padding: 6px 16px; border-radius: 50px; font-size: 0.85rem; font-weight: 600; border: 1px solid #a7f3d0; text-transform: uppercase; } 
        .ep-stepper-container { margin-bottom: 50px; position: relative; } 
        .ep-stepper { display: flex; justify-content: space-between; position: relative; z-index: 1; } 
        .ep-progress-bg { position: absolute; top: 25px; left: 5%; width: 90%; height: 4px; background: #e2e8f0; z-index: -1; } 
        .ep-progress-fill { position: absolute; top: 25px; left: 5%; height: 4px; background: #059669; z-index: -1; transition: width 0.5s ease; } 
        .ep-step-item { flex: 1; text-align: center; display: flex; flex-direction: column; align-items: center; } 
        .ep-step-circle { width: 54px; height: 54px; border-radius: 50%; background: #ffffff; border: 2px solid #e2e8f0; display: flex; align-items: center; justify-content: center; color: #94a3b8; transition: 0.4s; } 
        .ep-step-label { margin-top: 12px; font-size: 0.8rem; font-weight: 600; color: #64748b; text-transform: uppercase; } 
        .ep-step-item.active .ep-step-circle { border-color: #059669; color: #059669; transform: scale(1.15); background: #ffffff; } 
        .ep-step-item.completed .ep-step-circle { background: #059669; border-color: #059669; color: #fff; } 
        .ep-venue-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 20px; } 
        .ep-venue-card { border: 2px solid #cbd5e1; border-radius: 20px; padding: 25px 20px; text-align: center; cursor: pointer; background: rgba(255, 255, 255, 0.6); transition: all 0.3s ease; } 
        .ep-venue-card:hover { border-color: #059669; background: #ecfdf5; transform: translateY(-3px); } 
        .ep-venue-card.active { border-color: #059669; background: #ecfdf5; box-shadow: 0 10px 25px rgba(5, 150, 105, 0.15); } 
        .ep-venue-card i { font-size: 2.5rem; color: #94a3b8; } 
        .ep-venue-card.active i { color: #059669; } 
        .ep-category-badge { display: inline-block; font-size: 0.7rem; font-weight: 700; padding: 3px 10px; border-radius: 12px; background: #e2e8f0; color: #475569; margin-bottom: 8px; text-transform: uppercase; } 
        .ep-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 25px; } 
        .ep-full { grid-column: span 2; } 
        .ep-input-group label { display: block; font-size: 0.8rem; font-weight: 600; color: #475569; margin-bottom: 8px; text-transform: uppercase; } 
        .ep-input-group input, .ep-input-group select, .ep-input-group textarea { width: 100%; padding: 16px 20px; border-radius: 14px; border: 1px solid #cbd5e1; background: #ffffff; color: #0f172a; font-size: 1rem; outline: none; box-sizing: border-box; } 
        .ep-emergency-card { background: #fef2f2; border: 2px dashed #ef4444; border-radius: 24px; padding: 40px 20px; text-align: center; } 
        .ep-emergency-icon { font-size: 3.5rem; color: #dc2626; margin-bottom: 15px; animation: pulse 2s infinite; } 
        .ep-emergency-title { font-size: 1.1rem; font-weight: 700; color: #991b1b; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 10px; } 
        .ep-emergency-number { font-size: 3.2rem; font-weight: 900; color: #dc2626; margin: 15px 0; letter-spacing: 2px; font-family: monospace; } 
        .ep-emergency-desc { font-size: 1rem; color: #7f1d1d; max-width: 600px; margin: 0 auto; line-height: 1.6; } 
        .ep-call-btn { display: inline-flex; align-items: center; gap: 10px; background: #dc2626; color: white; padding: 14px 28px; border-radius: 50px; font-weight: 800; text-decoration: none; margin-top: 20px; font-size: 1.1rem; box-shadow: 0 10px 20px rgba(220, 38, 38, 0.3); } 
        .ep-actions { display: flex; justify-content: space-between; margin-top: 40px; align-items: center; } 
        .ep-btn { padding: 16px 35px; border-radius: 14px; font-weight: 700; font-size: 1.05rem; border: none; cursor: pointer; display: flex; align-items: center; gap: 10px; text-transform: uppercase; } 
        .ep-btn-prev { background: #f1f5f9; color: #475569; } 
        .ep-btn-next { background: #059669; color: white; } 
        .ep-btn:disabled { opacity: 0.5; cursor: not-allowed; } 
        .ep-toast { position: fixed; top: 30px; right: 30px; z-index: 9999; background: #ffffff; border-left: 5px solid #059669; padding: 20px 25px; border-radius: 12px; box-shadow: 0 20px 50px rgba(0,0,0,0.15); display: flex; gap: 15px; align-items: center; } 
        .ep-toast.error-toast { border-left-color: #ef4444; } 
        @keyframes pulse { 0% { transform: scale(1); } 50% { transform: scale(1.08); } 100% { transform: scale(1); } } 
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
            <h2>Amenity Request</h2> 
            <div className="ep-badge-official"><i className="bi bi-shield-check"></i> Barangay Resource Portal</div> 
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
            {/* STEP 1: SELECT AMENITY */} 
            {currentStep === 0 && ( 
              <div> 
                <h4 style={{ marginBottom: '20px', color: '#0f172a' }}><i className="bi bi-building me-2"></i> Select Barangay Resource</h4> 
                {loadingFacilities ? ( 
                  <p style={{ textAlign: 'center', color: '#64748b' }}>Loading options...</p> 
                ) : ( 
                  <div className="ep-venue-grid"> 
                    {facilities.map((v) => { 
                      const isSelected = String(formData.facility_id) === String(v.facility_id); 
                      return ( 
                        <div key={v.facility_id} onClick={() => handleFacilitySelect(v)} className={`ep-venue-card ${isSelected ? 'active' : ''}`} > 
                          <span className="ep-category-badge">{v.category || 'Venue'}</span> 
                          <div><i className={`bi ${v.icon_class || 'bi-building'}`}></i></div> 
                          <h4 style={{ margin: '10px 0 5px', fontWeight: 700 }}>{v.facility_name}</h4> 
                          <p style={{ margin: 0, color: '#64748b', fontSize: '0.85rem' }}>{v.description}</p> 
                        </div> 
                      ); 
                    })} 
                  </div> 
                )} 
              </div> 
            )} 

            {/* STEP 2: DYNAMIC INPUTS BASED ON CATEGORY */} 
            {currentStep === 1 && ( 
              <div> 
                {selectedCategory === 'Vehicle' ? ( 
                  <div className="ep-emergency-card"> 
                    <i className="bi bi-telephone-inbound-fill ep-emergency-icon"></i> 
                    <div className="ep-emergency-title">Emergency Contact Hotline</div> 
                    <div className="ep-emergency-number"> 
                      {selectedFacility?.hotline_number || '(046) 123-4567'} 
                    </div> 
                    <a href={`tel:${selectedFacility?.hotline_number || '0461234567'}`} className="ep-call-btn"> 
                      <i className="bi bi-telephone-fill"></i> Call Hotline Directly 
                    </a> 
                    <div className="ep-emergency-desc" style={{ marginTop: '25px' }}> 
                      <p style={{ margin: 0, fontWeight: '600' }}> 
                        {selectedFacility?.description || 'Emergency service vehicle available 24/7 for urgent hospital transport and medical emergency response.'} 
                      </p> 
                    </div> 
                  </div> 
                ) : ( 
                  <> 
                    <h4 style={{ marginBottom: '20px', color: '#0f172a' }}> 
                      <i className="bi bi-calendar-week me-2"></i> {selectedCategory === 'Venue' ? 'Select Date & Schedule' : 'Specify Quantity & Target Date'} 
                    </h4> 
                    <div className="ep-grid"> 
                      <div className="ep-input-group ep-full"> 
                        <label>Required Date *</label> 
                        <input type="date" name="reservation_date" min={new Date().toISOString().split('T')[0]} value={formData.reservation_date} onChange={handleInputChange} /> 
                      </div> 

                      {selectedCategory === 'Venue' && ( 
                        <> 
                          <div className="ep-input-group"> 
                            <label>Start Time *</label> 
                            <input type="time" name="start_time" value={formData.start_time} onChange={handleInputChange} /> 
                          </div> 
                          <div className="ep-input-group"> 
                            <label>End Time *</label> 
                            <input type="time" name="end_time" value={formData.end_time} onChange={handleInputChange} /> 
                          </div> 
                        </> 
                      )} 

                      {selectedCategory === 'Equipment' && ( 
                        <div className="ep-input-group ep-full"> 
                          <label>Quantity Needed (Chairs / Tents / Items) *</label> 
                          <input type="number" name="quantity" min="1" max="500" value={formData.quantity} onChange={handleInputChange} placeholder="Enter number of items" /> 
                        </div> 
                      )} 
                    </div> 
                  </> 
                )} 
              </div> 
            )} 

            {/* STEP 3: DETAILS & UPLOADS */} 
            {currentStep === 2 && ( 
              <div> 
                <h4 style={{ marginBottom: '20px', color: '#0f172a' }}><i className="bi bi-file-text me-2"></i> Reason & ID Upload</h4> 
                <div className="ep-grid"> 
                  <div className="ep-input-group ep-full"> 
                    <label>Purpose / Reason for Request *</label> 
                    <textarea name="purpose" rows="2" value={formData.purpose} onChange={handleInputChange} placeholder="State reason (e.g. Funeral Wake, Emergency Transport, Birthday Event)" /> 
                  </div> 
                  <div className="ep-input-group"> 
                    <label>Contact Person</label> 
                    <input type="text" value={formData.contact_name} readOnly /> 
                  </div> 
                  <div className="ep-input-group"> 
                    <label>Contact Number</label> 
                    <input type="text" value={formData.contact_number} readOnly /> 
                  </div> 
                </div> 

                <div className="ep-grid" style={{ marginTop: '20px' }}> 
                  <div className="ep-input-group"> 
                    <label>Valid ID (Front) *</label> 
                    <input type="file" name="id_front" onChange={handleFileChange} accept="image/*" /> 
                    {formData.id_front && (
                      <small style={{ color: '#059669', fontWeight: 600, marginTop: '6px', display: 'block' }}>
                        <i className="bi bi-check-circle-fill me-1"></i> Attached: {formData.id_front.name}
                      </small>
                    )}
                  </div> 

                  <div className="ep-input-group"> 
                    <label>Selfie with Valid ID *</label> 
                    <input type="file" name="id_holding" onChange={handleFileChange} accept="image/*" /> 
                    {formData.id_holding && (
                      <small style={{ color: '#059669', fontWeight: 600, marginTop: '6px', display: 'block' }}>
                        <i className="bi bi-check-circle-fill me-1"></i> Attached: {formData.id_holding.name}
                      </small>
                    )}
                  </div> 
                </div> 
              </div> 
            )} 

            {/* STEP 4: REVIEW */} 
            {currentStep === 3 && ( 
              <div> 
                <h4 style={{ marginBottom: '20px', color: '#0f172a' }}><i className="bi bi-check2-square me-2"></i> Review Request Details</h4> 
                <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '16px', border: '1px solid #e2e8f0' }}> 
                  <p><strong>Tracking Code:</strong> <span style={{ color: '#059669', fontFamily: 'monospace' }}>{trackingCode}</span></p> 
                  <p><strong>Resource:</strong> {formData.venue_name} ({selectedCategory})</p> 
                  <p><strong>Date:</strong> {formData.reservation_date || 'Immediate / On-Demand'}</p> 
                  {selectedCategory === 'Venue' && <p><strong>Schedule:</strong> {formData.start_time} - {formData.end_time}</p>} 
                  {selectedCategory === 'Equipment' && <p><strong>Quantity:</strong> {formData.quantity} unit(s)</p>} 
                  <p><strong>Requested By:</strong> {formData.contact_name} ({formData.contact_number})</p> 
                  <p><strong>Purpose:</strong> {formData.purpose}</p> 

                  <div style={{ marginTop: '15px', paddingTop: '15px', borderTop: '1px solid #cbd5e1' }}>
                    <p style={{ margin: '0 0 5px' }}>
                      <strong>Front ID:</strong> {formData.id_front ? <span style={{ color: '#059669' }}>✓ Attached ({formData.id_front.name})</span> : <span style={{ color: '#dc2626' }}>Missing</span>}
                    </p>
                    <p style={{ margin: 0 }}>
                      <strong>Selfie with ID:</strong> {formData.id_holding ? <span style={{ color: '#059669' }}>✓ Attached ({formData.id_holding.name})</span> : <span style={{ color: '#dc2626' }}>Missing</span>}
                    </p>
                  </div>
                </div> 
              </div> 
            )} 

            {/* BUTTONS */} 
            <div className="ep-actions"> 
              <button type="button" className="ep-btn ep-btn-prev" disabled={currentStep === 0 || isSubmitting} onClick={() => setCurrentStep(p => p - 1)}> 
                <i className="bi bi-arrow-left"></i> Back 
              </button> 

              {selectedCategory === 'Vehicle' && currentStep === 1 ? ( 
                <div style={{ color: '#dc2626', fontWeight: 700, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '8px', background: '#fef2f2', padding: '10px 18px', borderRadius: '12px', border: '1px solid #fecaca' }}> 
                  <i className="bi bi-info-circle-fill"></i> Direct Hotline Call Required 
                </div> 
              ) : ( 
                <button type="button" className="ep-btn ep-btn-next" disabled={!validateStep() || isSubmitting} onClick={() => currentStep === 3 ? handleSubmit() : handleNextStep()}> 
                  {currentStep === 3 ? (isSubmitting ? 'Submitting...' : 'Submit Request') : 'Continue'} 
                  <i className={`bi ${currentStep === 3 ? 'bi-send-fill' : 'bi-arrow-right'}`}></i> 
                </button> 
              )} 
            </div> 
          </form> 
        </div> 
      </div> 
      <Footer /> 
    </> 
  ); 
}; 

export default BookingPage;