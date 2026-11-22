import React, { useState, useEffect, useMemo, useRef } from 'react';
import Header from '../components/Header';
import Footer from '../components/Footer';
import Preloader from '../components/Preloader';
import WasteRouteMap from '../components/WasteRouteMap';
import { parseRoutePoints } from '../lib/wasteRoute';
import { dateValue, friendlyDate, nextPickupDate, schedulePassesStreet, scheduleStreets } from '../lib/wasteSchedule';
import { ROUTE_COLORS } from '../components/wasteRouteIcons';
import { useAuth } from '../context/AuthContext';
import './CSS/WasteManagement.css';

const API_BASE = '/api_backend';

const getLocalDateValue = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getDateSchedules = (items, date) => {
  if (!date) return [];
  const weekday = new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long' });
  const weekdayPattern = new RegExp(`\\b${weekday}\\b`, 'i');
  return items.filter((item) => weekdayPattern.test(item.collection_day || ''));
};

const WasteManagement = () => {
  const [activeTab, setActiveTab] = useState('schedules'); // 'schedules' | 'segregation' | 'facilities'
  const [schedules, setSchedules] = useState([]);
  const [segregation, setSegregation] = useState([]);
  const [stats, setStats] = useState({ total_schedules: 0, active_schedules: 0, total_zones: 0, categories_count: 0 });
  const [loading, setLoading] = useState(true);

  // Search & filter
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDate, setSelectedDate] = useState(() => getLocalDateValue());
  const [selectedRouteId, setSelectedRouteId] = useState('');
  // The route map shows the chosen date's routes, or every route ('all' days);
  // 'all' in the route list shows them side by side with none brought forward.
  const [routeScope, setRouteScope] = useState('day');
  const { user } = useAuth();
  // "When does the truck pass my street?" A signed-in resident's own street
  // is filled in from their profile.
  const [streetQuery, setStreetQuery] = useState('');
  const streetTouched = useRef(false);
  const routeSectionRef = useRef(null);

  useEffect(() => {
    if (!user) return undefined;
    let cancelled = false;
    fetch(`${API_BASE}/get_user_profile.php`, { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        const street = data?.data?.street;
        if (!cancelled && street && !streetTouched.current) setStreetQuery(String(street));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [user]);

  useEffect(() => {
    let mounted = true;
    const fetchData = async () => {
      try {
        const res = await fetch(`${API_BASE}/waste_management.php?action=get_all`);
        const data = await res.json();
        if (mounted && data && data.success) {
          setSchedules(data.schedules || []);
          setSegregation(data.segregation || []);
          setStats(data.stats || { total_schedules: 0, active_schedules: 0, total_zones: 0, categories_count: 0 });
        }
      } catch (err) {
        if (mounted) console.error('Error fetching waste data for citizen:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    fetchData();
    const refreshInterval = window.setInterval(fetchData, 60000);
    return () => {
      mounted = false;
      window.clearInterval(refreshInterval);
    };
  }, []);

  const filteredSchedules = schedules.filter((s) => {
    const matchesSearch =
      (s.zone_area || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.truck_route || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.waste_type || '').toLowerCase().includes(searchQuery.toLowerCase());
    const selectedWeekday = new Date(`${selectedDate}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long' });
    const matchesDay = new RegExp(`\\b${selectedWeekday}\\b`, 'i').test(s.collection_day || '');
    return matchesSearch && matchesDay;
  });
  const today = getLocalDateValue();
  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrow = getLocalDateValue(tomorrowDate);
  const todaySchedules = getDateSchedules(schedules, today).filter((schedule) => schedule.status !== 'Completed');
  const tomorrowSchedules = getDateSchedules(schedules, tomorrow).filter((schedule) => schedule.status !== 'Completed');
  const everyMappedRoute = schedules.filter((schedule) => parseRoutePoints(schedule.route_coordinates).length >= 2);
  const mappedRoutes = routeScope === 'all'
    ? everyMappedRoute
    : filteredSchedules.filter((schedule) => parseRoutePoints(schedule.route_coordinates).length >= 2);
  const showAllRoutes = selectedRouteId === 'all';
  const selectedRoute = showAllRoutes
    ? null
    : mappedRoutes.find((schedule) => String(schedule.id) === String(selectedRouteId)) || mappedRoutes[0];
  // A schedule keeps its colour whichever routes are shown.
  const routeColor = (schedule) => ROUTE_COLORS[Math.max(0, everyMappedRoute.indexOf(schedule)) % ROUTE_COLORS.length];

  const streetOptions = useMemo(() => {
    const names = new Map();
    schedules.forEach((s) => scheduleStreets(s).forEach((name) => names.set(name.toLowerCase(), name)));
    return [...names.values()].sort((a, b) => a.localeCompare(b));
  }, [schedules]);
  const streetMatches = useMemo(() => schedules
    .filter((s) => schedulePassesStreet(s, streetQuery))
    .map((s) => ({ schedule: s, next: nextPickupDate(s) }))
    .sort((a, b) => (a.next ? a.next.getTime() : Infinity) - (b.next ? b.next.getTime() : Infinity)), [schedules, streetQuery]);

  const showOnMap = (schedule, date) => {
    if (date) { setSelectedDate(dateValue(date)); setRouteScope('day'); }
    setSelectedRouteId(String(schedule.id));
    setSearchQuery('');
    window.setTimeout(() => routeSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };
  const selectedDateLabel = selectedDate
    ? new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date(`${selectedDate}T12:00:00`))
    : '';

  const renderCollectionNotices = (items, label) => (
    <section className="waste-notice-card" aria-live="polite">
      <div className="waste-notice-heading">
        <i className="bi bi-bell-fill" aria-hidden="true"></i>
        <h2>{label}</h2>
      </div>
      {loading ? (
        <p>Checking collection updates...</p>
      ) : items.length === 0 ? (
        <p>No garbage pickup is listed for {label.toLowerCase()}.</p>
      ) : (
        <ul>
          {items.map((item) => {
            const isSuspended = item.status === 'Suspended';
            const isRescheduled = item.status === 'Rescheduled';
            return (
              <li className={isSuspended ? 'suspended' : isRescheduled ? 'rescheduled' : ''} key={`${label}-${item.id}`}>
                <i className={`bi ${isSuspended ? 'bi-exclamation-triangle-fill' : isRescheduled ? 'bi-calendar2-week-fill' : 'bi-truck-front-fill'}`} aria-hidden="true"></i>
                <div>
                  <strong>{item.zone_area}: </strong>
                  {isSuspended
                    ? `Collection is suspended ${label.toLowerCase()}.`
                    : isRescheduled
                      ? `Collection is rescheduled for ${item.collection_time}.`
                      : `Garbage collection is scheduled ${label.toLowerCase()} during ${item.collection_time}.`}
                  {item.notes && <span className="waste-notice-advisory"> {item.notes}</span>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );

  return (
    <>
      <Preloader />
      <Header />

      <div className="citizen-waste-page">
        <div className="waste-page-container">
          {/* Header Banner */}
          <div className="waste-hero-header">
            <span className="badge-gold">Community Cleanliness & Green Ecology</span>
            <h1>Barangay Waste Management & Collection</h1>
            <p>
              Official garbage truck schedules, pickup routes, waste segregation guidelines, 
              and drop-off eco-centers for Barangay Pasong Buaya II, Imus, Cavite.
            </p>
          </div>

          {/* Highlights Grid */}
          <div className="waste-highlights-grid">
            <div className="waste-highlight-card">
              <div className="waste-highlight-icon green">
                <i className="bi bi-calendar2-check-fill"></i>
              </div>
              <div>
                <h3>{stats.active_schedules || schedules.length}</h3>
                <p>Active Routes</p>
              </div>
            </div>

            <div className="waste-highlight-card">
              <div className="waste-highlight-icon amber">
                <i className="bi bi-geo-alt-fill"></i>
              </div>
              <div>
                <h3>{stats.total_zones || 3}</h3>
                <p>Covered Zones</p>
              </div>
            </div>

            <div className="waste-highlight-card">
              <div className="waste-highlight-icon blue">
                <i className="bi bi-recycle"></i>
              </div>
              <div>
                <h3>{stats.categories_count || 4}</h3>
                <p>Segregation Types</p>
              </div>
            </div>

            <div className="waste-highlight-card">
              <div className="waste-highlight-icon purple">
                <i className="bi bi-truck"></i>
              </div>
              <div>
                <h3>Barangay Garbage Trucks</h3>
                <p>Daily Barangay Service</p>
              </div>
            </div>
          </div>

          {/* Citizen Tabs */}
          <div className="citizen-tabs-bar">
            <button
              className={`citizen-tab-btn ${activeTab === 'schedules' ? 'active' : ''}`}
              onClick={() => setActiveTab('schedules')}
            >
              <i className="bi bi-clock-history"></i> Pick-up Schedules & Routes
            </button>
            <button
              className={`citizen-tab-btn ${activeTab === 'segregation' ? 'active' : ''}`}
              onClick={() => setActiveTab('segregation')}
            >
              <i className="bi bi-ui-checks"></i> Waste Segregation Guide
            </button>
            <button
              className={`citizen-tab-btn ${activeTab === 'facilities' ? 'active' : ''}`}
              onClick={() => setActiveTab('facilities')}
            >
              <i className="bi bi-building"></i> Eco-Center & Landfill Info
            </button>
          </div>

          {/* TAB 1: SCHEDULES & ROUTES */}
          {activeTab === 'schedules' && (
            <>
              <section className="waste-street-finder" aria-labelledby="waste-street-finder-title">
                <h2 id="waste-street-finder-title"><i className="bi bi-house-door-fill" aria-hidden="true"></i> When does the truck pass my street?</h2>
                <label htmlFor="waste-street-input" className="waste-street-label">Type your street or subdivision</label>
                <input
                  id="waste-street-input"
                  className="keep-case waste-street-input"
                  list="waste-street-options"
                  autoComplete="off"
                  placeholder="e.g. Kapatiran Road"
                  value={streetQuery}
                  onChange={(e) => { streetTouched.current = true; setStreetQuery(e.target.value); }}
                />
                <datalist id="waste-street-options">
                  {streetOptions.map((name) => <option key={name} value={name} />)}
                </datalist>
                {streetQuery.trim().length >= 3 && (
                  streetMatches.length === 0 ? (
                    <p className="waste-street-none" role="status">
                      No collection route lists &ldquo;{streetQuery}&rdquo; yet. Check the schedules below, or ask the Barangay Hall.
                    </p>
                  ) : (
                    <ul className="waste-street-results" role="status">
                      {streetMatches.map(({ schedule, next }) => (
                        <li key={schedule.id}>
                          <div className="waste-street-when">
                            <strong>{next ? friendlyDate(next) : schedule.status === 'Suspended' ? 'Suspended for now' : 'No day set'}</strong>
                            <span>{schedule.collection_time}</span>
                          </div>
                          <div className="waste-street-what">
                            <span>{schedule.waste_type}</span>
                            <small>{schedule.zone_area} · every {schedule.collection_day}</small>
                            {schedule.notes && <small className="waste-street-note">{schedule.notes}</small>}
                          </div>
                          {parseRoutePoints(schedule.route_coordinates).length >= 2 && (
                            <button type="button" className="waste-street-map-btn" onClick={() => showOnMap(schedule, next)}>
                              <i className="bi bi-map" aria-hidden="true"></i> See the route
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )
                )}
              </section>

              <div className="waste-upcoming-notices">
                {renderCollectionNotices(todaySchedules, 'Today')}
                {renderCollectionNotices(tomorrowSchedules, 'Tomorrow')}
              </div>

              <div className="citizen-search-panel">
                <div className="search-box-citizen">
                  <i className="bi bi-search" style={{ color: '#64748b' }}></i>
                  <input
                    type="text"
                    className="keep-case"
                    placeholder="Find your subdivision, street, or route (e.g. Phase 1, Golden Mile, Purok 3)..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>

                <div className="filter-box-citizen">
                  <label htmlFor="waste-schedule-date">View collection date</label>
                  <input
                    id="waste-schedule-date"
                    type="date"
                    value={selectedDate}
                    onChange={(event) => setSelectedDate(event.target.value)}
                  />
                </div>
              </div>

              <section className="citizen-route-section" ref={routeSectionRef}>
                <div className="citizen-route-heading">
                  <div>
                    <h2><i className="bi bi-map-fill"></i> {routeScope === 'all' ? 'All truck routes' : <>Truck route for {selectedDateLabel}</>}</h2>
                    <p>Manually plotted for information only; this map does not provide live vehicle tracking or automated navigation.</p>
                  </div>
                  <div className="citizen-route-controls">
                    <div className="citizen-route-scope" role="group" aria-label="Which routes to show">
                      <button type="button" aria-pressed={routeScope === 'day'} onClick={() => setRouteScope('day')}>This date</button>
                      <button type="button" aria-pressed={routeScope === 'all'} onClick={() => { setRouteScope('all'); setSelectedRouteId('all'); }}>All routes</button>
                    </div>
                    {mappedRoutes.length > 0 && (
                      <label>
                        <span>Route / zone</span>
                        <select
                          value={showAllRoutes ? 'all' : selectedRoute ? String(selectedRoute.id) : ''}
                          onChange={(event) => setSelectedRouteId(event.target.value)}
                        >
                          {mappedRoutes.length > 1 && <option value="all">Show all routes together ({mappedRoutes.length})</option>}
                          {mappedRoutes.map((schedule) => (
                            <option key={schedule.id} value={schedule.id}>{schedule.zone_area}{routeScope === 'all' ? ` · ${schedule.collection_day}` : ''}</option>
                          ))}
                        </select>
                      </label>
                    )}
                  </div>
                </div>
                {mappedRoutes.length > 0 && (showAllRoutes || selectedRoute) ? (
                  <>
                    <WasteRouteMap
                      routes={mappedRoutes.map((schedule) => ({
                        id: String(schedule.id),
                        name: `${schedule.zone_area} · ${schedule.collection_time}`,
                        points: schedule.route_coordinates,
                        color: routeColor(schedule),
                      }))}
                      focusId={selectedRoute ? String(selectedRoute.id) : null}
                      onSelect={(id) => setSelectedRouteId(id)}
                      label={selectedRoute ? `${selectedRoute.zone_area} · ${selectedRoute.collection_time}` : `All ${mappedRoutes.length} routes`}
                    />
                    {mappedRoutes.length > 1 && (
                      <div className="citizen-route-key" role="group" aria-label="Routes on the map">
                        <button type="button" aria-pressed={showAllRoutes} onClick={() => setSelectedRouteId('all')}>
                          <i className="bi bi-layers" aria-hidden="true"></i> All together
                        </button>
                        {mappedRoutes.map((schedule) => (
                          <button
                            type="button"
                            key={schedule.id}
                            aria-pressed={!showAllRoutes && String(schedule.id) === String(selectedRoute?.id)}
                            onClick={() => setSelectedRouteId(String(schedule.id))}
                          >
                            <span className="citizen-route-swatch" style={{ background: routeColor(schedule) }} aria-hidden="true"></span>
                            {schedule.zone_area} <small>{routeScope === 'all' ? schedule.collection_day : schedule.collection_time}</small>
                          </button>
                        ))}
                      </div>
                    )}
                    {selectedRoute && scheduleStreets(selectedRoute).length > 0 && (
                      <p className="citizen-route-streets">
                        <strong>Streets, in order:</strong> {scheduleStreets(selectedRoute).join(' → ')}
                      </p>
                    )}
                  </>
                ) : (
                  <div className="citizen-route-empty">
                    <i className="bi bi-signpost-split"></i>
                    <strong>No mapped collection route is available for {selectedDateLabel}.</strong>
                    <span>Only routes manually plotted by barangay staff are shown here.</span>
                  </div>
                )}
                <div className="citizen-route-legend">
                  <span><i className="bi bi-truck-front-fill"></i> Start</span>
                  <span><i className="bi bi-arrow-up-right"></i> Direction of travel</span>
                  <span><i className="bi bi-flag-fill"></i> End</span>
                </div>
              </section>

              {loading ? (
                <div className="empty-state-citizen">
                  <i className="bi bi-arrow-repeat" style={{ fontSize: '2rem', color: '#047857', display: 'block', marginBottom: '10px' }}></i>
                  Loading collection schedules...
                </div>
              ) : filteredSchedules.length === 0 ? (
                <div className="empty-state-citizen">
                  <i className="bi bi-search" style={{ fontSize: '2rem', color: '#64748b', display: 'block', marginBottom: '10px' }}></i>
                  No pickup schedules found matching "{searchQuery}". Please check your spelling or choose "All Days".
                </div>
              ) : (
                <div className="schedule-cards-grid">
                  {filteredSchedules.map((item) => (
                    <div key={item.id} className="schedule-citizen-card">
                      <div className="schedule-card-top">
                        <h3 className="schedule-zone-title">{item.zone_area}</h3>
                        <span
                          style={{
                            background: item.status === 'Active' ? '#ecfdf5' : '#fffbeb',
                            color: item.status === 'Active' ? '#047857' : '#d97706',
                            padding: '4px 10px',
                            borderRadius: '20px',
                            fontSize: '0.72rem',
                            fontWeight: 800,
                            textTransform: 'uppercase'
                          }}
                        >
                          {item.status || 'Active'}
                        </span>
                      </div>

                      <div className="schedule-time-banner">
                        <span>
                          <i className="bi bi-calendar-event"></i> {item.collection_day}
                        </span>
                        <span>
                          <i className="bi bi-clock"></i> {item.collection_time}
                        </span>
                      </div>

                      <div className="schedule-detail-item">
                        <i className="bi bi-recycle"></i>
                        <div>
                          <strong>Waste Type:</strong> {item.waste_type}
                        </div>
                      </div>

                      <div className="schedule-detail-item">
                        <i className="bi bi-signpost-2"></i>
                        <div>
                          <strong>Truck Route:</strong> {item.truck_route || 'Standard Street Routine'}
                        </div>
                      </div>

                      <div className="schedule-detail-item">
                        <i className="bi bi-truck"></i>
                        <div>
                          <strong>Assigned Team:</strong> {item.truck_team || 'Barangay garbage truck'}
                        </div>
                      </div>

                      <div className="schedule-detail-item">
                        <i className="bi bi-geo-alt"></i>
                        <div>
                          <strong>Disposal Destination:</strong> {item.disposal_site}
                        </div>
                      </div>

                      {item.notes && (
                        <div className="schedule-notes-box">
                          <strong><i className="bi bi-info-circle"></i> Advisory:</strong> {item.notes}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* TAB 2: SEGREGATION GUIDE */}
          {activeTab === 'segregation' && (
            <div className="segregation-guide-grid">
              {segregation.map((cat) => (
                <div key={cat.id} className={`seg-guide-card ${cat.color_tag || 'green'}`}>
                  <div className="seg-guide-header">
                    <div className="seg-guide-icon">
                      <i className={`bi ${cat.icon_class || 'bi-recycle'}`}></i>
                    </div>
                    <div>
                      <h3 className="seg-guide-title">{cat.category_name}</h3>
                      <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>
                        {cat.collection_days || 'Designated Collection Schedule'}
                      </span>
                    </div>
                  </div>

                  <p className="seg-guide-desc">{cat.description}</p>

                  <div className="checklist-block">
                    <div className="checklist-label allowed">
                      <i className="bi bi-check-circle-fill"></i> Kasamang Itapon (Allowed Items):
                    </div>
                    <p className="checklist-text">{cat.allowed_items || 'N/A'}</p>
                  </div>

                  {cat.prohibited_items && (
                    <div className="checklist-block">
                      <div className="checklist-label prohibited">
                        <i className="bi bi-x-circle-fill"></i> Bawal Isama (Prohibited Items):
                      </div>
                      <p className="checklist-text">{cat.prohibited_items}</p>
                    </div>
                  )}

                  {cat.guidelines && (
                    <div style={{ marginTop: '12px', fontSize: '0.82rem', color: '#475569', fontStyle: 'italic', background: '#f8fafc', padding: '10px', borderRadius: '8px' }}>
                      <strong>Paalala sa mga Residente:</strong> {cat.guidelines}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* TAB 3: FACILITIES */}
          {activeTab === 'facilities' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))', gap: '22px' }}>
              <div className="facility-info-card">
                <div className="facility-info-header">
                  <div className="waste-highlight-icon green">
                    <i className="bi bi-recycle"></i>
                  </div>
                  <div>
                    <h3 style={{ margin: 0, color: '#043927', fontWeight: 800 }}>
                      Barangay PB2 Eco-Center & MRF
                    </h3>
                    <span style={{ fontSize: '0.82rem', color: '#64748b' }}>Materials Recovery Facility & Scrap Drop-off</span>
                  </div>
                </div>
                <p style={{ fontSize: '0.88rem', color: '#475569', lineHeight: '1.6' }}>
                  Residents may bring recyclables (plastic bottles, cardboard boxes, aluminum cans, glass bottles) 
                  directly to the Barangay Materials Recovery Facility. The facility is equipped with a composting site 
                  for garden waste and an eco-brick making corner.
                </p>
                <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', fontSize: '0.85rem', color: '#334155' }}>
                  <div style={{ marginBottom: '8px' }}>📍 <strong>Address:</strong> Barangay Hall Compound, Pasong Buaya II, Imus, Cavite</div>
                  <div style={{ marginBottom: '8px' }}>⏰ <strong>Drop-off Hours:</strong> Monday - Saturday (8:00 AM - 5:00 PM)</div>
                  <div>📞 <strong>Assistance Hotline:</strong> (046) 471-0000 / Barangay Green Police</div>
                </div>
              </div>

              <div className="facility-info-card">
                <div className="facility-info-header">
                  <div className="waste-highlight-icon amber">
                    <i className="bi bi-shield-check"></i>
                  </div>
                  <div>
                    <h3 style={{ margin: 0, color: '#043927', fontWeight: 800 }}>
                      City of Imus Central Sanitary Disposal
                    </h3>
                    <span style={{ fontSize: '0.82rem', color: '#64748b' }}>CENRO Regulated Waste Management</span>
                  </div>
                </div>
                <p style={{ fontSize: '0.88rem', color: '#475569', lineHeight: '1.6' }}>
                  Residual waste collected from Pasong Buaya II is transported directly to the Imus City Sanitary Landfill 
                  under the supervision of City CENRO in compliance with Republic Act 9003 (Ecological Solid Waste Management Act).
                </p>
                <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', fontSize: '0.85rem', color: '#334155' }}>
                  <div style={{ marginBottom: '8px' }}>🏛️ <strong>Regulating Agency:</strong> City of Imus CENRO</div>
                  <div style={{ marginBottom: '8px' }}>♻️ <strong>Policy:</strong> "No Segregation, No Collection" strictly enforced</div>
                  <div>🛡️ <strong>Special Waste:</strong> Medical & electronic waste handled on special eco-schedules</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <Footer />
    </>
  );
};

export default WasteManagement;
