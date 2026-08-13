import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const API_BASE = '/api_backend';

const AmenityDashboard = () => {
  const navigate = useNavigate();
  const [requests, setRequests] = useState([]);
  const [activeTab, setActiveTab] = useState('active');
  const [selectedRequest, setSelectedRequest] = useState(null);
  
  // States for calendar navigation
  const [currentDate, setCurrentDate] = useState(new Date());

  // 1. Fetch Reservations
  const fetchReservations = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE}/get_amenities.php`);
      if (Array.isArray(response.data)) {
        setRequests(response.data);
        
        // Auto-select the first request matching the tab filter if none is selected
        const filtered = response.data.filter(req => {
          if (activeTab === 'archived') {
            return req.status === 'Declined' || req.status === 'Completed' || req.status === 'Cancelled';
          }
          return req.status === 'Pending' || req.status === 'Approved';
        });
        if (filtered.length > 0 && !selectedRequest) {
          setSelectedRequest(filtered[0]);
        }
      }
    } catch (e) {
      console.error("Failed fetching reservations:", e);
    }
  }, [activeTab, selectedRequest]);

  useEffect(() => {
    fetchReservations();
  }, [fetchReservations]);

  // 2. Tab Change Handler (Resets panel selection)
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setSelectedRequest(null);
  };

  // 3. Update Status Action
  const handleStatusUpdate = async (id, newStatus) => {
    try {
      const response = await axios.post(`${API_BASE}/update_amenity.php`, {
        request_id: id,
        status: newStatus
      });
      if (response.data.success) {
        if (selectedRequest && selectedRequest.request_id === id) {
          setSelectedRequest(prev => ({ ...prev, status: newStatus }));
        }
        fetchReservations();
      } else {
        console.error("Server Error:", response.data.error);
      }
    } catch (error) {
      console.error("Update failed:", error);
    }
  };

  // Filter requests based on top tabs
  const filteredData = requests.filter(req => {
    if (activeTab === 'archived') {
      return req.status === 'Declined' || req.status === 'Completed' || req.status === 'Cancelled';
    }
    return req.status === 'Pending' || req.status === 'Approved';
  });

  // --- CALENDAR LOGIC GENERATOR ---
  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const startDay = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    
    const daysArr = [];
    for (let i = 0; i < startDay; i++) {
      daysArr.push({ dayNumber: null, currentMonth: false });
    }
    for (let day = 1; day <= totalDays; day++) {
      const formattedDateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const bookingsOnThisDay = filteredData.filter(r => r.reservation_date === formattedDateStr);
      daysArr.push({
        dayNumber: day,
        dateString: formattedDateStr,
        currentMonth: true,
        bookings: bookingsOnThisDay
      });
    }
    return daysArr;
  };

  const changeMonth = (direction) => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + direction, 1));
  };

  const calendarDays = getDaysInMonth(currentDate);
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div className="ep-adm-wrapper">
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css" />

      <style>{`
        .ep-adm-wrapper { width: 100%; max-width: 1200px; margin: 0 auto; min-height: 100vh; background: #f8fafc; padding: 20px; font-family: 'Poppins', sans-serif; color: #334155; box-sizing: border-box; }
        
        /* Layout Grid Header Controls */
        .ep-adm-topbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 25px; border-bottom: 2px solid #e2e8f0; padding-bottom: 15px; }
        .ep-adm-headline h2 { margin: 0 0 4px; font-size: 1.8rem; font-weight: 800; color: #043927; }
        .ep-adm-headline p { margin: 0; color: #64748b; font-size: 0.9rem; }
        
        .ep-tab-bar { display: flex; gap: 10px; }
        .ep-tab-item { padding: 10px 22px; border: none; background: transparent; cursor: pointer; font-weight: 700; color: #94a3b8; transition: 0.3s; border-radius: 8px; }
        .ep-tab-item.active { background: #043927; color: white; }
        
        /* Master Panel Workspace Blueprint Split Layout */
        .ep-dashboard-workspace { display: grid; grid-template-columns: 1.3fr 1fr; gap: 20px; align-items: start; }
        
        /* Left Side Component Box: Light Mode Calendar Engine */
        .ep-cal-card { background: white; border: 1px solid #e2e8f0; border-radius: 20px; padding: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.02); }
        .ep-cal-nav { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
        .ep-cal-title { font-size: 1.15rem; font-weight: 800; color: #043927; margin: 0; }
        .ep-cal-arrow { background: #f1f5f9; border: 1px solid #cbd5e1; color: #475569; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: 0.2s; }
        .ep-cal-arrow:hover { background: #043927; color: white; border-color: #043927; }
        
        .ep-cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 8px; text-align: center; }
        .ep-cal-dayname { color: #94a3b8; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; padding-bottom: 5px; }
        .ep-cal-cell { background: #ffffff; border: 1px solid #f1f5f9; border-radius: 12px; min-height: 85px; padding: 6px; display: flex; flex-direction: column; align-items: flex-start; justify-content: space-between; transition: 0.2s; cursor: default; }
        .ep-cal-cell.has-events { background: #f0fdf4; border-color: #bbf7d0; cursor: pointer; }
        .ep-cal-cell.has-events:hover { background: #e6fbf0; border-color: #043927; }
        .ep-cal-daynum { font-weight: 700; font-size: 0.85rem; color: #94a3b8; }
        .ep-cal-cell.has-events .ep-cal-daynum { color: #043927; }
        .ep-cal-empty { background: transparent; border: none; }
        
        /* Micro Badges Inside Calendar Cell */
        .ep-cell-dots-container { display: flex; flex-direction: column; gap: 3px; width: 100%; margin-top: 4px; }
        .ep-micro-badge { font-size: 0.65rem; width: 100%; text-overflow: ellipsis; overflow: hidden; white-space: nowrap; padding: 2px 5px; border-radius: 4px; font-weight: 700; text-align: left; }
        .ep-micro-badge.ep-mb-pending { background: #fffbeb; color: #b45309; border: 1px solid #fde68a; }
        .ep-micro-badge.ep-mb-approved { background: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0; }
        .ep-micro-badge.ep-mb-archived { background: #f1f5f9; color: #64748b; border: 1px solid #e2e8f0; }

        /* Right Side Component Box: Executive Context Details Panel Layout */
        .ep-details-panel { background: white; border: 1px solid #e2e8f0; border-radius: 20px; padding: 25px; position: sticky; top: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.02); }
        .ep-pane-placeholder { text-align: center; padding: 50px 20px; color: #94a3b8; }
        .ep-pane-placeholder i { font-size: 2.5rem; color: #cbd5e1; display: block; margin-bottom: 12px; }
        
        .ep-panel-header { display: flex; justify-content: space-between; align-items: start; border-bottom: 1px solid #f1f5f9; padding-bottom: 15px; margin-bottom: 18px; }
        .ep-panel-header h3 { margin: 0 0 2px; font-weight: 800; font-size: 1.2rem; color: #043927; }
        .ep-panel-header p { margin: 0; font-size: 0.8rem; color: #64748b; }
        
        /* Your original status tags styling matched perfectly */
        .ep-status-tag { padding: 6px 14px; border-radius: 8px; font-size: 0.75rem; font-weight: 700; display: inline-block; text-transform: uppercase; }
        .tag-pending { background: #fffbeb; color: #b45309; border: 1px solid #fde68a; }
        .tag-approved { background: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0; }
        .tag-declined { background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; }
        .tag-completed { background: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd; }

        .ep-info-stack { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px; }
        .ep-info-node label { display: block; font-size: 0.7rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px; }
        .ep-info-node p { margin: 0; font-weight: 700; font-size: 0.9rem; color: #334155; }
        
        /* Actions Interface Elements */
        .ep-panel-actions { display: flex; flex-direction: column; gap: 8px; margin-top: 20px; border-top: 1px solid #f1f5f9; padding-top: 15px; }
        .ep-btn-block { width: 100%; padding: 11px; border-radius: 10px; font-weight: 700; font-size: 0.8rem; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; transition: 0.2s; }
        .ep-btn-view { background: #e0f2fe; color: #0369a1; }
        .ep-btn-approve { background: #043927; color: white; }
        .ep-btn-decline { background: white; color: #64748b; border: 1px solid #e2e8f0; }
        .ep-btn-decline:hover { background: #fef2f2; color: #b91c1c; border-color: #fecaca; }
        .ep-btn-block:hover:not(.ep-btn-decline) { transform: translateY(-2px); opacity: 0.9; }
      `}</style>

      <div className="ep-adm-topbar">
        <div className="ep-adm-headline">
          <h2>Resource Reservation Matrix</h2>
          <p>Calendar visualization and context management desk</p>
        </div>
        
        <div className="ep-tab-bar">
          <button className={`ep-tab-item ${activeTab === 'active' ? 'active' : ''}`} onClick={() => handleTabChange('active')}>
            Active Requests
          </button>
          <button className={`ep-tab-item ${activeTab === 'archived' ? 'active' : ''}`} onClick={() => handleTabChange('archived')}>
            Archive / History
          </button>
        </div>
      </div>

      <div className="ep-dashboard-workspace">
        
        {/* INTERACTIVE LIGHT CALENDAR ENGINE */}
        <div className="ep-cal-card">
          <div className="ep-cal-nav">
            <button className="ep-cal-arrow" onClick={() => changeMonth(-1)}><i className="bi bi-chevron-left"></i></button>
            <h3 className="ep-cal-title">{monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}</h3>
            <button className="ep-cal-arrow" onClick={() => changeMonth(1)}><i className="bi bi-chevron-right"></i></button>
          </div>

          <div className="ep-cal-grid">
            {dayNames.map(d => <div key={d} className="ep-cal-dayname">{d}</div>)}
            
            {calendarDays.map((cell, idx) => {
              if (!cell.dayNumber) return <div key={`empty-${idx}`} className="ep-cal-cell ep-cal-empty"></div>;
              
              const hasEvents = cell.bookings && cell.bookings.length > 0;
              return (
                <div 
                  key={cell.dateString} 
                  className={`ep-cal-cell ${hasEvents ? 'has-events' : ''}`}
                  onClick={() => hasEvents && setSelectedRequest(cell.bookings[0])}
                >
                  <span className="ep-cal-daynum">{cell.dayNumber}</span>
                  
                  <div className="ep-cell-dots-container">
                    {cell.bookings.slice(0, 2).map(b => (
                      <div 
                        key={b.request_id} 
                        className={`ep-micro-badge ${
                          b.status === 'Pending' ? 'ep-mb-pending' : 
                          b.status === 'Approved' ? 'ep-mb-approved' : 'ep-mb-archived'
                        }`}
                      >
                        {b.venue.split(' ')[0]} - {b.name || b.contact_name}
                      </div>
                    ))}
                    {cell.bookings.length > 2 && (
                      <div className="ep-micro-badge ep-mb-archived" style={{ textAlign: 'center', fontSize: '0.6rem' }}>
                        + {cell.bookings.length - 2} slots
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* COMPACT DETAILS SIDEBAR PANEL */}
        <div className="ep-details-panel">
          {selectedRequest ? (
            <div>
              <div className="ep-panel-header">
                <div>
                  <h3>{selectedRequest.name || selectedRequest.contact_name}</h3>
                  <p>Reference Request ID: #{selectedRequest.request_id}</p>
                </div>
                <span className={`ep-status-tag tag-${selectedRequest.status?.toLowerCase()}`}>
                  {selectedRequest.status}
                </span>
              </div>

              <div className="ep-info-stack">
                <div className="ep-info-node" style={{ gridColumn: 'span 2' }}>
                  <label>Target Facility / Venue</label>
                  <p style={{ color: '#043927', fontSize: '1rem' }}>{selectedRequest.venue}</p>
                </div>
                <div className="ep-info-node">
                  <label>Reserved Date</label>
                  <p><i className="bi bi-calendar-event me-2 text-success"></i>{selectedRequest.reservation_date}</p>
                </div>
                <div className="ep-info-node">
                  <label>Assigned Time Frame</label>
                  <p><i className="bi bi-clock me-2 text-warning"></i>{selectedRequest.time_slot || 'Custom Range'}</p>
                </div>
                <div className="ep-info-node" style={{ gridColumn: 'span 2', marginTop: '5px' }}>
                  <label>Activity Purpose Narrative</label>
                  <p style={{ fontWeight: '400', fontStyle: 'italic', color: '#475569' }}>
                    "{selectedRequest.purpose || 'No description provided.'}"
                  </p>
                </div>
              </div>

              <div className="ep-panel-actions">
                <button 
                  className="ep-btn-block ep-btn-view" 
                  onClick={() => navigate(`/admin/amenities/view/${selectedRequest.request_id}`)}
                >
                  View
                </button>

                {selectedRequest.status === 'Pending' && activeTab === 'active' && (
                  <>
                    <button 
                      className="ep-btn-block ep-btn-approve" 
                      onClick={() => handleStatusUpdate(selectedRequest.request_id, 'Approved')}
                    >
                      Approve Booking
                    </button>
                    <button 
                      className="ep-btn-block ep-btn-decline" 
                      onClick={() => handleStatusUpdate(selectedRequest.request_id, 'Declined')}
                    >
                      Decline
                    </button>
                  </>
                )}

                {selectedRequest.status === 'Approved' && (
                  <button 
                    className="ep-btn-block ep-btn-approve" 
                    onClick={() => handleStatusUpdate(selectedRequest.request_id, 'Completed')}
                  >
                    Mark as Completed
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="ep-pane-placeholder">
              <i className="bi bi-calendar2-range"></i>
              <h4>No Reservation Selected</h4>
              <p>Click on any highlighted calendar cell containing scheduled micro-badges to process details instantly.</p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

export default AmenityDashboard;