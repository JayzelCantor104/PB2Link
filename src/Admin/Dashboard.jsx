import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom'; // Import for navigation
import axios from 'axios';

const API_BASE = '/api_backend';

const Dashboard = () => {
  const [stats, setStats] = useState(null);
  const [recent, setRecent] = useState([]);
  const [wasteData, setWasteData] = useState({ schedules: [], stats: { total_schedules: 0, active_schedules: 0 } });
  const [riskData, setRiskData] = useState({ alerts: [], centers: [], stats: { active_alerts_count: 0, available_centers: 0 } });
  const navigate = useNavigate(); // Initialize navigation

  useEffect(() => {
    const fetchData = async () => {
      try {
        const statsRes = await axios.get(`${API_BASE}/dashboard.php?api=dashboard_counts`);
        const recentRes = await axios.get(`${API_BASE}/dashboard.php?api=recent_residents`);
        
        setStats(statsRes.data);
        setRecent(Array.isArray(recentRes.data) ? recentRes.data : []);
      } catch (err) {
        console.error("Fetch error:", err);
        setStats({ total: 0, active: 0, archived: 0, pending_docs: 0, pending_amenities: 0 });
        setRecent([]);
      }

      // Fetch informative metrics for Waste and Disaster Risk
      try {
        const wasteRes = await axios.get(`${API_BASE}/waste_management.php?action=get_all`);
        if (wasteRes.data && wasteRes.data.success) {
          setWasteData({
            schedules: wasteRes.data.schedules || [],
            stats: wasteRes.data.stats || { total_schedules: 0, active_schedules: 0 }
          });
        }
      } catch {
        // Safe fallback
      }

      try {
        const riskRes = await axios.get(`${API_BASE}/disaster_risk.php?action=get_all`);
        if (riskRes.data && riskRes.data.success) {
          setRiskData({
            alerts: riskRes.data.alerts || [],
            centers: riskRes.data.centers || [],
            stats: riskRes.data.stats || { active_alerts_count: 0, available_centers: 0 }
          });
        }
      } catch {
        // Safe fallback
      }
    };
    fetchData();
  }, []);

  if (!stats) {
    return <div style={{ padding: '40px', fontWeight: 'bold', color: '#043927' }}>Loading Command Center...</div>;
  }

  return (
    <div className="dashboard-container">
      <style>{`
        .dashboard-container { padding: 30px; margin-top: 0px;}
        
        /* Stats Styling */
        .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 20px; }
        .stat-card { 
            background: white; padding: 20px; border-radius: 20px; border: 1px solid #e2e8f0;
            transition: 0.3s ease; display: flex; align-items: center; gap: 20px;
        }
        .stat-card:hover { transform: translateY(-5px); box-shadow: 0 10px 20px rgba(0,0,0,0.05); }
        .icon-box { 
            width: 50px; height: 50px; border-radius: 12px; background: #f0fdf4; 
            color: #15803d; display: flex; align-items: center; justify-content: center; font-size: 1.2rem;
        }
        .icon-box.amber { background: #fffbeb; color: #b45309; }
        .stat-card h3 { margin: 0; font-size: 1.8rem; color: #1e293b; }
        .stat-card p { margin: 0; color: #64748b; font-size: 0.85rem; font-weight: 600; }

        /* Quick Access Styling */
        .quick-access-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; }
        .btn-dash { 
            padding: 18px; border-radius: 15px; font-weight: 700; cursor: pointer; 
            transition: 0.2s; border: none; font-size: 0.9rem; text-align: left;
            display: flex; flex-direction: column; gap: 5px;
        }
        .btn-main { background: #043927; color: white; }
        .btn-sec { background: white; color: #043927; border: 2px solid #043927; }
        .btn-dash:hover { opacity: 0.9; transform: scale(1.02); }
        .btn-dash span { font-size: 0.7rem; font-weight: 400; opacity: 0.8; }
      `}</style>

      {/* 1. STAT CARDS SECTION */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="icon-box"><i className="bi bi-people-fill"></i></div>
          <div>
            <h3>{stats.total || 0}</h3>
            <p>Total Residents</p>
          </div>
        </div>
        
        <div className="stat-card">
          <div className="icon-box"><i className="bi bi-basket3-fill"></i></div>
          <div>
            {/* Added this to show your Amenity progress! */}
            <h3>{stats.pending_amenities || 0}</h3>
            <p>Amenity Requests</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="icon-box amber"><i className="bi bi-file-earmark-text"></i></div>
          <div>
            <h3>{stats.pending_docs || 0}</h3>
            <p>Doc Requests</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="icon-box amber"><i className="bi bi-exclamation-triangle-fill"></i></div>
          <div>
            <h3>{stats.active_incidents || 0}</h3>
            <p>Active Incidents</p>
          </div>
        </div>
      </div>

      <h6 style={{ margin: '40px 0 15px 0', color: '#64748b', fontSize: '0.75rem', fontWeight: 800, letterSpacing: '1px' }}>
        QUICK ACCESS COMMANDS
      </h6>

      {/* 2. QUICK ACCESS SECTION */}
      <div className="quick-access-grid">
        <button className="btn-dash btn-main" onClick={() => navigate('/admin/documents')}>
          Documents
          <span>Manage Document Request</span>
        </button>
        
        <button className="btn-dash btn-sec" onClick={() => navigate('/admin/amenities')}>
          Amenity Requests
          <span>Approve/Reject facility use</span>
        </button>
        
        <button className="btn-dash btn-sec" onClick={() => navigate('/admin/incidents')}>
          Incident Reports
          <span>Review blotter and complaints</span>
        </button>

        <button className="btn-dash btn-sec" onClick={() => navigate('/admin/waste-management')}>
          Waste Management
          <span>Pickup routes & scheduler</span>
        </button>

        <button className="btn-dash btn-sec" onClick={() => navigate('/admin/disaster-risk')}>
          Disaster Risk (DRRM)
          <span>Evacuation & weather alerts</span>
        </button>
      </div>

      {/* 2.5 ENVIRONMENTAL & DISASTER READINESS SNAPSHOT */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px', marginTop: '35px' }}>
        {/* Waste Snapshot */}
        <div style={{ background: 'white', padding: '24px', borderRadius: '20px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: '#ecfdf5', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem' }}>
                  <i className="bi bi-trash-fill"></i>
                </div>
                <h5 style={{ margin: 0, color: '#043927', fontWeight: 800 }}>Waste Management</h5>
              </div>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#059669', background: '#ecfdf5', padding: '3px 8px', borderRadius: '12px' }}>
                {wasteData.stats.active_schedules || 0} Active Routes
              </span>
            </div>
            <p style={{ fontSize: '0.83rem', color: '#64748b', margin: '0 0 14px 0' }}>
              Garbage truck pickup schedules, segregation rules, and city landfill transport monitoring.
            </p>
            {wasteData.schedules.length > 0 && (
              <div style={{ background: '#f8fafc', padding: '10px 14px', borderRadius: '10px', fontSize: '0.8rem', color: '#334155', marginBottom: '14px' }}>
                <strong>Upcoming Pickup:</strong> {wasteData.schedules[0]?.zone_area} ({wasteData.schedules[0]?.collection_day})
              </div>
            )}
          </div>
          <button
            style={{ alignSelf: 'flex-start', background: 'transparent', border: 'none', color: '#059669', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: '5px' }}
            onClick={() => navigate('/admin/waste-management')}
          >
            View Full Scheduler & Routes <i className="bi bi-arrow-right"></i>
          </button>
        </div>

        {/* DRRM Snapshot */}
        <div style={{ background: 'white', padding: '24px', borderRadius: '20px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: '#fef2f2', color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem' }}>
                  <i className="bi bi-shield-fill-exclamation"></i>
                </div>
                <h5 style={{ margin: 0, color: '#043927', fontWeight: 800 }}>Disaster Risk (DRRM)</h5>
              </div>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: riskData.stats.active_alerts_count > 0 ? '#dc2626' : '#059669', background: riskData.stats.active_alerts_count > 0 ? '#fef2f2' : '#ecfdf5', padding: '3px 8px', borderRadius: '12px' }}>
                {riskData.stats.active_alerts_count > 0 ? `${riskData.stats.active_alerts_count} Active Advisory` : 'Status: Normal'}
              </span>
            </div>
            <p style={{ fontSize: '0.83rem', color: '#64748b', margin: '0 0 14px 0' }}>
              Community calamity warning bulletins, evacuation center capacity & availability, and flood risk protocols.
            </p>
            <div style={{ background: '#f8fafc', padding: '10px 14px', borderRadius: '10px', fontSize: '0.8rem', color: '#334155', marginBottom: '14px' }}>
              <strong>Available Evacuation Centers:</strong> {riskData.stats.available_centers || 0} facility ready on standby
            </div>
          </div>
          <button
            style={{ alignSelf: 'flex-start', background: 'transparent', border: 'none', color: '#059669', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: '5px' }}
            onClick={() => navigate('/admin/disaster-risk')}
          >
            Manage Evacuation & Weather Alerts <i className="bi bi-arrow-right"></i>
          </button>
        </div>
      </div>

      {/* 3. LOWER CONTENT SECTION */}
      <div className="lower-dashboard-grid" style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '30px', marginTop: '40px' }}>
        
        <div className="card-custom" style={{ background: 'white', padding: '30px', borderRadius: '20px', border: '1px solid #e2e8f0' }}>
          <h5 style={{ color: '#043927', fontWeight: 800, marginBottom: '20px' }}>Subdivision Overview</h5>
          <div style={{ height: '150px', background: '#f8fafc', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
            Interactive Map or Chart Coming Soon
          </div>
        </div>

        <div className="card-custom" style={{ background: 'white', padding: '30px', borderRadius: '20px', border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h5 style={{ color: '#043927', fontWeight: 800, m: 0 }}>Recently Registered</h5>
          </div>
          
          {recent.length > 0 ? recent.map(r => (
            <div key={r.resident_id} style={{ padding: '12px 0', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 600, color: '#334155' }}>{r.first_name} {r.last_name}</span>
              <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{r.created_at || 'Just now'}</span>
            </div>
          )) : (
            <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8' }}>No recent records.</div>
          )}
        </div>

      </div>
    </div>
  );
};

export default Dashboard;