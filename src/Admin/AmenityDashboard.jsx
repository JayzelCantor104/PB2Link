import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const API_BASE = '/api_backend';

const AmenityDashboard = () => {
  const [requests, setRequests] = useState([]);
  const [activeTab, setActiveTab] = useState('active');
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [dayBookings, setDayBookings] = useState([]);
  const [currentDate, setCurrentDate] = useState(new Date());

  // Modals state
  const [previewImage, setPreviewImage] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newFacility, setNewFacility] = useState({
    facility_name: '',
    description: '',
    icon_class: 'bi-building'
  });

  // 1. Fetch Reservations from Backend
  const fetchReservations = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE}/get_amenity_reservations.php`);
      if (response.data.success && Array.isArray(response.data.data)) {
        const data = response.data.data;
        setRequests(data);

        const filtered = data.filter(req => {
          if (activeTab === 'archived') {
            return req.status === 'Declined' || req.status === 'Completed' || req.status === 'Cancelled' || req.status === 'rejected';
          }
          return req.status === 'Pending' || req.status === 'Approved' || req.status === 'approved' || req.status === 'pending';
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

  // 2. Tab Change Handler
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setSelectedRequest(null);
    setDayBookings([]);
  };

  // 3. Update Status Action
  const handleStatusUpdate = async (id, newStatus) => {
    try {
      const response = await axios.post(`${API_BASE}/update_reservation_status.php`, { id: id, status: newStatus });
      if (response.data.success) {
        if (selectedRequest && selectedRequest.id === id) {
          setSelectedRequest(prev => ({ ...prev, status: newStatus }));
        }
        fetchReservations();
      } else {
        console.error("Server Error:", response.data.message);
      }
    } catch (error) {
      console.error("Update failed:", error);
    }
  };

  // 4. Add New Amenity/Facility Handler
  const handleAddFacility = async (e) => {
    e.preventDefault();
    try {
      const res = await axios.post(`${API_BASE}/add_facility.php`, newFacility);
      if (res.data && res.data.success) {
        alert('Amenity added successfully!');
        setShowAddModal(false);
        setNewFacility({ facility_name: '', description: '', icon_class: 'bi-building' });
        
        // Directly invoke function to refresh view
        fetchReservations();
      } else {
        alert(`Error: ${res.data ? res.data.message : 'Unknown response'}`);
      }
    } catch (err) {
      console.error("Failed to add facility:", err);
      alert(`Request failed: ${err.message}`);
    }
  };

  // Filter requests based on top tabs
  const filteredData = requests.filter(req => {
    const status = (req.status || 'pending').toLowerCase();
    if (activeTab === 'archived') {
      return status === 'declined' || status === 'completed' || status === 'cancelled' || status === 'rejected';
    }
    return status === 'pending' || status === 'approved';
  });

  // --- CALENDAR ENGINE LOGIC ---
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
      const bookingsOnThisDay = filteredData.filter(r => r.date === formattedDateStr);
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

  const handleCellClick = (bookings) => {
    if (bookings && bookings.length > 0) {
      setDayBookings(bookings);
      setSelectedRequest(bookings[0]);
    }
  };

  const calendarDays = getDaysInMonth(currentDate);
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div className="ep-adm-wrapper">
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css" />
      <style>{`
        .ep-adm-wrapper { width: 100%; max-width: 1200px; margin: 0 auto; min-height: 100vh; background: #f8fafc; padding: 20px; font-family: 'Inter', sans-serif; color: #334155; box-sizing: border-box; }
        .ep-adm-topbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 25px; border-bottom: 2px solid #e2e8f0; padding-bottom: 15px; }
        .ep-adm-headline h2 { margin: 0 0 4px; font-size: 1.8rem; font-weight: 800; color: #043927; }
        .ep-adm-headline p { margin: 0; color: #64748b; font-size: 0.9rem; }
        .ep-topbar-controls { display: flex; gap: 12px; align-items: center; }
        .ep-tab-bar { display: flex; gap: 10px; }
        .ep-tab-item { padding: 10px 22px; border: none; background: transparent; cursor: pointer; font-weight: 700; color: #94a3b8; transition: 0.3s; border-radius: 8px; }
        .ep-tab-item.active { background: #043927; color: white; }
        .ep-dashboard-workspace { display: grid; grid-template-columns: 1.3fr 1fr; gap: 20px; align-items: start; }
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
        .ep-cell-dots-container { display: flex; flex-direction: column; gap: 3px; width: 100%; margin-top: 4px; }
        .ep-micro-badge { font-size: 0.65rem; width: 100%; text-overflow: ellipsis; overflow: hidden; white-space: nowrap; padding: 2px 5px; border-radius: 4px; font-weight: 700; text-align: left; }
        .ep-micro-badge.ep-mb-pending { background: #fffbeb; color: #b45309; border: 1px solid #fde68a; }
        .ep-micro-badge.ep-mb-approved { background: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0; }
        .ep-micro-badge.ep-mb-archived { background: #f1f5f9; color: #64748b; border: 1px solid #e2e8f0; }
        .ep-details-panel { background: white; border: 1px solid #e2e8f0; border-radius: 20px; padding: 25px; position: sticky; top: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.02); }
        .ep-pane-placeholder { text-align: center; padding: 50px 20px; color: #94a3b8; }
        .ep-pane-placeholder i { font-size: 2.5rem; color: #cbd5e1; display: block; margin-bottom: 12px; }
        .ep-panel-header { display: flex; justify-content: space-between; align-items: start; border-bottom: 1px solid #f1f5f9; padding-bottom: 15px; margin-bottom: 18px; }
        .ep-panel-header h3 { margin: 0 0 2px; font-weight: 800; font-size: 1.2rem; color: #043927; }
        .ep-panel-header p { margin: 0; font-size: 0.8rem; color: #64748b; }
        .ep-status-tag { padding: 6px 14px; border-radius: 8px; font-size: 0.75rem; font-weight: 700; display: inline-block; text-transform: uppercase; }
        .tag-pending { background: #fffbeb; color: #b45309; border: 1px solid #fde68a; }
        .tag-approved { background: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0; }
        .tag-declined, .tag-rejected { background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; }
        .tag-completed { background: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd; }
        .ep-info-stack { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px; }
        .ep-info-node label { display: block; font-size: 0.7rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px; }
        .ep-info-node p { margin: 0; font-weight: 700; font-size: 0.9rem; color: #334155; }
        .ep-doc-btns { display: flex; gap: 8px; margin-top: 5px; }
        .ep-doc-btn { padding: 6px 12px; border: 1px solid #043927; background: #ecfdf5; color: #043927; border-radius: 6px; font-size: 0.75rem; font-weight: 700; cursor: pointer; }
        .ep-panel-actions { display: flex; flex-direction: column; gap: 8px; margin-top: 20px; border-top: 1px solid #f1f5f9; padding-top: 15px; }
        .ep-btn-block { width: 100%; padding: 11px; border-radius: 10px; font-weight: 700; font-size: 0.8rem; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; transition: 0.2s; }
        .ep-btn-approve { background: #043927; color: white; }
        .ep-btn-decline { background: white; color: #64748b; border: 1px solid #e2e8f0; }
        .ep-btn-decline:hover { background: #fef2f2; color: #b91c1c; border-color: #fecaca; }
        .ep-modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.75); display: flex; justify-content: center; align-items: center; z-index: 9999; }
      `}</style>

      {/* TOPBAR NAVIGATION */}
      <div className="ep-adm-topbar">
        <div className="ep-adm-headline">
          <h2>Resource Reservation Matrix</h2>
          <p>Calendar visualization and context management desk</p>
        </div>
        <div className="ep-topbar-controls">
          <div className="ep-tab-bar">
            <button className={`ep-tab-item ${activeTab === 'active' ? 'active' : ''}`} onClick={() => handleTabChange('active')}>
              Active Requests
            </button>
            <button className={`ep-tab-item ${activeTab === 'archived' ? 'active' : ''}`} onClick={() => handleTabChange('archived')}>
              Archive / History
            </button>
          </div>
          <button className="ep-btn-block ep-btn-approve" style={{ width: 'auto', padding: '10px 18px', borderRadius: '8px' }} onClick={() => setShowAddModal(true)}>
            <i className="bi bi-plus-lg"></i> Add Amenity
          </button>
        </div>
      </div>

      <div className="ep-dashboard-workspace">
        {/* CALENDAR ENGINE VIEW */}
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
                <div key={cell.dateString} className={`ep-cal-cell ${hasEvents ? 'has-events' : ''}`} onClick={() => handleCellClick(cell.bookings)}>
                  <span className="ep-cal-daynum">{cell.dayNumber}</span>
                  <div className="ep-cell-dots-container">
                    {cell.bookings.slice(0, 2).map(b => {
                      const st = (b.status || 'pending').toLowerCase();
                      return (
                        <div key={b.id} className={`ep-micro-badge ${st === 'pending' ? 'ep-mb-pending' : st === 'approved' ? 'ep-mb-approved' : 'ep-mb-archived'}`}>
                          {b.venue.split(' ')[0]} - {b.contact_name}
                        </div>
                      );
                    })}
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

        {/* DETAILS SIDEBAR PANEL */}
        <div className="ep-details-panel">
          {selectedRequest ? (
            <div>
              {dayBookings.length > 1 && (
                <div style={{ marginBottom: '15px', paddingBottom: '10px', borderBottom: '1px solid #eee' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#64748b' }}>Bookings on this date:</label>
                  <div style={{ display: 'flex', gap: '5px', marginTop: '5px', flexWrap: 'wrap' }}>
                    {dayBookings.map(item => (
                      <button key={item.id} onClick={() => setSelectedRequest(item)} style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', background: selectedRequest.id === item.id ? '#043927' : '#fff', color: selectedRequest.id === item.id ? '#fff' : '#334155', fontSize: '0.75rem', cursor: 'pointer' }}>
                        {item.contact_name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="ep-panel-header">
                <div>
                  <h3>{selectedRequest.contact_name}</h3>
                  <p>Tracking Ref: <strong>{selectedRequest.tracking_code || `#${selectedRequest.id}`}</strong></p>
                </div>
                <span className={`ep-status-tag tag-${(selectedRequest.status || 'pending').toLowerCase()}`}>
                  {selectedRequest.status || 'Pending'}
                </span>
              </div>
              <div className="ep-info-stack">
                <div className="ep-info-node" style={{ gridColumn: 'span 2' }}>
                  <label>Target Facility / Venue</label>
                  <p style={{ color: '#043927', fontSize: '1rem' }}>{selectedRequest.venue}</p>
                </div>
                <div className="ep-info-node">
                  <label>Reserved Date</label>
                  <p><i className="bi bi-calendar-event me-2 text-success"></i>{selectedRequest.date}</p>
                </div>
                <div className="ep-info-node">
                  <label>Assigned Time Frame</label>
                  <p><i className="bi bi-clock me-2 text-warning"></i>{selectedRequest.time_slot}</p>
                </div>
                <div className="ep-info-node" style={{ gridColumn: 'span 2' }}>
                  <label>Contact Phone</label>
                  <p>{selectedRequest.contact_number || 'N/A'}</p>
                </div>
                <div className="ep-info-node" style={{ gridColumn: 'span 2' }}>
                  <label>Activity Purpose</label>
                  <p style={{ fontWeight: '400', fontStyle: 'italic', color: '#475569' }}>
                    "{selectedRequest.purpose || 'No description provided.'}"
                  </p>
                </div>
                <div className="ep-info-node" style={{ gridColumn: 'span 2' }}>
                  <label>Verification Documents</label>
                  <div className="ep-doc-btns">
                    {selectedRequest.id_front ? (
                      <button className="ep-doc-btn" onClick={() => setPreviewImage(`/uploads/${selectedRequest.id_front}`)}>
                        <i className="bi bi-person-vcard me-1"></i> ID Front
                      </button>
                    ) : <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>No Front ID</span>}
                    {selectedRequest.id_holding ? (
                      <button className="ep-doc-btn" onClick={() => setPreviewImage(`/uploads/${selectedRequest.id_holding}`)}>
                        <i className="bi bi-camera me-1"></i> ID Selfie
                      </button>
                    ) : <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>No Selfie ID</span>}
                  </div>
                </div>
              </div>
              <div className="ep-panel-actions">
                {(selectedRequest.status === 'Pending' || selectedRequest.status === 'pending') && (
                  <>
                    <button className="ep-btn-block ep-btn-approve" onClick={() => handleStatusUpdate(selectedRequest.id, 'approved')}>
                      Approve Booking
                    </button>
                    <button className="ep-btn-block ep-btn-decline" onClick={() => handleStatusUpdate(selectedRequest.id, 'rejected')}>
                      Decline Request
                    </button>
                  </>
                )}
                {(selectedRequest.status === 'Approved' || selectedRequest.status === 'approved') && (
                  <button className="ep-btn-block ep-btn-approve" onClick={() => handleStatusUpdate(selectedRequest.id, 'completed')}>
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

      {/* ID VERIFICATION IMAGE MODAL */}
      {previewImage && (
        <div className="ep-modal-overlay" onClick={() => setPreviewImage(null)}>
          <div style={{ position: 'relative', maxWidth: '90%', maxHeight: '90%' }}>
            <img src={previewImage} alt="Verification Attachment" style={{ maxWidth: '100%', maxHeight: '80vh', borderRadius: '12px', border: '3px solid white' }} />
            <p style={{ color: '#fff', textAlign: 'center', marginTop: '10px' }}>Click anywhere to close</p>
          </div>
        </div>
      )}

      {/* ADD NEW AMENITY MODAL */}
      {showAddModal && (
        <div className="ep-modal-overlay">
          <div style={{ background: '#fff', padding: '25px', borderRadius: '15px', width: '420px', maxWidth: '90%', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
            <h3 style={{ margin: '0 0 15px', color: '#043927', fontWeight: '800' }}>Add New Facility / Amenity</h3>
            <form onSubmit={handleAddFacility}>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>Facility Name</label>
                <input type="text" required style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', marginTop: '4px', boxSizing: 'border-box' }} value={newFacility.facility_name} onChange={(e) => setNewFacility({ ...newFacility, facility_name: e.target.value })} placeholder="e.g. Barangay Ambulance / Function Hall" />
              </div>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>Description</label>
                <textarea rows="3" style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', marginTop: '4px', boxSizing: 'border-box' }} value={newFacility.description} onChange={(e) => setNewFacility({ ...newFacility, description: e.target.value })} placeholder="Brief description of the facility service..." />
              </div>
              <div style={{ marginBottom: '18px' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>Facility Icon</label>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '4px' }}>
                  <select style={{ flex: 1, padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }} value={newFacility.icon_class} onChange={(e) => setNewFacility({ ...newFacility, icon_class: e.target.value })}>
                    <option value="bi-building">🏢 Building / Multi-Purpose Hall</option>
                    <option value="bi-truck-front-fill">🚑 Ambulance / Emergency Vehicle</option>
                    <option value="bi-dribbble">🏀 Basketball Court / Sports</option>
                    <option value="bi-tools">🛠️ Equipment / Utility</option>
                    <option value="bi-geo-alt">📍 Park / Open Grounds</option>
                    <option value="bi-file-earmark-text">📄 Permit / Certificate</option>
                  </select>
                  <div style={{ width: '40px', height: '38px', borderRadius: '6px', background: '#ecfdf5', border: '1px solid #a7f3d0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#043927', fontSize: '1.2rem' }}>
                    <i className={`bi ${newFacility.icon_class}`}></i>
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button type="button" className="ep-btn-block ep-btn-decline" style={{ width: 'auto' }} onClick={() => setShowAddModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="ep-btn-block ep-btn-approve" style={{ width: 'auto' }}>
                  Save Facility
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AmenityDashboard;