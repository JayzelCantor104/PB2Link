import React, { useState, useEffect } from 'react';
import Header from '../components/Header';
import Footer from '../components/Footer';
import Preloader from '../components/Preloader';
import './CSS/DisasterRisk.css';

const API_BASE = '/api_backend';

const DisasterRisk = () => {
  const [activeTab, setActiveTab] = useState('centers'); // 'centers' | 'protocols' | 'hotlines'
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

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const res = await fetch(`${API_BASE}/disaster_risk.php?action=get_all`);
        const data = await res.json();
        if (data && data.success) {
          setAlerts(data.alerts || []);
          setCenters(data.centers || []);
          setStats(data.stats || {
            active_alerts_count: 0,
            total_centers: 0,
            available_centers: 0,
            total_capacity_families: 0,
            total_current_families: 0
          });
        }
      } catch (err) {
        console.error('Error fetching disaster risk data for citizen:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const activeAlert = alerts.find((a) => Number(a.is_active) === 1);

  return (
    <>
      <Preloader />
      <Header />

      <div className="citizen-drrm-page">
        <div className="drrm-page-container">
          {/* Header Banner */}
          <div className="drrm-hero-header">
            <span className="badge-safety">Disaster Risk Reduction & Management (DRRM)</span>
            <h1>Barangay Public Safety & Evacuation Command</h1>
            <p>
              Official weather bulletins, real-time evacuation center capacity, 
              pre-emptive evacuation schedules, and emergency response hotlines for Barangay Pasong Buaya II, Imus, Cavite.
            </p>
          </div>

          {/* ACTIVE DISASTER WARNING BANNER */}
          {activeAlert ? (
            <div className={`citizen-alert-banner banner-${(activeAlert.alert_level || 'advisory').toLowerCase()}`}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span className="alert-pulse-dot"></span>
                <span className={`alert-badge-citizen badge-${(activeAlert.alert_level || 'advisory').toLowerCase()}`}>
                  {activeAlert.alert_level} Alert Level
                </span>
                <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>
                  <i className="bi bi-cloud-lightning-rain-fill"></i> {activeAlert.calamity_type || 'Weather Disturbance'}
                </span>
              </div>

              <h2 className="citizen-alert-title">{activeAlert.title}</h2>
              <p className="citizen-alert-instructions">{activeAlert.instructions}</p>

              <div className="citizen-alert-details">
                {activeAlert.affected_areas && (
                  <div>
                    <i className="bi bi-geo-alt-fill"></i> <strong>Priority Zones:</strong> {activeAlert.affected_areas}
                  </div>
                )}
                {activeAlert.evacuation_schedule && (
                  <div>
                    <i className="bi bi-alarm-fill"></i> <strong>Evacuation Timetable:</strong> {activeAlert.evacuation_schedule}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="citizen-alert-banner banner-normal">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                <span className="alert-badge-citizen badge-normal">Status: Normal / All Clear</span>
                <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>Barangay Pasong Buaya II Safety Command</span>
              </div>
              <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>No Active Environmental Calamity Alert</h3>
              <p style={{ margin: '6px 0 0 0', fontSize: '0.88rem', color: '#047857' }}>
                The community is currently under normal conditions. Evacuation centers remain on standard operational standby.
              </p>
            </div>
          )}

          {/* Quick Metrics Bar */}
          <div className="waste-highlights-grid" style={{ marginBottom: '35px' }}>
            <div className="waste-highlight-card">
              <div className="waste-highlight-icon green">
                <i className="bi bi-shield-check"></i>
              </div>
              <div>
                <h3>{stats.available_centers || centers.length}</h3>
                <p>Available Evacuation Sites</p>
              </div>
            </div>

            <div className="waste-highlight-card">
              <div className="waste-highlight-icon blue">
                <i className="bi bi-people-fill"></i>
              </div>
              <div>
                <h3>{stats.total_capacity_families || 350} Families</h3>
                <p>Shelter Capacity</p>
              </div>
            </div>

            <div className="waste-highlight-card">
              <div className="waste-highlight-icon amber">
                <i className="bi bi-person-walking"></i>
              </div>
              <div>
                <h3>{stats.total_current_families || 0} Families</h3>
                <p>Current Evacuees</p>
              </div>
            </div>

            <div className="waste-highlight-card">
              <div className="waste-highlight-icon red">
                <i className="bi bi-telephone-inbound-fill"></i>
              </div>
              <div>
                <h3>24/7 Hotlines</h3>
                <p>Emergency Standby</p>
              </div>
            </div>
          </div>

          {/* Citizen Tabs */}
          <div className="citizen-tabs-bar">
            <button
              className={`citizen-tab-btn ${activeTab === 'centers' ? 'active' : ''}`}
              onClick={() => setActiveTab('centers')}
            >
              <i className="bi bi-buildings"></i> Evacuation Centers & Availability
            </button>
            <button
              className={`citizen-tab-btn ${activeTab === 'protocols' ? 'active' : ''}`}
              onClick={() => setActiveTab('protocols')}
            >
              <i className="bi bi-backpack4-fill"></i> Go-Bag & Evacuation Guide
            </button>
            <button
              className={`citizen-tab-btn ${activeTab === 'hotlines' ? 'active' : ''}`}
              onClick={() => setActiveTab('hotlines')}
            >
              <i className="bi bi-telephone-forward-fill"></i> Emergency Hotlines
            </button>
          </div>

          {/* TAB 1: EVACUATION CENTERS */}
          {activeTab === 'centers' && (
            <>
              {loading ? (
                <div className="empty-state-citizen">
                  <i className="bi bi-arrow-repeat" style={{ fontSize: '2rem', color: '#059669', display: 'block', marginBottom: '10px' }}></i>
                  Loading evacuation centers...
                </div>
              ) : centers.length === 0 ? (
                <div className="empty-state-citizen">
                  <p>No evacuation centers recorded yet.</p>
                </div>
              ) : (
                <div className="evac-citizen-grid">
                  {centers.map((center) => {
                    const cap = Number(center.capacity_families) || 1;
                    const curr = Number(center.current_families) || 0;
                    const pct = Math.min(100, Math.round((curr / cap) * 100));

                    let fillClass = 'fill-green';
                    if (pct >= 80) fillClass = 'fill-red';
                    else if (pct >= 50) fillClass = 'fill-amber';

                    return (
                      <div key={center.id} className="evac-citizen-card">
                        <div className="evac-card-header">
                          <div>
                            <h3>{center.name}</h3>
                            <div className="evac-address">
                              <i className="bi bi-geo-alt"></i> {center.location}
                            </div>
                          </div>
                          <span className={`evac-status-badge status-${(center.status || 'available').toLowerCase()}`}>
                            {center.status}
                          </span>
                        </div>

                        {/* Occupancy Progress Meter */}
                        <div className="occupancy-meter">
                          <div className="meter-labels">
                            <span>Family Occupancy: {curr} / {cap}</span>
                            <span>{pct}% Occupied</span>
                          </div>
                          <div className="meter-track">
                            <div className={`meter-fill ${fillClass}`} style={{ width: `${pct}%` }}></div>
                          </div>
                        </div>

                        <div className="evac-facilities-list">
                          <strong style={{ display: 'block', color: '#1e293b', marginBottom: '4px' }}>
                            <i className="bi bi-check2-circle" style={{ color: '#059669' }}></i> Available On-Site Facilities:
                          </strong>
                          {center.facilities || 'Drinking Water, Restrooms, First Aid Station, Emergency Power'}
                        </div>

                        <div className="evac-card-footer">
                          <div>
                            <span style={{ fontSize: '0.78rem', color: '#64748b', display: 'block' }}>Focal Officer:</span>
                            <strong style={{ color: '#1e293b' }}>{center.contact_person || 'BDRRMC Officer'}</strong>
                          </div>
                          {center.contact_number && (
                            <a href={`tel:${center.contact_number.split('/')[0].trim()}`} className="call-btn-citizen">
                              <i className="bi bi-telephone-fill"></i> Call Station
                            </a>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* TAB 2: PROTOCOLS & GO-BAG */}
          {activeTab === 'protocols' && (
            <div className="prep-guide-grid">
              <div className="prep-guide-card">
                <div className="prep-guide-header">
                  <div className="prep-icon amber">
                    <i className="bi bi-clock-history"></i>
                  </div>
                  <div>
                    <h3 style={{ margin: 0, color: '#043927', fontWeight: 800 }}>
                      Barangay Evacuation Stages
                    </h3>
                    <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Standard Emergency Operating Procedure</span>
                  </div>
                </div>
                <ul className="prep-list">
                  <li>
                    <strong>Level 1 - Advisory (Yellow):</strong> Weather disturbance monitoring. Early warning megaphones and radio stations activated.
                  </li>
                  <li>
                    <strong>Level 2 - Watch (Orange):</strong> Voluntary evacuation for vulnerable citizens (senior citizens, persons with disabilities, pregnant women, and young children).
                  </li>
                  <li>
                    <strong>Level 3 - Warning (Red):</strong> Mandatory pre-emptive evacuation for low-lying and riverside residents before flooding peaks.
                  </li>
                  <li>
                    <strong>Level 4 - Severe (Forced Evacuation):</strong> Rescue teams mobilized. Evacuate immediately with your 72-hour Go Bag.
                  </li>
                </ul>
              </div>

              <div className="prep-guide-card">
                <div className="prep-guide-header">
                  <div className="prep-icon green">
                    <i className="bi bi-backpack4-fill"></i>
                  </div>
                  <div>
                    <h3 style={{ margin: 0, color: '#043927', fontWeight: 800 }}>
                      72-Hour "Emergency Go Bag"
                    </h3>
                    <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Checklist for Every Family</span>
                  </div>
                </div>
                <ul className="prep-list">
                  <li>
                    <strong>Water & Non-Perishable Food:</strong> At least 3 liters of water per person and easy-open canned food or biscuits.
                  </li>
                  <li>
                    <strong>Critical Documents:</strong> Birth certificates, marriage contracts, IDs, and titles sealed in waterproof plastic envelopes.
                  </li>
                  <li>
                    <strong>First Aid & Medications:</strong> Maintenance medicines, bandages, alcohol, face masks, and thermometer.
                  </li>
                  <li>
                    <strong>Emergency Tools:</strong> Battery-powered flashlight, AM radio, power banks, whistle, and extra cash in small bills.
                  </li>
                </ul>
              </div>
            </div>
          )}

          {/* TAB 3: EMERGENCY HOTLINES */}
          {activeTab === 'hotlines' && (
            <div className="hotlines-card">
              <h3 style={{ margin: '0 0 16px 0', color: '#043927', fontWeight: 800, fontSize: '1.25rem' }}>
                <i className="bi bi-telephone-fill" style={{ color: '#dc2626', marginRight: '8px' }}></i>
                Emergency Assistance & Rescue Directory
              </h3>
              <p style={{ color: '#64748b', fontSize: '0.88rem', marginBottom: '20px' }}>
                Keep these numbers saved on your mobile phones for immediate assistance during floods, typhoons, fires, or medical emergencies.
              </p>

              <div className="hotline-row">
                <div>
                  <div className="hotline-name">Barangay Pasong Buaya II Disaster Operations Center</div>
                  <div className="hotline-agency">BDRRMC Emergency Command</div>
                </div>
                <a href="tel:0464710000" className="hotline-link">
                  <i className="bi bi-telephone-outbound"></i> (046) 471-0000
                </a>
              </div>

              <div className="hotline-row">
                <div>
                  <div className="hotline-name">Imus City Disaster Risk Reduction & Management Office (CDRRMO)</div>
                  <div className="hotline-agency">City Government of Imus Rescue</div>
                </div>
                <a href="tel:0464722525" className="hotline-link">
                  <i className="bi bi-telephone-outbound"></i> (046) 472-2525 / 911
                </a>
              </div>

              <div className="hotline-row">
                <div>
                  <div className="hotline-name">Bureau of Fire Protection (BFP) - Imus Central</div>
                  <div className="hotline-agency">Fire and Rescue Operations</div>
                </div>
                <a href="tel:0464710116" className="hotline-link">
                  <i className="bi bi-telephone-outbound"></i> (046) 471-0116
                </a>
              </div>

              <div className="hotline-row">
                <div>
                  <div className="hotline-name">Philippine National Police (PNP) - Imus Component Station</div>
                  <div className="hotline-agency">Law Enforcement & Public Order</div>
                </div>
                <a href="tel:0464715822" className="hotline-link">
                  <i className="bi bi-telephone-outbound"></i> (046) 471-5822
                </a>
              </div>
            </div>
          )}
        </div>
      </div>

      <Footer />
    </>
  );
};

export default DisasterRisk;

