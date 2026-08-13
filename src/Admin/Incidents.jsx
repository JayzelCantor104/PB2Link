import React, { useEffect, useState } from 'react';
import axios from 'axios';
import './Incidents.css';

const API_BASE = '/api_backend';

// Helper function to normalize status
const normalizeStatus = (status) => {
  const statusLower = (status || '').toLowerCase();
  const statusMap = {
    'pending': 'pending',
    'processing': 'processing',
    'resolved': 'approved',
    'closed': 'completed',
  };
  return statusMap[statusLower] || 'pending';
};

// Helper function to get status icon
const getStatusIcon = (status) => {
  const normalized = normalizeStatus(status);
  const iconMap = {
    'pending': 'bi-hourglass-split',
    'approved': 'bi-check-circle-fill',
    'completed': 'bi-patch-check-fill',
    'processing': 'bi-gear-fill'
  };
  return iconMap[normalized] || 'bi-info-circle';
};

// Helper function to get public URL
const getPublicUrl = (path) => {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  // Convert relative path to absolute URL
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

const Incidents = () => {
  const [incidents, setIncidents] = useState([]);
  const [message, setMessage] = useState('');
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [actionContext, setActionContext] = useState(null);
  const [previewAttachment, setPreviewAttachment] = useState(null);
  const [previewZoom, setPreviewZoom] = useState(1);
  const [previewPan, setPreviewPan] = useState({ x: 0, y: 0 });
  const [isPreviewDragging, setIsPreviewDragging] = useState(false);
  const [previewDragOrigin, setPreviewDragOrigin] = useState({ x: 0, y: 0 });

  const fetchIncidents = async () => {
    try {
      const response = await axios.get(`${API_BASE}/get_admin_incidents.php`);
      if (response.data.success) setIncidents(response.data.data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => { fetchIncidents(); }, []);

  const handleInitiateUpdate = (incident, targetStatus) => {
    setActionContext({
      incident_id: incident.id,
      targetStatus,
      itemObject: incident,
      adminRemarks: ''
    });
  };

  const processStatusUpdateWithRemarks = async () => {
    if (!actionContext) return;

    try {
      const response = await axios.post(`${API_BASE}/update_incident_status.php`, {
        id: actionContext.incident_id,
        status: actionContext.targetStatus,
        remarks: actionContext.adminRemarks
      });

      if (response.data.success) {
        setMessage(`Incident status updated to ${actionContext.targetStatus}.`);
        fetchIncidents();
        setSelectedIncident(null);
        setActionContext(null);
      } else {
        setMessage(`Error: ${response.data.message || 'Unable to update status.'}`);
      }
    } catch (err) {
      console.error(err);
      setMessage('Error updating incident status.');
    }
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

  const getStatusClass = (status) => {
    const s = (status || '').toLowerCase();
    if (s.includes('pending')) return 'status-pending';
    if (s.includes('process')) return 'status-processing';
    if (s.includes('resolved') || s.includes('complete')) return 'status-approved';
    if (s.includes('close')) return 'status-rejected';
    return 'status-default';
  };

  return (
    <div className="admin-page-container">
      <h2><i className="bi bi-exclamation-triangle"></i> Incident Reports</h2>
      <p>Review reported incidents and update status to keep records current.</p>
      {message && <div className="admin-success-box">{message}</div>}
      <div className="table-card">
        <table className="admin-table">
          <thead>
            <tr>
              <th style={{ textAlign: 'center' }}>Track Code</th>
              <th style={{ textAlign: 'center' }}>Reporter</th>
              <th style={{ textAlign: 'center' }}>Type</th>
              <th style={{ textAlign: 'center' }}>Status</th>
              <th style={{ textAlign: 'center' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {incidents.map(item => (
              <tr key={item.id}>
                <td><span className="track-code">{item.track_code}</span></td>
                <td>{item.reporter_name}</td>
                <td>{item.incident_class || item.reporting_class}</td>
                <td><span className={`status-pill ${getStatusClass(item.status)}`}>{item.status}</span></td>
                <td className="admin-action-cell">
                  <button 
                    className="admin-btn view-btn" 
                    onClick={() => setSelectedIncident(item)}
                    title="View Details"
                  >
                    <i className="bi bi-eye"></i>
                  </button>
                  <button className="admin-btn approve" onClick={() => handleInitiateUpdate(item, 'Processing')}>Process</button>
                  <button className="admin-btn complete" onClick={() => handleInitiateUpdate(item, 'Resolved')}>Resolve</button>
                  <button className="admin-btn reject" onClick={() => handleInitiateUpdate(item, 'Closed')}>Close</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Incident Details Modal */}
      {selectedIncident && (
        <div className="detail-modal-overlay" onClick={() => setSelectedIncident(null)}>
          <div className="detail-modal" role="document" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="detail-modal-header">
              <div>
                <p className="detail-modal-subtitle">Incident Report</p>
                <h2>{selectedIncident.track_code}</h2>
                <span className={`status-pill status-${normalizeStatus(selectedIncident.status)}`}>
                  <i className={`bi ${getStatusIcon(selectedIncident.status)}`}></i> {selectedIncident.status}
                </span>
              </div>
              <button className="detail-close-btn" onClick={() => setSelectedIncident(null)} type="button" aria-label="Close details">
                <i className="bi bi-x-lg"></i>
              </button>
            </div>

            <div className="detail-modal-body">
              <div className="detail-section">
                <h4 className="detail-section-title">Report Information</h4>
                <div className="detail-grid">
                  <div>
                    <span className="detail-label">Tracking Code</span>
                    <p className="detail-value font-mono">{selectedIncident.track_code}</p>
                  </div>
                  <div>
                    <span className="detail-label">Status</span>
                    <p className="detail-value">{selectedIncident.status}</p>
                  </div>
                  <div>
                    <span className="detail-label">Date Reported</span>
                    <p className="detail-value">
                      {selectedIncident.created_at ? new Date(selectedIncident.created_at).toLocaleString() : 'N/A'}
                    </p>
                  </div>
                  <div>
                    <span className="detail-label">Incident Type</span>
                    <p className="detail-value">{selectedIncident.incident_class || selectedIncident.reporting_class || 'N/A'}</p>
                  </div>
                </div>
              </div>

              <hr className="detail-divider" />

              <div className="detail-section">
                <h4 className="detail-section-title">Reporter Information</h4>
                <div className="detail-grid">
                  <div style={{ gridColumn: 'span 2' }}>
                    <p className="detail-value text-capitalize">{selectedIncident.reporter_name || 'N/A'}</p>
                  </div>
                  <div>
                    <span className="detail-label">Contact Number</span>
                    <p className="detail-value">{selectedIncident.reporter_contact || 'N/A'}</p>
                  </div>
                  <div>
                    <span className="detail-label">Incident Address</span>
                    <p className="detail-value" style={{ gridColumn: 'span 2' }}>{selectedIncident.incident_address || 'N/A'}</p>
                  </div>
                </div>
              </div>

              <hr className="detail-divider" />

              <div className="detail-section">
                <h4 className="detail-section-title">Person Involved</h4>
                <div className="detail-grid">
                  <div>
                    <span className="detail-label">Name</span>
                    <p className="detail-value text-capitalize">{selectedIncident.contact_person_name || 'N/A'}</p>
                  </div>
                  <div>
                    <span className="detail-label">Contact Number</span>
                    <p className="detail-value">{selectedIncident.contact_person_number || 'N/A'}</p>
                  </div>
                </div>
              </div>

              <hr className="detail-divider" />

              <div className="detail-section">
                <h4 className="detail-section-title">Incident Description</h4>
                <div className="detail-grid">
                  <div style={{ gridColumn: 'span 2' }}>
                    <span className="detail-label">Description</span>
                    <p className="detail-value">{selectedIncident.description || 'N/A'}</p>
                  </div>
                </div>
              </div>

              {(() => {
                const attachments = getAttachmentList(selectedIncident.attachment_path);

                if (!attachments.length) return null;

                return (
                  <>
                    <hr className="detail-divider" />
                    <div className="detail-section">
                      <h4 className="detail-section-title">Evidence Attachments</h4>
                      <div className="detail-media-grid">
                        {attachments.map((path, index) => {
                          const type = getAttachmentType(path);
                          return (
                            <div className="detail-media-card" key={`${path}-${index}`}>
                              <span className="detail-label">
                                {type === 'video' ? (
                                  <><i className="bi bi-film"></i> Video Evidence {index + 1}</>
                                ) : (
                                  <><i className="bi bi-image"></i> Photo Evidence {index + 1}</>
                                )}
                              </span>
                              <button
                                type="button"
                                className="attachment-preview-trigger"
                                onClick={() => setPreviewAttachment(path)}
                                aria-label={`Preview evidence ${index + 1}`}
                              >
                                {type === 'video' ? (
                                  <video
                                    src={getPublicUrl(path)}
                                    controls
                                    style={{ width: '100%', borderRadius: '8px', maxHeight: '300px', backgroundColor: '#000' }}
                                  />
                                ) : (
                                  <img
                                    src={getPublicUrl(path)}
                                    alt={`Evidence ${index + 1}`}
                                    style={{ width: '100%', borderRadius: '8px', maxHeight: '300px', objectFit: 'cover' }}
                                  />
                                )}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {previewAttachment && (
        <div
          className="detail-modal-overlay attachment-preview-overlay"
          onClick={() => {
            setPreviewAttachment(null);
            resetPreviewTransform(setPreviewZoom, setPreviewPan, setIsPreviewDragging);
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
                  resetPreviewTransform(setPreviewZoom, setPreviewPan, setIsPreviewDragging);
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

      {actionContext && (
        <div className="detail-modal-overlay" onClick={() => setActionContext(null)}>
          <div className="detail-modal admin-workflow-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="detail-modal-header">
              <div>
                <p className="detail-modal-subtitle">Incident Status Update</p>
                <h2>Send Status Notification</h2>
                <span className={`status-pill status-${normalizeStatus(actionContext.targetStatus)}`}>
                  <i className={`bi ${getStatusIcon(actionContext.targetStatus)}`}></i> {actionContext.targetStatus}
                </span>
              </div>
              <button className="detail-close-btn" onClick={() => setActionContext(null)} type="button" aria-label="Close update modal">
                <i className="bi bi-x-lg"></i>
              </button>
            </div>

            <div className="detail-modal-body">
              <div className="detail-section">
                <h4 className="detail-section-title">Incident Summary</h4>
                <div className="detail-grid">
                  <div>
                    <span className="detail-label">Tracking Code</span>
                    <p className="detail-value font-mono">{actionContext.itemObject.track_code}</p>
                  </div>
                  <div>
                    <span className="detail-label">Reporter</span>
                    <p className="detail-value">{actionContext.itemObject.reporter_name || 'N/A'}</p>
                  </div>
                  <div>
                    <span className="detail-label">Contact Number</span>
                    <p className="detail-value">{actionContext.itemObject.reporter_contact || 'N/A'}</p>
                  </div>
                  <div>
                    <span className="detail-label">Incident Type</span>
                    <p className="detail-value">{actionContext.itemObject.incident_class || actionContext.itemObject.reporting_class || 'N/A'}</p>
                  </div>
                </div>
              </div>

              <hr className="detail-divider" />

              <div className="detail-section">
                <h4 className="detail-section-title">Custom Email Message</h4>
                <label className="detail-label" htmlFor="incident-admin-remarks">Message to include in user notification</label>
                <textarea
                  id="incident-admin-remarks"
                  className="workflow-textarea"
                  rows="5"
                  placeholder="Type a short note for the reporter. This will be included in the email notification."
                  value={actionContext.adminRemarks}
                  onChange={(e) => setActionContext({ ...actionContext, adminRemarks: e.target.value })}
                />
              </div>

              <div className="workflow-modal-footer" style={{ marginTop: '18px' }}>
                <button type="button" className="workflow-btn-cancel" onClick={() => setActionContext(null)}>
                  Cancel
                </button>
                <button
                  type="button"
                  id="incident-save-notify-btn"
                  className="workflow-btn-submit is-success"
                  onClick={processStatusUpdateWithRemarks}
                  style={{ background: '#059669', color: '#ffffff' }}
                >
                  <i className="bi bi-cloud-arrow-up-fill"></i> Save & Notify Reporter
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Incidents;
