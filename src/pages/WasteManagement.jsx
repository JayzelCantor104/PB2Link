import React, { useState, useEffect } from 'react';
import Header from '../components/Header';
import Footer from '../components/Footer';
import Preloader from '../components/Preloader';
import './CSS/WasteManagement.css';

const API_BASE = '/api_backend';

const WasteManagement = () => {
  const [activeTab, setActiveTab] = useState('schedules'); // 'schedules' | 'segregation' | 'facilities'
  const [schedules, setSchedules] = useState([]);
  const [segregation, setSegregation] = useState([]);
  const [stats, setStats] = useState({ total_schedules: 0, active_schedules: 0, total_zones: 0, categories_count: 0 });
  const [loading, setLoading] = useState(true);

  // Search & filter
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDay, setSelectedDay] = useState('ALL');

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const res = await fetch(`${API_BASE}/waste_management.php?action=get_all`);
        const data = await res.json();
        if (data && data.success) {
          setSchedules(data.schedules || []);
          setSegregation(data.segregation || []);
          setStats(data.stats || { total_schedules: 0, active_schedules: 0, total_zones: 0, categories_count: 0 });
        }
      } catch (err) {
        console.error('Error fetching waste data for citizen:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const filteredSchedules = schedules.filter((s) => {
    const matchesSearch =
      (s.zone_area || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.truck_route || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.waste_type || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesDay = selectedDay === 'ALL' || (s.collection_day || '').includes(selectedDay);
    return matchesSearch && matchesDay;
  });

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
                <h3>PB2 Green Fleet</h3>
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
              <div className="citizen-search-panel">
                <div className="search-box-citizen">
                  <i className="bi bi-search" style={{ color: '#94a3b8' }}></i>
                  <input
                    type="text"
                    placeholder="Find your subdivision, street, or route (e.g. Phase 1, Golden Mile, Purok 3)..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>

                <div className="filter-box-citizen">
                  <select value={selectedDay} onChange={(e) => setSelectedDay(e.target.value)}>
                    <option value="ALL">All Days of the Week</option>
                    <option value="Monday">Monday</option>
                    <option value="Tuesday">Tuesday</option>
                    <option value="Wednesday">Wednesday</option>
                    <option value="Thursday">Thursday</option>
                    <option value="Friday">Friday</option>
                    <option value="Saturday">Saturday</option>
                  </select>
                </div>
              </div>

              {loading ? (
                <div className="empty-state-citizen">
                  <i className="bi bi-arrow-repeat" style={{ fontSize: '2rem', color: '#059669', display: 'block', marginBottom: '10px' }}></i>
                  Loading collection schedules...
                </div>
              ) : filteredSchedules.length === 0 ? (
                <div className="empty-state-citizen">
                  <i className="bi bi-search" style={{ fontSize: '2rem', color: '#94a3b8', display: 'block', marginBottom: '10px' }}></i>
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
                            color: item.status === 'Active' ? '#059669' : '#d97706',
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
                          <strong>Assigned Team:</strong> {item.truck_team || 'PB2 Green Fleet'}
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '22px' }}>
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

