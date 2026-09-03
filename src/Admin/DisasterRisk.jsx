import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './DisasterRisk.css';

const API_BASE = '/api_backend';

const initialAlertForm = {
  id: null,
  title: '',
  alert_level: 'Watch',
  calamity_type: 'Heavy Rainfall / Flood Watch',
  affected_areas: '',
  evacuation_schedule: '',
  instructions: '',
  is_active: 1
};

const initialCenterForm = {
  id: null,
  name: '',
  location: '',
  capacity_families: 100,
  current_families: 0,
  status: 'Available',
  facilities: '',
  contact_person: '',
  contact_number: ''
};

const DisasterRisk = () => {
  const [activeTab, setActiveTab] = useState('centers'); // 'centers' | 'alerts' | 'protocols'
  const [alerts, setAlerts] = useState([]);
  const [centers, setCenters] = useState([]);
  const [stats, setStats] = useState({
    active_alerts_count: 0,
    total_centers: 0,
    available_centers: 0,
    total_capacity_families: 0,
    total_current_families: 0
  });
  const [loading, setLoading] = useState(true);

  // Modals
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [alertFormData, setAlertFormData] = useState(initialAlertForm);
  const [showCenterModal, setShowCenterModal] = useState(false);
  const [centerFormData, setCenterFormData] = useState(initialCenterForm);

  // Quick occupancy modal
  const [occupancyModal, setOccupancyModal] = useState(null); // { id, name, current_families, status }

  // Toast
  const [toast, setToast] = useState(null);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchRiskData = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/disaster_risk.php?action=get_all`);
      if (res.data && res.data.success) {
        setAlerts(res.data.alerts || []);
        setCenters(res.data.centers || []);
        setStats(res.data.stats || {
          active_alerts_count: 0,
          total_centers: 0,
          available_centers: 0,
          total_capacity_families: 0,
          total_current_families: 0
        });
      }
    } catch (err) {
      console.error('Error fetching disaster risk data:', err);
      showToast('Loaded local information.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRiskData();
  }, []);

  const activeAlert = alerts.find((a) => Number(a.is_active) === 1);

  // Save Disaster Alert
  const handleSaveAlert = async (e) => {
    e.preventDefault();
    try {
      const res = await axios.post(`${API_BASE}/disaster_risk.php?action=save_alert`, alertFormData);
      if (res.data && res.data.success) {
        showToast(alertFormData.id ? 'Advisory updated!' : 'Emergency alert issued!');
        setShowAlertModal(false);
        setAlertFormData(initialAlertForm);
        fetchRiskData();
      } else {
        showToast(res.data.message || 'Error saving alert.', 'error');
      }
    } catch {
      showToast('Network error while saving alert.', 'error');
    }
  };

  // Toggle Alert Status
  const handleToggleAlert = async (id, currentActive) => {
    try {
      const nextState = currentActive ? 0 : 1;
      const res = await axios.post(`${API_BASE}/disaster_risk.php?action=toggle_alert_status`, {
        id,
        is_active: nextState
      });
      if (res.data && res.data.success) {
        showToast(nextState ? 'Alert activated!' : 'Alert deactivated.');
        fetchRiskData();
      }
    } catch {
      showToast('Failed to toggle alert state.', 'error');
    }
  };

  // Delete Alert
  const handleDeleteAlert = async (id) => {
    if (!window.confirm('Delete this advisory bulletin?')) return;
    try {
      const res = await axios.post(`${API_BASE}/disaster_risk.php?action=delete_alert`, { id });
      if (res.data && res.data.success) {
        showToast('Advisory removed.');
        fetchRiskData();
      }
    } catch {
      showToast('Failed to delete bulletin.', 'error');
    }
  };

  // Save Evacuation Center
  const handleSaveCenter = async (e) => {
    e.preventDefault();
    try {
      const res = await axios.post(`${API_BASE}/disaster_risk.php?action=save_center`, centerFormData);
      if (res.data && res.data.success) {
        showToast(centerFormData.id ? 'Evacuation center updated!' : 'Evacuation center added!');
        setShowCenterModal(false);
        setCenterFormData(initialCenterForm);
        fetchRiskData();
      } else {
        showToast(res.data.message || 'Error saving center.', 'error');
      }
    } catch {
      showToast('Failed to save center data.', 'error');
    }
  };

  // Quick Occupancy Update
  const handleUpdateOccupancy = async (e) => {
    e.preventDefault();
    if (!occupancyModal) return;
    try {
      const res = await axios.post(`${API_BASE}/disaster_risk.php?action=update_center_occupancy`, {
        id: occupancyModal.id,
        current_families: occupancyModal.current_families,
        status: occupancyModal.status
      });
      if (res.data && res.data.success) {
        showToast('Center occupancy updated!');
        setOccupancyModal(null);
        fetchRiskData();
      }
    } catch {
      showToast('Failed to update occupancy.', 'error');
    }
  };

  // Delete Evacuation Center
  const handleDeleteCenter = async (id) => {
    if (!window.confirm('Are you sure you want to remove this evacuation center?')) return;
    try {
      const res = await axios.post(`${API_BASE}/disaster_risk.php?action=delete_center`, { id });
      if (res.data && res.data.success) {
        showToast('Evacuation center removed.');
        fetchRiskData();
      }
    } catch {
      showToast('Failed to delete center.', 'error');
    }
  };

  const openEditAlert = (item) => {
    setAlertFormData({
      id: item.id,
      title: item.title || '',
      alert_level: item.alert_level || 'Advisory',
      calamity_type: item.calamity_type || 'Typhoon / Heavy Rain',
      affected_areas: item.affected_areas || '',
      evacuation_schedule: item.evacuation_schedule || '',
      instructions: item.instructions || '',
      is_active: Number(item.is_active)
    });
    setShowAlertModal(true);
  };

  const openEditCenter = (item) => {
    setCenterFormData({
      id: item.id,
      name: item.name || '',
      location: item.location || '',
      capacity_families: item.capacity_families || 100,
      current_families: item.current_families || 0,
      status: item.status || 'Available',
      facilities: item.facilities || '',
      contact_person: item.contact_person || '',
      contact_number: item.contact_number || ''
    });
    setShowCenterModal(true);
  };

  return (
    <div className="drrm-container">
      {/* Toast */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            top: '80px',
            right: '30px',
            zIndex: 9999,
            background: toast.type === 'error' ? '#dc2626' : '#043927',
            color: '#fff',
            padding: '12px 22px',
            borderRadius: '10px',
            boxShadow: '0 8px 20px rgba(0,0,0,0.15)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontWeight: 600,
            fontSize: '0.85rem'
          }}
        >
          <i className={toast.type === 'error' ? 'bi bi-exclamation-circle' : 'bi bi-check-circle-fill'}></i>
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="page-header-row">
        <div className="page-title-group">
          <h2>
            <i className="bi bi-shield-exclamation" style={{ color: '#dc2626' }}></i>
            Disaster Risk Reduction & Management (DRRM)
          </h2>
          <p>Barangay Pasong Buaya II, Imus, Cavite &bull; Emergency Information & Evacuation Command</p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            className="btn-primary-action"
            onClick={() => {
              setCenterFormData(initialCenterForm);
              setShowCenterModal(true);
            }}
          >
            <i className="bi bi-plus-circle-fill"></i> Add Evacuation Center
          </button>
          <button
            className="btn-danger-action"
            onClick={() => {
              setAlertFormData(initialAlertForm);
              setShowAlertModal(true);
            }}
          >
            <i className="bi bi-broadcast"></i> Issue Disaster Alert
          </button>
        </div>
      </div>

      {/* ACTIVE DISASTER / WEATHER ALERT BANNER */}
      {activeAlert && (
        <div className={`active-alert-banner alert-level-${(activeAlert.alert_level || 'advisory').toLowerCase()}`}>
          <div className="banner-left">
            <div className="banner-icon">
              <i
                className={
                  activeAlert.alert_level === 'Severe'
                    ? 'bi bi-radioactive'
                    : activeAlert.alert_level === 'Warning'
                    ? 'bi bi-exclamation-triangle-fill'
                    : 'bi bi-cloud-lightning-rain-fill'
                }
              ></i>
            </div>
            <div>
              <div className="banner-title-line">
                <span className={`alert-badge badge-${(activeAlert.alert_level || 'advisory').toLowerCase()}`}>
                  {activeAlert.alert_level} Level
                </span>
                <h3>{activeAlert.title}</h3>
              </div>
              <p className="banner-desc">{activeAlert.instructions}</p>
              <div className="banner-meta">
                {activeAlert.affected_areas && (
                  <span>
                    <i className="bi bi-geo-alt-fill"></i> <strong>Affected:</strong> {activeAlert.affected_areas}
                  </span>
                )}
                {activeAlert.evacuation_schedule && (
                  <span>
                    <i className="bi bi-alarm-fill"></i> <strong>Evacuation Schedule:</strong>{' '}
                    {activeAlert.evacuation_schedule}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              className="btn-primary-action"
              style={{ background: '#1e293b' }}
              onClick={() => openEditAlert(activeAlert)}
            >
              <i className="bi bi-pencil-square"></i> Edit Alert
            </button>
            <button
              className="btn-secondary"
              onClick={() => handleToggleAlert(activeAlert.id, 1)}
            >
              Deactivate
            </button>
          </div>
        </div>
      )}

      {/* Stat Cards */}
      <div className="drrm-stats-grid">
        <div className="drrm-stat-card">
          <div className="drrm-icon-box red">
            <i className="bi bi-bell-fill"></i>
          </div>
          <div>
            <h3>{stats.active_alerts_count}</h3>
            <p>Active Advisories</p>
          </div>
        </div>

        <div className="drrm-stat-card">
          <div className="drrm-icon-box green">
            <i className="bi bi-house-heart-fill"></i>
          </div>
          <div>
            <h3>{stats.available_centers} / {stats.total_centers}</h3>
            <p>Centers Available</p>
          </div>
        </div>

        <div className="drrm-stat-card">
          <div className="drrm-icon-box blue">
            <i className="bi bi-people-fill"></i>
          </div>
          <div>
            <h3>{stats.total_capacity_families} Families</h3>
            <p>Total Capacity</p>
          </div>
        </div>

        <div className="drrm-stat-card">
          <div className="drrm-icon-box amber">
            <i className="bi bi-person-walking"></i>
          </div>
          <div>
            <h3>{stats.total_current_families} Families</h3>
            <p>Current Evacuees</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="drrm-tabs-nav">
        <button
          className={`drrm-tab-btn ${activeTab === 'centers' ? 'active' : ''}`}
          onClick={() => setActiveTab('centers')}
        >
          <i className="bi bi-buildings"></i> Evacuation Centers & Availability
        </button>
        <button
          className={`drrm-tab-btn ${activeTab === 'alerts' ? 'active' : ''}`}
          onClick={() => setActiveTab('alerts')}
        >
          <i className="bi bi-megaphone-fill"></i> Weather Advisories & Alerts
        </button>
        <button
          className={`drrm-tab-btn ${activeTab === 'protocols' ? 'active' : ''}`}
          onClick={() => setActiveTab('protocols')}
        >
          <i className="bi bi-signpost-split"></i> Evacuation Protocols & Schedules
        </button>
      </div>

      {/* TAB 1: EVACUATION CENTERS */}
      {activeTab === 'centers' && (
        <div className="evac-grid">
          {centers.map((center) => {
            const cap = Number(center.capacity_families) || 1;
            const curr = Number(center.current_families) || 0;
            const pct = Math.min(100, Math.round((curr / cap) * 100));

            let progressClass = 'progress-green';
            if (pct >= 80) progressClass = 'progress-red';
            else if (pct >= 50) progressClass = 'progress-amber';

            return (
              <div key={center.id} className="evac-card">
                <div className="evac-card-header">
                  <div>
                    <h4 className="evac-card-title">{center.name}</h4>
                    <div className="evac-location">
                      <i className="bi bi-geo-alt"></i> {center.location}
                    </div>
                  </div>
                  <span className={`evac-status-pill evac-${(center.status || 'available').toLowerCase()}`}>
                    {center.status}
                  </span>
                </div>

                {/* Occupancy Indicator */}
                <div className="occupancy-box">
                  <div className="occupancy-labels">
                    <span>
                      Occupancy: {curr} / {cap} Families
                    </span>
                    <span>{pct}% Full</span>
                  </div>
                  <div className="progress-track">
                    <div className={`progress-fill ${progressClass}`} style={{ width: `${pct}%` }}></div>
                  </div>
                </div>

                <div className="evac-facilities-box">
                  <strong style={{ display: 'block', marginBottom: '4px', color: '#1e293b' }}>
                    <i className="bi bi-check2-circle" style={{ color: '#059669' }}></i> Available Facilities:
                  </strong>
                  {center.facilities || 'Potable Water, Restrooms, First Aid Kit, Emergency Power'}
                </div>

                <div className="evac-footer">
                  <div>
                    <div><strong>Contact:</strong> {center.contact_person || 'BDRRMC Officer'}</div>
                    <div><i className="bi bi-telephone"></i> {center.contact_number || '(046) 471-0000'}</div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      className="btn-icon-action"
                      title="Update Occupancy"
                      style={{ background: '#ecfdf5', color: '#059669' }}
                      onClick={() =>
                        setOccupancyModal({
                          id: center.id,
                          name: center.name,
                          current_families: center.current_families,
                          status: center.status
                        })
                      }
                    >
                      <i className="bi bi-people"></i>
                    </button>
                    <button
                      className="btn-icon-action"
                      title="Edit Center"
                      onClick={() => openEditCenter(center)}
                    >
                      <i className="bi bi-pencil-fill"></i>
                    </button>
                    <button
                      className="btn-icon-action danger"
                      title="Delete Center"
                      onClick={() => handleDeleteCenter(center.id)}
                    >
                      <i className="bi bi-trash-fill"></i>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* TAB 2: WEATHER ADVISORIES & ALERTS */}
      {activeTab === 'alerts' && (
        <div className="table-card">
          <table className="custom-data-table">
            <thead>
              <tr>
                <th>Advisory Title</th>
                <th>Alert Level</th>
                <th>Calamity Type</th>
                <th>Affected Areas</th>
                <th>Evacuation Timetable</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {alerts.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                    No weather advisories recorded.
                  </td>
                </tr>
              ) : (
                alerts.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong style={{ color: '#1e293b' }}>{item.title}</strong>
                      <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>
                        {item.instructions?.substring(0, 70)}...
                      </div>
                    </td>
                    <td>
                      <span className={`alert-badge badge-${(item.alert_level || 'advisory').toLowerCase()}`}>
                        {item.alert_level}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontWeight: 600, color: '#334155' }}>{item.calamity_type}</span>
                    </td>
                    <td style={{ maxWidth: '200px' }}>
                      <span style={{ fontSize: '0.8rem', color: '#475569' }}>
                        {item.affected_areas || 'Barangay-wide'}
                      </span>
                    </td>
                    <td style={{ maxWidth: '180px' }}>
                      <span style={{ fontSize: '0.8rem', color: '#043927', fontWeight: 600 }}>
                        {item.evacuation_schedule || 'Standard Standby'}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`status-pill ${
                          Number(item.is_active) === 1 ? 'status-active' : 'status-suspended'
                        }`}
                      >
                        {Number(item.is_active) === 1 ? 'Active Alert' : 'Deactivated'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        className="btn-icon-action"
                        title={Number(item.is_active) === 1 ? 'Deactivate Alert' : 'Activate Alert'}
                        onClick={() => handleToggleAlert(item.id, Number(item.is_active))}
                      >
                        <i
                          className={
                            Number(item.is_active) === 1
                              ? 'bi bi-toggle-on'
                              : 'bi bi-toggle-off'
                          }
                          style={{ color: Number(item.is_active) === 1 ? '#059669' : '#94a3b8' }}
                        ></i>
                      </button>
                      <button
                        className="btn-icon-action"
                        title="Edit Advisory"
                        onClick={() => openEditAlert(item)}
                      >
                        <i className="bi bi-pencil-fill"></i>
                      </button>
                      <button
                        className="btn-icon-action danger"
                        title="Delete Advisory"
                        onClick={() => handleDeleteAlert(item.id)}
                      >
                        <i className="bi bi-trash-fill"></i>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 3: EVACUATION PROTOCOLS */}
      {activeTab === 'protocols' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
          <div className="table-card" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div className="drrm-icon-box amber">
                <i className="bi bi-clock-history"></i>
              </div>
              <div>
                <h4 style={{ margin: 0, color: '#043927', fontWeight: 800 }}>
                  Pre-emptive Evacuation Timetable
                </h4>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Standard Operating Procedure (SOP)</span>
              </div>
            </div>
            <ul style={{ paddingLeft: '20px', fontSize: '0.85rem', color: '#334155', lineHeight: '1.7' }}>
              <li><strong>Alert Level 1 (Yellow / Advisory):</strong> BDRRMC activation, public announcement through barangay megaphones and PB2Link portal.</li>
              <li><strong>Alert Level 2 (Orange / Watch):</strong> Voluntary evacuation begins for senior citizens, persons with disabilities (PWDs), and pregnant mothers.</li>
              <li><strong>Alert Level 3 (Red / Warning):</strong> Mandatory pre-emptive evacuation for low-lying and riverside residents before nightfall or flood crest.</li>
              <li><strong>Alert Level 4 (Severe / Forced):</strong> Forced evacuation by BDRRMC rescue personnel and Imus City Disaster Responders.</li>
            </ul>
          </div>

          <div className="table-card" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div className="drrm-icon-box green">
                <i className="bi bi-backpack4-fill"></i>
              </div>
              <div>
                <h4 style={{ margin: 0, color: '#043927', fontWeight: 800 }}>
                  Resident 72-Hour "Go Bag" Checklist
                </h4>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Community Preparedness Guide</span>
              </div>
            </div>
            <ul style={{ paddingLeft: '20px', fontSize: '0.85rem', color: '#334155', lineHeight: '1.7' }}>
              <li><strong>Documents:</strong> IDs, birth certificates, land titles sealed in waterproof envelopes.</li>
              <li><strong>Provisions:</strong> At least 3 liters of drinking water per person and non-perishable canned food.</li>
              <li><strong>First Aid:</strong> Essential daily maintenance medicines, antiseptic, and bandages.</li>
              <li><strong>Tools:</strong> Battery-powered flashlight, AM/FM radio, power banks, whistle, and spare cash.</li>
            </ul>
          </div>
        </div>
      )}

      {/* MODAL: ISSUE / EDIT DISASTER ALERT */}
      {showAlertModal && (
        <div className="modal-backdrop" onClick={() => setShowAlertModal(false)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h4>
                <i className="bi bi-broadcast" style={{ color: '#dc2626' }}></i>
                {alertFormData.id ? 'Edit Disaster Alert' : 'Issue Disaster Risk Bulletin'}
              </h4>
              <button className="modal-close-btn" onClick={() => setShowAlertModal(false)}>
                <i className="bi bi-x-lg"></i>
              </button>
            </div>
            <form onSubmit={handleSaveAlert}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Advisory / Bulletin Title *</label>
                  <input
                    type="text"
                    required
                    className="form-input"
                    placeholder="e.g. Typhoon Wind Signal #2 Alert & Flood Watch"
                    value={alertFormData.title}
                    onChange={(e) => setAlertFormData({ ...alertFormData, title: e.target.value })}
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Alert Severity Level *</label>
                    <select
                      className="form-select"
                      value={alertFormData.alert_level}
                      onChange={(e) => setAlertFormData({ ...alertFormData, alert_level: e.target.value })}
                    >
                      <option value="Advisory">Advisory (Low / Weather Monitoring)</option>
                      <option value="Watch">Watch (Moderate / Voluntary Evacuation)</option>
                      <option value="Warning">Warning (High / Pre-emptive Evacuation)</option>
                      <option value="Severe">Severe (Critical / Forced Evacuation)</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Calamity Type</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. Typhoon / Heavy Monsoon Rain"
                      value={alertFormData.calamity_type}
                      onChange={(e) => setAlertFormData({ ...alertFormData, calamity_type: e.target.value })}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Affected Areas / Subdivisions in Pasong Buaya II</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Phase 1 Low-lying, Bucandala riverbank, Purok 3 & 4"
                    value={alertFormData.affected_areas}
                    onChange={(e) => setAlertFormData({ ...alertFormData, affected_areas: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Evacuation Schedule / Departure Notice</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Mandatory evacuation begins 3:00 PM; rescue trucks stationed at covered court"
                    value={alertFormData.evacuation_schedule}
                    onChange={(e) => setAlertFormData({ ...alertFormData, evacuation_schedule: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Instructions & Reminders for Residents *</label>
                  <textarea
                    rows="3"
                    required
                    className="form-textarea"
                    placeholder="Provide actionable guidance for families (e.g. prepare Go Bags, disconnect power breakers, stay tuned)"
                    value={alertFormData.instructions}
                    onChange={(e) => setAlertFormData({ ...alertFormData, instructions: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Publish Status</label>
                  <select
                    className="form-select"
                    value={alertFormData.is_active}
                    onChange={(e) => setAlertFormData({ ...alertFormData, is_active: Number(e.target.value) })}
                  >
                    <option value={1}>Active (Broadcast on System Dashboard)</option>
                    <option value={0}>Draft / Deactivated</option>
                  </select>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowAlertModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-danger-action">
                  <i className="bi bi-save-fill"></i> Save & Broadcast
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD / EDIT EVACUATION CENTER */}
      {showCenterModal && (
        <div className="modal-backdrop" onClick={() => setShowCenterModal(false)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h4>
                <i className="bi bi-house-door-fill" style={{ color: '#059669' }}></i>
                {centerFormData.id ? 'Edit Evacuation Center' : 'Add Evacuation Center'}
              </h4>
              <button className="modal-close-btn" onClick={() => setShowCenterModal(false)}>
                <i className="bi bi-x-lg"></i>
              </button>
            </div>
            <form onSubmit={handleSaveCenter}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Center Name *</label>
                  <input
                    type="text"
                    required
                    className="form-input"
                    placeholder="e.g. Pasong Buaya II Covered Court"
                    value={centerFormData.name}
                    onChange={(e) => setCenterFormData({ ...centerFormData, name: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Location / Address *</label>
                  <input
                    type="text"
                    required
                    className="form-input"
                    placeholder="e.g. Barangay Compound, Pasong Buaya II, Imus, Cavite"
                    value={centerFormData.location}
                    onChange={(e) => setCenterFormData({ ...centerFormData, location: e.target.value })}
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Max Family Capacity *</label>
                    <input
                      type="number"
                      required
                      min="1"
                      className="form-input"
                      value={centerFormData.capacity_families}
                      onChange={(e) =>
                        setCenterFormData({ ...centerFormData, capacity_families: Number(e.target.value) })
                      }
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Current Occupied Families</label>
                    <input
                      type="number"
                      min="0"
                      className="form-input"
                      value={centerFormData.current_families}
                      onChange={(e) =>
                        setCenterFormData({ ...centerFormData, current_families: Number(e.target.value) })
                      }
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Center Status</label>
                    <select
                      className="form-select"
                      value={centerFormData.status}
                      onChange={(e) => setCenterFormData({ ...centerFormData, status: e.target.value })}
                    >
                      <option value="Available">Available</option>
                      <option value="Standby">On Standby</option>
                      <option value="Full">Full</option>
                      <option value="Closed">Closed</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Contact Person</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. Kagawad on Duty"
                      value={centerFormData.contact_person}
                      onChange={(e) => setCenterFormData({ ...centerFormData, contact_person: e.target.value })}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Contact Hotline</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. (046) 471-0000 / 0917-123-4567"
                    value={centerFormData.contact_number}
                    onChange={(e) => setCenterFormData({ ...centerFormData, contact_number: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Available Facilities / Amenities</label>
                  <textarea
                    rows="2"
                    className="form-textarea"
                    placeholder="e.g. Clean Restrooms, Potable Water, Standby Clinic, Heavy Generator"
                    value={centerFormData.facilities}
                    onChange={(e) => setCenterFormData({ ...centerFormData, facilities: e.target.value })}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowCenterModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary-action">
                  <i className="bi bi-save-fill"></i> Save Evacuation Center
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* QUICK OCCUPANCY MODAL */}
      {occupancyModal && (
        <div className="modal-backdrop" onClick={() => setOccupancyModal(null)}>
          <div className="modal-dialog" style={{ maxWidth: '450px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h4>
                <i className="bi bi-people-fill" style={{ color: '#059669' }}></i>
                Quick Occupancy Update
              </h4>
              <button className="modal-close-btn" onClick={() => setOccupancyModal(null)}>
                <i className="bi bi-x-lg"></i>
              </button>
            </div>
            <form onSubmit={handleUpdateOccupancy}>
              <div className="modal-body">
                <div style={{ fontWeight: 700, color: '#1e293b' }}>{occupancyModal.name}</div>
                <div className="form-group">
                  <label className="form-label">Current Families Evacuated:</label>
                  <input
                    type="number"
                    min="0"
                    className="form-input"
                    value={occupancyModal.current_families}
                    onChange={(e) =>
                      setOccupancyModal({ ...occupancyModal, current_families: Number(e.target.value) })
                    }
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Status</label>
                  <select
                    className="form-select"
                    value={occupancyModal.status}
                    onChange={(e) => setOccupancyModal({ ...occupancyModal, status: e.target.value })}
                  >
                    <option value="Available">Available</option>
                    <option value="Standby">On Standby</option>
                    <option value="Full">Full</option>
                    <option value="Closed">Closed</option>
                  </select>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setOccupancyModal(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary-action">
                  Update
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default DisasterRisk;

