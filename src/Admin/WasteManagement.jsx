import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { createPortal } from 'react-dom';
import './WasteManagement.css';
import Toast from '../components/Toast';
import { useToast } from '../lib/useToast';
import WasteRouteMap from '../components/WasteRouteMap';
import WasteRouteEditor from '../components/WasteRouteEditor';
import { ROUTE_COLORS } from '../components/wasteRouteIcons';
import { parseRoutePoints, parseRouteStreets } from '../lib/wasteRoute';
import { samplePoints } from '../lib/roadRouting';
import useFormDraft from '../lib/useFormDraft';

const API_BASE = '/api_backend';

const initialScheduleForm = {
  id: null,
  zone_area: '',
  collection_day: 'Monday & Thursday',
  collection_time: '06:00 AM - 09:00 AM',
  waste_type: 'Biodegradable (Nabubulok)',
  truck_route: '',
  route_coordinates: [],
  route_waypoints: [],
  route_streets: [],
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

  // The route editor's list shows one row per street (an empty list shows
  // one empty Start row).
  return stops;
};

const selectedDateLabelFor = (value) => (value
  ? new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date(`${value}T12:00:00`))
  : '');

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
  // Route Map tab: the routes of one date, or every route; 'all' in the
  // route list shows them side by side with none brought forward.
  const [routeScope, setRouteScope] = useState('day');

  // Modals
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleFormData, setScheduleFormData] = useState(initialScheduleForm);
  const [selectedCollectionDays, setSelectedCollectionDays] = useState(() => parseSelectedDays(initialScheduleForm.collection_day));
  const [timeWindowStart, setTimeWindowStart] = useState('06:00');
  const [timeWindowEnd, setTimeWindowEnd] = useState('09:00');
  const [routeStops, setRouteStops] = useState(() => buildRouteStops(initialScheduleForm.truck_route));
  const [showSegModal, setShowSegModal] = useState(false);
  const [segFormData, setSegFormData] = useState(initialSegregationForm);

  // Draft of the schedule form (src/lib/useFormDraft.jsx): the fields, days,
  // time window and the route clicked on the map survive a refresh or an
  // accidental close, per schedule (new ones share one draft). Cleared on save.
  const scheduleDraft = useFormDraft(
    scheduleFormData.id ? `waste_schedule_${scheduleFormData.id}` : 'waste_schedule_new',
    { form: scheduleFormData, days: selectedCollectionDays, start: timeWindowStart, end: timeWindowEnd, stops: routeStops },
    (d) => {
      if (d.form) setScheduleFormData((prev) => ({ ...prev, ...d.form }));
      if (Array.isArray(d.days)) setSelectedCollectionDays(d.days);
      if (d.start) setTimeWindowStart(d.start);
      if (d.end) setTimeWindowEnd(d.end);
      if (Array.isArray(d.stops)) setRouteStops(d.stops);
    },
    { enabled: showScheduleModal, owner: 'admin', trigger: 'change' },
  );

  // Feedback Toast
  const { toast, showToast: notify, confirmToast, closeToast } = useToast();
  const showToast = useCallback(
    (message, type = 'success') => notify(type === 'error' ? 'Something went wrong' : 'Success', message, type),
    [notify]
  );

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
      route_coordinates: parseRoutePoints(form.route_coordinates || []),
      route_waypoints: parseRoutePoints(form.route_waypoints || []),
      route_streets: parseRouteStreets(form.route_streets || [])
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
  const mappedSchedules = schedules.filter((schedule) => parseRoutePoints(schedule.route_coordinates).length >= 2);
  const routeSchedules = routeScope === 'all'
    ? mappedSchedules
    : getSchedulesForDate(mappedSchedules, routeDate);
  const showAllRoutes = selectedRouteId === 'all';
  const selectedRoute = showAllRoutes
    ? null
    : routeSchedules.find((schedule) => String(schedule.id) === String(selectedRouteId)) || routeSchedules[0];
  // A schedule keeps its colour whichever routes are shown.
  const routeColor = (schedule) => ROUTE_COLORS[Math.max(0, mappedSchedules.indexOf(schedule)) % ROUTE_COLORS.length];

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

    if (!finalRouteText) {
      showToast('Draw the route on the map, or type at least one street in the list beside it.', 'error');
      return;
    }

    if ((!scheduleFormData.id && routePointCount < 2) || routePointCount === 1) {
      showToast('Draw the route on the map: click where the truck starts, then where it ends.', 'error');
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
        scheduleDraft.clear();
        setShowScheduleModal(false);
        setScheduleFormData(initialScheduleForm);
        setSelectedCollectionDays([]);
        setTimeWindowStart('06:00');
        setTimeWindowEnd('09:00');
        setRouteStops([]);
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
    const savedPath = parseRoutePoints(item.route_coordinates);
    const savedWaypoints = parseRoutePoints(item.route_waypoints);
    resetScheduleForm({
      id: item.id,
      zone_area: item.zone_area || '',
      collection_day: item.collection_day || 'Monday',
      collection_time: item.collection_time || '06:00 AM - 09:00 AM',
      waste_type: item.waste_type || 'Biodegradable (Nabubulok)',
      truck_route: item.truck_route || '',
      route_coordinates: savedPath,
      // A route drawn before the street routing has no saved pins: a few of
      // its points become draggable pins (the route stays as saved until moved).
      route_waypoints: savedWaypoints.length >= 2 ? savedWaypoints : samplePoints(savedPath, 12),
      route_streets: parseRouteStreets(item.route_streets),
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
            <i className="bi bi-trash3-fill" style={{ color: '#047857' }}></i>
            Waste Management & Garbage Pick-Up
          </h2>
          <p>Barangay Pasong Buaya II, Imus, Cavite &bull; Garbage Collection & Segregation</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          {activeTab === 'schedules' && (
            <button
              className="btn-primary-action"
              onClick={() => {
                resetScheduleForm(initialScheduleForm);
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
              <i className="bi bi-plus-circle-fill"></i> Add Waste Type
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
            <p>Areas Covered</p>
          </div>
        </div>

        <div className="waste-stat-card">
          <div className="waste-icon-box blue">
            <i className="bi bi-recycle"></i>
          </div>
          <div>
            <h3>{stats.categories_count}</h3>
            <p>Waste Types</p>
          </div>
        </div>

        <div className="waste-stat-card">
          <div className="waste-icon-box purple">
            <i className="bi bi-truck"></i>
          </div>
          <div>
            <h3>{new Set(schedules.map((s) => (s.truck_team || '').trim().toLowerCase()).filter(Boolean)).size}</h3>
            <p>Trucks / Teams Assigned</p>
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
          <i className="bi bi-grid-fill"></i> Segregation Guide
        </button>
        <button
          className={`waste-tab-btn ${activeTab === 'disposal' ? 'active' : ''}`}
          onClick={() => setActiveTab('disposal')}
        >
          <i className="bi bi-building"></i> Disposal Sites
        </button>
      </div>

      {/* TAB 1: SCHEDULES & ROUTES */}
      {activeTab === 'schedules' && (
        <>
          <div className="filter-bar">
            <div className="search-input-group">
              <i className="bi bi-search" style={{ color: '#64748b' }}></i>
              <input
                type="text"
                aria-label="Search area, route, waste type, or truck" placeholder="Search area, route, waste type, or truck..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="filter-controls">
              <select
                aria-label="Filter by collection day"
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
                aria-label="Filter by status"
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
                  <th>Area</th>
                  <th>Day & Time</th>
                  <th>Waste Type</th>
                  <th>Route</th>
                  <th>Disposal Site</th>
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
                          <i className="bi bi-signpost-2" style={{ color: '#047857', marginRight: '4px' }}></i>
                          {item.truck_route || 'Standard Subdivision Route'}
                        </div>
                      </td>
                      <td style={{ maxWidth: '200px' }}>
                        <div style={{ fontSize: '0.8rem', color: '#475569' }}>
                          <i className="bi bi-geo-alt" style={{ color: '#b45309', marginRight: '4px' }}></i>
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
              <h3><i className="bi bi-map-fill"></i> Collection route map</h3>
              <p>Each route has its own colour. Pick one to bring it forward, or show them all together. For information only: it does not track or dispatch a truck.</p>
            </div>
            <div className="waste-route-filters">
              <div className="waste-route-scope" role="group" aria-label="Which routes to show">
                <span>Show</span>
                <div>
                  <button type="button" aria-pressed={routeScope === 'day'} onClick={() => setRouteScope('day')}>This date</button>
                  <button type="button" aria-pressed={routeScope === 'all'} onClick={() => { setRouteScope('all'); setSelectedRouteId('all'); }}>All routes</button>
                </div>
              </div>
              {routeScope === 'day' && (
                <label>
                  <span>Collection date</span>
                  <input
                    className="filter-select"
                    type="date"
                    value={routeDate}
                    onChange={(event) => setRouteDate(event.target.value)}
                  />
                </label>
              )}
              <label>
                <span>{routeScope === 'all' ? 'Route' : 'Route for this date'}</span>
                <select
                  className="filter-select"
                  value={showAllRoutes ? 'all' : selectedRoute ? String(selectedRoute.id) : ''}
                  onChange={(event) => setSelectedRouteId(event.target.value)}
                >
                  {routeSchedules.length === 0 && <option value="">No mapped routes for this day</option>}
                  {routeSchedules.length > 1 && <option value="all">Show all routes together ({routeSchedules.length})</option>}
                  {routeSchedules.map((schedule) => (
                    <option key={schedule.id} value={schedule.id}>{schedule.zone_area} · {routeScope === 'all' ? `${schedule.collection_day} · ` : ''}{schedule.collection_time}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>
          {routeSchedules.length > 0 && (showAllRoutes || selectedRoute) ? (
            <>
              {selectedRoute ? (
              <div className="waste-route-summary">
                <strong>{selectedRoute.zone_area}</strong>
                <span>{selectedRoute.collection_day} · {selectedRoute.collection_time}</span>
                <span>{selectedRoute.truck_team || 'PB2 Green Fleet'}</span>
                <button type="button" className="btn-icon-action" title="Edit plotted route" onClick={() => openEditSchedule(selectedRoute)}>
                  <i className="bi bi-pencil-fill"></i> Edit route
                </button>
              </div>
              ) : (
              <div className="waste-route-summary">
                <strong>{routeSchedules.length} routes</strong>
                <span>{routeScope === 'all' ? 'Every collection day' : selectedDateLabelFor(routeDate)}</span>
                <span>Click a line or a name below to bring one route forward.</span>
              </div>
              )}
              <WasteRouteMap
                routes={routeSchedules.map((schedule) => ({
                  id: String(schedule.id),
                  name: `${schedule.zone_area} · ${schedule.collection_day} · ${schedule.collection_time}`,
                  points: schedule.route_coordinates,
                  color: routeColor(schedule),
                }))}
                focusId={selectedRoute ? String(selectedRoute.id) : null}
                onSelect={(id) => setSelectedRouteId(id)}
                label={selectedRoute ? `${selectedRoute.zone_area} · ${selectedRoute.collection_time}` : `All ${routeSchedules.length} routes`}
              />
              {routeSchedules.length > 1 && (
                <div className="waste-route-key" role="group" aria-label="Routes on the map">
                  <button type="button" aria-pressed={showAllRoutes} onClick={() => setSelectedRouteId('all')}>
                    <i className="bi bi-layers" aria-hidden="true"></i> All together
                  </button>
                  {routeSchedules.map((schedule) => (
                    <button
                      type="button"
                      key={schedule.id}
                      aria-pressed={!showAllRoutes && String(schedule.id) === String(selectedRoute?.id)}
                      onClick={() => setSelectedRouteId(String(schedule.id))}
                    >
                      <span className="waste-route-swatch" style={{ background: routeColor(schedule) }} aria-hidden="true"></span>
                      {schedule.zone_area}
                      <small>{routeScope === 'all' ? schedule.collection_day : schedule.collection_time}</small>
                    </button>
                  ))}
                </div>
              )}
              {selectedRoute && parseRouteStreets(selectedRoute.route_streets).length > 0 && (
                <p className="waste-route-streets-line"><strong>Streets, in order:</strong> {parseRouteStreets(selectedRoute.route_streets).join(' → ')}</p>
              )}
            </>
          ) : (
            <div className="waste-route-empty">
              <i className="bi bi-signpost-split"></i>
              <strong>{routeScope === 'all' ? 'No routes have been plotted yet.' : 'No routes have been plotted for this collection day.'}</strong>
              <span>Edit a schedule and click where the truck starts and ends; the route follows the streets.</span>
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
                  <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Segregation Guide</span>
                </div>
                <button
                  className="btn-icon-action"
                  title="Edit"
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))', gap: '20px' }}>
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
              <div><strong>Person in Charge:</strong> Barangay Eco Officer / Green Patrol</div>
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
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Final Disposal</span>
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

      {/* MODAL: ADD / EDIT PICKUP SCHEDULE. Rendered on <body>: the admin content
          column is its own layer, so the sidebar covered the left of the wide pop-up. */}
      {showScheduleModal && createPortal(
        <div className="modal-backdrop waste-schedule-backdrop" onClick={() => setShowScheduleModal(false)}>
          <div className="modal-dialog waste-schedule-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h4>
                <i className="bi bi-calendar-plus-fill" style={{ color: '#047857' }}></i>
                {scheduleFormData.id ? 'Edit Pickup Schedule & Route' : 'Add Garbage Pickup Schedule'}
              </h4>
              <button className="modal-close-btn" onClick={() => setShowScheduleModal(false)}>
                <i className="bi bi-x-lg"></i>
              </button>
            </div>
            <form onSubmit={handleSaveSchedule}>
              <div className="modal-body">
                {scheduleDraft.notice}
                <div className="form-group">
                  <label htmlFor="lbWasteManagemen-1" className="form-label">Area / Subdivision *</label>
                  <input id="lbWasteManagemen-1"
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
                    <label className="form-label">Collection Time *</label>
                    <div className="waste-time-window">
                      <select
                        aria-label="Collection starts at"
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
                        aria-label="Collection ends at"
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
                    <label htmlFor="lbWasteManagemen-2" className="form-label">Type of Waste Collected *</label>
                    <select id="lbWasteManagemen-2"
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
                    <label htmlFor="lbWasteManagemen-3" className="form-label">Status</label>
                    <select id="lbWasteManagemen-3"
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
                  <span className="form-label">Truck route *</span>
                  <WasteRouteEditor
                    waypoints={parseRoutePoints(scheduleFormData.route_waypoints)}
                    path={parseRoutePoints(scheduleFormData.route_coordinates)}
                    stops={routeStops}
                    onChange={({ waypoints, path, streets }) => {
                      setScheduleFormData((form) => ({ ...form, route_waypoints: waypoints, route_coordinates: path, route_streets: streets }));
                    }}
                    onStopsChange={updateRouteStops}
                    onMessage={(message, type = 'warning') => notify(type === 'info' ? 'Route map' : 'Choose another spot', message, type === 'info' ? 'info' : 'warning')}
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="lbWasteManagemen-4" className="form-label">Disposal Site *</label>
                    <input id="lbWasteManagemen-4"
                      type="text"
                      required
                      className="form-input"
                      placeholder="e.g. Imus City MRF / Sanitary Landfill"
                      value={scheduleFormData.disposal_site}
                      onChange={(e) => setScheduleFormData({ ...scheduleFormData, disposal_site: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="lbWasteManagemen-5" className="form-label">Truck or Team</label>
                    <input id="lbWasteManagemen-5"
                      type="text"
                      className="form-input"
                      placeholder="e.g. Truck #1"
                      value={scheduleFormData.truck_team}
                      onChange={(e) => setScheduleFormData({ ...scheduleFormData, truck_team: e.target.value })}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="lbWasteManagemen-6" className="form-label">Note for Residents</label>
                  <input id="lbWasteManagemen-6"
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
        </div>,
        document.body
      )}

      {/* MODAL: EDIT SEGREGATION RULE */}
      {showSegModal && (
        <div className="modal-backdrop" onClick={() => setShowSegModal(false)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h4>
                <i className="bi bi-recycle" style={{ color: '#047857' }}></i>
                {segFormData.id ? 'Edit Waste Type' : 'Add Waste Type'}
              </h4>
              <button className="modal-close-btn" onClick={() => setShowSegModal(false)}>
                <i className="bi bi-x-lg"></i>
              </button>
            </div>
            <form onSubmit={handleSaveSegregation}>
              <div className="modal-body">
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="lbWasteManagemen-7" className="form-label">Waste Type *</label>
                    <input id="lbWasteManagemen-7"
                      type="text"
                      required
                      className="form-input"
                      placeholder="e.g. Biodegradable (Nabubulok)"
                      value={segFormData.category_name}
                      onChange={(e) => setSegFormData({ ...segFormData, category_name: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="lbWasteManagemen-8" className="form-label">Color</label>
                    <select id="lbWasteManagemen-8"
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
                  <label htmlFor="lbWasteManagemen-9" className="form-label">Description *</label>
                  <textarea id="lbWasteManagemen-9"
                    rows="2"
                    required
                    className="form-textarea"
                    placeholder="General definition and instructions"
                    value={segFormData.description}
                    onChange={(e) => setSegFormData({ ...segFormData, description: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="lbWasteManagemen-10" className="form-label">Allowed Items (Kasamang Itapon)</label>
                  <textarea id="lbWasteManagemen-10"
                    rows="2"
                    className="form-textarea"
                    placeholder="e.g. Food leftovers, fruit peelings, garden leaves"
                    value={segFormData.allowed_items}
                    onChange={(e) => setSegFormData({ ...segFormData, allowed_items: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="lbWasteManagemen-11" className="form-label">Prohibited Items (Bawal Isama)</label>
                  <input id="lbWasteManagemen-11"
                    type="text"
                    className="form-input"
                    placeholder="e.g. Plastics, cans, batteries"
                    value={segFormData.prohibited_items}
                    onChange={(e) => setSegFormData({ ...segFormData, prohibited_items: e.target.value })}
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="lbWasteManagemen-12" className="form-label">Collection Days</label>
                    <input id="lbWasteManagemen-12"
                      type="text"
                      className="form-input"
                      placeholder="e.g. Monday & Thursday (6:00 AM - 9:00 AM)"
                      value={segFormData.collection_days}
                      onChange={(e) => setSegFormData({ ...segFormData, collection_days: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="lbWasteManagemen-13" className="form-label">Disposal Reminder / Paalala</label>
                    <input id="lbWasteManagemen-13"
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
