import React, { useState, useEffect } from 'react';
import Header from '../components/Header';
import Footer from '../components/Footer';
import Preloader from '../components/Preloader';
import DisasterMap from '../components/DisasterMap';
import LiveHazards from '../components/LiveHazards';
import AlertsOnDevice from '../components/AlertsOnDevice';
import EmergencyHotlines from '../components/EmergencyHotlines';
import { Link } from 'react-router-dom';
import { advisoryText, getAdvisoryLang, setAdvisoryLang } from '../lib/advisoryLanguage';
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
  // English or Filipino advisory text (migration 032), remembered on this device.
  const [lang, setLang] = useState(getAdvisoryLang);
  const chooseLang = (l) => { setLang(l); setAdvisoryLang(l); };

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

  // Practice advisories are staff-only drills: never shown here, even to signed-in staff.
  const activeAlert = alerts.find((a) => Number(a.is_active) === 1 && Number(a.is_practice || 0) === 0);
  const text = activeAlert ? advisoryText(activeAlert, lang) : null;

  return (
    <>
      <Preloader />
      <Header />

      <div className="citizen-drrm-page">
        <div className="drrm-page-container">
          {/* Header Banner */}
          <div className="drrm-hero-header">
            <span className="badge-safety">Disaster Risk Reduction & Management (DRRM)</span>
            <h1>Disaster Risk & Evacuation</h1>
            <p>
              Official weather bulletins, mapped evacuation resources, pre-emptive evacuation schedules, and emergency response hotlines for Barangay Pasong Buaya II, Imus, Cavite.
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

              {text.hasFilipino && (
                <div className="adv-lang" role="group" aria-label="Language" style={{ marginTop: '10px' }}>
                  <button type="button" className={lang === 'en' ? 'is-active' : ''} aria-pressed={lang === 'en'} onClick={() => chooseLang('en')}>English</button>
                  <button type="button" className={lang === 'fil' ? 'is-active' : ''} aria-pressed={lang === 'fil'} onClick={() => chooseLang('fil')}>Filipino</button>
                </div>
              )}
              <h2 className="citizen-alert-title" lang={text.isFilipino ? 'fil' : 'en'}>{text.title}</h2>
              <p className="citizen-alert-instructions" lang={text.isFilipino ? 'fil' : 'en'}>{text.instructions}</p>

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
              <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>No Active Advisory</h3>
              <p style={{ margin: '6px 0 0 0', fontSize: '0.88rem', color: '#065f46' }}>
                The community is currently under normal conditions. Evacuation centers remain on standard operational standby.
              </p>
            </div>
          )}

          {/* Advisory alerts on this phone (Web Push, migration 032) */}
          <AlertsOnDevice language={lang} />

          {/* Live PAGASA / PHIVOLCS / GDACS readings (hazard_feeds.php) */}
          <LiveHazards />

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
              className={`citizen-tab-btn ${activeTab === 'map' ? 'active' : ''}`}
              onClick={() => setActiveTab('map')}
            >
              <i className="bi bi-map"></i> Disaster Map
            </button>
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

          {activeTab === 'map' && <DisasterMap centers={centers} advisoryActive={!!activeAlert} />}

          {/* TAB 1: EVACUATION CENTERS */}
          {activeTab === 'centers' && (
            <>
              {loading ? (
                <div className="empty-state-citizen">
                  <i className="bi bi-arrow-repeat" style={{ fontSize: '2rem', color: '#047857', display: 'block', marginBottom: '10px' }}></i>
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
                            <i className="bi bi-check2-circle" style={{ color: '#047857' }}></i> Available On-Site Facilities:
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
                      Be prepared
                    </h3>
                    <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Go-bag, family plan and what to do</span>
                  </div>
                </div>
                <p style={{ fontSize: '0.88rem', color: '#334155', lineHeight: 1.6 }}>
                  Tick off your family’s go-bag and plan, see what to do before, during and after a typhoon, flood, earthquake or fire, and check how much your street can flood.
                </p>
                <Link to="/preparedness" className="hotline-link" style={{ display: 'inline-flex' }}>
                  <i className="bi bi-arrow-right-circle"></i> Open the preparedness guide
                </Link>
              </div>
            </div>
          )}

          {/* TAB 3: EMERGENCY HOTLINES (preparedness.php, staff keep the list on admin Disaster Risk) */}
          {activeTab === 'hotlines' && (
            <div className="hotlines-card">
              <h3 style={{ margin: '0 0 16px 0', color: '#043927', fontWeight: 800, fontSize: '1.25rem' }}>
                <i className="bi bi-telephone-fill" style={{ color: '#dc2626', marginRight: '8px' }}></i>
                Emergency Assistance & Rescue Directory
              </h3>
              <p style={{ color: '#64748b', fontSize: '0.88rem', marginBottom: '20px' }}>
                Tap a number to call. Keep these numbers saved on your phone for floods, typhoons, fires and medical emergencies.
              </p>
              <EmergencyHotlines />
            </div>
          )}
        </div>
      </div>

      <Footer />
    </>
  );
};

export default DisasterRisk;

