import React, { useEffect, useState } from 'react';
import axios from 'axios';
import './PendingUsers.css';

const API_BASE = '/api_backend';

const getPublicUrl = (path) => {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  let normalized = path.replace(/^(\.\.\/)+/, '');
  if (normalized.startsWith('api/')) normalized = normalized.replace(/^api\//, '');
  normalized = normalized.replace(/^\/+/, '');
  return `/api_backend/${normalized}`;
};

const parseBooleanFlag = (value) => {
  return value === 1 || value === '1' || value === true || value === 'true';
};

const renderSectorBadge = (value) => {
  const isActive = parseBooleanFlag(value);
  return (
    <span className={`sector-pill ${isActive ? 'sector-yes' : 'sector-no'}`}>
      {isActive ? 'Yes' : 'No'}
    </span>
  );
};

const PendingUsers = () => {
  const [pending, setPending] = useState([]);
  const [message, setMessage] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);

  const fetchPending = async () => {
    const response = await axios.get(`${API_BASE}/get_pending_users.php`);
    if (response.data.success) setPending(response.data.data);
  };

  const updateStatus = async (id, status) => {
    const response = await axios.post(`${API_BASE}/update_resident_status.php`, {
      resident_id: id,
      status,
      admin_remarks: status === 'Active' ? 'Automatically approved by admin.' : 'Registration declined by admin.'
    });
    if (response.data.success) {
      setMessage('Pending user updated.');
      fetchPending();
    }
  };

  useEffect(() => { fetchPending(); }, []);

  return (
    <div className="admin-page-container">
      <h2>Pending User Approvals</h2>
      <p>Review recent registrations and approve or decline accounts.</p>
      {message && <div className="admin-success-box">{message}</div>}
      <div className="table-card">
        <table className="admin-table">
          <thead>
            <tr>
              <th style={{ textAlign: 'center' }}>Name</th>
              <th style={{ textAlign: 'center' }}>Email</th>
              <th style={{ textAlign: 'center' }}>Registered</th>
              <th style={{ textAlign: 'center' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {pending.map(item => (
              <tr key={item.resident_id}>
                <td style={{ textAlign: 'center' }}>{item.name}</td>
                <td style={{ textAlign: 'center' }}>{item.email}</td>
                <td style={{ textAlign: 'center' }}>{item.date_registered?.slice(0, 10)}</td>
                <td className="admin-action-cell" style={{ textAlign: 'center' }}>
                  <button className="admin-btn view-btn" onClick={() => setSelectedUser(item)} title="View Details">
                    <i className="bi bi-eye"></i>
                  </button>
                  <button className="admin-btn approve" onClick={() => updateStatus(item.resident_id, 'Active')}>Approve</button>
                  <button className="admin-btn reject" onClick={() => updateStatus(item.resident_id, 'Action Required')}>Decline</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedUser && (
        <div className="detail-modal-overlay" onClick={() => setSelectedUser(null)}>
          <div className="detail-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="detail-modal-header">
              <div>
                <p className="detail-modal-subtitle">Registration Details</p>
                <h2>{selectedUser.name}</h2>
                <span className="status-pill status-pending">{selectedUser.status}</span>
              </div>
              <button className="detail-close-btn" onClick={() => setSelectedUser(null)} type="button" aria-label="Close details">
                <i className="bi bi-x-lg"></i>
              </button>
            </div>
            <div className="detail-modal-body">
              <div className="detail-section">
                <h4 className="detail-section-title">Account Information</h4>
                <div className="detail-grid">
                  <div>
                    <span className="detail-label">Email</span>
                    <p className="detail-value">{selectedUser.email || 'N/A'}</p>
                  </div>
                  <div>
                    <span className="detail-label">Registered On</span>
                    <p className="detail-value">{selectedUser.date_registered ? new Date(selectedUser.date_registered).toLocaleString() : 'N/A'}</p>
                  </div>
                  <div>
                    <span className="detail-label">Control Number</span>
                    <p className="detail-value">{selectedUser.control_num || 'N/A'}</p>
                  </div>
                </div>
              </div>

              <hr className="detail-divider" />

              <div className="detail-section">
                <h4 className="detail-section-title">Personal Information</h4>
                <div className="detail-grid">
                  <div>
                    <span className="detail-label">First Name</span>
                    <p className="detail-value">{selectedUser.fName || 'N/A'}</p>
                  </div>
                  <div>
                    <span className="detail-label">Middle Name</span>
                    <p className="detail-value">{selectedUser.mName || 'N/A'}</p>
                  </div>
                  <div>
                    <span className="detail-label">Last Name</span>
                    <p className="detail-value">{selectedUser.lName || 'N/A'}</p>
                  </div>
                  <div>
                    <span className="detail-label">Suffix</span>
                    <p className="detail-value">{selectedUser.suffix || 'N/A'}</p>
                  </div>
                  <div>
                    <span className="detail-label">Gender</span>
                    <p className="detail-value">{selectedUser.gender || 'N/A'}</p>
                  </div>
                  <div>
                    <span className="detail-label">Birth Date</span>
                    <p className="detail-value">{selectedUser.birth_date || 'N/A'}</p>
                  </div>
                  <div>
                    <span className="detail-label">Height</span>
                    <p className="detail-value">{selectedUser.height || 'N/A'}</p>
                  </div>
                  <div>
                    <span className="detail-label">Blood Type</span>
                    <p className="detail-value">{selectedUser.blood_type || 'N/A'}</p>
                  </div>
                  <div>
                    <span className="detail-label">Civil Status</span>
                    <p className="detail-value">{selectedUser.civil_status || 'N/A'}</p>
                  </div>
                  <div>
                    <span className="detail-label">Spouse Name</span>
                    <p className="detail-value">{selectedUser.spouse_name_text || 'N/A'}</p>
                  </div>
                  <div>
                    <span className="detail-label">Religion</span>
                    <p className="detail-value">{selectedUser.religion || 'N/A'}</p>
                  </div>
                  <div>
                    <span className="detail-label">Birth City</span>
                    <p className="detail-value">{selectedUser.birth_city || 'N/A'}</p>
                  </div>
                  <div>
                    <span className="detail-label">Birth Province</span>
                    <p className="detail-value">{selectedUser.birth_province || 'N/A'}</p>
                  </div>
                  <div>
                    <span className="detail-label">Birth Country</span>
                    <p className="detail-value">{selectedUser.birth_country || 'N/A'}</p>
                  </div>
                </div>
              </div>

              <hr className="detail-divider" />

              <div className="detail-section">
                <h4 className="detail-section-title">Contact & Residency</h4>
                <div className="detail-grid">
                  <div>
                    <span className="detail-label">Mobile Number</span>
                    <p className="detail-value">{selectedUser.contact_num || 'N/A'}</p>
                  </div>
                  <div>
                    <span className="detail-label">Philsys ID</span>
                    <p className="detail-value">{selectedUser.philsys_nat_id || 'N/A'}</p>
                  </div>
                  <div>
                    <span className="detail-label">Residence Type</span>
                    <p className="detail-value">{selectedUser.residency_status || 'N/A'}</p>
                  </div>
                  <div>
                    <span className="detail-label">Years in PB2</span>
                    <p className="detail-value">{selectedUser.years_in_PB2 || 'N/A'}</p>
                  </div>
                </div>
              </div>

              <hr className="detail-divider" />

              <div className="detail-section">
                <h4 className="detail-section-title">Sector Status</h4>
                <div className="detail-grid">
                  <div>
                    <span className="detail-label">Senior Citizen</span>
                    <p className="detail-value">{renderSectorBadge(selectedUser.is_senior)}</p>
                  </div>
                  <div>
                    <span className="detail-label">PWD</span>
                    <p className="detail-value">{renderSectorBadge(selectedUser.is_pwd)}</p>
                  </div>
                  <div>
                    <span className="detail-label">4Ps</span>
                    <p className="detail-value">{renderSectorBadge(selectedUser.is_4ps)}</p>
                  </div>
                  <div>
                    <span className="detail-label">Solo Parent</span>
                    <p className="detail-value">{renderSectorBadge(selectedUser.is_solo_parent)}</p>
                  </div>
                  <div>
                    <span className="detail-label">Indigent</span>
                    <p className="detail-value">{renderSectorBadge(selectedUser.is_indigent)}</p>
                  </div>
                </div>

                {(parseBooleanFlag(selectedUser.is_senior) || parseBooleanFlag(selectedUser.is_pwd) || parseBooleanFlag(selectedUser.is_4ps) || parseBooleanFlag(selectedUser.is_solo_parent) || parseBooleanFlag(selectedUser.is_indigent)) && (
                  <div className="detail-section" style={{ marginTop: '18px' }}>
                    <h4 className="detail-section-title">Sector Evidence Attachments</h4>
                    <div className="detail-media-grid">
                      {selectedUser.proof_pwd && parseBooleanFlag(selectedUser.is_pwd) && (
                        <div className="detail-media-card">
                          <span className="detail-label">PWD Proof</span>
                          <img src={getPublicUrl(selectedUser.proof_pwd)} alt="PWD Proof" />
                        </div>
                      )}
                      {selectedUser.proof_4ps && parseBooleanFlag(selectedUser.is_4ps) && (
                        <div className="detail-media-card">
                          <span className="detail-label">4Ps Proof</span>
                          <img src={getPublicUrl(selectedUser.proof_4ps)} alt="4Ps Proof" />
                        </div>
                      )}
                      {selectedUser.proof_solo_parent && parseBooleanFlag(selectedUser.is_solo_parent) && (
                        <div className="detail-media-card">
                          <span className="detail-label">Solo Parent Proof</span>
                          <img src={getPublicUrl(selectedUser.proof_solo_parent)} alt="Solo Parent Proof" />
                        </div>
                      )}
                      {selectedUser.proof_indigent && parseBooleanFlag(selectedUser.is_indigent) && (
                        <div className="detail-media-card">
                          <span className="detail-label">Indigent Proof</span>
                          <img src={getPublicUrl(selectedUser.proof_indigent)} alt="Indigent Proof" />
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <hr className="detail-divider" />

              <div className="detail-section">
                <h4 className="detail-section-title">Address</h4>
                <div className="detail-grid">
                  <div>
                    <span className="detail-label">House No.</span>
                    <p className="detail-value">{selectedUser.house_no || 'N/A'}</p>
                  </div>
                  <div>
                    <span className="detail-label">Street</span>
                    <p className="detail-value">{selectedUser.street || 'N/A'}</p>
                  </div>
                  <div>
                    <span className="detail-label">Zone</span>
                    <p className="detail-value">{selectedUser.zone || 'N/A'}</p>
                  </div>
                  <div>
                    <span className="detail-label">Subdivision</span>
                    <p className="detail-value">{selectedUser.subdivision || 'N/A'}</p>
                  </div>
                </div>
              </div>

              <hr className="detail-divider" />

              <div className="detail-section">
                <h4 className="detail-section-title">Emergency Contact</h4>
                <div className="detail-grid">
                  <div>
                    <span className="detail-label">Contact Person</span>
                    <p className="detail-value">{selectedUser.contact_person || 'N/A'}</p>
                  </div>
                  <div>
                    <span className="detail-label">Contact Number</span>
                    <p className="detail-value">{selectedUser.contactp_num || 'N/A'}</p>
                  </div>
                  <div>
                    <span className="detail-label">Relationship</span>
                    <p className="detail-value">{selectedUser.contactp_relationship || 'N/A'}</p>
                  </div>
                </div>
              </div>

              <hr className="detail-divider" />

              <div className="detail-section">
                <h4 className="detail-section-title">Verification Documents</h4>
                <div className="detail-media-grid">
                  {selectedUser.valid_id && (
                    <div className="detail-media-card">
                      <span className="detail-label">Valid ID Type</span>
                      <p className="detail-value">{selectedUser.valid_id}</p>
                    </div>
                  )}
                  {selectedUser.valid_id_img_front && (
                    <div className="detail-media-card">
                      <span className="detail-label">ID Front</span>
                      <img src={getPublicUrl(selectedUser.valid_id_img_front)} alt="ID Front" />
                    </div>
                  )}
                  {selectedUser.valid_id_img_back && (
                    <div className="detail-media-card">
                      <span className="detail-label">ID Back</span>
                      <img src={getPublicUrl(selectedUser.valid_id_img_back)} alt="ID Back" />
                    </div>
                  )}
                  {selectedUser.valid_id_img_holding && (
                    <div className="detail-media-card">
                      <span className="detail-label">ID Holding</span>
                      <img src={getPublicUrl(selectedUser.valid_id_img_holding)} alt="ID Holding" />
                    </div>
                  )}
                  {selectedUser.proof_pwd && (
                    <div className="detail-media-card">
                      <span className="detail-label">PWD Proof</span>
                      <img src={getPublicUrl(selectedUser.proof_pwd)} alt="PWD Proof" />
                    </div>
                  )}
                  {selectedUser.proof_4ps && (
                    <div className="detail-media-card">
                      <span className="detail-label">4Ps Proof</span>
                      <img src={getPublicUrl(selectedUser.proof_4ps)} alt="4Ps Proof" />
                    </div>
                  )}
                  {selectedUser.proof_solo_parent && (
                    <div className="detail-media-card">
                      <span className="detail-label">Solo Parent Proof</span>
                      <img src={getPublicUrl(selectedUser.proof_solo_parent)} alt="Solo Parent Proof" />
                    </div>
                  )}
                  {selectedUser.proof_indigent && (
                    <div className="detail-media-card">
                      <span className="detail-label">Indigent Proof</span>
                      <img src={getPublicUrl(selectedUser.proof_indigent)} alt="Indigent Proof" />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PendingUsers;
