import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './WasteManagement.css';

const API_BASE = '/api_backend';

const initialScheduleForm = {
  id: null,
  zone_area: '',
  collection_day: 'Monday & Thursday',
  collection_time: '06:00 AM - 09:00 AM',
  waste_type: 'Biodegradable (Nabubulok)',
  truck_route: '',
  disposal_site: 'Imus City Materials Recovery Facility (MRF) / Central Landfill',
  truck_team: 'PB2 Green Fleet - Truck #1',
  status: 'Active',
  notes: ''
};

const initialSegregationForm = {
  id: null,
  category_name: '',
  color_tag: 'green',
  icon_class: 'bi-recycle',
  description: '',
  allowed_items: '',
  prohibited_items: '',
  collection_days: '',
  guidelines: ''
};

const WasteManagement = () => {
  const [activeTab, setActiveTab] = useState('schedules'); // 'schedules' | 'segregation' | 'disposal'
  const [schedules, setSchedules] = useState([]);
  const [segregation, setSegregation] = useState([]);
  const [stats, setStats] = useState({ total_schedules: 0, active_schedules: 0, total_zones: 0, categories_count: 0 });
  const [loading, setLoading] = useState(true);

  // Search and filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [dayFilter, setDayFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Modals
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleFormData, setScheduleFormData] = useState(initialScheduleForm);
  const [showSegModal, setShowSegModal] = useState(false);
  const [segFormData, setSegFormData] = useState(initialSegregationForm);

  // Feedback Toast
  const [toast, setToast] = useState(null);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchWasteData = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/waste_management.php?action=get_all`);
      if (res.data && res.data.success) {
        setSchedules(res.data.schedules || []);
        setSegregation(res.data.segregation || []);
        setStats(res.data.stats || { total_schedules: 0, active_schedules: 0, total_zones: 0, categories_count: 0 });
      }
    } catch (err) {
      console.error('Error loading waste management data:', err);
      showToast('Failed to connect to backend. Loaded demo records.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWasteData();
  }, []);

  // Filtered schedules
  const filteredSchedules = schedules.filter((s) => {
    const matchesSearch =
      (s.zone_area || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.truck_route || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.waste_type || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.disposal_site || '').toLowerCase().includes(searchQuery.toLowerCase());

    const matchesDay = dayFilter === 'ALL' || (s.collection_day || '').includes(dayFilter);
    const matchesStatus = statusFilter === 'ALL' || (s.status || '') === statusFilter;

    return matchesSearch && matchesDay && matchesStatus;
  });

  // Handle Save Schedule
  const handleSaveSchedule = async (e) => {
    e.preventDefault();
    try {
      const res = await axios.post(`${API_BASE}/waste_management.php?action=save_schedule`, scheduleFormData);
      if (res.data && res.data.success) {
        showToast(scheduleFormData.id ? 'Schedule updated successfully!' : 'New schedule added!');
        setShowScheduleModal(false);
        setScheduleFormData(initialScheduleForm);
        fetchWasteData();
      } else {
        showToast(res.data.message || 'Error saving schedule.', 'error');
      }
    } catch {
      showToast('Request failed. Please check inputs.', 'error');
    }
  };

  // Handle Delete Schedule
  const handleDeleteSchedule = async (id) => {
    if (!window.confirm('Are you sure you want to remove this garbage collection schedule?')) return;
    try {
      const res = await axios.post(`${API_BASE}/waste_management.php?action=delete_schedule`, { id });
      if (res.data && res.data.success) {
        showToast('Schedule deleted.');
        fetchWasteData();
      } else {
        showToast(res.data.message || 'Failed to delete schedule.', 'error');
      }
    } catch {
      showToast('Network error while deleting.', 'error');
    }
  };

  // Handle Save Segregation Rule
  const handleSaveSegregation = async (e) => {
    e.preventDefault();
    try {
      const res = await axios.post(`${API_BASE}/waste_management.php?action=save_segregation`, segFormData);
      if (res.data && res.data.success) {
        showToast('Segregation rule updated!');
        setShowSegModal(false);
        setSegFormData(initialSegregationForm);
        fetchWasteData();
      } else {
        showToast(res.data.message || 'Error updating rule.', 'error');
      }
    } catch {
      showToast('Failed to save segregation guideline.', 'error');
    }
  };

  const openEditSchedule = (item) => {
    setScheduleFormData({
      id: item.id,
      zone_area: item.zone_area || '',
      collection_day: item.collection_day || 'Monday',
      collection_time: item.collection_time || '',
      waste_type: item.waste_type || 'Biodegradable (Nabubulok)',
      truck_route: item.truck_route || '',
      disposal_site: item.disposal_site || '',
      truck_team: item.truck_team || '',
      status: item.status || 'Active',
      notes: item.notes || ''
    });
    setShowScheduleModal(true);
  };

  const openEditSeg = (item) => {
    setSegFormData({
      id: item.id,
      category_name: item.category_name || '',
      color_tag: item.color_tag || 'green',
      icon_class: item.icon_class || 'bi-recycle',
      description: item.description || '',
      allowed_items: item.allowed_items || '',
      prohibited_items: item.prohibited_items || '',
      collection_days: item.collection_days || '',
      guidelines: item.guidelines || ''
    });
    setShowSegModal(true);
  };

  return (
    <div className="waste-container">
      {/* Feedback Toast */}
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

      {/* Header Row */}
      <div className="page-header-row">
        <div className="page-title-group">
          <h2>
            <i className="bi bi-trash3-fill" style={{ color: '#059669' }}></i>
            Waste Management & Garbage Pick-Up
          </h2>
          <p>Barangay Pasong Buaya II, Imus, Cavite &bull; Informative Collection & Segregation System</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          {activeTab === 'schedules' && (
            <button
              className="btn-primary-action"
              onClick={() => {
                setScheduleFormData(initialScheduleForm);
                setShowScheduleModal(true);
              }}
            >
              <i className="bi bi-plus-circle-fill"></i> Add Pickup Schedule
            </button>
          )}
          {activeTab === 'segregation' && (
            <button
              className="btn-primary-action"
              onClick={() => {
                setSegFormData(initialSegregationForm);
                setShowSegModal(true);
              }}
            >
              <i className="bi bi-plus-circle-fill"></i> Add Segregation Category
            </button>
          )}
        </div>
      </div>

      {/* Stat Cards */}
      <div className="waste-stats-grid">
        <div className="waste-stat-card">
          <div className="waste-icon-box green">
            <i className="bi bi-calendar-check-fill"></i>
          </div>
          <div>
            <h3>{stats.active_schedules}</h3>
            <p>Active Schedules</p>
          </div>
        </div>

        <div className="waste-stat-card">
          <div className="waste-icon-box amber">
            <i className="bi bi-geo-alt-fill"></i>
          </div>
          <div>
            <h3>{stats.total_zones}</h3>
            <p>Covered Zones</p>
          </div>
        </div>

        <div className="waste-stat-card">
          <div className="waste-icon-box blue">
            <i className="bi bi-recycle"></i>
          </div>
          <div>
            <h3>{stats.categories_count}</h3>
            <p>Waste Categories</p>
          </div>
        </div>

        <div className="waste-stat-card">
          <div className="waste-icon-box purple">
            <i className="bi bi-truck"></i>
          </div>
          <div>
            <h3>3 Trucks</h3>
            <p>Fleet Readiness</p>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="waste-tabs-nav">
        <button
          className={`waste-tab-btn ${activeTab === 'schedules' ? 'active' : ''}`}
          onClick={() => setActiveTab('schedules')}
        >
          <i className="bi bi-clock-history"></i> Pick-up Schedules & Routes
        </button>
        <button
          className={`waste-tab-btn ${activeTab === 'segregation' ? 'active' : ''}`}
          onClick={() => setActiveTab('segregation')}
        >
          <i className="bi bi-grid-fill"></i> Waste Segregation Guidelines
        </button>
        <button
          className={`waste-tab-btn ${activeTab === 'disposal' ? 'active' : ''}`}
          onClick={() => setActiveTab('disposal')}
        >
          <i className="bi bi-building"></i> Disposal Sites & MRF Facilities
        </button>
      </div>

      {/* TAB 1: SCHEDULES & ROUTES */}
      {activeTab === 'schedules' && (
        <>
          <div className="filter-bar">
            <div className="search-input-group">
              <i className="bi bi-search" style={{ color: '#94a3b8' }}></i>
              <input
                type="text"
                placeholder="Search area, route, waste type, or truck..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="filter-controls">
              <select
                className="filter-select"
                value={dayFilter}
                onChange={(e) => setDayFilter(e.target.value)}
              >
                <option value="ALL">All Days</option>
                <option value="Monday">Monday</option>
                <option value="Tuesday">Tuesday</option>
                <option value="Wednesday">Wednesday</option>
                <option value="Thursday">Thursday</option>
                <option value="Friday">Friday</option>
                <option value="Saturday">Saturday</option>
              </select>

              <select
                className="filter-select"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="ALL">All Statuses</option>
                <option value="Active">Active</option>
                <option value="Rescheduled">Rescheduled</option>
                <option value="Suspended">Suspended</option>
                <option value="Completed">Completed</option>
              </select>
            </div>
          </div>

          <div className="table-card">
            <table className="custom-data-table">
              <thead>
                <tr>
                  <th>Place / Zone</th>
                  <th>Schedule & Time</th>
                  <th>Waste Type</th>
                  <th>Truck Route</th>
                  <th>Disposal Destination</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                      Loading schedules...
                    </td>
                  </tr>
                ) : filteredSchedules.length === 0 ? (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                      No collection schedules match your criteria.
                    </td>
                  </tr>
                ) : (
                  filteredSchedules.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <strong style={{ color: '#1e293b', display: 'block' }}>{item.zone_area}</strong>
                        <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                          <i className="bi bi-truck"></i> {item.truck_team || 'PB2 Green Fleet'}
                        </span>
                      </td>
                      <td>
                        <div style={{ fontWeight: 700, color: '#043927' }}>{item.collection_day}</div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                          <i className="bi bi-clock"></i> {item.collection_time}
                        </div>
                      </td>
                      <td>
                        <span className="waste-type-tag">{item.waste_type}</span>
                      </td>
                      <td style={{ maxWidth: '240px' }}>
                        <div style={{ fontSize: '0.8rem', color: '#334155', lineHeight: '1.4' }}>
                          <i className="bi bi-signpost-2" style={{ color: '#059669', marginRight: '4px' }}></i>
                          {item.truck_route || 'Standard Subdivision Route'}
                        </div>
                      </td>
                      <td style={{ maxWidth: '200px' }}>
                        <div style={{ fontSize: '0.8rem', color: '#475569' }}>
                          <i className="bi bi-geo-alt" style={{ color: '#d97706', marginRight: '4px' }}></i>
                          {item.disposal_site}
                        </div>
                      </td>
                      <td>
                        <span className={`status-pill status-${(item.status || 'active').toLowerCase()}`}>
                          {item.status || 'Active'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          className="btn-icon-action"
                          title="Edit Schedule"
                          onClick={() => openEditSchedule(item)}
                        >
                          <i className="bi bi-pencil-fill"></i>
                        </button>
                        <button
                          className="btn-icon-action danger"
                          title="Delete Schedule"
                          onClick={() => handleDeleteSchedule(item.id)}
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
        </>
      )}

      {/* TAB 2: SEGREGATION GUIDELINES */}
      {activeTab === 'segregation' && (
        <div className="segregation-grid">
          {segregation.map((cat) => (
            <div key={cat.id} className={`segregation-card ${cat.color_tag || 'green'}`}>
              <div className="seg-header">
                <div>
                  <h4 className="seg-title">{cat.category_name}</h4>
                  <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Barangay Segregation Standard</span>
                </div>
                <button
                  className="btn-icon-action"
                  title="Edit Rule"
                  onClick={() => openEditSeg(cat)}
                >
                  <i className="bi bi-pencil-fill"></i>
                </button>
              </div>

              <p className="seg-desc">{cat.description}</p>

              <div className="seg-item-block">
                <div className="seg-item-label allowed">
                  <i className="bi bi-check-circle-fill"></i> Allowed / Kasamang Itapon:
                </div>
                <p className="seg-item-text">{cat.allowed_items || 'N/A'}</p>
              </div>

              {cat.prohibited_items && (
                <div className="seg-item-block">
                  <div className="seg-item-label prohibited">
                    <i className="bi bi-x-circle-fill"></i> Prohibited / Bawal Isama:
                  </div>
                  <p className="seg-item-text">{cat.prohibited_items}</p>
                </div>
              )}

              {cat.guidelines && (
                <div style={{ margin: '8px 0', fontSize: '0.8rem', color: '#475569', fontStyle: 'italic' }}>
                  <strong>Paalala:</strong> {cat.guidelines}
                </div>
              )}

              <div className="seg-footer">
                <span className="seg-days-badge">
                  <i className="bi bi-calendar-event"></i> {cat.collection_days || 'Designated Pickup Days'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TAB 3: DISPOSAL & MRF SITES */}
      {activeTab === 'disposal' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
          <div className="table-card" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div className="waste-icon-box green">
                <i className="bi bi-recycle"></i>
              </div>
              <div>
                <h4 style={{ margin: 0, color: '#043927', fontWeight: 800 }}>
                  Barangay PB2 Materials Recovery Facility (MRF)
                </h4>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Eco-Shed & Drop-Off Station</span>
              </div>
            </div>
            <p style={{ fontSize: '0.85rem', color: '#475569', lineHeight: '1.5' }}>
              Dedicated barangay facility for initial sorting, weighing of recyclable items, composting of garden and vegetable waste, and holding zone for eco-bricks and scrap materials.
            </p>
            <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '10px', fontSize: '0.8rem' }}>
              <div style={{ marginBottom: '6px' }}><strong>Location:</strong> Barangay Compound, Pasong Buaya II, Imus, Cavite</div>
              <div style={{ marginBottom: '6px' }}><strong>Operating Hours:</strong> Mon - Sat: 8:00 AM - 5:00 PM</div>
              <div><strong>Focal Officer:</strong> Barangay Eco Officer / Green Patrol</div>
            </div>
          </div>

          <div className="table-card" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div className="waste-icon-box amber">
                <i className="bi bi-truck-flatbed"></i>
              </div>
              <div>
                <h4 style={{ margin: 0, color: '#043927', fontWeight: 800 }}>
                  City of Imus Central Sanitary Landfill & Disposal Point
                </h4>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>LGU Regulated Final Disposal</span>
              </div>
            </div>
            <p style={{ fontSize: '0.85rem', color: '#475569', lineHeight: '1.5' }}>
              Designated sanitary landfill managed under the City Environment and Natural Resources Office (CENRO) of Imus for municipal residual waste that cannot be composted or recycled.
            </p>
            <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '10px', fontSize: '0.8rem' }}>
              <div style={{ marginBottom: '6px' }}><strong>Compliance:</strong> RA 9003 (Ecological Solid Waste Management Act)</div>
              <div style={{ marginBottom: '6px' }}><strong>Disposal Schedule:</strong> Tuesdays, Thursdays, Saturdays</div>
              <div><strong>Supervision:</strong> Imus City CENRO Waste Transport Division</div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ADD / EDIT PICKUP SCHEDULE */}
      {showScheduleModal && (
        <div className="modal-backdrop" onClick={() => setShowScheduleModal(false)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h4>
                <i className="bi bi-calendar-plus-fill" style={{ color: '#059669' }}></i>
                {scheduleFormData.id ? 'Edit Pickup Schedule & Route' : 'Add Garbage Pickup Schedule'}
              </h4>
              <button className="modal-close-btn" onClick={() => setShowScheduleModal(false)}>
                <i className="bi bi-x-lg"></i>
              </button>
            </div>
            <form onSubmit={handleSaveSchedule}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Place / Zone / Subdivision *</label>
                  <input
                    type="text"
                    required
                    className="form-input"
                    placeholder="e.g. Phase 1 - Main Avenue & Secondary Streets"
                    value={scheduleFormData.zone_area}
                    onChange={(e) => setScheduleFormData({ ...scheduleFormData, zone_area: e.target.value })}
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Collection Day(s) *</label>
                    <input
                      type="text"
                      required
                      className="form-input"
                      placeholder="e.g. Monday & Thursday"
                      value={scheduleFormData.collection_day}
                      onChange={(e) => setScheduleFormData({ ...scheduleFormData, collection_day: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Time Window *</label>
                    <input
                      type="text"
                      required
                      className="form-input"
                      placeholder="e.g. 06:00 AM - 09:00 AM"
                      value={scheduleFormData.collection_time}
                      onChange={(e) => setScheduleFormData({ ...scheduleFormData, collection_time: e.target.value })}
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Type of Waste Collected *</label>
                    <select
                      className="form-select"
                      value={scheduleFormData.waste_type}
                      onChange={(e) => setScheduleFormData({ ...scheduleFormData, waste_type: e.target.value })}
                    >
                      <option value="Biodegradable (Nabubulok)">Biodegradable (Nabubulok)</option>
                      <option value="Non-Biodegradable / Residual">Non-Biodegradable / Residual</option>
                      <option value="Recyclables & Dry Plastics">Recyclables & Dry Plastics</option>
                      <option value="Special & Bulky Waste">Special & Bulky Waste</option>
                      <option value="All Segregated Waste">All Segregated Waste</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Status</label>
                    <select
                      className="form-select"
                      value={scheduleFormData.status}
                      onChange={(e) => setScheduleFormData({ ...scheduleFormData, status: e.target.value })}
                    >
                      <option value="Active">Active</option>
                      <option value="Rescheduled">Rescheduled</option>
                      <option value="Suspended">Suspended</option>
                      <option value="Completed">Completed</option>
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Garbage Truck Route (Streets / Path) *</label>
                  <textarea
                    rows="2"
                    required
                    className="form-textarea"
                    placeholder="e.g. Entry Gate -> Santol St. -> Phase 1 Covered Court -> Exit to Main Road"
                    value={scheduleFormData.truck_route}
                    onChange={(e) => setScheduleFormData({ ...scheduleFormData, truck_route: e.target.value })}
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Disposal Destination *</label>
                    <input
                      type="text"
                      required
                      className="form-input"
                      placeholder="e.g. Imus City MRF / Sanitary Landfill"
                      value={scheduleFormData.disposal_site}
                      onChange={(e) => setScheduleFormData({ ...scheduleFormData, disposal_site: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Assigned Truck / Team</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. PB2 Green Fleet - Truck #1"
                      value={scheduleFormData.truck_team}
                      onChange={(e) => setScheduleFormData({ ...scheduleFormData, truck_team: e.target.value })}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Special Advisory / Notes for Residents</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Please put bins outside 15 minutes before 6:00 AM."
                    value={scheduleFormData.notes}
                    onChange={(e) => setScheduleFormData({ ...scheduleFormData, notes: e.target.value })}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowScheduleModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary-action">
                  <i className="bi bi-save-fill"></i> Save Schedule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EDIT SEGREGATION RULE */}
      {showSegModal && (
        <div className="modal-backdrop" onClick={() => setShowSegModal(false)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h4>
                <i className="bi bi-recycle" style={{ color: '#059669' }}></i>
                {segFormData.id ? 'Edit Segregation Guideline' : 'Add Segregation Category'}
              </h4>
              <button className="modal-close-btn" onClick={() => setShowSegModal(false)}>
                <i className="bi bi-x-lg"></i>
              </button>
            </div>
            <form onSubmit={handleSaveSegregation}>
              <div className="modal-body">
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Category Name *</label>
                    <input
                      type="text"
                      required
                      className="form-input"
                      placeholder="e.g. Biodegradable (Nabubulok)"
                      value={segFormData.category_name}
                      onChange={(e) => setSegFormData({ ...segFormData, category_name: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Color Accent</label>
                    <select
                      className="form-select"
                      value={segFormData.color_tag}
                      onChange={(e) => setSegFormData({ ...segFormData, color_tag: e.target.value })}
                    >
                      <option value="green">Green (Organic / Nabubulok)</option>
                      <option value="amber">Amber (Residual / Di-nabubulok)</option>
                      <option value="blue">Blue (Recyclables)</option>
                      <option value="red">Red (Hazardous / Special)</option>
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Category Description *</label>
                  <textarea
                    rows="2"
                    required
                    className="form-textarea"
                    placeholder="General definition and instructions"
                    value={segFormData.description}
                    onChange={(e) => setSegFormData({ ...segFormData, description: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Allowed Items (Kasamang Itapon)</label>
                  <textarea
                    rows="2"
                    className="form-textarea"
                    placeholder="e.g. Food leftovers, fruit peelings, garden leaves"
                    value={segFormData.allowed_items}
                    onChange={(e) => setSegFormData({ ...segFormData, allowed_items: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Prohibited Items (Bawal Isama)</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Plastics, cans, batteries"
                    value={segFormData.prohibited_items}
                    onChange={(e) => setSegFormData({ ...segFormData, prohibited_items: e.target.value })}
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Collection Days</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. Monday & Thursday (6:00 AM - 9:00 AM)"
                      value={segFormData.collection_days}
                      onChange={(e) => setSegFormData({ ...segFormData, collection_days: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Disposal Reminder / Paalala</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. Drain liquids before throwing"
                      value={segFormData.guidelines}
                      onChange={(e) => setSegFormData({ ...segFormData, guidelines: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowSegModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary-action">
                  <i className="bi bi-save-fill"></i> Save Guidelines
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default WasteManagement;

