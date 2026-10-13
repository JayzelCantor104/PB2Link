import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import './WasteManagement.css';
import Toast from '../components/Toast';
import { useToast } from '../lib/useToast';
import WasteRouteMap from '../components/WasteRouteMap';
import { parseRoutePoints } from '../lib/wasteRoute';

const API_BASE = '/api_backend';

const initialScheduleForm = {
  id: null,
  zone_area: '',
  collection_day: 'Monday & Thursday',
  collection_time: '06:00 AM - 09:00 AM',
  waste_type: 'Biodegradable (Nabubulok)',
  truck_route: '',
  route_coordinates: [],
  disposal_site: 'Imus City Materials Recovery Facility (MRF) / Central Landfill',
  truck_team: 'PB2 Green Fleet - Truck #1',
  status: 'Active',
  notes: ''
};

const getLocalDateValue = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getSchedulesForDate = (items, date) => {
  if (!date) return [];
  const weekday = new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long' });
  const weekdayPattern = new RegExp(`\\b${weekday}\\b`, 'i');
  return items.filter((item) => weekdayPattern.test(item.collection_day || ''));
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

const DAY_OPTIONS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const TIME_OPTIONS = Array.from({ length: 24 * 4 }, (_, index) => {
  const totalMinutes = index * 15;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const value = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  const displayHour = hours % 12 === 0 ? 12 : hours % 12;
  const period = hours >= 12 ? 'PM' : 'AM';
  return { value, label: `${String(displayHour).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${period}` };
});

const formatTimeLabel = (timeValue = '06:00') => {
  const [rawHour = '6', rawMinutes = '00'] = String(timeValue || '06:00').split(':');
  const hour = Number(rawHour);
  const minutes = Number(rawMinutes);
  const safeHour = Number.isNaN(hour) ? 6 : hour;
  const safeMinutes = Number.isNaN(minutes) ? 0 : minutes;
  const normalizedHour = safeHour % 12 === 0 ? 12 : safeHour % 12;
  const timePeriod = safeHour >= 12 ? 'PM' : 'AM';
  return `${String(normalizedHour).padStart(2, '0')}:${String(safeMinutes).padStart(2, '0')} ${timePeriod}`;
};

const formatCollectionTime = (start = '06:00', end = '09:00') => `${formatTimeLabel(start)} - ${formatTimeLabel(end)}`;

const parseCollectionTime = (value = '06:00 AM - 09:00 AM') => {
  const matches = String(value || '').match(/(\d{1,2}:\d{2})/g) || [];
  if (matches.length < 2) {
    return { start: '06:00', end: '09:00' };
  }
  return { start: matches[0], end: matches[1] };
};

const parseSelectedDays = (value = '') => {
  const tokens = String(value || '')
    .split(/(?:,\s*|\s*&\s*|\s+and\s+|\s*\/\s*)/i)
    .map((day) => day.trim())
    .filter(Boolean);

  return [...new Set(tokens.filter((day) => DAY_OPTIONS.includes(day)))];
};

const buildRouteStops = (value = '') => {
  const stops = String(value || '')
    .split(/(?:->|→)/)
    .map((stop) => stop.trim())
    .filter(Boolean);

  if (stops.length === 0) return ['', ''];
  if (stops.length === 1) return [stops[0], ''];
  return [...stops, ''];
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
  const [routeDate, setRouteDate] = useState(() => getLocalDateValue());
  const [selectedRouteId, setSelectedRouteId] = useState('');

  // Modals
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleFormData, setScheduleFormData] = useState(initialScheduleForm);
  const [selectedCollectionDays, setSelectedCollectionDays] = useState(() => parseSelectedDays(initialScheduleForm.collection_day));
  const [timeWindowStart, setTimeWindowStart] = useState('06:00');
  const [timeWindowEnd, setTimeWindowEnd] = useState('09:00');
  const [routeStops, setRouteStops] = useState(() => buildRouteStops(initialScheduleForm.truck_route));
  const [routeRoadValidation, setRouteRoadValidation] = useState(null);
  const [showSegModal, setShowSegModal] = useState(false);
  const [segFormData, setSegFormData] = useState(initialSegregationForm);

  // Feedback Toast
  const { toast, showToast: notify, confirmToast, closeToast } = useToast();
  const showToast = useCallback(
    (message, type = 'success') => notify(type === 'error' ? 'Something went wrong' : 'Success', message, type),
    [notify]
  );
  const handleRouteValidationChange = useCallback((isValid) => setRouteRoadValidation(isValid), []);

  const updateRouteStops = useCallback((nextStops) => {
    setRouteStops(nextStops);
    setScheduleFormData((form) => ({
      ...form,
      truck_route: nextStops.map((stop) => stop.trim()).filter(Boolean).join(' -> ')
    }));
  }, []);

  const resetScheduleForm = useCallback((form = initialScheduleForm) => {
    const nextDays = parseSelectedDays(form.collection_day || initialScheduleForm.collection_day);
    const timeRange = parseCollectionTime(form.collection_time || initialScheduleForm.collection_time);

    setScheduleFormData({
      ...initialScheduleForm,
      ...form,
      collection_day: form.collection_day || initialScheduleForm.collection_day,
      collection_time: form.collection_time || initialScheduleForm.collection_time,
      truck_route: form.truck_route || initialScheduleForm.truck_route,
      route_coordinates: parseRoutePoints(form.route_coordinates || [])
    });
    setSelectedCollectionDays(nextDays);
    setTimeWindowStart(timeRange.start);
    setTimeWindowEnd(timeRange.end);
    setRouteStops(buildRouteStops(form.truck_route || initialScheduleForm.truck_route));
  }, []);

  useEffect(() => {
    setScheduleFormData((form) => ({ ...form, collection_day: selectedCollectionDays.join(', ') }));
  }, [selectedCollectionDays]);

  useEffect(() => {
    setScheduleFormData((form) => ({ ...form, collection_time: formatCollectionTime(timeWindowStart, timeWindowEnd) }));
  }, [timeWindowStart, timeWindowEnd]);

  const fetchWasteData = useCallback(async () => {
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
  }, [showToast]);

  useEffect(() => {
    fetchWasteData();
  }, [fetchWasteData]);

  // Filtered schedules
  const filteredSchedules = schedules.filter((s) => {
    const matchesSearch =
      (s.zone_area || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.truck_route || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.waste_type || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.disposal_site || '').toLowerCase().includes(searchQuery.toLowerCase());

    const matchesDay = dayFilter === 'ALL' || (s.collection_day || '').toLowerCase().includes(dayFilter.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || (s.status || '') === statusFilter;

    return matchesSearch && matchesDay && matchesStatus;
  });
  const routeSchedules = getSchedulesForDate(schedules, routeDate)
    .filter((schedule) => parseRoutePoints(schedule.route_coordinates).length >= 2);
  const selectedRoute = routeSchedules.find((schedule) => String(schedule.id) === String(selectedRouteId))
    || routeSchedules[0];

  // Handle Save Schedule
  const handleSaveSchedule = async (e) => {
    e.preventDefault();
    const routePointCount = parseRoutePoints(scheduleFormData.route_coordinates).length;
    const finalDaySelection = selectedCollectionDays.join(', ');
    const finalRouteText = routeStops.map((stop) => stop.trim()).filter(Boolean).join(' -> ');

    if (!finalDaySelection) {
      showToast('Select at least one collection day.', 'error');
      return;
    }

    if (!finalRouteText || routeStops.map((stop) => stop.trim()).filter(Boolean).length < 2) {
      showToast('Add at least two route stops for the collection area sequence.', 'error');
      return;
    }

    if ((!scheduleFormData.id && routePointCount < 2) || routePointCount === 1) {
      showToast('Plot at least two points on the map to save a collection route.', 'error');
      return;
    }
    if (routePointCount >= 2 && routeRoadValidation !== true) {
      showToast(
        routeRoadValidation === false
          ? 'This route is not on mapped streets. Clear and redraw it along the roads before saving.'
          : 'Wait for mapped streets to load and route validation to finish before saving.',
        'error'
      );
      return;
    }

    const finalScheduleData = {
      ...scheduleFormData,
      collection_day: finalDaySelection,
      collection_time: formatCollectionTime(timeWindowStart, timeWindowEnd),
      truck_route: finalRouteText
    };

    try {
      const res = await axios.post(`${API_BASE}/waste_management.php?action=save_schedule`, finalScheduleData);
      if (res.data && res.data.success) {
        showToast(scheduleFormData.id ? 'Schedule updated successfully!' : 'New schedule added!');
        setShowScheduleModal(false);
        setScheduleFormData(initialScheduleForm);
        setSelectedCollectionDays([]);
        setTimeWindowStart('06:00');
        setTimeWindowEnd('09:00');
        setRouteStops(['', '']);
        setRouteRoadValidation(null);
        fetchWasteData();
      } else {
        showToast(res.data.message || 'Error saving schedule.', 'error');
      }
    } catch (error) {
      const message = error.response?.data?.message
        || (error.response?.status
          ? `Could not save schedule (HTTP ${error.response.status}). Check the backend error log.`
          : 'Could not reach the backend. Check your connection and try again.');
      showToast(message, 'error');
    }
  };

  // Handle Delete Schedule
  const handleDeleteSchedule = async (id) => {
    if (!(await confirmToast('Remove Schedule?', 'This garbage collection schedule will be removed for all residents.', { confirmLabel: 'Remove', danger: true }))) return;
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
    setRouteRoadValidation(null);
    resetScheduleForm({
      id: item.id,
      zone_area: item.zone_area || '',
      collection_day: item.collection_day || 'Monday',
      collection_time: item.collection_time || '06:00 AM - 09:00 AM',
      waste_type: item.waste_type || 'Biodegradable (Nabubulok)',
      truck_route: item.truck_route || '',
      route_coordinates: parseRoutePoints(item.route_coordinates),
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
      <Toast toast={toast} onClose={closeToast} />

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
                resetScheduleForm(initialScheduleForm);
                setRouteRoadValidation(null);
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
          className={`waste-tab-btn ${activeTab === 'routes' ? 'active' : ''}`}
          onClick={() => setActiveTab('routes')}
        >
          <i className="bi bi-map-fill"></i> Route Map
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

      {activeTab === 'routes' && (
        <section className="waste-route-panel">
          <div className="waste-route-panel-header">
            <div>
              <h3><i className="bi bi-map-fill"></i> Manual collection route map</h3>
              <p>Choose a date to view the hand-plotted truck route for that weekday. This is informational only; it does not navigate or dispatch a truck.</p>
            </div>
            <div className="waste-route-filters">
              <label>
                <span>Collection date</span>
                <input
                  className="filter-select"
                  type="date"
                  value={routeDate}
                  onChange={(event) => setRouteDate(event.target.value)}
                />
              </label>
              <label>
                <span>Route for this date</span>
                <select
                  className="filter-select"
                  value={selectedRoute ? String(selectedRoute.id) : ''}
                  onChange={(event) => setSelectedRouteId(event.target.value)}
                >
                  {routeSchedules.length === 0 && <option value="">No mapped routes for this day</option>}
                  {routeSchedules.map((schedule) => (
                    <option key={schedule.id} value={schedule.id}>{schedule.zone_area} · {schedule.collection_time}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>
          {selectedRoute ? (
            <>
              <div className="waste-route-summary">
                <strong>{selectedRoute.zone_area}</strong>
                <span>{selectedRoute.collection_day} · {selectedRoute.collection_time}</span>
                <span>{selectedRoute.truck_team || 'PB2 Green Fleet'}</span>
                <button type="button" className="btn-icon-action" title="Edit plotted route" onClick={() => openEditSchedule(selectedRoute)}>
                  <i className="bi bi-pencil-fill"></i> Edit route
                </button>
              </div>
              <WasteRouteMap
                points={selectedRoute.route_coordinates}
                label={`Start: truck · End: route finish · ${selectedRoute.zone_area}`}
              />
            </>
          ) : (
            <div className="waste-route-empty">
              <i className="bi bi-signpost-split"></i>
              <strong>No routes have been plotted for this collection day.</strong>
              <span>Edit a schedule and manually click along the streets to add its route.</span>
            </div>
          )}
          <div className="waste-route-legend">
            <span><i className="bi bi-truck-front-fill"></i> Start</span>
            <span><i className="bi bi-arrow-up-right"></i> Direction of travel</span>
            <span><i className="bi bi-flag-fill"></i> End</span>
          </div>
        </section>
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
          <div className="modal-dialog waste-schedule-modal" onClick={(e) => e.stopPropagation()}>
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
                    <div className="waste-day-picker" role="group" aria-label="Collection day selector">
                      {DAY_OPTIONS.map((day) => (
                        <label key={day} className={`waste-day-option ${selectedCollectionDays.includes(day) ? 'selected' : ''}`}>
                          <input
                            type="checkbox"
                            checked={selectedCollectionDays.includes(day)}
                            onChange={() => {
                              setSelectedCollectionDays((currentDays) => {
                                const nextDays = currentDays.includes(day)
                                  ? currentDays.filter((selectedDay) => selectedDay !== day)
                                  : [...currentDays, day];
                                return nextDays;
                              });
                            }}
                          />
                          <span>{day.slice(0, 3)}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Time Window *</label>
                    <div className="waste-time-window">
                      <select
                        className="form-select"
                        value={timeWindowStart}
                        onChange={(e) => setTimeWindowStart(e.target.value)}
                      >
                        {TIME_OPTIONS.map((option) => (
                          <option key={`start-${option.value}`} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                      <span className="waste-time-divider">to</span>
                      <select
                        className="form-select"
                        value={timeWindowEnd}
                        onChange={(e) => setTimeWindowEnd(e.target.value)}
                      >
                        {TIME_OPTIONS.map((option) => (
                          <option key={`end-${option.value}`} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </div>
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
                  <label className="form-label">Collection Route Sequence *</label>
                  <div className="waste-route-stop-builder">
                    {routeStops.map((stop, index) => (
                      <div key={`route-stop-${index}`} className="waste-route-stop-row">
                        <input
                          type="text"
                          className="form-input"
                          placeholder={index === 0 ? 'Start of route / pickup area' : `Next area to collect ${index + 1}`}
                          value={stop}
                          onChange={(e) => {
                            const nextStops = [...routeStops];
                            nextStops[index] = e.target.value;
                            updateRouteStops(nextStops);
                          }}
                        />
                        {index < routeStops.length - 1 && <span className="waste-route-arrow">→</span>}
                      </div>
                    ))}
                  </div>
                  <div className="waste-route-stop-actions">
                    <button type="button" className="btn-secondary" onClick={() => updateRouteStops([...routeStops, ''])}>
                      Add next route
                    </button>
                    {routeStops.length > 2 && (
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => {
                          const nextStops = routeStops.slice(0, -1);
                          updateRouteStops(nextStops);
                        }}
                      >
                        Remove route
                      </button>
                    )}
                  </div>
                </div>

                <div className="form-group">
                  <div className="waste-route-editor-heading">
                    <div>
                      <label className="form-label">Trace the route on the PB2 map *</label>
                      <p>Click mapped streets in travel order, beginning at the truck start. Each point snaps to the nearest street; route legs must stay on mapped roads, so add points along bends and intersections. New schedules need at least two points; existing unplotted schedules can still be updated.</p>
                    </div>
                    <div className="waste-route-editor-actions">
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={!parseRoutePoints(scheduleFormData.route_coordinates).length}
                        onClick={() => setScheduleFormData((form) => ({
                          ...form,
                          route_coordinates: parseRoutePoints(form.route_coordinates).slice(0, -1)
                        }))}
                      >
                        Undo point
                      </button>
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={!parseRoutePoints(scheduleFormData.route_coordinates).length}
                        onClick={() => setScheduleFormData((form) => ({ ...form, route_coordinates: [] }))}
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                  <div className="waste-route-point-count">
                    {parseRoutePoints(scheduleFormData.route_coordinates).length} plotted point(s) · at least 2 required
                  </div>
                  <WasteRouteMap
                    editable
                    points={scheduleFormData.route_coordinates}
                    onPointsChange={(points) => {
                      setRouteRoadValidation(null);
                      setScheduleFormData((form) => ({ ...form, route_coordinates: points }));
                    }}
                    onRouteValidationChange={handleRouteValidationChange}
                    onOutOfBoundary={() => showToast('Keep the route points and path inside the Pasong Buaya II boundary.', 'error')}
                    onOffRoad={() => showToast('Click on a mapped street to place a route point. Building areas cannot be selected.', 'error')}
                    onRouteOffRoad={() => showToast('This route leg leaves the street. Add points along the road bends and intersections, then try again.', 'error')}
                    label="Click the map to trace the truck route"
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
