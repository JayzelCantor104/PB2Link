import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Header from '../components/Header';
import Footer from '../components/Footer';
import Preloader from '../components/Preloader';
import '../styles/track-request.css';

const API_BASE = '/api_backend';

// Helper functions moved outside component for better performance
const normalizeStatus = (status) => {
  const statusLower = (status || '').toLowerCase();
  const statusMap = {
    'pending': 'pending',
    'processing': 'processing',
    'approved': 'approved',
    'completed': 'completed',
    'rejected': 'rejected',
    'declined': 'rejected',
    'ready for pickup': 'completed',
    'ready for pick up': 'completed',
    'claimed': 'completed'
  };
  return statusMap[statusLower] || 'pending';
};

const getStatusColor = (status) => {
  const normalized = normalizeStatus(status);
  const statusMap = {
    'pending': '#f59e0b',
    'approved': '#10b981',
    'rejected': '#ef4444',
    'completed': '#3b82f6',
    'processing': '#8b5cf6'
  };
  return statusMap[normalized] || '#64748b';
};

const getStatusIcon = (status) => {
  const normalized = normalizeStatus(status);
  const iconMap = {
    'pending': 'bi-hourglass-split',
    'approved': 'bi-check-circle-fill',
    'rejected': 'bi-x-circle-fill',
    'completed': 'bi-patch-check-fill',
    'processing': 'bi-gear-fill'
  };
  return iconMap[normalized] || 'bi-info-circle';
};

const getProgressPercentage = (status) => {
  const normalized = normalizeStatus(status);
  const progressMap = {
    'pending': 25,
    'processing': 50,
    'approved': 75,
    'completed': 100,
    'rejected': 0
  };
  return progressMap[normalized] || 0;
};

const getTimelineSteps = (status, createdAt) => {
  const normalized = normalizeStatus(status);
  const submittedDate = createdAt ? new Date(createdAt).toLocaleDateString() : 'N/A';
  
  const steps = [
    { label: 'Submitted', completed: true, date: submittedDate },
    { label: 'Processing', completed: ['processing', 'approved', 'completed'].includes(normalized) },
    { label: 'Approved', completed: ['approved', 'completed'].includes(normalized) },
    { label: 'Ready for Pickup', completed: normalized === 'completed' }
  ];
  return steps;
};

const buildFullName = (request) => {
  if (!request) return '';
  if (request.name) return request.name;
  return [request.fName, request.mName, request.lName, request.suffix && request.suffix !== 'N/A' ? request.suffix : '']
    .filter(Boolean)
    .join(' ');
};

const getPublicUrl = (path) => {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  let normalized = path.replace(/^(\.\.\/)+/, '');
  if (normalized.startsWith('api/')) normalized = normalized.replace(/^api\//, '');
  normalized = normalized.replace(/^\/+/, '');
  return `/api_backend/${normalized}`;
};

const getAttachmentList = (attachmentPath) => {
  if (!attachmentPath) return [];

  if (Array.isArray(attachmentPath)) {
    return attachmentPath
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean);
  }

  return String(attachmentPath)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
};

const getAttachmentType = (path) => {
  const lower = String(path || '').toLowerCase();
  return /\.(mp4|mov|webm)$/i.test(lower) ? 'video' : 'image';
};

const resetPreviewTransform = (setPreviewZoom, setPreviewPan, setIsPreviewDragging) => {
  setPreviewZoom(1);
  setPreviewPan({ x: 0, y: 0 });
  setIsPreviewDragging(false);
};

