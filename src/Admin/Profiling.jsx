import React, { useEffect, useState, useMemo } from 'react';
import axios from 'axios';
import './Profiling.css';

const Profiling = () => {
  const [residents, setResidents] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedResident, setSelectedResident] = useState(null);
  
  const [statusModal, setStatusModal] = useState({
    show: false,
    resident: null,
    newStatus: '',
    adminRemarks: '',
    editableData: null
  });

  const [activeFilterTab, setActiveFilterTab] = useState('Location');
  const [sortOrder, setSortOrder] = useState('asc'); 
  const [filters, setFilters] = useState({
    subdivision: '',
    street: '',
    residentStatus: '',
    sector: '',
    age: '',
    civilStatus: '',
    accountStatus: ''
  });

  useEffect(() => {
    fetchResidents();
  }, []);

  const fetchResidents = () => {
    axios.get('/api_backend/get_residents.php')
      .then(res => { 
        if(res.data.success) setResidents(res.data.data); 
      })
      .catch(err => console.error("Failed to fetch residents:", err));
  };

  const uniqueSubdivisions = useMemo(() => {
    return [...new Set(residents.map(r => r.subdivision).filter(Boolean))].sort();
  }, [residents]);

  const uniqueStreets = useMemo(() => {
    let filtered = residents;
    if (filters.subdivision) {
      filtered = residents.filter(r => r.subdivision === filters.subdivision);
    }
    return [...new Set(filtered.map(r => r.street).filter(Boolean))].sort();
  }, [residents, filters.subdivision]);

  const handleFilterChange = (field, value) => {
    setFilters(prev => ({
      ...prev,
      [field]: value,
      ...(field === 'subdivision' ? { street: '' } : {}) 
    }));
  };

  const clearFilters = () => {
    setFilters({ subdivision: '', street: '', residentStatus: '', sector: '', age: '', civilStatus: '', accountStatus: '' });
    setSearchTerm('');
  };

  const filteredResidents = useMemo(() => {
    return residents.filter(r => {
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch = 
        (r.fName || '').toLowerCase().includes(searchLower) ||
        (r.lName || '').toLowerCase().includes(searchLower) ||
        (r.full_name || '').toLowerCase().includes(searchLower) || 
        (r.resident_id || '').toString().includes(searchLower) ||
        (r.user_id || '').toString().includes(searchLower);
      
      if (!matchesSearch) return false;

      if (filters.subdivision && r.subdivision !== filters.subdivision) return false;
      if (filters.street && r.street !== filters.street) return false;
      if (filters.residentStatus && r.residency_status !== filters.residentStatus) return false;

      if (filters.sector) {
        if (filters.sector === 'Senior Citizens' && parseInt(r.is_senior) !== 1) return false;
        if (filters.sector === 'PWD' && parseInt(r.is_pwd) !== 1) return false;
        if (filters.sector === 'Solo parent' && parseInt(r.is_solo_parent) !== 1) return false;
        if (filters.sector === 'Indigent' && parseInt(r.is_indigent) !== 1) return false;
        if (filters.sector === '4ps Beneficiaries' && parseInt(r.is_4ps) !== 1) return false;
      }

      if (filters.age) {
        const age = parseInt(r.age) || 0;
        if (filters.age === 'Minor' && age >= 18) return false;
        if (filters.age === 'above 18' && (age < 18 || age >= 60)) return false;
        if (filters.age === 'Senior' && age < 60) return false;
      }

      if (filters.civilStatus && r.civil_status !== filters.civilStatus) return false;
      if (filters.accountStatus && r.status !== filters.accountStatus) return false;

      return true;
    }).sort((a, b) => {
      const nameA = (a.full_name || '').toLowerCase();
      const nameB = (b.full_name || '').toLowerCase();
      return sortOrder === 'asc' ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
    });
  }, [residents, searchTerm, filters, sortOrder]);

  const handleUpdateStatus = async () => {
    try {
      const fileKeys = [
        'valid_id_img_front', 'valid_id_img_back', 'valid_id_img_holding',
        'proof_pwd', 'proof_4ps', 'proof_solo_parent', 'proof_indigent', 'proof_senior'
      ];

      const hasFiles = fileKeys.some(key => statusModal.editableData?.[key] instanceof File);
      let res;

      if (hasFiles) {
        const formData = new FormData();
        formData.append('resident_id', statusModal.resident.resident_id);
        formData.append('status', statusModal.newStatus);
        
        if (statusModal.newStatus === 'Action Required') {
          formData.append('admin_remarks', statusModal.adminRemarks);
        }

        Object.entries(statusModal.editableData || {}).forEach(([key, value]) => {
          if (value instanceof File) {
            formData.append(key, value);
          } else if (value !== null && value !== undefined) {
            formData.append(`editableData[${key}]`, String(value));
          }
        });

        res = await axios.post('/api_backend/update_resident_status.php', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
      } else {
        const payload = {
          resident_id: statusModal.resident.resident_id,
          status: statusModal.newStatus,
          admin_remarks: statusModal.newStatus === 'Action Required' ? statusModal.adminRemarks : null,
          editableData: statusModal.editableData
        };
        res = await axios.post('/api_backend/update_resident_status.php', payload);
      }

      if (res.data.success) {
        await fetchResidents();
        setStatusModal({ show: false, resident: null, newStatus: '', adminRemarks: '', editableData: null });
      } else {
        alert("Failed to update status: " + res.data.message);
      }
    } catch (err) {
      console.error("Error updating status:", err);
      alert("An error occurred while updating the status.");
    }
  };

  const val = (data) => data && String(data).trim() !== '' ? data : <span className="empty-val">N/A</span>;
  const boolVal = (data) => parseInt(data) === 1 ? <span className="badge-yes">Yes</span> : <span className="badge-no">No</span>;

  const handleEditableChange = (field, value) => {
    setStatusModal(prev => ({
      ...prev,
      editableData: {
        ...prev.editableData,
        [field]: value
      }
    }));
  };

  const editVal = (field) => {
    if (statusModal.editableData && field in statusModal.editableData) {
      return statusModal.editableData[field] ?? '';
    }
    return '';
  };

  const isTabActive = (tab) => {
    if(tab === 'Location') return filters.subdivision || filters.street || filters.residentStatus;
    if(tab === 'Sector') return filters.sector;
    if(tab === 'Demographics') return filters.age || filters.civilStatus;
    if(tab === 'Account') return filters.accountStatus;
    return false;
  };

  const openStatusModal = (r) => {
    setStatusModal({ 
      show: true, 
      resident: r, 
      newStatus: r.status || 'Active', 
      adminRemarks: r.admin_remarks || '',
      editableData: { ...r }
    });
  };

  return (
    <div className="admin-page-container">
      {/* HEADER & SEARCH */}
      <div className="page-header">
        <div className="header-titles">
          <h2>Resident Profiling</h2>
          <p>Manage, filter, and view comprehensive resident records.</p>
        </div>
        <div className="search-wrapper">
          <i className="bi bi-search search-icon"></i>
          <input 
            type="text" 
            placeholder="Search by Resident ID, User ID, Name..." 
            className="search-input"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* FILTER CONTROL PANEL */}
      <div className="filter-panel">
        <div className="filter-tabs">
          {['Location', 'Sector', 'Demographics', 'Account'].map(tab => (
            <button 
              key={tab}
              className={`filter-tab-btn ${activeFilterTab === tab ? 'active' : ''}`}
              onClick={() => setActiveFilterTab(tab)}
            >
              {tab} {isTabActive(tab) && <span className="filter-dot"></span>}
            </button>
          ))}
          <div className="filter-actions-right">
             <button className="sort-btn" onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}>
               <i className={`bi bi-sort-alpha-${sortOrder === 'asc' ? 'down' : 'up'}`}></i> {sortOrder === 'asc' ? 'A-Z' : 'Z-A'}
             </button>
             <button className="clear-filter-btn" onClick={clearFilters}><i className="bi bi-x-circle"></i> Clear</button>
          </div>
        </div>

        <div className="filter-content">
          {activeFilterTab === 'Location' && (
            <div className="filter-group-row">
              <div className="filter-item">
                <label>Subdivision</label>
                <select value={filters.subdivision} onChange={(e) => handleFilterChange('subdivision', e.target.value)}>
                  <option value="">All Subdivisions</option>
                  {uniqueSubdivisions.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="filter-item">
                <label>Street</label>
                <select value={filters.street} onChange={(e) => handleFilterChange('street', e.target.value)}>
                  <option value="">All Streets</option>
                  {uniqueStreets.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="filter-item">
                <label>Resident Status</label>
                <select value={filters.residentStatus} onChange={(e) => handleFilterChange('residentStatus', e.target.value)}>
                  <option value="">All Types</option>
                  <option value="Homeowner">Homeowner</option>
                  <option value="Tenant">Tenant</option>
                  <option value="Sharer">Sharer</option>
                </select>
              </div>
            </div>
          )}

          {activeFilterTab === 'Sector' && (
            <div className="filter-group-row">
              <div className="filter-item">
                <label>Sector</label>
                <select value={filters.sector} onChange={(e) => handleFilterChange('sector', e.target.value)}>
                  <option value="">All Sectors</option>
                  <option value="Senior Citizens">Senior Citizens</option>
                  <option value="PWD">PWD</option>
                  <option value="Solo parent">Solo parent</option>
                  <option value="Indigent">Indigent</option>
                  <option value="4ps Beneficiaries">4ps Beneficiaries</option>
                </select>
              </div>
            </div>
          )}

          {activeFilterTab === 'Demographics' && (
            <div className="filter-group-row">
              <div className="filter-item">
                <label>Age Bracket</label>
                <select value={filters.age} onChange={(e) => handleFilterChange('age', e.target.value)}>
                  <option value="">All Ages</option>
                  <option value="Minor">Minor</option>
                  <option value="above 18">Above 18</option>
                  <option value="Senior">Senior</option>
                </select>
              </div>
              <div className="filter-item">
                <label>Civil Status</label>
                <select value={filters.civilStatus} onChange={(e) => handleFilterChange('civilStatus', e.target.value)}>
                  <option value="">All Statuses</option>
                  <option value="Single">Single</option>
                  <option value="Married">Married</option>
                  <option value="Widowed">Widowed</option>
                  <option value="Separated">Separated</option>
                </select>
              </div>
            </div>
          )}

          {activeFilterTab === 'Account' && (
            <div className="filter-group-row">
              <div className="filter-item">
                <label>Account Status</label>
                <select value={filters.accountStatus} onChange={(e) => handleFilterChange('accountStatus', e.target.value)}>
                  <option value="">All Statuses</option>
                  <option value="Pending">Pending</option>
                  <option value="Active">Active</option>
                  <option value="Action Required">Action Required</option>
                  <option value="Archived">Archive</option>
                </select>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* DATA TABLE */}
      <div className="table-card">
        <div className="table-header-info">
          Showing <strong>{filteredResidents.length}</strong> resident(s)
        </div>
        <table className="admin-table">
          <thead>
          <tr>
            <th style={{ width: '12%' }}>RESIDENT ID</th>
            <th style={{ width: '12%' }}>USER ID</th>
             <th style={{ width: '12%' }}>CONTROL NUMBER</th>
            <th style={{ width: '25%' }}>FULL NAME</th>
            <th style={{ width: '21%' }}>ADDRESS</th>
            <th style={{ width: '5%' }}>AGE</th>
            <th style={{ width: '10%' }}>STATUS</th>
            <th style={{ width: '15%', textAlign:'center' }}>ACTIONS</th>
          </tr>
        </thead>
          <tbody>
            {filteredResidents.map(r => (
              <tr key={r.resident_id}>
                <td><span className="id-badge">{r.resident_id}</span></td>
                <td><span className="id-badge">{r.user_id}</span></td>
                <td><span className="id-badge">{r.control_num}</span></td>
                 <td className="fw-bold">{r.full_name}</td>
                <td className="text-truncate" style={{maxWidth: '180px'}} title={r.full_address}>{r.full_address}</td>
                <td>{r.age || 'N/A'}</td>
                <td>
                  <span className={`status-pill ${(r.status || '').toLowerCase().replace(/\s+/g, '-')}`}>
                    {r.status || 'Unknown'}
                  </span>
                </td>
                <td className="actions-cell">
                  <button className="action-btn view-btn" onClick={() => setSelectedResident(r)}>
                    <i className="bi bi-eye"></i> View Profile
                  </button>
                  <button className="action-btn status-btn" onClick={() => openStatusModal(r)}>
                    <i className="bi bi-gear"></i> Change Status
                  </button>
                </td>
              </tr>
            ))}
            {filteredResidents.length === 0 && (
              <tr>
                <td colSpan="7" className="text-center empty-state">
                  <div className="empty-state-content">
                    <i className="bi bi-folder2-open"></i>
                    <p>No residents match your current filters and search criteria.</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ==============================================================
          1. FULL PROFILE DETAILS MODAL (READ ONLY) - METICULOUSLY EXPANDED
      ============================================================== */}
      {selectedResident && (
        <div className="glass-modal-overlay" onClick={() => setSelectedResident(null)}>
          <div className="glass-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-clean">
              <div className="modal-title-area">
                <h3>{selectedResident.full_name}</h3>
                <span className={`status-pill ${(selectedResident.status || '').toLowerCase().replace(/\s+/g, '-')}`}>
                  {selectedResident.status || 'Unknown'}
                </span>
              </div>
              <button className="close-modern-btn" onClick={() => setSelectedResident(null)}>
                <i className="bi bi-x-lg"></i>
              </button>
            </div>
            
            <div className="modal-scroll-area bg-light">
              <div className="info-group card-shadow">
                <h4 className="group-title"><i className="bi bi-person-lines-fill"></i> Personal Information</h4>
                <div className="info-grid">
                  <div className="info-item"><label>Resident ID</label><span>{val(selectedResident.resident_id)}</span></div>
                  <div className="info-item"><label>User ID</label><span>{val(selectedResident.user_id)}</span></div>
                  <div className="info-item"><label>Control Number</label><span>{val(selectedResident.control_num)}</span></div>
                  <div className="info-item"><label>First Name</label><span>{val(selectedResident.fName)}</span></div>
                  <div className="info-item"><label>Middle Name</label><span>{val(selectedResident.mName)}</span></div>
                  <div className="info-item"><label>Last Name</label><span>{val(selectedResident.lName)}</span></div>
                  <div className="info-item"><label>Suffix</label><span>{val(selectedResident.suffix)}</span></div>
                  <div className="info-item"><label>Gender</label><span>{val(selectedResident.gender)}</span></div>
                  <div className="info-item"><label>Birth Date</label><span>{val(selectedResident.birth_date)} (Age: {selectedResident.age})</span></div>
                  
                  {/* Expanded Birthplace */}
                  <div className="info-item"><label>Birth City</label><span>{val(selectedResident.birth_city)}</span></div>
                  <div className="info-item"><label>Birth Province</label><span>{val(selectedResident.birth_province)}</span></div>
                  <div className="info-item"><label>Birth Country</label><span>{val(selectedResident.birth_country)}</span></div>

                  <div className="info-item"><label>Height (cm)</label><span>{val(selectedResident.height)}</span></div>
                  <div className="info-item"><label>Blood Type</label><span>{val(selectedResident.blood_type)}</span></div>
                  <div className="info-item"><label>Religion</label><span>{val(selectedResident.religion)}</span></div>
                  <div className="info-item"><label>Civil Status</label><span>{val(selectedResident.civil_status)}</span></div>
                  <div className="info-item"><label>Spouse Name</label><span>{val(selectedResident.spouse_name_text)}</span></div>
                </div>
              </div>

              <div className="info-group card-shadow">
                <h4 className="group-title"><i className="bi bi-geo-alt-fill"></i> Contact & Location Breakdown</h4>
                <div className="info-grid">
                  <div className="info-item"><label>Contact Number</label><span>{val(selectedResident.contact_num)}</span></div>
                  <div className="info-item"><label>Email Address</label><span>{val(selectedResident.email)}</span></div>
                  
                  {/* Granular Address breakdown */}
                  <div className="info-item"><label>House No.</label><span>{val(selectedResident.house_no)}</span></div>
                  <div className="info-item"><label>Street</label><span>{val(selectedResident.street)}</span></div>
                  <div className="info-item"><label>Subdivision</label><span>{val(selectedResident.subdivision)}</span></div>
                  <div className="info-item"><label>Zone / Purok</label><span>{val(selectedResident.zone)}</span></div>
                  <div className="info-item"><label>Block & Lot</label><span>{val(selectedResident.block_lot)}</span></div>
                  <div className="info-item"><label>Area</label><span>{val(selectedResident.area)}</span></div>
                  <div className="info-item"><label>Landmark</label><span>{val(selectedResident.landmark)}</span></div>
                  
                  <div className="info-item"><label>Full Formatted Address</label><span className="span-full">{val(selectedResident.full_address)}</span></div>
                  <div className="info-item"><label>Residency Status</label><span>{val(selectedResident.residency_status)}</span></div>
                  <div className="info-item"><label>Years in PB2</label><span>{val(selectedResident.years_in_PB2)}</span></div>
                  <div className="info-item"><label>Date Registered</label><span>{val(selectedResident.date_registered)}</span></div>
                </div>
              </div>

              <div className="info-group card-shadow">
                <h4 className="group-title"><i className="bi bi-shield-fill-check"></i> Sector & Emergency Info</h4>
                <div className="info-grid">
                  <div className="info-item"><label>Primary Sector</label><span>{val(selectedResident.sector)}</span></div>
                  <div className="info-item"><label>Senior Citizen?</label><span>{boolVal(selectedResident.is_senior)}</span></div>
                  <div className="info-item"><label>PWD?</label><span>{boolVal(selectedResident.is_pwd)}</span></div>
                  <div className="info-item"><label>Solo Parent?</label><span>{boolVal(selectedResident.is_solo_parent)}</span></div>
                  <div className="info-item"><label>Indigent?</label><span>{boolVal(selectedResident.is_indigent)}</span></div>
                  <div className="info-item"><label>4Ps Beneficiary?</label><span>{boolVal(selectedResident.is_4ps)}</span></div>
                </div>
                
                {/* Dynamically render Sector Images if they have the sector status AND uploaded an image */}
                {(selectedResident.is_senior == 1 || selectedResident.is_pwd == 1 || selectedResident.is_solo_parent == 1 || selectedResident.is_indigent == 1 || selectedResident.is_4ps == 1) && (
                  <div className="sector-proofs-container mt-4">
                    <h5 className="sub-group-title text-muted mb-3"><i className="bi bi-images"></i> Sector Proof Attachments</h5>
                    <div className="document-previews">
                      {selectedResident.is_senior == 1 && (
                        <div className="doc-box">
                          <label>Senior Citizen ID/Proof</label>
                          {selectedResident.proof_senior ? <img src={`/api_backend/${selectedResident.proof_senior}`} alt="Senior Proof" onError={(e) => e.target.style.display='none'}/> : <div className="no-img">No Image</div>}
                        </div>
                      )}
                      {selectedResident.is_pwd == 1 && (
                        <div className="doc-box">
                          <label>PWD ID/Proof</label>
                          {selectedResident.proof_pwd ? <img src={`/api_backend/${selectedResident.proof_pwd}`} alt="PWD Proof" onError={(e) => e.target.style.display='none'}/> : <div className="no-img">No Image</div>}
                        </div>
                      )}
                      {selectedResident.is_solo_parent == 1 && (
                        <div className="doc-box">
                          <label>Solo Parent ID/Proof</label>
                          {selectedResident.proof_solo_parent ? <img src={`/api_backend/${selectedResident.proof_solo_parent}`} alt="Solo Parent Proof" onError={(e) => e.target.style.display='none'}/> : <div className="no-img">No Image</div>}
                        </div>
                      )}
                      {selectedResident.is_indigent == 1 && (
                        <div className="doc-box">
                          <label>Indigent Certificate</label>
                          {selectedResident.proof_indigent ? <img src={`/api_backend/${selectedResident.proof_indigent}`} alt="Indigent Proof" onError={(e) => e.target.style.display='none'}/> : <div className="no-img">No Image</div>}
                        </div>
                      )}
                      {selectedResident.is_4ps == 1 && (
                        <div className="doc-box">
                          <label>4P's ID/Proof</label>
                          {selectedResident.proof_4ps ? <img src={`/api_backend/${selectedResident.proof_4ps}`} alt="4Ps Proof" onError={(e) => e.target.style.display='none'}/> : <div className="no-img">No Image</div>}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <hr className="divider" />
                <div className="info-grid mt-3">
                  <div className="info-item"><label>Emergency Contact Person</label><span>{val(selectedResident.contact_person)}</span></div>
                  <div className="info-item"><label>Relationship</label><span>{val(selectedResident.contactp_relationship)}</span></div>
                  <div className="info-item"><label>Contact Number</label><span>{val(selectedResident.contactp_num)}</span></div>
                </div>
              </div>

              <div className="info-group card-shadow border-0">
                <h4 className="group-title"><i className="bi bi-pass-fill"></i> Validation Documents & Remarks</h4>
                {selectedResident.admin_remarks && (
                  <div className="admin-remarks-display mb-4">
                    <label>Action Required / Admin Remarks:</label>
                    <p>{selectedResident.admin_remarks}</p>
                  </div>
                )}
                <div className="info-grid mt-3">
                  <div className="info-item"><label>PhilSys Nat ID</label><span>{val(selectedResident.philsys_nat_id)}</span></div>
                  <div className="info-item"><label>Valid ID Type</label><span>{val(selectedResident.valid_id)}</span></div>
                </div>
                <div className="document-previews mt-3">
                  <div className="doc-box">
                    <label>ID Front</label>
                    {selectedResident.valid_id_img_front ? <img src={`/api_backend/${selectedResident.valid_id_img_front}`} alt="Front ID" onError={(e) => e.target.style.display='none'}/> : <div className="no-img">No Image</div>}
                  </div>
                  <div className="doc-box">
                    <label>ID Back</label>
                    {selectedResident.valid_id_img_back ? <img src={`/api_backend/${selectedResident.valid_id_img_back}`} alt="Back ID" onError={(e) => e.target.style.display='none'}/> : <div className="no-img">No Image</div>}
                  </div>
                  <div className="doc-box">
                    <label>ID Holding</label>
                    {selectedResident.valid_id_img_holding ? <img src={`/api_backend/${selectedResident.valid_id_img_holding}`} alt="Holding ID" onError={(e) => e.target.style.display='none'}/> : <div className="no-img">No Image</div>}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==============================================================
          2. STATUS CHANGE & EDIT MODAL
      ============================================================== */}
      {statusModal.show && (
        <div className="glass-modal-overlay" onClick={() => setStatusModal({ ...statusModal, show: false })}>
          <div className="glass-modal-content status-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-clean">
              <div className="modal-title-area">
                <h3>Edit Profile & Status</h3>
                <p className="subtitle text-muted mb-0">For: {statusModal.resident.full_name}</p>
              </div>
              <button className="close-modern-btn" onClick={() => setStatusModal({ ...statusModal, show: false })}>
                <i className="bi bi-x-lg"></i>
              </button>
            </div>
            
            <div className="modal-scroll-area bg-light" style={{padding: '25px'}}>
              
              <div className="status-control-card mb-4">
                <div className="status-form-group">
                  <label className="form-label">Set Account Status</label>
                  <select className="status-dropdown" value={statusModal.newStatus} onChange={(e) => setStatusModal({ ...statusModal, newStatus: e.target.value })}>
                    <option value="Active">Active</option>
                    <option value="Archived">Archive Resident</option>
                    <option value="Action Required">Action Required</option>
                  </select>
                </div>
                {statusModal.newStatus === 'Action Required' && (
                  <div className="status-form-group mt-3 slide-down-anim">
                    <label className="form-label text-danger">Admin Remarks <span className="text-danger">*</span></label>
                    <textarea className="remarks-textarea" placeholder="E.g., Please upload a clearer valid ID..." value={statusModal.adminRemarks} onChange={(e) => setStatusModal({ ...statusModal, adminRemarks: e.target.value })} rows="3"></textarea>
                  </div>
                )}
              </div>

              <div className="info-group card-shadow">
                <h4 className="group-title"><i className="bi bi-pencil-square"></i> Editable Personal Data</h4>
                <div className="info-grid">
                  <div className="info-item"><label>Resident ID</label><input type="text" className="readonly-input" value={editVal('resident_id')} disabled /></div>
                  <div className="info-item"><label>User ID</label><input type="text" className="readonly-input" value={editVal('user_id')} disabled /></div>
                  <div className="info-item"><label>Control Number</label><input type="text" className="readonly-input" value={editVal('control_num')} disabled /></div>
                  <div className="info-item"><label>First Name</label><input type="text" value={editVal('fName')} onChange={(e) => handleEditableChange('fName', e.target.value)} /></div>
                  <div className="info-item"><label>Middle Name</label><input type="text" value={editVal('mName')} onChange={(e) => handleEditableChange('mName', e.target.value)} /></div>
                  <div className="info-item"><label>Last Name</label><input type="text" value={editVal('lName')} onChange={(e) => handleEditableChange('lName', e.target.value)} /></div>
                  <div className="info-item"><label>Suffix</label><input type="text" value={editVal('suffix')} onChange={(e) => handleEditableChange('suffix', e.target.value)} /></div>
                  <div className="info-item"><label>Gender</label><select value={editVal('gender')} onChange={(e) => handleEditableChange('gender', e.target.value)}>
                    <option value="">Choose Gender</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select></div>
                  <div className="info-item"><label>Birth Date</label><input type="date" value={editVal('birth_date')} onChange={(e) => handleEditableChange('birth_date', e.target.value)} /></div>
                  <div className="info-item"><label>Civil Status</label><select value={editVal('civil_status')} onChange={(e) => handleEditableChange('civil_status', e.target.value)}>
                    <option value="">Choose Status</option>
                    <option value="Single">Single</option>
                    <option value="Married">Married</option>
                    <option value="Widowed">Widowed</option>
                    <option value="Separated">Separated</option>
                  </select></div>
                </div>
              </div>

              <div className="info-group card-shadow">
                <h4 className="group-title"><i className="bi bi-telephone-fill"></i> Editable Contact & Location</h4>
                <div className="info-grid">
                  <div className="info-item"><label>Contact Number</label><input type="text" value={editVal('contact_num')} onChange={(e) => handleEditableChange('contact_num', e.target.value)} /></div>
                  <div className="info-item"><label>Email Address</label><input type="email" value={editVal('email')} onChange={(e) => handleEditableChange('email', e.target.value)} /></div>
                  <div className="info-item"><label>House No.</label><input type="text" value={editVal('house_no')} onChange={(e) => handleEditableChange('house_no', e.target.value)} /></div>
                  <div className="info-item"><label>Street</label><input type="text" value={editVal('street')} onChange={(e) => handleEditableChange('street', e.target.value)} /></div>
                  <div className="info-item"><label>Subdivision</label><input type="text" value={editVal('subdivision')} onChange={(e) => handleEditableChange('subdivision', e.target.value)} /></div>
                  <div className="info-item"><label>Zone / Purok</label><input type="text" value={editVal('zone')} onChange={(e) => handleEditableChange('zone', e.target.value)} /></div>
                </div>
              </div>

              <div className="info-group card-shadow">
                <h4 className="group-title"><i className="bi bi-tags-fill"></i> Sector Attachments</h4>
                <div className="info-grid">
                  <div className="info-item">
                    <label>Senior Citizen?</label>
                    <select value={editVal('is_senior')} onChange={(e) => handleEditableChange('is_senior', e.target.value)}>
                      <option value="0">No</option>
                      <option value="1">Yes</option>
                    </select>
                    {String(editVal('is_senior')) === '1' && (
                      <div className="sector-attachment-group">
                        <button type="button" className="file-add-btn" onClick={() => document.getElementById('proof_senior').click()}><i className="bi bi-upload"></i> Upload Proof</button>
                        <input id="proof_senior" type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={(e) => handleEditableChange('proof_senior', e.target.files[0] || null)} />
                        {editVal('proof_senior') && <span className="selected-file-name">{typeof editVal('proof_senior') === 'object' ? editVal('proof_senior').name : editVal('proof_senior')}</span>}
                      </div>
                    )}
                  </div>
                  <div className="info-item">
                    <label>PWD?</label>
                    <select value={editVal('is_pwd')} onChange={(e) => handleEditableChange('is_pwd', e.target.value)}>
                      <option value="0">No</option>
                      <option value="1">Yes</option>
                    </select>
                    {String(editVal('is_pwd')) === '1' && (
                      <div className="sector-attachment-group">
                        <button type="button" className="file-add-btn" onClick={() => document.getElementById('proof_pwd').click()}><i className="bi bi-upload"></i> Upload Proof</button>
                        <input id="proof_pwd" type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={(e) => handleEditableChange('proof_pwd', e.target.files[0] || null)} />
                        {editVal('proof_pwd') && <span className="selected-file-name">{typeof editVal('proof_pwd') === 'object' ? editVal('proof_pwd').name : editVal('proof_pwd')}</span>}
                      </div>
                    )}
                  </div>

                  <div className="info-item">
                    <label>Solo Parent?</label>
                    <select value={editVal('is_solo_parent')} onChange={(e) => handleEditableChange('is_solo_parent', e.target.value)}>
                      <option value="0">No</option>
                      <option value="1">Yes</option>
                    </select>
                    {String(editVal('is_solo_parent')) === '1' && (
                      <div className="sector-attachment-group">
                        <button type="button" className="file-add-btn" onClick={() => document.getElementById('proof_solo_parent').click()}><i className="bi bi-upload"></i> Upload Proof</button>
                        <input id="proof_solo_parent" type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={(e) => handleEditableChange('proof_solo_parent', e.target.files[0] || null)} />
                        {editVal('proof_solo_parent') && <span className="selected-file-name">{typeof editVal('proof_solo_parent') === 'object' ? editVal('proof_solo_parent').name : editVal('proof_solo_parent')}</span>}
                      </div>
                    )}
                  </div>

                  <div className="info-item">
                    <label>Indigent?</label>
                    <select value={editVal('is_indigent')} onChange={(e) => handleEditableChange('is_indigent', e.target.value)}>
                      <option value="0">No</option>
                      <option value="1">Yes</option>
                    </select>
                    {String(editVal('is_indigent')) === '1' && (
                      <div className="sector-attachment-group">
                        <button type="button" className="file-add-btn" onClick={() => document.getElementById('proof_indigent').click()}><i className="bi bi-upload"></i> Upload Proof</button>
                        <input id="proof_indigent" type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={(e) => handleEditableChange('proof_indigent', e.target.files[0] || null)} />
                        {editVal('proof_indigent') && <span className="selected-file-name">{typeof editVal('proof_indigent') === 'object' ? editVal('proof_indigent').name : editVal('proof_indigent')}</span>}
                      </div>
                    )}
                  </div>

                  <div className="info-item">
                    <label>4P's Beneficiary?</label>
                    <select value={editVal('is_4ps')} onChange={(e) => handleEditableChange('is_4ps', e.target.value)}>
                      <option value="0">No</option>
                      <option value="1">Yes</option>
                    </select>
                    {String(editVal('is_4ps')) === '1' && (
                      <div className="sector-attachment-group">
                        <button type="button" className="file-add-btn" onClick={() => document.getElementById('proof_4ps').click()}><i className="bi bi-upload"></i> Upload Proof</button>
                        <input id="proof_4ps" type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={(e) => handleEditableChange('proof_4ps', e.target.files[0] || null)} />
                        {editVal('proof_4ps') && <span className="selected-file-name">{typeof editVal('proof_4ps') === 'object' ? editVal('proof_4ps').name : editVal('proof_4ps')}</span>}
                      </div>
                    )}
                  </div>

                </div>
              </div>

              <div className="info-group card-shadow">
                <h4 className="group-title"><i className="bi bi-file-earmark-person"></i> Re-upload IDs</h4>
                <div className="info-grid">
                  <div className="info-item"><label>Valid ID Type</label><select value={editVal('valid_id')} onChange={(e) => handleEditableChange('valid_id', e.target.value)}>
                      <option value="National ID (PhilID/ePhilID)">National ID (PhilID/ePhilID)</option>
                      <option value="Passport">Passport</option>
                      <option value="Driver's License">Driver's License</option>
                      <option value="UMID">UMID</option>
                      <option value="SSS / GSIS ID">SSS / GSIS ID</option>
                    </select></div>
                  <div className="info-item"><label>Valid ID Front</label><input type="file" className="file-input-modern" accept="image/*" onChange={(e) => handleEditableChange('valid_id_img_front', e.target.files[0] || null)} /></div>
                  <div className="info-item"><label>Valid ID Back</label><input type="file" className="file-input-modern" accept="image/*" onChange={(e) => handleEditableChange('valid_id_img_back', e.target.files[0] || null)} /></div>
                  <div className="info-item"><label>ID Holding</label><input type="file" className="file-input-modern" accept="image/*" onChange={(e) => handleEditableChange('valid_id_img_holding', e.target.files[0] || null)} /></div>
                </div>
              </div>

              <div className="modal-footer-actions">
                <button className="action-btn cancel-btn" onClick={() => setStatusModal({ ...statusModal, show: false })}>Cancel</button>
                <button className="action-btn save-btn" onClick={handleUpdateStatus} disabled={statusModal.newStatus === 'Action Required' && statusModal.adminRemarks.trim() === ''}>
                  <i className="bi bi-check2-circle"></i> Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Profiling;