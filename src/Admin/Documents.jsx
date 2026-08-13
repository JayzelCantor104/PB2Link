import React, { useEffect, useState, useMemo } from 'react';
import axios from 'axios';
// Import your externalized CSS file
import './Documents.css';
import { 
  DocumentPrintSidebar, 
  PrintHeaderAndTitle, 
  PrintFooterSignatures,
  RenderPrintDocumentContent,
  PrintBusinessClearance,
  PrintBarangayClearance,
  PrintCertificateResidency,
  PrintCertificateIndigency,
  PrintBarangayIDCard,
  executePDFDownload,
  PrintDefaultFallback
} from './PrintTemplates';



const API_BASE = '/api_backend';

// Helper function to normalize status
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

// Helper function to get status icon
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

// Helper to build full name
const buildFullName = (request) => {
  if (!request) return '';
  if (request.name) return request.name;
  return [request.fName, request.mName, request.lName, request.suffix && request.suffix !== 'N/A' ? request.suffix : '']
    .filter(Boolean)
    .join(' ');
};

// Helper to get public URL
const getPublicUrl = (path) => {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  let normalized = path.replace(/^(\.\.\/)+/, '');
  if (normalized.startsWith('api/')) normalized = normalized.replace(/^api\//, '');
  normalized = normalized.replace(/^\/+/, '');
  return `/api_backend/${normalized}`;
};

// List of all document types for the tabs
const DOCUMENT_TABS = [
  'All Requests',
  'Barangay Clearance',
  'Certificate of Residency',
  'Certificate of Indigency',
  'Business Clearance',
  'Barangay ID',
  'Volunteer Registration'
];


const Documents = () => {
  const [requests, setRequests] = useState([]);
  const [message, setMessage] = useState('');
  
  // Advanced Filter States
  const [activeTab, setActiveTab] = useState('All Requests');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [sortOrder, setSortOrder] = useState('Newest');
  const [selectedRequest, setSelectedRequest] = useState(null);
  // NEW FEATURE STATE: Print Engine Overlay Mode Triggers
  const [printRequest, setPrintRequest] = useState(null);
  // NEW FEATURE STATE: Intercept Action Workflow Context
  const [actionContext, setActionContext] = useState(null); 
  // Structure: { request_id, type, targetStatus, itemObject, adminRemarks: '' }

  // Fetch Data
  const fetchRequests = async () => {
    try {
      const response = await axios.get(`${API_BASE}/get_document_requests.php`);
      if (response.data.success) {
        setRequests(response.data.data);
      }
    } catch (err) {
      console.error(err);
      showToast('Error: Failed to fetch requests. Check connection.');
    }
  };

  useEffect(() => { fetchRequests(); }, []);

  // Custom Toast Handler
  const showToast = (msg) => {
    setMessage(msg);
    setTimeout(() => setMessage(''), 4000);
  };

  // Maps frontend display types to your backend table keys
  const getBackendType = (type) => {
    switch (type) {
      case 'Barangay Clearance': return 'clearance';
      case 'Certificate of Residency': return 'residency';
      case 'Certificate of Indigency': return 'indigency';
      case 'Business Clearance': return 'business_clearance';
      case 'Barangay ID': return 'barangay_id';
      case 'Volunteer Registration': return 'volunteer';
      case 'Amenity Reservation': return 'amenity';
      default: return 'clearance';
    }
  };

  // Intercept method to safely open confirmation workspace
  const handleInitiateUpdate = (item, targetStatus) => {
    setActionContext({
      request_id: item.request_id,
      type: item.type,
      targetStatus: targetStatus,
      itemObject: item,
      adminRemarks: ''
    });
  };

  // Modified execution process saving updates & custom remarks to DB
  const processStatusUpdateWithRemarks = async () => {
    if (!actionContext) return;
    
    try {
      const backendType = getBackendType(actionContext.type);
      const response = await axios.post(`${API_BASE}/update_document_request.php`, { 
        request_id: actionContext.request_id, 
        request_type: backendType, 
        status: actionContext.targetStatus,
        remarks: actionContext.adminRemarks // Passing user additional message explicitly
      });
      
      if (response.data.success) {
        showToast(`Success: Request marked as ${actionContext.targetStatus}`);
        setActionContext(null); // Close update entry layout modal
        fetchRequests(); // Refresh the list from server pipeline
      } else {
        showToast(`Error: ${response.data.message || 'Failed to update status.'}`);
      }
    } catch (err) {
      console.error(err);
      showToast('Error: Server connection failed.');
    }
  };

  // --- DATA PROCESSING ENGINE ---
  const filteredData = useMemo(() => {
    if (!Array.isArray(requests)) return [];
    
    let filtered = requests.filter(item => {
      const itemStatus = (item.status || '').toLowerCase();
      const itemName = (item.name || '').toLowerCase();
      const itemCode = (item.tracking_code || '').toLowerCase();
      
      const matchesTab = activeTab === 'All Requests' || item.type === activeTab;
      const matchesStatus = statusFilter === 'All' || itemStatus.includes(statusFilter.toLowerCase());
      
      const query = searchQuery.toLowerCase();
      const matchesSearch = itemName.includes(query) || itemCode.includes(query);
      
      return matchesTab && matchesStatus && matchesSearch;
    });

    return filtered.sort((a, b) => {
      const dateA = new Date(a.requested_at || 0);
      const dateB = new Date(b.requested_at || 0);
      return sortOrder === 'Newest' ? dateB - dateA : dateA - dateB;
    });
  }, [requests, activeTab, statusFilter, searchQuery, sortOrder]);

  // --- EXPORT TO SPREADSHEET (CSV) ---
  const exportToCSV = () => {
    if (filteredData.length === 0) {
      showToast("Notice: No data to export.");
      return;
    }

    const headers = ["Resident Name", "Document Type", "Tracking Code", "Date Requested", "Status"];
    
    const rows = filteredData.map(item => [
      `"${item.name || ''}"`,
      `"${item.type || ''}"`,
      `"${item.tracking_code || ''}"`,
      `"${item.requested_at || ''}"`,
      `"${item.status || ''}"`
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `PB2_Requests_${activeTab.replace(/\s+/g, '_')}_${new Date().toLocaleDateString()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showToast("Success: Spreadsheet downloaded.");
  };

  







const CommonRequestInfo = ({ request, normalizeStatus, getStatusIcon }) => (
  <div className="detail-section">
    <h4 className="detail-section-title">Request Information</h4>
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
        <p className="detail-value">
          {request.requested_at ? new Date(request.requested_at).toLocaleString() : 'N/A'}
        </p>
      </div>
      <div>
        <span className="detail-label">Status</span>
        <div>
          <span className={`status-pill status-${normalizeStatus(request.status)}`}>
            <i className={`bi ${getStatusIcon(request.status)}`}></i> {request.status}
          </span>
        </div>
      </div>
    </div>
  </div>
);

const BaseApplicantInfo = ({ request, buildFullName }) => (
  <div className="detail-section">
    <h4 className="detail-section-title">Applicant Information</h4>
    <div className="detail-grid">
      <div style={{ gridColumn: 'span 2' }}>
        <span className="detail-label">Full Name</span>
        <p className="detail-value text-capitalize">{buildFullName(request) || 'N/A'}</p>
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

// 1. Barangay Clearance Component
const BarangayClearanceTemplate = ({ request, getPublicUrl, commonInfo, applicantInfo }) => (
  <>
    {commonInfo}
    <hr className="detail-divider" />
    {applicantInfo}
    <hr className="detail-divider" />
    <div className="detail-section">
      <h4 className="detail-section-title">Additional Details</h4>
      <div className="detail-grid">
        <div>
          <span className="detail-label">Purpose</span>
          <p className="detail-value">{request.purpose || 'N/A'}</p>
        </div>
        <div>
          <span className="detail-label">Years in PB2</span>
          <p className="detail-value">{request.years_in_PB2 || 'N/A'}</p>
        </div>
        <div>
          <span className="detail-label">Precinct No.</span>
          <p className="detail-value">{request.precinct_no || 'N/A'}</p>
        </div>
        <div>
          <span className="detail-label">Sector</span>
          <p className="detail-value">{request.sector || 'N/A'}</p>
        </div>
      </div>
    </div>
    <hr className="detail-divider" />
    {(request.id_front || request.id_back || request.id_holding) && (
      <div className="detail-section">
        <h4 className="detail-section-title">Submitted Documents</h4>
        <div className="detail-media-grid">
          {request.id_front && (
            <div className="detail-media-card">
              <span className="detail-label">ID Front</span>
              <img src={getPublicUrl(request.id_front)} alt="ID Front" />
            </div>
          )}
          {request.id_back && (
            <div className="detail-media-card">
              <span className="detail-label">ID Back</span>
              <img src={getPublicUrl(request.id_back)} alt="ID Back" />
            </div>
          )}
          {request.id_holding && (
            <div className="detail-media-card">
              <span className="detail-label">ID Holding</span>
              <img src={getPublicUrl(request.id_holding)} alt="ID Holding Verification" />
            </div>
          )}
        </div>
      </div>
    )}
    {request.notes && (
      <div className="detail-section notes-highlight">
        <span className="detail-label">Remarks</span>
        <p className="detail-value">{request.notes}</p>
      </div>
    )}
  </>
);

// 2. Certificate of Residency Component
const CertificateResidencyTemplate = ({ request, getPublicUrl, commonInfo, applicantInfo }) => (
  <>
    {commonInfo}
    <hr className="detail-divider" />
    {applicantInfo}
    <hr className="detail-divider" />
    <div className="detail-section">
      <h4 className="detail-section-title">Residency Verification Details</h4>
      <div className="detail-grid">
        <div>
          <span className="detail-label">Purpose</span>
          <p className="detail-value">{request.purpose || 'N/A'}</p>
        </div>
        <div>
          <span className="detail-label">Residency Status</span>
          <p className="detail-value">{request.residency_status || 'N/A'}</p>
        </div>
        <div>
          <span className="detail-label">Years in PB2</span>
          <p className="detail-value">{request.years_in_PB2 || 'N/A'}</p>
        </div>
        <div>
          <span className="detail-label">Sector</span>
          <p className="detail-value">{request.sector || 'N/A'}</p>
        </div>
      </div>
    </div>
    <hr className="detail-divider" />
    {(request.valid_id || request.proof_doc) && (
      <div className="detail-section">
        <h4 className="detail-section-title">Submitted Documents</h4>
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
              <img src={getPublicUrl(request.proof_doc)} alt="Proof document" />
            </div>
          )}
        </div>
      </div>
    )}
  </>
);

// 3. Barangay ID Component
const BarangayIDTemplate = ({ request, getPublicUrl, commonInfo, applicantInfo }) => (
  <>
    {commonInfo}
    <hr className="detail-divider" />
    {applicantInfo}
    <hr className="detail-divider" />
    <div className="detail-section">
      <h4 className="detail-section-title">Physical Metrics & Background</h4>
      <div className="detail-grid">
        <div>
          <span className="detail-label">Place of Birth</span>
          <p className="detail-value">{request.birth_place || 'N/A'}</p>
        </div>
        <div>
          <span className="detail-label">Contact Number</span>
          <p className="detail-value">{request.contact_num || 'N/A'}</p>
        </div>
        <div>
          <span className="detail-label">Height / Weight</span>
          <p className="detail-value">{request.height || 'N/A'} | {request.weight || 'N/A'}</p>
        </div>
        <div>
          <span className="detail-label">Blood Type</span>
          <p className="detail-value">{request.blood_type || 'N/A'}</p>
        </div>
        <div style={{ gridColumn: 'span 2' }}>
          <span className="detail-label">TIN No.</span>
          <p className="detail-value font-mono">{request.tin_no || 'N/A'}</p>
        </div>
      </div>
    </div>
    <hr className="detail-divider" />
    <div className="detail-section">
      <h4 className="detail-section-title">Emergency Contact Person</h4>
      <div className="detail-grid">
        <div>
          <span className="detail-label">Contact Full Name</span>
          <p className="detail-value">{request.contact_person || 'N/A'}</p>
        </div>
        <div>
          <span className="detail-label">Relationship</span>
          <p className="detail-value">{request.contactp_relationship || 'N/A'}</p>
        </div>
        <div>
          <span className="detail-label">Contact Phone</span>
          <p className="detail-value">{request.contactp_num || 'N/A'}</p>
        </div>
        <div style={{ gridColumn: 'span 2' }}>
          <span className="detail-label">Emergency Address</span>
          <p className="detail-value">{request.emergency_address || 'N/A'}</p>
        </div>
      </div>
    </div>
    <hr className="detail-divider" />
    {(request.id_front || request.id_holding) && (
      <div className="detail-section">
        <h4 className="detail-section-title">Biometrics Identification</h4>
        <div className="detail-media-grid">
          {request.id_front && (
            <div className="detail-media-card">
              <span className="detail-label">ID Picture</span>
              <img src={getPublicUrl(request.id_front)} alt="ID Profile Pic" />
            </div>
          )}
          {request.id_holding && (
            <div className="detail-media-card">
              <span className="detail-label">Digital Signature</span>
              <img src={getPublicUrl(request.id_holding)} alt="Resident Signature" />
            </div>
          )}
        </div>
      </div>
    )}
  </>
);

// 4. Business Clearance Component
const BusinessClearanceTemplate = ({ request, getPublicUrl, commonInfo, applicantInfo }) => (
  <>
    {commonInfo}
    <hr className="detail-divider" />
    {applicantInfo}
    <hr className="detail-divider" />
    <div className="detail-section">
      <h4 className="detail-section-title">Commercial Enterprise Details</h4>
      <div className="detail-grid">
        <div style={{ gridColumn: 'span 2' }}>
          <span className="detail-label">Registered Business Name</span>
          <p className="detail-value text-primary" style={{ fontWeight: 700, fontSize: '1.1rem' }}>
            {request.business_name || 'N/A'}
          </p>
        </div>
        <div>
          <span className="detail-label">Business Type</span>
          <p className="detail-value">{request.business_type || 'N/A'}</p>
        </div>
        <div>
          <span className="detail-label">Nature of Operation</span>
          <p className="detail-value">{request.nature_business || 'N/A'}</p>
        </div>
        <div style={{ gridColumn: 'span 2' }}>
          <span className="detail-label">Business Location Address</span>
          <p className="detail-value">{request.business_address || 'N/A'}</p>
        </div>
        <div>
          <span className="detail-label">Authorized Contact Person</span>
          <p className="detail-value">{request.business_contact_person || 'N/A'}</p>
        </div>
        <div>
          <span className="detail-label">Business Hotline Number</span>
          <p className="detail-value font-mono">{request.business_contact_num || 'N/A'}</p>
        </div>
      </div>
    </div>
    <hr className="detail-divider" />
    {(request.id_front || request.id_back) && (
      <div className="detail-section">
        <h4 className="detail-section-title">Corporate Credentials</h4>
        <div className="detail-media-grid">
          {request.id_front && (
            <div className="detail-media-card">
              <span className="detail-label">Owner/Representative ID</span>
              <img src={getPublicUrl(request.id_front)} alt="Owner Valid ID" />
            </div>
          )}
          {request.id_back && (
            <div className="detail-media-card">
              <span className="detail-label">DTI / SEC Registration Proof</span>
              <img src={getPublicUrl(request.id_back)} alt="DTI Registration Cert" />
            </div>
          )}
        </div>
      </div>
    )}
  </>
);

// 5. Certificate of Indigency Component
const CertificateIndigencyTemplate = ({ request, getPublicUrl, commonInfo, applicantInfo }) => (
  <>
    {commonInfo}
    <hr className="detail-divider" />
    {applicantInfo}
    <hr className="detail-divider" />
    <div className="detail-section">
      <h4 className="detail-section-title">Socio-Economic Financial Statement</h4>
      <div className="detail-grid">
        <div>
          <span className="detail-label">Stated Purpose</span>
          <p className="detail-value">{request.purpose || 'N/A'}</p>
        </div>
        <div>
          <span className="detail-label">Employment Status</span>
          <p className="detail-value">{request.employment_status || 'N/A'}</p>
        </div>
        <div style={{ gridColumn: 'span 2' }}>
          <span className="detail-label">Estimated Monthly Household Income</span>
          <p className="detail-value" style={{ color: '#b45309', fontWeight: 700, fontSize: '1.15rem' }}>
            {request.monthly_income ? `₱${parseFloat(request.monthly_income).toLocaleString(undefined, {minimumFractionDigits: 2})}` : '₱0.00'}
          </p>
        </div>
      </div>
    </div>
    <hr className="detail-divider" />
    {(request.valid_id || request.proof_doc) && (
      <div className="detail-section">
        <h4 className="detail-section-title">Required Income Evidence Documents</h4>
        <div className="detail-media-grid">
          {request.valid_id && (
            <div className="detail-media-card">
              <span className="detail-label">Valid Government ID</span>
              <img src={getPublicUrl(request.valid_id)} alt="Income Valid ID" />
            </div>
          )}
          {request.proof_doc && (
            <div className="detail-media-card">
              <span className="detail-label">Indigency Proof Attachment</span>
              <img src={getPublicUrl(request.proof_doc)} alt="Proof of Indigency Document" />
            </div>
          )}
        </div>
      </div>
    )}
    {request.notes && (
      <div className="detail-section notes-highlight">
        <span className="detail-label">Purpose Explanatory Notes</span>
        <p className="detail-value">{request.notes}</p>
      </div>
    )}
  </>
);

// 6. Volunteer Registration Component
const VolunteerRegistrationTemplate = ({ request, getPublicUrl, commonInfo }) => (
  <>
    {commonInfo}
    <hr className="detail-divider" />
    <div className="detail-section">
      <h4 className="detail-section-title">Volunteer Core Contact Info</h4>
      <div className="detail-grid">
        <div style={{ gridColumn: 'span 2' }}>
          <span className="detail-label">Full Name</span>
          <p className="detail-value text-capitalize">{request.name || 'N/A'}</p>
        </div>
        <div style={{ gridColumn: 'span 2' }}>
          <span className="detail-label">Residential Address</span>
          <p className="detail-value">{request.address || 'N/A'}</p>
        </div>
        <div>
          <span className="detail-label">Mobile Number</span>
          <p className="detail-value font-mono">{request.contact_num || 'N/A'}</p>
        </div>
        <div>
          <span className="detail-label">Active Email Address</span>
          <p className="detail-value">{request.email || 'N/A'}</p>
        </div>
      </div>
    </div>
    <hr className="detail-divider" />
    <div className="detail-section">
      <h4 className="detail-section-title">Community Service Profile</h4>
      <div className="detail-grid">
        <div>
          <span className="detail-label">Target Program Area</span>
          <p className="detail-value text-primary" style={{ fontWeight: 700 }}>{request.program_area || 'N/A'}</p>
        </div>
        <div>
          <span className="detail-label">Time Availability Structure</span>
          <p className="detail-value">{request.availability || 'N/A'}</p>
        </div>
        <div style={{ gridColumn: 'span 2' }}>
          <span className="detail-label">Current Professional Occupation</span>
          <p className="detail-value">{request.occupation || 'N/A'}</p>
        </div>
        <div style={{ gridColumn: 'span 2' }}>
          <span className="detail-label">Special Skills / Interests Logs</span>
          <p className="detail-value" style={{ background: '#f1f5f9', padding: '10px 14px', borderRadius: '8px' }}>
            {request.skills || 'No specialized skills provided.'}
          </p>
        </div>
      </div>
    </div>
    {request.valid_id && (
      <>
        <hr className="detail-divider" />
        <div className="detail-section">
          <h4 className="detail-section-title">Accountability Verification ID</h4>
          <div className="detail-media-grid" style={{ gridTemplateColumns: 'max-content' }}>
            <div className="detail-media-card">
              <span className="detail-label">Valid ID Copy</span>
              <img src={getPublicUrl(request.valid_id)} alt="Volunteer ID Proof" style={{ maxWidth: '320px' }} />
            </div>
          </div>
        </div>
      </>
    )}
  </>
);


// ==========================================
//     MAIN REFACTORED LOADER METHOD
// ==========================================

const renderDocumentDetails = (request) => {
  const type = request.type?.toLowerCase() || '';

  // Generate reusable sub-elements
  const commonInfo = (
    <CommonRequestInfo 
      request={request} 
      normalizeStatus={normalizeStatus} 
      getStatusIcon={getStatusIcon} 
    />
  );
  
  const applicantInfo = (
    <BaseApplicantInfo 
      request={request} 
      buildFullName={buildFullName} 
    />
  );

  // Call template components conditionally depending on type
  if (type.includes('clearance') && !type.includes('business')) {
    return <BarangayClearanceTemplate request={request} getPublicUrl={getPublicUrl} commonInfo={commonInfo} applicantInfo={applicantInfo} />;
  }
  if (type.includes('residency')) {
    return <CertificateResidencyTemplate request={request} getPublicUrl={getPublicUrl} commonInfo={commonInfo} applicantInfo={applicantInfo} />;
  }
  if (type.includes('barangay id') || type.includes('id')) {
    return <BarangayIDTemplate request={request} getPublicUrl={getPublicUrl} commonInfo={commonInfo} applicantInfo={applicantInfo} />;
  }
  if (type.includes('business')) {
    return <BusinessClearanceTemplate request={request} getPublicUrl={getPublicUrl} commonInfo={commonInfo} applicantInfo={applicantInfo} />;
  }
  if (type.includes('indigency')) {
    return <CertificateIndigencyTemplate request={request} getPublicUrl={getPublicUrl} commonInfo={commonInfo} applicantInfo={applicantInfo} />;
  }
  if (type.includes('volunteer')) {
    return <VolunteerRegistrationTemplate request={request} getPublicUrl={getPublicUrl} commonInfo={commonInfo} />;
  }
 


// Programmatic trigger interface execution for client-side PDF downscaling
  const executeDownloadPDFReceipt = () => {
    if (!printRequest) return;
    
    // Dynamically query script context if absent from header templates
    if (!window.html2pdf) {
      const script = document.createElement('script');
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js";
      script.onload = () => initiatePDFRenderingPipeline();
      document.head.appendChild(script);
    } else {
      initiatePDFRenderingPipeline();
    }
  };

  const initiatePDFRenderingPipeline = () => {
    const targetElement = document.getElementById('pb2-printable-sheet-element') || document.querySelector('.brgy-id-card-print-container');
    if (!targetElement) return;

    const safeFilename = `${printRequest.type.replace(/\s+/g, '_')}_${(printRequest.name || 'document').replace(/\s+/g, '_')}.pdf`;
    
    const configurationOptions = {
      margin: 0,
      filename: safeFilename,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2.5, useCORS: true, letterRendering: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    window.html2pdf().set(configurationOptions).from(targetElement).save()
      .then(() => showToast("Success: Document downloaded successfully."))
      .catch((err) => console.error("PDF engine crash context:", err));
  };




  // Fallback if type doesn't explicitly match anything above
  return (
    <>
      {commonInfo}
      <hr className="detail-divider" />
      {applicantInfo}
      {request.notes && (
        <div className="detail-section notes-highlight">
          <span className="detail-label">Additional System Notes</span>
          <p className="detail-value">{request.notes}</p>
        </div>
      )}
    </>
  );
};








  // Helper for Status Badge Colors
  const getStatusClass = (status) => {
    const s = (status || '').toLowerCase();
    if (s.includes('pending')) return 'status-pending';
    if (s.includes('process')) return 'status-processing';
    if (s.includes('ready') || s.includes('approve') || s.includes('claim')) return 'status-approved';
    if (s.includes('decline') || s.includes('reject')) return 'status-rejected';
    return 'status-default';
  };

  return (
    <div id="pb2-documents-exclusive" className="admin-page-container">
      
      {/* HEADER SECTION */}
      <div className="doc-header-wrap">
        <div className="header-text">
          <h2><i className="bi bi-folder-check"></i> Document Operations</h2>
          <p>Manage incoming requests, filter by type, and export records.</p>
        </div>
        <button className="btn-export" onClick={exportToCSV}>
          <i className="bi bi-file-earmark-spreadsheet"></i> Export to CSV
        </button>
      </div>

      {/* TOAST NOTIFICATION */}
      {message && (
        <div className="doc-toast">
          <i className="bi bi-check-circle-fill" style={{ color: '#059669', fontSize: '1.2rem' }}></i>
          {message}
        </div>
      )}

      {/* CONTROLS PANEL (Tabs, Search, Filter) */}
      <div className="controls-panel">
        
        {/* Horizontal Scrollable Tabs */}
        <div className="tabs-container">
          {DOCUMENT_TABS.map(tab => (
            <button 
              key={tab} 
              className={`tab-btn ${activeTab === tab ? 'active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Search and Status Filters */}
        <div className="filters-row">
          <div className="search-box">
            <i className="bi bi-search"></i>
            <input 
              type="text" 
              placeholder="Search resident name or tracking code..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          
          <div className="filter-box">
            <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value)}>
              <option value="Newest">Newest First</option>
              <option value="Oldest">Oldest First</option>
            </select>
          </div>

          <div className="filter-box">
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="All">All Statuses</option>
              <option value="Pending">Pending</option>
              <option value="Processing">Processing</option>
              <option value="Ready">Ready for Pickup</option>
              <option value="Approved">Approved</option>
              <option value="Declined">Declined</option>
            </select>
          </div>
        </div>
      </div>

      {/* DATA TABLE */}
      <div className="doc-table-card">
        <table className="doc-table">
          <thead>
            <tr>
              <th style={{textAlign: 'center' }}>Resident Name</th>
              <th style={{textAlign: 'center' }}>Document Type</th>
              <th style={{textAlign: 'center' }}>Tracking Code</th>
              <th style={{textAlign: 'center' }}>Date Requested</th>
              <th style={{textAlign: 'center' }}>Current Status</th>
              <th style={{textAlign: 'center' }}>Administrative Actions</th>
            </tr>
          </thead>

    {/* Centered View Details Modal */}
{selectedRequest && (
  <div className="detail-modal-overlay" onClick={() => setSelectedRequest(null)}>
    <div className="detail-modal" role="document" aria-modal="true" onClick={(e) => e.stopPropagation()}>
      <div className="detail-modal-header">
        <div>
          <p className="detail-modal-subtitle">{selectedRequest.type || 'Document Request'}</p>
          <h2>{selectedRequest.tracking_code}</h2>
          <span className={`status-pill status-${normalizeStatus(selectedRequest.status)}`}>
            <i className={`bi ${getStatusIcon(selectedRequest.status)}`}></i> {selectedRequest.status}
          </span>
        </div>
        <button className="detail-close-btn" onClick={() => setSelectedRequest(null)} type="button" aria-label="Close details">
          <i className="bi bi-x-lg"></i>
        </button>
      </div>

      <div className="detail-modal-body">
        {renderDocumentDetails(selectedRequest)}
      </div>
    </div>
  </div>
)}

{/* NEW INTERCEPT MODAL: Administrative Update Context & Custom Notification Messages Wrapper */}
{actionContext && (
  <div className="detail-modal-overlay" onClick={() => setActionContext(null)}>
    <div className="detail-modal admin-workflow-modal" onClick={(e) => e.stopPropagation()}>
      
      {/* Header Section */}
      <div className="workflow-modal-header">
        <div className="workflow-header-content">
          <p className="detail-modal-subtitle">Update Action Workflow</p>
          <h2>Configure Status Execution</h2>
          <p className="workflow-header-meta">
            Setting status to <span className={`status-pill status-${normalizeStatus(actionContext.targetStatus)}`}>{actionContext.targetStatus}</span> for tracking code <span className="track-code font-mono">{actionContext.itemObject.tracking_code}</span>
          </p>
        </div>
        <button className="detail-close-btn" onClick={() => setActionContext(null)} type="button" aria-label="Close modal">
          <i className="bi bi-x-lg"></i>
        </button>
      </div>

      <div className="detail-modal-body workflow-modal-body">
        
        {/* Compressed Quick Information Summary Card */}
        <div className="workflow-summary-card">
          <div className="summary-card-title">
            <i className="bi bi-file-earmark-text-fill"></i>
            <h5>Summary of Submitted Data</h5>
          </div>
          <div className="workflow-summary-grid">
            <div className="summary-field">
              <span className="summary-label">Resident Name</span> 
              <p className="summary-value text-capitalize">{buildFullName(actionContext.itemObject)}</p>
            </div>
            <div className="summary-field">
              <span className="summary-label">Document Type</span> 
              <p className="summary-value">{actionContext.itemObject.type}</p>
            </div>
            {actionContext.itemObject.purpose && (
              <div className="summary-field full-width">
                <span className="summary-label">Stated Purpose</span> 
                <p className="summary-value">{actionContext.itemObject.purpose}</p>
              </div>
            )}
            {actionContext.itemObject.address && (
              <div className="summary-field full-width">
                <span className="summary-label">Registered Address</span> 
                <p className="summary-value">{actionContext.itemObject.address}</p>
              </div>
            )}
          </div>
        </div>

        {/* Input Form Field Section */}
        <div className="workflow-input-group">
          <label className="detail-label workflow-input-label">
            <i className="bi bi-chat-left-text-fill"></i> Additional message / Process Instruction Notes
          </label>
          <textarea
            className="workflow-textarea"
            placeholder="Type instructions, pick-up times, or specific structural requirements to append into custom log tracking notes here..."
            value={actionContext.adminRemarks}
            onChange={(e) => setActionContext({ ...actionContext, adminRemarks: e.target.value })}
          />
          <p className="workflow-hint">
            <i className="bi bi-info-circle"></i> This text note will save dynamically directly to the Barangay database.
          </p>
        </div>

        {/* Action Controls Footer Group */}
        <div className="workflow-modal-footer">
          <button 
            type="button" 
            className="workflow-btn-cancel"
            onClick={() => setActionContext(null)}
          >
            Cancel
          </button>
          <button 
            type="button" 
            className={`workflow-btn-submit ${actionContext.targetStatus === 'Declined' ? 'is-danger' : 'is-success'}`}
            onClick={processStatusUpdateWithRemarks}
          >
            <i className="bi bi-cloud-arrow-up-fill"></i> Save & Execute Update
          </button>
        </div>

            </div>
          </div>
        </div>
      )}

          <tbody>
            {filteredData.length === 0 ? (
              <tr>
                <td colSpan="6" style={{ textAlign: 'center', padding: '60px', color: '#94a3b8' }}>
                  <i className="bi bi-search" style={{ fontSize: '2.5rem', display: 'block', margin: '0 auto 15px', opacity: '0.3' }}></i>
                  No records match your current filters.
                </td>
              </tr>
            ) : (
              filteredData.map((item) => (
                <tr key={`${item.type}-${item.request_id}`}>
                  <td>
                    <div style={{ fontWeight: '700', color: '#1e293b' }}>{item.name}</div>
                  </td>
                  <td>
                    <i className="bi bi-file-earmark-text" style={{ color: '#059669', marginRight: '0px' }}></i>
                    {item.type}
                  </td>
                  <td>
                    <span className="track-code">{item.tracking_code}</span>
                  </td>
                  <td>
                    <span className="track-code">{item.requested_at ? new Date(item.requested_at).toLocaleDateString() : 'N/A'}</span>
                  </td>
                  <td>
                    <span className={`status-pill ${getStatusClass(item.status)}`}>
                      {item.status}
                    </span>
                  </td>
                  <td>
                    {/* Action Panel updated to safely trigger intermediate custom actions */}
                  <div className="action-group">
                    <button 
                      className="action-btn btn-view" 
                      onClick={() => setSelectedRequest(item)}
                      title="View Details"
                    >
                      <i className="bi bi-eye"></i>
                    </button>

                    <button 
                      className="action-btn btn-process" 
                      onClick={() => handleInitiateUpdate(item, 'Processing')}
                      title="Mark as Processing"
                    >
                      <i className="bi bi-gear-fill"></i> Process
                    </button>
                    <button 
                      className="action-btn btn-ready" 
                      onClick={() => handleInitiateUpdate(item, 'Ready for Pick Up')}
                      title="Mark as Ready for Pickup"
                    >
                      <i className="bi bi-check2-all"></i> Ready
                    </button>
                    <button 
                      className="action-btn btn-decline" 
                      onClick={() => handleInitiateUpdate(item, 'Declined')}
                      title="Decline Request"
                    >
                      <i className="bi bi-x-octagon-fill"></i> Decline
                    </button>

                    <button 
                    type="button"
                    className="action-btn" 
                    style={{ background: '#f8fafc', color: '#0f172a', border: '1px solid #cbd5e1' }}
                    onClick={() => setPrintRequest(item)}
                    title="Print / Generate Official Document"
                  >
                    <i className="bi bi-printer-fill"></i> Print
                  </button>

                  </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

    {/* =======================================================
         NEW FEATURE MODAL: OFFICIAL SYSTEM LIVE PRINT OVERLAY 
         ======================================================= */}
     {printRequest && (
  <div className="detail-modal-overlay brgy-print-overlay" onClick={() => setPrintRequest(null)}>
    <div className="brgy-print-action-bar-floating" onClick={(e) => e.stopPropagation()}>
  <div className="print-bar-text">
    <i className="bi bi-file-earmark-pdf-fill" style={{ color: '#ecfdf5' }}></i>
    <span><strong>Print Workspace:</strong> {printRequest.tracking_code}</span>
  </div>
  <div style={{ display: 'flex', gap: '8px', marginTop: '60px' }}>
    
    {/* NEW FEATURE ACTION BUTTON: Seamless addition to your top group */}
    <button 
      type="button" 
      className="print-bar-btn" 
      onClick={() => executePDFDownload(printRequest)}
      style={{ 
        background: '#0284c7', 
        color: '#ffffff', 
        display: 'inline-flex', 
        alignItems: 'center', 
        gap: '6px' 
      }}
    >
      <i className="bi bi-download"></i> Download PDF
    </button>

    <button type="button" className="print-bar-btn print-execute" onClick={() => window.print()}>
      <i className="bi bi-printer"></i> Print Document / ID
    </button>
    <button type="button" className="print-bar-btn print-close" onClick={() => setPrintRequest(null)}>
      Close Preview
    </button>
  </div>
</div>

    {/* Dynamic layout engine switching formats between A4 Certificates vs ID Cards */}
    {printRequest.type === 'Barangay ID' ? (
      <div className="id-card-strict-print-page" onClick={(e) => e.stopPropagation()}>
        <PrintBarangayIDCard request={printRequest} buildFullName={buildFullName} getPublicUrl={getPublicUrl} />
      </div>
    ) : (
     
<div className="brgy-print-paper-sheet-a4" id="pb2-printable-sheet-element" onClick={(e) => e.stopPropagation()}>
  <div className="brgy-print-paper-inner">
    <DocumentPrintSidebar />
    <div className="brgy-print-main-content-area">
      <PrintHeaderAndTitle />
      <h1 className="brgy-print-document-main-title">{(printRequest.type || 'Certification').toUpperCase()}</h1>
      
      {/* Ensure internal layout is clean */}
      <div className="brgy-print-document-body-content">
         <RenderPrintDocumentContent request={printRequest} buildFullName={buildFullName} />
      </div>

      <PrintFooterSignatures 
        orNo={printRequest.tracking_code ? printRequest.tracking_code.split('-')[2] : undefined} 
      />
    </div>
  </div>
</div>
    )}
  </div>
)}


    </div>
  );
};

export default Documents;