const TrackRequest = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('documents');
  const [documentRequests, setDocumentRequests] = useState([]);
  const [incidentReports, setIncidentReports] = useState([]);
  const [searchTrackingCode, setSearchTrackingCode] = useState('');
  const [toast, setToast] = useState(null);
  const [filteredRequests, setFilteredRequests] = useState({ documents: [], incident: [] });
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [selectedRequestType, setSelectedRequestType] = useState('');
  const [previewAttachment, setPreviewAttachment] = useState(null);
  const [previewZoom, setPreviewZoom] = useState(1);
  const [previewPan, setPreviewPan] = useState({ x: 0, y: 0 });
  const [isPreviewDragging, setIsPreviewDragging] = useState(false);
  const [previewDragOrigin, setPreviewDragOrigin] = useState({ x: 0, y: 0 });
  const searchInputRef = useRef(null);
  const mainContentRef = useRef(null);

  const handleCloseRequestDetails = () => {
    setSelectedRequest(null);
    setSelectedRequestType('');
  };

  const handlePreviewPointerDown = (event) => {
    if (getAttachmentType(previewAttachment) === 'video') return;

    event.preventDefault();
    setIsPreviewDragging(true);
    setPreviewDragOrigin({
      x: event.clientX - previewPan.x,
      y: event.clientY - previewPan.y,
    });
  };

  const handlePreviewPointerMove = (event) => {
    if (!isPreviewDragging || getAttachmentType(previewAttachment) === 'video') return;

    setPreviewPan({
      x: event.clientX - previewDragOrigin.x,
      y: event.clientY - previewDragOrigin.y,
    });
  };

  const handlePreviewPointerUp = () => setIsPreviewDragging(false);

  const handleOverlayClick = (event) => {
    if (event.target.classList.contains('detail-modal-overlay')) {
      handleCloseRequestDetails();
    }
  };

  useEffect(() => {
    const handleEsc = (event) => {
      if (event.key === 'Escape' && selectedRequest) {
        handleCloseRequestDetails();
      }
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [selectedRequest]);

  // Fetch request data
  const fetchRequestData = useCallback(async () => {
    if (!user?.user_id) return;
    
    try {
      setLoading(true);
      
      // Fetch all document requests for the user
      const documentRes = await fetch(`${API_BASE}/get_user_document_requests.php?user_id=${user.user_id}`);
      const documentData = await documentRes.json();

      if (documentData.success) {
        setDocumentRequests(documentData.data || []);
      } else {
        console.error('Failed to fetch document requests:', documentData.message);
        showToast('Failed to load document requests', 'error');
      }

      const incidentRes = await fetch(`${API_BASE}/get_incident_reports.php?user_id=${user.user_id}`);
      const incidentData = await incidentRes.json();

      if (incidentData.success) {
        setIncidentReports(incidentData.data || []);
      } else {
        console.error('Failed to fetch incident reports:', incidentData.message);
        showToast('Failed to load incident reports', 'error');
      }
    } catch (error) {
      console.error('Error fetching requests:', error);
      showToast('Error loading requests. Please check your connection.', 'error');
    } finally {
      setLoading(false);
    }
  }, [user?.user_id]);

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }
    fetchRequestData();
  }, [user, navigate, fetchRequestData]);

  // Filter requests based on search
  useEffect(() => {
    const searchTerm = searchTrackingCode.toLowerCase().trim();
    
    if (searchTerm) {
      const filteredDocuments = documentRequests.filter(req => 
        (req.tracking_code?.toLowerCase().includes(searchTerm) || false) ||
        (req.purpose?.toLowerCase().includes(searchTerm) || false) ||
        (req.type?.toLowerCase().includes(searchTerm) || false)
      );
      const filteredIncident = incidentReports.filter(req => 
        (req.tracking_code?.toLowerCase().includes(searchTerm) || false) ||
        (req.incident_class?.toLowerCase().includes(searchTerm) || false) ||
        (req.reporting_class?.toLowerCase().includes(searchTerm) || false)
      );
      setFilteredRequests({ documents: filteredDocuments, incident: filteredIncident });
    } else {
      setFilteredRequests({ documents: documentRequests, incident: incidentReports });
    }
  }, [searchTrackingCode, documentRequests, incidentReports]);

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const handleCopyTracking = useCallback((trackingCode) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(trackingCode).then(() => {
        showToast('Tracking code copied to clipboard!');
      }).catch(() => {
        showToast('Failed to copy tracking code', 'error');
      });
    } else {
      const textArea = document.createElement('textarea');
      textArea.value = trackingCode;
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        showToast('Tracking code copied to clipboard!');
      } catch {
        showToast('Failed to copy tracking code', 'error');
      }
      document.body.removeChild(textArea);
    }
  }, [showToast]);

  const handleViewDetails = useCallback((request, type) => {
    setSelectedRequest(request);
    setSelectedRequestType(type);
  }, []);

  const handleResubmit = useCallback((request) => {
    const type = request.type?.toLowerCase() || '';
    if (type.includes('clearance')) {
      navigate('/request/clearance', { state: { resubmitFrom: request } });
    } else if (type.includes('residency')) {
      navigate('/request/residency', { state: { resubmitFrom: request } });
    } else if (type.includes('id')) {
      navigate('/request/id', { state: { resubmitFrom: request } });
    } else if (type.includes('business')) {
      navigate('/request/business', { state: { resubmitFrom: request } });
    } else if (type.includes('indigency')) {
      navigate('/request/indigency', { state: { resubmitFrom: request } });
    } else if (type.includes('volunteer')) {
      navigate('/request/volunteer', { state: { resubmitFrom: request } });
    } else if (type.includes('amenity')) {
      navigate('/amenity-reservation', { state: { resubmitFrom: request } });
    } else {
      navigate('/request/clearance', { state: { resubmitFrom: request } });
    }
  }, [navigate]);

  const displayRequests = useMemo(() => {
    return activeTab === 'documents' ? filteredRequests.documents : filteredRequests.incident;
  }, [activeTab, filteredRequests]);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setTimeout(() => {
      if (mainContentRef.current) {
        const firstCard = mainContentRef.current.querySelector('.request-card, .empty-state');
        if (firstCard) {
          firstCard.focus();
        }
      }
    }, 100);
  };

  const handleSearch = () => {
    if (!searchTrackingCode.trim()) {
      showToast('Please enter a tracking code', 'error');
      searchInputRef.current?.focus();
    }
  };

  const handleKeyDown = (e, action) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      action();
    }
  };

  // Render detail view based on document type
  const renderDocumentDetails = (request) => {
    const type = request.type?.toLowerCase() || '';

    // Common fields for all documents
    const commonInfo = (
      <div className="detail-section">
        <h3>Request Information</h3>
        <div className="detail-grid">
          <div>
            <span className="detail-label">Document Type</span>
            <p className="detail-value">{request.type || 'N/A'}</p>
          </div>
          <div>
            <span className="detail-label">Tracking Code</span>
            <p className="detail-value font-mono text-primary">{request.tracking_code}</p>
          </div>
          <div>
            <span className="detail-label">Date Submitted</span>
            <p className="detail-value">{request.requested_at ? new Date(request.requested_at).toLocaleString() : 'N/A'}</p>
          </div>
          <div>
            <span className="detail-label">Status</span>
            <span className={`status-pill status-${normalizeStatus(request.status)}`}>
              <i className={`bi ${getStatusIcon(request.status)}`}></i> {request.status}
            </span>
          </div>
        </div>
      </div>
    );

    // Applicant information
    const applicantInfo = (
      <div className="detail-section">
        <h3>Applicant Information</h3>
        <div className="detail-grid">
          <div style={{ gridColumn: 'span 2' }}>
            <span className="detail-label">Full Name</span>
            <p className="detail-value">{buildFullName(request) || 'N/A'}</p>
          </div>
          {request.beneficiary_name && (
            <div>
              <span className="detail-label">Beneficiary</span>
              <p className="detail-value">{request.beneficiary_name}</p>
            </div>
          )}
          {request.request_mode && (
            <div>
              <span className="detail-label">Request Mode</span>
              <p className="detail-value">{request.request_mode}</p>
            </div>
          )}
          {request.birth_date && (
            <div>
              <span className="detail-label">Birth Date</span>
              <p className="detail-value">{request.birth_date}</p>
            </div>
          )}
          {request.gender && (
            <div>
              <span className="detail-label">Gender</span>
              <p className="detail-value">{request.gender}</p>
            </div>
          )}
          {request.civil_status && (
            <div>
              <span className="detail-label">Civil Status</span>
              <p className="detail-value">{request.civil_status}</p>
            </div>
          )}
          {request.address && (
            <div style={{ gridColumn: 'span 2' }}>
              <span className="detail-label">Address</span>
              <p className="detail-value">{request.address}</p>
            </div>
          )}
        </div>
      </div>
    );

    // Render based on type
    if (type.includes('clearance') && !type.includes('business')) {
      // Barangay Clearance specific fields
      return (
        <>
          {commonInfo}
          {applicantInfo}
          <div className="detail-section">
            <h3>Additional Details</h3>
            <div className="detail-grid">
              <div>
                <span className="detail-label">Purpose</span>
                <p className="detail-value">{request.purpose || 'N/A'}</p>
              </div>
              {request.years_in_PB2 && (
                <div>
                  <span className="detail-label">Years in PB2</span>
                  <p className="detail-value">{request.years_in_PB2}</p>
                </div>
              )}
              {request.precinct_no && (
                <div>
                  <span className="detail-label">Precinct No.</span>
                  <p className="detail-value">{request.precinct_no}</p>
                </div>
              )}
              {request.sector && (
                <div>
                  <span className="detail-label">Sector</span>
                  <p className="detail-value">{request.sector}</p>
                </div>
              )}
            </div>
          </div>
          {(request.id_front || request.id_back || request.id_holding) && (
            <div className="detail-section">
              <h3>Submitted Documents</h3>
              <div className="detail-media-grid">
                {request.id_front && (
                  <div className="detail-media-card">
                    <span className="detail-label">ID Front</span>
                    <img src={getPublicUrl(request.id_front)} alt="ID front" />
                  </div>
                )}
                {request.id_back && (
                  <div className="detail-media-card">
                    <span className="detail-label">ID Back</span>
                    <img src={getPublicUrl(request.id_back)} alt="ID back" />
                  </div>
                )}
                {request.id_holding && (
                  <div className="detail-media-card">
                    <span className="detail-label">ID Holding</span>
                    <img src={getPublicUrl(request.id_holding)} alt="Holding ID" />
                  </div>
                )}
              </div>
            </div>
          )}
          {request.notes && (
            <div className="detail-section">
              <h3>Additional Notes</h3>
              <p className="detail-value">{request.notes}</p>
            </div>
          )}
        </>
      );
    }

    if (type.includes('residency')) {
      // Certificate of Residency specific fields
      return (
        <>
          {commonInfo}
          {applicantInfo}
          <div className="detail-section">
            <h3>Residency Details</h3>
            <div className="detail-grid">
              <div>
                <span className="detail-label">Purpose</span>
                <p className="detail-value">{request.purpose || 'N/A'}</p>
              </div>
              {request.residency_status && (
                <div>
                  <span className="detail-label">Residency Status</span>
                  <p className="detail-value">{request.residency_status}</p>
                </div>
              )}
              {request.years_in_PB2 && (
                <div>
                  <span className="detail-label">Years in PB2</span>
                  <p className="detail-value">{request.years_in_PB2}</p>
                </div>
              )}
              {request.sector && (
                <div>
                  <span className="detail-label">Sector</span>
                  <p className="detail-value">{request.sector}</p>
                </div>
              )}
            </div>
          </div>
          {(request.valid_id || request.proof_doc) && (
            <div className="detail-section">
              <h3>Submitted Documents</h3>
              <div className="detail-media-grid">
                {request.valid_id && (
                  <div className="detail-media-card">
                    <span className="detail-label">Valid ID</span>
                    <img src={getPublicUrl(request.valid_id)} alt="Valid ID" />
                  </div>
                )}
                {request.proof_doc && (
                  <div className="detail-media-card">
                    <span className="detail-label">Proof of Residency</span>
                    <img src={getPublicUrl(request.proof_doc)} alt="Proof of Residency" />
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      );
    }

    if (type.includes('barangay id') || type.includes('id')) {
      // Barangay ID specific fields
      return (
        <>
          {commonInfo}
          {applicantInfo}
          <div className="detail-section">
            <h3>Personal Details</h3>
            <div className="detail-grid">
              {request.birth_place && (
                <div>
                  <span className="detail-label">Birth Place</span>
                  <p className="detail-value">{request.birth_place}</p>
                </div>
              )}
              {request.contact_num && (
                <div>
                  <span className="detail-label">Contact Number</span>
                  <p className="detail-value">{request.contact_num}</p>
                </div>
              )}
              {request.height && (
                <div>
                  <span className="detail-label">Height</span>
                  <p className="detail-value">{request.height}</p>
                </div>
              )}
              {request.weight && (
                <div>
                  <span className="detail-label">Weight</span>
                  <p className="detail-value">{request.weight}</p>
                </div>
              )}
              {request.blood_type && (
                <div>
                  <span className="detail-label">Blood Type</span>
                  <p className="detail-value">{request.blood_type}</p>
                </div>
              )}
              {request.tin_no && (
                <div>
                  <span className="detail-label">TIN No.</span>
                  <p className="detail-value">{request.tin_no}</p>
                </div>
              )}
            </div>
          </div>
          <div className="detail-section">
            <h3>Emergency Contact</h3>
            <div className="detail-grid">
              {request.contact_person && (
                <div>
                  <span className="detail-label">Contact Person</span>
                  <p className="detail-value">{request.contact_person}</p>
                </div>
              )}
              {request.contactp_relationship && (
                <div>
                  <span className="detail-label">Relationship</span>
                  <p className="detail-value">{request.contactp_relationship}</p>
                </div>
              )}
              {request.contactp_num && (
                <div>
                  <span className="detail-label">Contact Number</span>
                  <p className="detail-value">{request.contactp_num}</p>
                </div>
              )}
              {request.emergency_address && (
                <div style={{ gridColumn: 'span 2' }}>
                  <span className="detail-label">Emergency Address</span>
                  <p className="detail-value">{request.emergency_address}</p>
                </div>
              )}
            </div>
          </div>
          {(request.id_front || request.id_holding) && (
            <div className="detail-section">
              <h3>Submitted Documents</h3>
              <div className="detail-media-grid">
                {request.id_front && (
                  <div className="detail-media-card">
                    <span className="detail-label">ID Picture</span>
                    <img src={getPublicUrl(request.id_front)} alt="ID Picture" />
                  </div>
                )}
                {request.id_holding && (
                  <div className="detail-media-card">
                    <span className="detail-label">Signature</span>
                    <img src={getPublicUrl(request.id_holding)} alt="Signature" />
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      );
    }

    if (type.includes('business')) {
      // Business Clearance specific fields
      return (
        <>
          {commonInfo}
          {applicantInfo}
          <div className="detail-section">
            <h3>Business Details</h3>
            <div className="detail-grid">
              {request.business_name && (
                <div style={{ gridColumn: 'span 2' }}>
                  <span className="detail-label">Business Name</span>
                  <p className="detail-value">{request.business_name}</p>
                </div>
              )}
              {request.business_type && (
                <div>
                  <span className="detail-label">Business Type</span>
                  <p className="detail-value">{request.business_type}</p>
                </div>
              )}
              {request.nature_business && (
                <div style={{ gridColumn: 'span 2' }}>
                  <span className="detail-label">Nature of Business</span>
                  <p className="detail-value">{request.nature_business}</p>
                </div>
              )}
              {request.business_address && (
                <div style={{ gridColumn: 'span 2' }}>
                  <span className="detail-label">Business Address</span>
                  <p className="detail-value">{request.business_address}</p>
                </div>
              )}
              {request.business_contact_person && (
                <div>
                  <span className="detail-label">Business Contact</span>
                  <p className="detail-value">{request.business_contact_person}</p>
                </div>
              )}
              {request.business_contact_num && (
                <div>
                  <span className="detail-label">Business Contact No.</span>
                  <p className="detail-value">{request.business_contact_num}</p>
                </div>
              )}
            </div>
          </div>
          {(request.id_front || request.id_back) && (
            <div className="detail-section">
              <h3>Submitted Documents</h3>
              <div className="detail-media-grid">
                {request.id_front && (
                  <div className="detail-media-card">
                    <span className="detail-label">Owner ID</span>
                    <img src={getPublicUrl(request.id_front)} alt="Owner ID" />
                  </div>
                )}
                {request.id_back && (
                  <div className="detail-media-card">
                    <span className="detail-label">DTI/SEC Registration</span>
                    <img src={getPublicUrl(request.id_back)} alt="DTI Registration" />
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      );
    }

    if (type.includes('indigency')) {
      // Certificate of Indigency specific fields
      return (
        <>
          {commonInfo}
          {applicantInfo}
          <div className="detail-section">
            <h3>Financial Details</h3>
            <div className="detail-grid">
              <div>
                <span className="detail-label">Purpose</span>
                <p className="detail-value">{request.purpose || 'N/A'}</p>
              </div>
              {request.employment_status && (
                <div>
                  <span className="detail-label">Employment Status</span>
                  <p className="detail-value">{request.employment_status}</p>
                </div>
              )}
              {request.monthly_income && (
                <div>
                  <span className="detail-label">Monthly Income</span>
                  <p className="detail-value">₱{parseFloat(request.monthly_income).toLocaleString()}</p>
                </div>
              )}
            </div>
          </div>
          {(request.valid_id || request.proof_doc) && (
            <div className="detail-section">
              <h3>Submitted Documents</h3>
              <div className="detail-media-grid">
                {request.valid_id && (
                  <div className="detail-media-card">
                    <span className="detail-label">Valid ID</span>
                    <img src={getPublicUrl(request.valid_id)} alt="Valid ID" />
                  </div>
                )}
                {request.proof_doc && (
                  <div className="detail-media-card">
                    <span className="detail-label">Proof Document</span>
                    <img src={getPublicUrl(request.proof_doc)} alt="Proof Document" />
                  </div>
                )}
              </div>
            </div>
          )}
          {request.notes && (
            <div className="detail-section">
              <h3>Purpose Details</h3>
              <p className="detail-value">{request.notes}</p>
            </div>
          )}
        </>
      );
    }

    if (type.includes('volunteer')) {
      // Volunteer Registration specific fields
      return (
        <>
          {commonInfo}
          <div className="detail-section">
            <h3>Personal Information</h3>
            <div className="detail-grid">
              <div style={{ gridColumn: 'span 2' }}>
                <span className="detail-label">Full Name</span>
                <p className="detail-value">{buildFullName(request) || 'N/A'}</p>
              </div>
              {request.address && (
                <div style={{ gridColumn: 'span 2' }}>
                  <span className="detail-label">Address</span>
                  <p className="detail-value">{request.address}</p>
                </div>
              )}
              {request.contact_num && (
                <div>
                  <span className="detail-label">Contact Number</span>
                  <p className="detail-value">{request.contact_num}</p>
                </div>
              )}
              {request.email && (
                <div>
                  <span className="detail-label">Email</span>
                  <p className="detail-value">{request.email}</p>
                </div>
              )}
            </div>
          </div>
          <div className="detail-section">
            <h3>Volunteer Profile</h3>
            <div className="detail-grid">
              {request.program_area && (
                <div>
                  <span className="detail-label">Program Area</span>
                  <p className="detail-value">{request.program_area}</p>
                </div>
              )}
              {request.availability && (
                <div>
                  <span className="detail-label">Availability</span>
                  <p className="detail-value">{request.availability}</p>
                </div>
              )}
              {request.occupation && (
                <div>
                  <span className="detail-label">Occupation</span>
                  <p className="detail-value">{request.occupation}</p>
                </div>
              )}
              {request.skills && (
                <div style={{ gridColumn: 'span 2' }}>
                  <span className="detail-label">Skills/Interests</span>
                  <p className="detail-value">{request.skills}</p>
                </div>
              )}
            </div>
          </div>
          {request.valid_id && (
            <div className="detail-section">
              <h3>Submitted Documents</h3>
              <div className="detail-media-grid">
                <div className="detail-media-card">
                  <span className="detail-label">Valid ID</span>
                  <img src={getPublicUrl(request.valid_id)} alt="Valid ID" />
                </div>
              </div>
            </div>
          )}
        </>
      );
    }

    if (type.includes('amenity') || type.includes('reservation')) {
      // Amenity Reservation specific fields
      return (
        <>
          {commonInfo}
          <div className="detail-section">
            <h3>Contact Information</h3>
            <div className="detail-grid">
              <div style={{ gridColumn: 'span 2' }}>
                <span className="detail-label">Contact Name</span>
                <p className="detail-value">{request.contact_name || buildFullName(request) || 'N/A'}</p>
              </div>
              {request.contact_number && (
                <div>
                  <span className="detail-label">Contact Number</span>
                  <p className="detail-value">{request.contact_number}</p>
                </div>
              )}
            </div>
          </div>
          <div className="detail-section">
            <h3>Reservation Details</h3>
            <div className="detail-grid">
              {request.venue && (
                <div>
                  <span className="detail-label">Venue/Facility</span>
                  <p className="detail-value">{request.venue}</p>
                </div>
              )}
              {request.reservation_date && (
                <div>
                  <span className="detail-label">Reservation Date</span>
                  <p className="detail-value">{request.reservation_date}</p>
                </div>
              )}
              {request.time_slot && (
                <div>
                  <span className="detail-label">Time Slot</span>
                  <p className="detail-value">{request.time_slot}</p>
                </div>
              )}
              {request.purpose && (
                <div style={{ gridColumn: 'span 2' }}>
                  <span className="detail-label">Purpose</span>
                  <p className="detail-value">{request.purpose}</p>
                </div>
              )}
            </div>
          </div>
          {(request.id_front || request.id_holding) && (
            <div className="detail-section">
              <h3>Submitted Documents</h3>
              <div className="detail-media-grid">
                {request.id_front && (
                  <div className="detail-media-card">
                    <span className="detail-label">ID Front</span>
                    <img src={getPublicUrl(request.id_front)} alt="ID Front" />
                  </div>
                )}
                {request.id_holding && (
                  <div className="detail-media-card">
                    <span className="detail-label">ID Holding</span>
                    <img src={getPublicUrl(request.id_holding)} alt="ID Holding" />
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      );
    }

    // Default fallback
    return (
      <>
        {commonInfo}
        {applicantInfo}
        {request.notes && (
          <div className="detail-section">
            <h3>Additional Notes</h3>
            <p className="detail-value">{request.notes}</p>
          </div>
        )}
      </>
    );
  };

  return (
    <>
      <Preloader />
      <Header />

      <a href="#main-content" className="skip-link" aria-label="Skip to main content">
        Skip to main content
      </a>

      <div className="track-page-background">
        
        {/* Hero Section */}
        <section className="track-hero-section" aria-label="Track your requests">
          <div className="hero-content">
            <span className="badge-premium" role="text"><i className="bi bi-geo-alt-fill"></i> Track Your Requests</span>
            <h1>Status Tracker</h1>
            <p>Monitor the progress of your barangay documents and incident reports in real-time.</p>
            
            <div className="search-container">
              <label htmlFor="search-tracking" className="visually-hidden">Search by tracking code</label>
              <div className="search-input-wrapper">
                <i className="bi bi-search search-prefix-icon"></i>
                <input 
                  id="search-tracking"
                  type="text"
                  placeholder="Enter tracking code (e.g., CLR-2026...)"
                  value={searchTrackingCode}
                  onChange={(e) => setSearchTrackingCode(e.target.value)}
                  className="search-input"
                  aria-label="Enter tracking code to search"
                  ref={searchInputRef}
                  onKeyDown={(e) => handleKeyDown(e, handleSearch)}
                />
              </div>
              <button 
                className="btn-premium"
                onClick={handleSearch}
                aria-label="Search for tracking code"
                type="button"
              >
                Track Now
              </button>
            </div>
          </div>
        </section>

        {/* Main Content */}
        <section className="track-content-section" aria-label="Your requests" id="main-content">
          <div className="track-container">
            
            {/* Tab Navigation (Segmented Control Style) */}
            <div className="tab-navigation-wrapper">
              <div className="tab-navigation" role="tablist" aria-label="Request type tabs">
                <button 
                  className={`tab-btn ${activeTab === 'documents' ? 'active' : ''}`}
                  onClick={() => handleTabChange('documents')}
                  role="tab"
                  aria-selected={activeTab === 'documents'}
                  aria-controls="documents-panel"
                  id="documents-tab"
                  type="button"
                >
                  <i className="bi bi-file-earmark-text-fill tab-icon" aria-hidden="true"></i>
                  <span>Documents</span>
                  <span className="badge-count" aria-label={`${documentRequests.length} document requests`}>{documentRequests.length}</span>
                </button>
                <button 
                  className={`tab-btn ${activeTab === 'incident' ? 'active' : ''}`}
                  onClick={() => handleTabChange('incident')}
                  role="tab"
                  aria-selected={activeTab === 'incident'}
                  aria-controls="incident-panel"
                  id="incident-tab"
                  type="button"
                >
                  <i className="bi bi-shield-exclamation tab-icon" aria-hidden="true"></i>
                  <span>Incidents</span>
                  <span className="badge-count" aria-label={`${incidentReports.length} incident reports`}>{incidentReports.length}</span>
                </button>
              </div>
            </div>

            {/* Content Area */}
            <div className="track-content" role="tabpanel" ref={mainContentRef}>
              {loading ? (
                <div className="loading-state">
                  <div className="premium-spinner" aria-hidden="true"></div>
                  <p>Retrieving your records...</p>
                </div>
              ) : activeTab === 'documents' ? (
                <div className="requests-grid" id="documents-panel" role="tabpanel" aria-labelledby="documents-tab">
                  {displayRequests.length > 0 ? (
                    <div className="premium-table-container">
                      <table className="premium-table">
                        <thead>
                          <tr>
                            <th>Tracking Code</th>
                            <th>Document Type</th>
                            <th>Purpose</th>
                            <th>Status</th>
                            <th>Date Submitted</th>
                            <th>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {displayRequests.map((request, idx) => (
                            <tr key={request.tracking_code || idx}>
                              <td className="font-mono text-primary fw-bold">
                                <i className="bi bi-hash"></i> {request.tracking_code}
                              </td>
                              <td className="fw-semibold text-dark">{request.type}</td>
                              <td className="text-muted">{request.purpose || 'N/A'}</td>
                              <td>
                                <span className={`status-pill status-${normalizeStatus(request.status)}`}>
                                  <i className={`bi ${getStatusIcon(request.status)}`}></i> {request.status}
                                </span>
                              </td>
                              <td className="text-muted">
                                <i className="bi bi-calendar3"></i> {request.requested_at ? new Date(request.requested_at).toLocaleDateString() : 'N/A'}
                              </td>
                              <td>
                                <button className="btn-action-light" onClick={() => handleViewDetails(request, 'document')}>
                                  View Details
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : searchTrackingCode ? (
                    <div className="empty-state" tabIndex="0">
                      <div className="empty-icon-box" aria-hidden="true"><i className="bi bi-search"></i></div>
                      <h3>No Results Found</h3>
                      <p>No document requests match your search "{searchTrackingCode}"</p>
                      <button className="btn-outline-premium" onClick={() => { setSearchTrackingCode(''); searchInputRef.current?.focus(); }} type="button">
                        Clear Search
                      </button>
                    </div>
                  ) : (
                    <div className="empty-state" tabIndex="0">
                      <div className="empty-icon-box" aria-hidden="true"><i className="bi bi-folder-x"></i></div>
                      <h3>No Documents Found</h3>
                      <p>You haven't submitted any document requests yet.</p>
                      <button className="btn-premium" onClick={() => navigate('/services')} type="button">
                        Browse Services
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="requests-grid" id="incident-panel" role="tabpanel" aria-labelledby="incident-tab">
                  {displayRequests.length > 0 ? (
                  <div className="premium-table-container">
                    <table className="premium-table">
                      <thead>
                        <tr>
                          <th>Tracking Code</th>
                          <th>Incident Type</th>
                          <th>Status</th>
                          <th>Date Submitted</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {displayRequests.map((report, idx) => (
                          <tr key={report.tracking_code || idx}>
                            <td className="font-mono text-primary fw-bold">
                              <i className="bi bi-hash"></i> {report.tracking_code}
                            </td>
                            <td className="fw-semibold text-dark">
                            <div className="incident-type">
                              <div className="incident-class">{report.incident_class}</div>
                              <div className="reporting-class">{report.reporting_class}</div>
                            </div>
                          </td>
                            <td>
                              <span className={`status-pill status-${normalizeStatus(report.status)}`}>
                                <i className={`bi ${getStatusIcon(report.status)}`}></i> {report.status}
                              </span>
                            </td>
                            <td className="text-muted">
                              <i className="bi bi-calendar3"></i> {new Date(report.created_at).toLocaleDateString()}
                            </td>
                            <td>
                              <button className="btn-action-light" onClick={() => handleViewDetails(report, 'incident')}>
                                View Details
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : searchTrackingCode ? (
                    <div className="empty-state" tabIndex="0">
                      <div className="empty-icon-box" aria-hidden="true"><i className="bi bi-search"></i></div>
                      <h3>No Results Found</h3>
                      <p>No incident reports match your search "{searchTrackingCode}"</p>
                      <button className="btn-outline-premium" onClick={() => { setSearchTrackingCode(''); searchInputRef.current?.focus(); }} type="button">
                        Clear Search
                      </button>
                    </div>
                  ) : (
                    <div className="empty-state" tabIndex="0">
                      <div className="empty-icon-box" aria-hidden="true"><i className="bi bi-shield-x"></i></div>
                      <h3>No Incident Reports</h3>
                      <p>You haven't submitted any incident reports yet.</p>
                      <button className="btn-premium" onClick={() => navigate('/incident-report')} type="button">
                        File Incident Report
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>

        {previewAttachment && (
          <div
            className="detail-modal-overlay attachment-preview-overlay"
            onClick={() => {
              setPreviewAttachment(null);
              resetPreviewTransform();
            }}
          >
            <div className="attachment-preview-panel" onClick={(event) => event.stopPropagation()}>
              <div className="attachment-preview-toolbar">
                {getAttachmentType(previewAttachment) !== 'video' && (
                  <>
                    <button type="button" className="attachment-zoom-btn" onClick={() => setPreviewZoom((prev) => Math.min(prev + 0.2, 3))}>+</button>
                    <button type="button" className="attachment-zoom-btn" onClick={() => setPreviewZoom((prev) => Math.max(prev - 0.2, 1))}>−</button>
                    <button type="button" className="attachment-zoom-btn" onClick={() => resetPreviewTransform(setPreviewZoom, setPreviewPan, setIsPreviewDragging)}>Reset</button>
                    <span className="attachment-zoom-label">{previewZoom.toFixed(1)}x</span>
                  </>
                )}
                <button
                  type="button"
                  className="detail-close-btn attachment-preview-close"
                  onClick={() => {
                    setPreviewAttachment(null);
                    resetPreviewTransform();
                  }}
                  aria-label="Close attachment preview"
                >
                  <i className="bi bi-x-lg"></i>
                </button>
              </div>
              {getAttachmentType(previewAttachment) === 'video' ? (
                <video controls src={getPublicUrl(previewAttachment)} className="attachment-preview-media" />
              ) : (
                <img
                  src={getPublicUrl(previewAttachment)}
                  alt="Attachment preview"
                  className="attachment-preview-media"
                  style={{
                    transform: `translate(${previewPan.x}px, ${previewPan.y}px) scale(${previewZoom})`,
                    cursor: isPreviewDragging ? 'grabbing' : 'grab',
                  }}
                  onPointerDown={handlePreviewPointerDown}
                  onPointerMove={handlePreviewPointerMove}
                  onPointerUp={handlePreviewPointerUp}
                  onPointerLeave={handlePreviewPointerUp}
                />
              )}
            </div>
          </div>
        )}

        {selectedRequest && (
          <div className="detail-modal-overlay" onClick={handleOverlayClick}>
            <div className="detail-modal" role="document" aria-modal="true" aria-labelledby="detail-modal-title">
              <div className="detail-modal-header">
                <div>
                  <p className="detail-modal-subtitle">{selectedRequestType === 'document' ? (selectedRequest.type || 'Document Request') : 'Incident Report'}</p>
                  <h2 id="detail-modal-title">{selectedRequest.tracking_code || selectedRequest.track_code}</h2>
                  <span className={`status-pill status-${normalizeStatus(selectedRequest.status)}`}>
                    <i className={`bi ${getStatusIcon(selectedRequest.status)}`}></i> {selectedRequest.status}
                  </span>
                </div>
                <button className="detail-close-btn" onClick={handleCloseRequestDetails} type="button" aria-label="Close details">
                  <i className="bi bi-x-lg"></i>
                </button>
              </div>

              <div className="detail-modal-body">
                {selectedRequestType === 'document' ? (
                  renderDocumentDetails(selectedRequest)
                ) : (
                  <>
                    <div className="detail-section">
                      <h3>Report Information</h3>
                      <div className="detail-grid">
                        <div>
                          <span className="detail-label">Reported By</span>
                          <p className="detail-value">{selectedRequest.reporter_name || 'N/A'}</p>
                        </div>
                        <div>
                          <span className="detail-label">Reporter Email</span>
                          <p className="detail-value">{selectedRequest.reporter_email || 'N/A'}</p>
                        </div>
                        <div>
                          <span className="detail-label">Reporter Contact</span>
                          <p className="detail-value">{selectedRequest.reporter_contact || 'N/A'}</p>
                        </div>
                        <div style={{ gridColumn: 'span 2' }}>
                          <span className="detail-label">Reporter Address</span>
                          <p className="detail-value">{selectedRequest.reporter_address || 'N/A'}</p>
                        </div>
                      </div>
                    </div>

                    <div className="detail-section">
                      <h3>Incident Details</h3>
                      <div className="detail-grid">
                        <div>
                          <span className="detail-label">Person Involved</span>
                          <p className="detail-value">{selectedRequest.contact_person_name || 'N/A'}</p>
                        </div>
                        <div>
                          <span className="detail-label">Contact Number</span>
                          <p className="detail-value">{selectedRequest.contact_person_number || 'N/A'}</p>
                        </div>
                        <div style={{ gridColumn: 'span 2' }}>
                          <span className="detail-label">Incident Location</span>
                          <p className="detail-value">{selectedRequest.incident_address || 'N/A'}</p>
                        </div>
                        <div>
                          <span className="detail-label">Classification</span>
                          <p className="detail-value">{selectedRequest.incident_class || 'N/A'}</p>
                        </div>
                        <div>
                          <span className="detail-label">Report Type</span>
                          <p className="detail-value">{selectedRequest.reporting_class || 'N/A'}</p>
                        </div>
                        <div>
                          <span className="detail-label">Submitted</span>
                          <p className="detail-value">{selectedRequest.created_at ? new Date(selectedRequest.created_at).toLocaleString() : 'N/A'}</p>
                        </div>
                      </div>
                    </div>

                    <div className="detail-section">
                      <h3>Description</h3>
                      <div className="detail-description-box">
                        {selectedRequest.description || 'No description provided.'}
                      </div>
                    </div>

                    <div className="detail-section">
                      <h3>Evidence Attachments</h3>
                      {(() => {
                        const attachments = getAttachmentList(selectedRequest.attachment_path);

                        if (!attachments.length) {
                          return <p className="detail-value">No attachment available.</p>;
                        }

                        return (
                          <div className="detail-media-grid">
                            {attachments.map((path, index) => {
                              const type = getAttachmentType(path);
                              return (
                                <div className="detail-media-card" key={`${path}-${index}`}>
                                  <span className="detail-label">Attachment {index + 1}</span>
                                  <button
                                    type="button"
                                    className="attachment-preview-trigger"
                                    onClick={() => setPreviewAttachment(path)}
                                    aria-label={`Preview attachment ${index + 1}`}
                                  >
                                    {type === 'video' ? (
                                      <video controls src={getPublicUrl(path)} style={{ width: '100%', borderRadius: '8px', maxHeight: '300px', backgroundColor: '#000' }} />
                                    ) : (
                                      <img src={getPublicUrl(path)} alt={`Incident evidence ${index + 1}`} style={{ width: '100%', borderRadius: '8px', maxHeight: '300px', objectFit: 'cover' }} />
                                    )}
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Info Cards Section */}
        <section className="info-section" aria-label="Helpful information">
          <div className="info-cards">
            <div className="info-card">
              <div className="info-icon-wrapper" aria-hidden="true"><i className="bi bi-stopwatch"></i></div>
              <h3>Processing Time</h3>
              <p>Standard processing takes 3-5 business days.</p>
            </div>
            <div className="info-card">
              <div className="info-icon-wrapper" aria-hidden="true"><i className="bi bi-headset"></i></div>
              <h3>Need Support?</h3>
              <p>Contact the barangay hall for urgent inquiries.</p>
            </div>
            <div className="info-card">
              <div className="info-icon-wrapper" aria-hidden="true"><i className="bi bi-envelope-paper"></i></div>
              <h3>Email Alerts</h3>
              <p>Status updates will be sent to your registered email.</p>
            </div>
          </div>
        </section>
      </div>

      {/* Modern Toast Notification */}
      {toast && (
        <div className={`premium-toast ${toast.type}`} role="alert" aria-live="assertive" aria-atomic="true">
          <div className="toast-icon">
             <i className={`bi ${toast.type === 'error' ? 'bi-exclamation-octagon-fill' : 'bi-check-circle-fill'}`}></i>
          </div>
          <div className="toast-content">{toast.message}</div>
        </div>
      )}

      <Footer />
    </>
  );
};

export default TrackRequest;