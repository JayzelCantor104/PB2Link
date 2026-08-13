import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Header from '../components/Header';
import Footer from '../components/Footer';
import Preloader from '../components/Preloader';
import '../styles/incident-report.css';

const API_BASE = '/api_backend';

const EMPTY_RESIDENT_DATA = {
  fullname: '',
  address: '',
  contact_num: '',
  email: '',
};

const buildFullName = (resident) => [
  resident.fName,
  resident.mName,
  resident.lName,
  resident.suffix && resident.suffix !== 'N/A' ? resident.suffix : '',
].filter(Boolean).join(' ');

const buildAddress = (resident) => [
  resident.house_no,
  resident.street,
  resident.subdivision,
  resident.zone ? `Zone ${resident.zone}` : '',
].filter(Boolean).join(', ');

const normalizeResidentData = (profile = {}) => ({
  ...EMPTY_RESIDENT_DATA,
  ...profile,
  fullname: profile.fullname || buildFullName(profile),
  address: profile.address || buildAddress(profile),
  contact_num: profile.contact_num || '',
  email: profile.email || '',
});

const IncidentReport = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [trackingCode, setTrackingCode] = useState('');
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [toast, setToast] = useState({ show: false, title: '', msg: '', type: 'success' });
  const [previewAttachment, setPreviewAttachment] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');

  const [residentData, setResidentData] = useState(EMPTY_RESIDENT_DATA);

  const [formData, setFormData] = useState({
    contact_person_name: '',
    contact_person_number: '',
    incident_address: '',
    description: '',
    incident_class: '',
    reporting_class: '',
    attachment: [],
  });

  const removeAttachment = (indexToRemove) => {
    setFormData({
      ...formData,
      attachment: formData.attachment.filter(
        (_, index) => index !== indexToRemove
      ),
    });
  };

  const isVideoFile = (file) => file?.type?.startsWith('video/');

  useEffect(() => {
    if (!previewAttachment) {
      setPreviewUrl('');
      return;
    }

    const objectUrl = URL.createObjectURL(previewAttachment);
    setPreviewUrl(objectUrl);

    return () => URL.revokeObjectURL(objectUrl);
  }, [previewAttachment]);

  const [submittedDate, setSubmittedDate] = useState(null);

  const triggerToast = (title, msg, type = 'success') => {
    setToast({ show: true, title, msg, type });
    setTimeout(() => setToast(prev => ({ ...prev, show: false })), 5000);
  };

  useEffect(() => {
    // Generate an incredibly unique Tracking Code using exact milliseconds + an alphanumeric hash
    const timestamp = Date.now(); 
    const randomHash = Math.random().toString(36).substring(2, 7).toUpperCase();
    const code = `INC-${timestamp}-${randomHash}`;
    
    setTrackingCode(code);

    if (!user) {
      setLoading(false);
      return;
    }

    const fetchResidentData = async () => {
      try {
        const userId = user.user_id || localStorage.getItem('user_id');
        const response = await fetch(`${API_BASE}/get_user_profile.php?user_id=${userId}`);
        const data = await response.json();
        if (data.success) {
          const resident = normalizeResidentData(data.resident || data.data);

          setResidentData(resident);
          // Auto-fill incident defaults with resident info
          setFormData(prev => ({
            ...prev,
            incident_address: resident.address,
          }));
        }
      } catch (err) {
        console.error(err);
        triggerToast('Error', 'Failed to load profile.', 'error');
      } finally {
        setLoading(false);
      }
    };
    fetchResidentData();
  }, [user]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user) {
        triggerToast('Login Required', 'Please log in to submit a report.', 'error');
        return;
    }

    const missingReporterInfo = !residentData.fullname || !residentData.address || !residentData.contact_num || !residentData.email;
    if (missingReporterInfo) {
        triggerToast('Incomplete Profile', 'Your registered name, contact number, address, and email are required before submitting.', 'error');
        return;
    }

    // Only strictly validate the fields that are actually required
    const requiredIncidentFields = ['incident_address', 'description', 'incident_class', 'reporting_class',];
    const missingIncidentInfo = requiredIncidentFields.some(key => !formData[key]);
    
    if (!formData.attachment || formData.attachment.length === 0) {
        triggerToast('Incomplete Report', 'Please upload at least 1 attachment.', 'error');
        return;
    }

    if (missingIncidentInfo) {
        triggerToast('Incomplete Report', 'Please complete all required incident fields and add an evidence attachment.', 'error');
        return;
    }

    setSubmitting(true);

    try {
        const dataToSend = new FormData();

        // Append form data
        Object.keys(formData).forEach(key => {
          if (key !== 'attachment' && formData[key] !== null) {
              dataToSend.append(key, formData[key]);
            }
        });

        // Loop through your files array and append each to attachment[]
        if (formData.attachment && formData.attachment.length > 0) {
            formData.attachment.forEach((file) => {
                dataToSend.append('attachment[]', file);
            });
        }

        // Append metadata
        dataToSend.append('user_id', user.user_id || localStorage.getItem('user_id'));
        dataToSend.append('track_code', trackingCode);

        // Append reporter info
        dataToSend.append('reporter_name', residentData.fullname);
        dataToSend.append('reporter_address', residentData.address);
        dataToSend.append('reporter_contact', residentData.contact_num);
        dataToSend.append('reporter_email', residentData.email);

        // Submit to backend
        const response = await fetch(`${API_BASE}/report_incident.php`, {
            method: 'POST',
            body: dataToSend,
        });

        const res = await response.json();

        if (res.success) {
            // ✅ Set modal & submitted date
            setShowSuccessModal(true);
            console.log("Incident response:", res);
            setSubmittedDate(res.created_at); // <-- This line is crucial

        } else {
            triggerToast('Error', res.message, 'error');
        }

    } catch (err) {
        console.error(err);
        triggerToast('Network Error', 'Could not connect to server.', 'error');
    } finally {
        setSubmitting(false);
    }
};
  
  return (
    <>
      <Preloader/>;
      <Header />

      {toast.show && (
        <div className="toast-container">
            <div className={`toast-box ${toast.type === 'error' ? 'error' : ''}`} style={{ opacity: 1, transform: 'translateX(0)' }}>
                <div className="toast-content">
                    <h4>{toast.title}</h4>
                    <p>{toast.msg}</p>
                </div>
                <div className="toast-close" onClick={() => setToast({ ...toast, show: false })}>&times;</div>
            </div>
        </div>
      )}

      <div className="incident-page">
        <div className="incident-container">
          <div className="incident-card">
            
            <div className="incident-header">
              <h1>Incident Report Form</h1>
              <p>Help us keep Barangay Pasong Buaya II safe</p>
            </div>

            <div className="incident-body">
              
              <div className="incident-notice">
                <strong>For emergency contact:</strong><br />
                Barangay Pasong Buaya 2 Response Team<br />
                📱 Mobile: <strong>0917 157 1889</strong><br />
                ☎ Hotline: <strong>(046) 502 4058</strong>
                <p style={{marginTop: '10px', fontSize: '0.75rem', opacity: 0.7}}>
                   {user ? "Please ensure all details are accurate before submitting." : "You are currently in view-only mode. Please login to submit."}
                </p>
              </div>

              <form onSubmit={handleSubmit}>
                
                {/* SECTION 1: REPORTER */}
                <div className="section-header">
                  <div className="badge">01</div>
                  <div className="title">Reporter Information</div>
                </div>

                <div className="input-grid">
                  <div className="form-group span-2">
                    <label>Full Name</label>
                    <input type="text" required value={residentData.fullname} readOnly placeholder="Log in to view" />
                  </div>
                  <div className="form-group">
                    <label>Contact Number</label>
                    <input type="text" required value={residentData.contact_num} readOnly placeholder="N/A" />
                  </div>
                  <div className="form-group span-2">
                    <label>Address</label>
                    <input type="text" required value={residentData.address} readOnly placeholder="N/A" />
                  </div>
                  <div className="form-group">
                    <label>Email Address</label>
                    <input type="email" required value={residentData.email} readOnly placeholder="N/A" />
                  </div>
                </div>

                {/* SECTION 2: INCIDENT DETAILS */}
                <div className="section-header">
                  <div className="badge">02</div>
                  <div className="title">Incident Details</div>
                </div>

                <div className="input-grid">
                  <div className="form-group">
                    <label>Tracking Code</label>
                    <input type="text" value={trackingCode} readOnly style={{fontWeight: '800', color: '#064e3b'}} />
                  </div>
                  <div className="form-group">
                    <label>Person Involved</label>
                    <input type="text"  maxLength="30" value={formData.contact_person_name} 
                      onChange={(e) => {
                        const value = e.target.value.replace(/[^a-zA-Z\s]/g, '');
                        setFormData({...formData, contact_person_name: value});
                      }} />
                  </div>
                  <div className="form-group">
                    <label>Involved Contact Number</label>
                    <input
                      type="text"
                      maxLength="11"
                      value={formData.contact_person_number}
                      onChange={(e) => {
                        let value = e.target.value.replace(/\D/g, '');

                        if (value.length < 2) value = '09';
                        if (!value.startsWith('09')) value = '09' + value.slice(2);

                        setFormData({
                          ...formData,
                          contact_person_number: value.slice(0, 11),
                        });
                      }}
                    />
                  </div>
                  
                  <div className="form-group span-3">
                    <label>Incident Address / Landmark</label>
                    <input type="text" required value={formData.incident_address}
                      onChange={(e) => setFormData({...formData, incident_address: e.target.value})} />
                  </div>

                  <div className="form-group span-2">
                    <label>Classification</label>
                    <select required value={formData.incident_class} onChange={(e) => setFormData({...formData, incident_class: e.target.value})}>
                      <option value="">-- Select Category --</option>
                      <option value="Health & Safety">Health & Safety</option>
                      <option value="Security">Security</option>
                      <option value="Environmental & Infrastructure">Environmental & Infrastructure</option>
                      <option value="Environmental & Infrastructure">Others</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Reporting Type</label>
                    <select required value={formData.reporting_class} onChange={(e) => setFormData({...formData, reporting_class: e.target.value})}>
                      <option value="">-- Select Type --</option>
                      <option value="Accident Report">Accident Report</option>
                      <option value="Near Miss Report">Near Miss Report</option>
                      <option value="Hazard Report">Hazard Report</option>
                      <option value="Complaint Report">Complaint Report</option>
                      <option value="Suspicious Activity Report">Suspicious Activity Report</option>
                      <option value="Suspicious Activity Report">Others</option>
                    </select>
                  </div>

                  <div className="form-group span-3">
                    <label>Detailed Description</label>
                    <textarea required value={formData.description} 
                      onChange={(e) => setFormData({...formData, description: e.target.value})}
                      placeholder="Please describe the events clearly..."></textarea>
                  </div>

                  <div className="form-group span-3">
                  <label>Evidence Attachment (1-10 files, max 10MB each)</label>

                  <div className="file-input-wrapper">
                    <input
                      type="file"
                      multiple
                      accept=".jpg,.jpeg,.png,.mp4"
                      onChange={(e) => {
                      const newFiles = Array.from(e.target.files);

                      setFormData((prev) => {
                        const existing = prev.attachment || [];

                        // Merge old + new
                        const merged = [...existing, ...newFiles];

                        // Remove duplicates (by name + size + lastModified)
                        const uniqueFiles = merged.filter(
                          (file, index, self) =>
                            index ===
                            self.findIndex(
                              (f) =>
                                f.name === file.name &&
                                f.size === file.size &&
                                f.lastModified === file.lastModified
                            )
                        );

                        // Limit to 10 files
                        if (uniqueFiles.length > 10) {
                          alert("You can upload a maximum of 10 files.");
                          return prev;
                        }

                        // Validate file size (10MB each)
                        const maxSize = 10 * 1024 * 1024;

                        const invalidFile = uniqueFiles.find(
                          (file) => file.size > maxSize
                        );

                        if (invalidFile) {
                          alert(`${invalidFile.name} exceeds 10MB limit.`);
                          return prev;
                        }

                        return {
                          ...prev,
                          attachment: uniqueFiles,
                        };
                      });

                      // allow reselecting same file again
                      e.target.value = "";
                    }}
                    />
                  </div>

                  {/* Selected Files Display */}
                  {formData.attachment?.length > 0 && (
                  <div className="selected-files">
                    <h4>Selected Attachment:</h4>

                    <ul className="attachment-list">
                      {formData.attachment.map((file, index) => (
                        <li key={index} className="attachment-item">
                          <span className="attachment-name">
                            {file.name} - {(file.size / (1024 * 1024)).toFixed(2)} MB
                          </span>

                          <div className="attachment-actions">
                            <button
                              type="button"
                              className="attachment-view-btn"
                              onClick={() => setPreviewAttachment(file)}
                            >
                              View
                            </button>
                            <button
                              type="button"
                              className="remove-file-btn"
                              onClick={() => removeAttachment(index)}
                            >
                              ❌
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                </div>
                </div>

                <button type="submit" className="btn-submit" disabled={submitting}>
                  {submitting ? "Sending Report..." : "Submit Incident Report"}
                </button>

              </form>
            </div>
          </div>
        </div>
      </div>

      {previewAttachment && previewUrl && (
        <div className="detail-modal-overlay attachment-preview-overlay" onClick={() => setPreviewAttachment(null)}>
          <div className="attachment-preview-panel" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="attachment-preview-close detail-close-btn"
              onClick={() => setPreviewAttachment(null)}
              aria-label="Close preview"
            >
              ×
            </button>

            <div className="attachment-preview-scrollbox">
              {isVideoFile(previewAttachment) ? (
                <video controls src={previewUrl} className="attachment-preview-media" />
              ) : (
                <img src={previewUrl} alt="Attachment preview" className="attachment-preview-media" />
              )}
            </div>
          </div>
        </div>
      )}

      {showSuccessModal && (
        <div className="modal-overlay" style={{display:'flex', position:'fixed', top:0, left:0, width:'100%', height:'100%', background:'rgba(0,0,0,0.7)', justifyContent:'center', alignItems:'center', zIndex:1000}}>
          <div style={{background:'white', padding:'40px', borderRadius:'8px', maxWidth:'500px', textAlign:'center', borderTop:'8px solid #064e3b'}}>
            <h2 style={{color:'#064e3b'}}>✓ SUBMITTED</h2>
            <p>Your report has been recorded.</p>
            <div style={{background:'#f1f5f9', padding:'15px', margin:'20px 0', fontWeight:'800', letterSpacing:'1px'}}>
              {trackingCode}
            </div>
              {submittedDate && (
                  <p style={{marginBottom: '20px', fontSize: '0.9rem', color: '#334155'}}>
                      Submitted on: {new Date(submittedDate).toLocaleString()}
                  </p>
              )}
            <button onClick={() => navigate('/dashboard')} style={{background:'#064e3b', color:'white', border:'none', padding:'10px 20px', cursor:'pointer'}}>Continue to Dashboard</button>
          </div>
        </div>
      )}

      <Footer />
    </>
  );
};

export default IncidentReport;
