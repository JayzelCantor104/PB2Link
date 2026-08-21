import React, { useState, useEffect } from 'react';

import { forceAdminReauth, isAuthFailure } from '../lib/apiClient';

const API_BASE = '/api_backend'; // Maps to http://localhost/PB2Link/backend/api
const UPLOADS_BASE = '/uploads_backend'; // Maps to http://localhost/PB2Link/backend/uploads

const AdminProfileApprovals = () => {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  
  // Modal states
  const [showModal, setShowModal] = useState(false);
  const [modalData, setModalData] = useState(null);
  const [individualDecisions, setIndividualDecisions] = useState({});

  // Fetch pending requests on load
  const fetchRequests = async () => {
    try {
      const res = await fetch(`${API_BASE}/admin_process_profile.php`, {
        credentials: 'include'
      });
      if (isAuthFailure(res.status)) return forceAdminReauth();
      const data = await res.json();
      if (data.success) {
        setRequests(data.requests);
      } else {
        showToast('Error', 'Failed to retrieve approval data.', 'error');
      }
    } catch (err) {
      showToast('Error', 'Network connectivity failure.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  const showToast = (title, message, type = 'success') => {
    setToast({ title, message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Group requests by user and submission batch
  const groupRequestsByUser = () => {
    const grouped = {};
    requests.forEach(req => {
      const key = `${req.user_id}_${req.submission_batch || req.change_id}`;
      if (!grouped[key]) {
        grouped[key] = {
          user_id: req.user_id,
          fName: req.fName,
          lName: req.lName,
          email: req.email,
          submission_batch: req.submission_batch,
          proof_document: req.proof_document, // Extracted from tracking table row metadata
          changes: []
        };
      }
      grouped[key].changes.push(req);
    });
    return grouped;
  };

  // Open modal to view all changes for a specific user/submission
  const openViewChangesModal = (groupKey) => {
    const grouped = groupRequestsByUser();
    const group = grouped[groupKey];
    if (group) {
      setModalData(group);
      const decisions = {};
      group.changes.forEach(change => {
        decisions[change.change_id] = null; // null = undecided
      });
      setIndividualDecisions(decisions);
      setShowModal(true);
    }
  };

  const handleIndividualDecision = (changeId, decision) => {
    setIndividualDecisions(prev => {
      const newDecisions = { ...prev };
      if (newDecisions[changeId] === decision) {
        newDecisions[changeId] = null;
      } else {
        newDecisions[changeId] = decision;
      }
      return newDecisions;
    });
  };

  // Process a single decision directly
  const handleIndividualAction = async (changeId, actionType) => {
    try {
      const res = await fetch(`${API_BASE}/admin_process_profile.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          batch_action: false,
          change_id: changeId,
          user_id: modalData.user_id,
          action: actionType
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast('Success!', data.message, 'success');
        setModalData(prev => ({ ...prev, changes: prev.changes.filter(c => c.change_id !== changeId) }));
        setIndividualDecisions(prev => {
          const newDecisions = { ...prev };
          delete newDecisions[changeId];
          return newDecisions;
        });
        fetchRequests();
      } else {
        showToast('Action Failed', data.message, 'error');
      }
    } catch (err) {
      showToast('Server Error', 'Could not transmit decision payload.', 'error');
    }
  };

  // Bulk process decision mapping via a single structural array request payload
  const handleBulkDecisionSubmit = async (targetType) => {
    const targetedIds = Object.entries(individualDecisions)
      .filter(([_, decision]) => decision === targetType)
      .map(([changeId]) => parseInt(changeId));

    if (targetedIds.length === 0) {
      showToast('Info', `Please select at least one change to ${targetType}.`, 'info');
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/admin_process_profile.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          batch_action: true,
          user_id: modalData.user_id,
          change_ids: targetedIds,
          action: targetType
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast('Success!', data.message, 'success');
        fetchRequests();
        setShowModal(false);
      } else {
        showToast('Error', data.message, 'error');
      }
    } catch (err) {
      showToast('Server Error', 'Could not process bulk modification transaction.', 'error');
    }
  };

  const formatFieldLabel = (text) => {
    return text.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  };

  // Safe helper hook to resolve file assets pathways without structural breakups
  const getProofAssetUrl = (rawPath) => {
    if (!rawPath) return '';
    // If path is stored as "uploads/proofs/file.png", strip "uploads/" so it routes cleanly through our Vite proxy mapping
    const cleanPath = rawPath.replace(/^uploads\//, '');
    return `${UPLOADS_BASE}/${cleanPath}`;
  };

  return (
    <>
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css" />
      <style>{`
        .adm-container { padding: 40px 20px; background: #f8fafc; min-height: 100vh; font-family: 'Inter', sans-serif; }
        .adm-card { background: #ffffff; border-radius: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; padding: 30px; max-width: 1100px; margin: 0 auto; }
        .adm-header { border-bottom: 2px solid #f1f5f9; padding-bottom: 20px; margin-bottom: 25px; display: flex; align-items: center; gap: 12px; }
        .adm-header h2 { margin: 0; color: #0f172a; font-weight: 700; }
        .adm-header i { color: #059669; font-size: 1.8rem; }
        .adm-table { width: 100%; border-collapse: collapse; text-align: left; }
        .adm-table th { background: #f1f5f9; color: #475569; padding: 14px 18px; font-size: 0.85rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
        .adm-table td { padding: 18px; border-bottom: 1px solid #e2e8f0; color: #334155; font-size: 0.95rem; }
        .adm-name { font-weight: 600; color: #0f172a; }
        .adm-badge { background: #e0f2fe; color: #0369a1; padding: 4px 10px; border-radius: 6px; font-size: 0.8rem; font-weight: 600; }
        .adm-val-old { color: #94a3b8; text-decoration: line-through; }
        .adm-val-new { color: #059669; font-weight: 600; background: #f0fdf4; padding: 2px 6px; border-radius: 4px; }
        .adm-btn-group { display: flex; gap: 10px; }
        .adm-btn { padding: 8px 16px; border-radius: 8px; font-weight: 600; font-size: 0.85rem; border: none; cursor: pointer; display: flex; align-items: center; gap: 6px; transition: 0.2s; }
        .adm-btn-approve { background: #059669; color: white; }
        .adm-btn-reject { background: #ef4444; color: white; }
        .adm-btn-view { background: #3b82f6; color: white; }
        .adm-btn-view:hover { background: #2563eb; }
        .adm-empty { text-align: center; padding: 50px 20px; color: #64748b; }
        .adm-empty i { font-size: 3rem; color: #cbd5e1; margin-bottom: 10px; display: block; }
        .adm-toast { position: fixed; top: 20px; right: 20px; background: white; border-left: 5px solid #059669; padding: 15px 25px; box-shadow: 0 10px 30px rgba(0,0,0,0.1); border-radius: 8px; z-index: 999; }
        .adm-toast.error { border-left-color: #ef4444; }
        .modal-overlay { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(15, 23, 42, 0.6); backdrop-filter: blur(4px); z-index: 1050; display: flex; align-items: center; justify-content: center; padding: 20px; }
        .modal-content { background: #ffffff; border-radius: 16px; padding: 30px; width: 100%; max-width: 900px; max-height: 85vh; overflow-y: auto; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25); }
        .modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 2px solid #f1f5f9; }
        .modal-header h3 { margin: 0; color: #0f172a; font-weight: 700; }
        .modal-close { background: none; border: none; font-size: 1.5rem; cursor: pointer; color: #64748b; }
        .modal-user-info { background: #f8fafc; padding: 15px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #3b82f6; text-align: left; }
        .changes-table { width: 100%; border-collapse: collapse; }
        .changes-table th { background: #f1f5f9; padding: 12px; text-align: left; font-weight: 600; color: #475569; font-size: 0.85rem; }
        .changes-table td { padding: 12px; border-bottom: 1px solid #e2e8f0; vertical-align: middle; text-align: left; }
        .checkbox-group { display: flex; gap: 15px; align-items: center; justify-content: center; }
        .checkbox-label { display: flex; align-items: center; gap: 6px; cursor: pointer; font-weight: 500; font-size: 0.9rem; }
        .checkbox-label input[type="checkbox"] { width: 18px; height: 18px; cursor: pointer; }
        .checkbox-approve input:checked { accent-color: #059669; }
        .checkbox-reject input:checked { accent-color: #ef4444; }
        .modal-actions { display: flex; justify-content: flex-end; gap: 12px; margin-top: 20px; padding-top: 20px; border-top: 2px solid #f1f5f9; }
        .btn-bulk { padding: 10px 20px; border-radius: 8px; font-weight: 600; border: none; cursor: pointer; transition: 0.2s; }
        .btn-accept-all { background: #059669; color: white; }
        .btn-accept-all:disabled { background: #cbd5e1; cursor: not-allowed; }
        .btn-reject-all { background: #ef4444; color: white; }
        .btn-reject-all:disabled { background: #cbd5e1; cursor: not-allowed; }
        .btn-cancel { background: #64748b; color: white; }
        
        /* New Style Rules for Professional Image Verification Document Previews */
        .admin-proof-preview-container {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 15px;
          margin-top: 15px;
        }
        .admin-proof-media-wrapper {
          max-width: 100%;
          max-height: 280px;
          overflow: hidden;
          border-radius: 8px;
          margin: 10px auto;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1px dashed #cbd5e1;
          background: #ffffff;
        }
        .admin-proof-img {
          max-width: 100%;
          max-height: 280px;
          object-fit: contain;
        }
      `}</style>

      {toast && (
        <div className={`adm-toast ${toast.type === 'error' ? 'error' : ''}`}>
          <strong style={{ display: 'block', color: '#0f172a' }}>{toast.title}</strong>
          <span style={{ color: '#64748b', fontSize: '0.9rem' }}>{toast.message}</span>
        </div>
      )}

      <div className="adm-container">
        <div className="adm-card">
          <div className="adm-header">
            <i className="bi bi-shield-check"></i>
            <h2>Profile Update Requests</h2>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '30px' }}>Loading verification data...</div>
          ) : requests.length === 0 ? (
            <div className="adm-empty">
              <i className="bi bi-inbox"></i>
              <p>No profile changes currently pending approval.</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="adm-table">
                <thead>
                  <tr>
                    <th>Resident Name</th>
                    <th>Email</th>
                    <th>Number of Changes</th>
                    <th style={{ textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(groupRequestsByUser()).map(([groupKey, group]) => (
                    <tr key={groupKey}>
                      <td className="adm-name">{`${group.fName} ${group.lName}`}</td>
                      <td>{group.email || 'N/A'}</td>
                      <td>
                        <span className="adm-badge">
                          {group.changes.length} change{group.changes.length !== 1 ? 's' : ''}
                        </span>
                      </td>
                      <td>
                        <div className="adm-btn-group" style={{ justifyContent: 'center' }}>
                          <button className="adm-btn adm-btn-view" onClick={() => openViewChangesModal(groupKey)}>
                            <i className="bi bi-eye"></i> View Changes
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* View Changes Modal */}
      {showModal && modalData && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3><i className="bi bi-search me-2"></i> Review Profile Changes</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}><i className="bi bi-x-lg"></i></button>
            </div>

            <div className="modal-user-info">
              <strong>User:</strong> {modalData.fName} {modalData.lName}<br/>
              <strong>Email:</strong> {modalData.email || 'N/A'}<br/>
              <strong>Total Changes:</strong> {modalData.changes.length}

              {/* --- INTEGRATED STATIC ASSETS VALIDATION PREVIEW BLOCK --- */}
              {modalData.proof_document ? (
                <div className="admin-proof-preview-container">
                  <div className="fw-bold text-secondary small text-uppercase mb-2">
                    <i className="bi bi-file-earmark-medical-fill text-success me-1"></i> Attached Resident Authentication Document
                  </div>
                  
                  {modalData.proof_document.toLowerCase().endsWith('.pdf') ? (
                    <div className="text-center p-3 bg-white border rounded">
                      <i className="bi bi-file-earmark-pdf text-danger fs-1"></i>
                      <p className="mb-2 mt-1 small font-monospace text-truncate">{modalData.proof_document.split('/').pop()}</p>
                      <a 
                        href={getProofAssetUrl(modalData.proof_document)} 
                        target="_blank" 
                        rel="noreferrer" 
                        className="adm-btn adm-btn-view d-inline-flex mx-auto"
                        style={{ width: 'auto' }}
                      >
                        Open Document PDF
                      </a>
                    </div>
                  ) : (
                    <div className="admin-proof-media-wrapper">
                      <img 
                        src={getProofAssetUrl(modalData.proof_document)} 
                        alt="Resident Upload Proof" 
                        className="admin-proof-img"
                        onError={(e) => {
                          // Fallback address mapping format logic in case string format diverges
                          e.target.src = `http://localhost/PB2Link/backend/${modalData.proof_document}`;
                        }}
                      />
                    </div>
                  )}
                  <div className="text-center mt-2">
                    <a 
                      href={getProofAssetUrl(modalData.proof_document)} 
                      target="_blank" 
                      rel="noreferrer" 
                      className="small text-decoration-underline fw-medium text-primary"
                    >
                      Open document in new tab <i className="bi bi-box-arrow-up-right small"></i>
                    </a>
                  </div>
                </div>
              ) : (
                <div className="p-3 border rounded text-center text-muted small bg-white mt-2">
                  <i className="bi bi-exclamation-triangle text-warning me-1"></i> No verification documentation file was attached to this profile change.
                </div>
              )}
            </div>

            <table className="changes-table">
              <thead>
                <tr>
                  <th>Field</th>
                  <th>Current Value</th>
                  <th>Requested Value</th>
                  <th style={{ textAlign: 'center', width: '200px' }}>Decision</th>
                  <th style={{ textAlign: 'center', width: '100px' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {modalData.changes.map((change) => (
                  <tr key={change.change_id}>
                    <td><span className="adm-badge">{formatFieldLabel(change.field_name)}</span></td>
                    <td className="adm-val-old">{change.old_value || 'None'}</td>
                    <td><span className="adm-val-new">{change.new_value}</span></td>
                    <td>
                      <div className="checkbox-group">
                        <label className="checkbox-label checkbox-approve">
                          <input 
                            type="checkbox" 
                            checked={individualDecisions[change.change_id] === 'approve'} 
                            onChange={() => handleIndividualDecision(change.change_id, 'approve')} 
                          />
                          <i className="bi bi-check-circle" style={{ color: '#059669' }}></i> Approve
                        </label>
                        <label className="checkbox-label checkbox-reject">
                          <input 
                            type="checkbox" 
                            checked={individualDecisions[change.change_id] === 'reject'} 
                            onChange={() => handleIndividualDecision(change.change_id, 'reject')} 
                          />
                          <i className="bi bi-x-circle" style={{ color: '#ef4444' }}></i> Reject
                        </label>
                      </div>
                    </td>
                    <td>
                      {individualDecisions[change.change_id] && (
                        <button 
                          className="adm-btn" 
                          style={{ 
                            background: individualDecisions[change.change_id] === 'approve' ? '#059669' : '#ef4444', 
                            color: 'white', 
                            width: '100%', 
                            justifyContent: 'center' 
                          }} 
                          onClick={() => handleIndividualAction(change.change_id, individualDecisions[change.change_id])}
                        >
                          <i className={`bi bi-${individualDecisions[change.change_id] === 'approve' ? 'check-lg' : 'x-lg'}`}></i>
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="modal-actions">
              <button className="btn-bulk btn-cancel" onClick={() => setShowModal(false)}><i className="bi bi-x-circle me-1"></i> Cancel</button>
              <button className="btn-bulk btn-reject-all" onClick={() => handleBulkDecisionSubmit('reject')} disabled={!Object.values(individualDecisions).includes('reject')}><i className="bi bi-x-circle me-1"></i> Reject Selected</button>
              <button className="btn-bulk btn-accept-all" onClick={() => handleBulkDecisionSubmit('approve')} disabled={!Object.values(individualDecisions).includes('approve')}><i className="bi bi-check-circle me-1"></i> Approve Selected</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default AdminProfileApprovals;