import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';

const API_BASE = '/api_backend';

const AmenityDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Overtime Hours modification states
  const [overtimeHours, setOvertimeHours] = useState(1);
  const [isExtending, setIsExtending] = useState(false);

  const fetchDetails = async () => {
    try {
      const response = await axios.get(`${API_BASE}/get_amenity_details.php?id=${id}`);
      setData(response.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetails();
  }, [id]);

  // Handle Overtime Submission from this screen
  const handleExtendHours = async () => {
    setIsExtending(true);
    try {
      const response = await axios.post(`${API_BASE}/update_amenity.php`, {
        request_id: id,
        status: data.status, // Keep current status
        extend_hours: overtimeHours
      });
      if (response.data.success) {
        alert(`Successfully logged ${overtimeHours} overtime hour(s) into this reservation file.`);
        fetchDetails(); // Reload page with updated data
      }
    } catch (error) {
      console.error("Extension failed:", error);
    } finally {
      setIsExtending(false);
    }
  };

  if (loading) return <div style={{ padding: '40px', fontFamily: 'sans-serif', color: '#64748b' }}>Loading file data...</div>;
  if (!data) return <div style={{ padding: '40px', fontFamily: 'sans-serif', color: '#b91c1c' }}>Record not found.</div>;

  return (
    <div className="detail-page-wrapper">
      {/* Bootstrap Icons integration for layout design */}
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css" />

      <style>{`
        .detail-page-wrapper { width: 100%; max-width: 1200px; margin: 0 auto; padding: 20px; box-sizing: border-box; font-family: 'Inter', sans-serif; background: #f8fafc; display: flex; flex-direction: column; justify-content: flex-start; align-items: flex-start; min-height: calc(100vh - 80px); }
        .back-nav { margin-bottom: 24px; cursor: pointer; color: #64748b; font-weight: 700; display: inline-flex; align-items: center; gap: 8px; border: 1px solid #e2e8f0; background: white; padding: 8px 16px; border-radius: 8px; font-size: 0.85rem; transition: 0.2s; }
        .back-nav:hover { background: #f1f5f9; color: #043927; transform: translateX(-3px); }
        
        .landscape-card { background: white; border-radius: 16px; border: 1px solid #e2e8f0; box-shadow: 0 10px 25px rgba(0,0,0,0.01); width: 100%; overflow: hidden; }
        
        /* Top Branding Header Block */
        .card-top { padding: 30px 40px; border-bottom: 2px solid #f1f5f9; display: flex; justify-content: space-between; align-items: center; background: white; }
        .card-top h1 { margin: 0 0 4px 0; color: #043927; font-size: 1.6rem; font-weight: 800; letter-spacing: -0.5px; }
        .card-top span { color: #94a3b8; font-size: 0.85rem; font-family: monospace; font-weight: 600; }
        
        /* Dynamic Status Pill Colorizations matches perfectly */
        .status-pill-large { padding: 8px 18px; border-radius: 8px; font-size: 0.75rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; }
        .tag-pending { background: #fffbeb; color: #b45309; border: 1px solid #fde68a; }
        .tag-approved { background: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0; }
        .tag-declined { background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; }
        .tag-completed { background: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd; }

        /* Structural Layout Specifications Grid */
        .grid-info { display: grid; grid-template-columns: repeat(4, 1fr); padding: 40px; gap: 24px; background: white; }
        
        .data-box { background: #f8fafc; border: 1px solid #e2e8f0; padding: 16px 20px; border-radius: 12px; display: flex; align-items: center; gap: 14px; }
        .data-box i { font-size: 1.4rem; color: #043927; width: 24px; text-align: center; }
        .data-box-meta label { display: block; font-size: 0.65rem; text-transform: uppercase; color: #94a3b8; font-weight: 800; letter-spacing: 0.8px; margin-bottom: 2px; }
        .data-box-meta p { font-size: 0.95rem; color: #1e293b; font-weight: 700; margin: 0; }
        .venue-hl { color: #043927 !important; font-size: 1.05rem !important; font-weight: 800 !important; }
        .data-box-span-2 { grid-column: span 2; }

        /* Large Sections Row styling */
        .remarks-section { grid-column: span 4; background: #f8fafc; padding: 24px; border-radius: 12px; border: 1px solid #e2e8f0; margin-top: 6px; }
        .section-lbl-badge { display: block; font-size: 0.7rem; color: #94a3b8; font-weight: 800; letter-spacing: 0.8px; text-transform: uppercase; margin-bottom: 10px; }
        .remarks-text { margin: 0; color: #475569; font-size: 0.9rem; line-height: 1.5; font-style: italic; }

        /* --- PREMIUM OVERTIME CONTROLLER WRAPPER --- */
        .overtime-action-block { grid-column: span 4; background: #f0fdf4; border: 1px dashed #15803d; padding: 20px 30px; border-radius: 12px; display: flex; justify-content: space-between; align-items: center; margin-top: 10px; }
        .ot-message h4 { margin: 0 0 4px 0; color: #14532d; font-size: 1rem; font-weight: 800; }
        .ot-message p { margin: 0; color: #166534; font-size: 0.75rem; }
        .ot-form-controls { display: flex; align-items: center; gap: 10px; }
        .ot-dropdown { padding: 8px 14px; border-radius: 8px; border: 1px solid #bbf7d0; font-size: 0.85rem; font-weight: 700; color: #15803d; background: white; outline: none; cursor: pointer; }
        .ot-submit-btn { background: #15803d; color: white; border: none; padding: 9px 18px; font-weight: 700; font-size: 0.8rem; border-radius: 8px; cursor: pointer; transition: 0.2s; display: inline-flex; align-items: center; gap: 6px; }
        .ot-submit-btn:hover { background: #146534; transform: translateY(-1px); }
        .ot-submit-btn:disabled { opacity: 0.6; cursor: not-allowed; }

        @media (max-width: 900px) {
          .detail-page-wrapper { padding: 14px; }
          .card-top { flex-direction: column; align-items: flex-start; gap: 12px; padding: 20px; }
          .grid-info { grid-template-columns: 1fr; padding: 20px; gap: 14px; }
          .remarks-section, .overtime-action-block, .data-box-span-2 { grid-column: span 1; }
          .overtime-action-block { flex-direction: column; align-items: flex-start; gap: 14px; }
          .ot-form-controls { width: 100%; flex-wrap: wrap; }
        }
      `}</style>

      {/* Modern Back Button Layout Control */}
      <button className="back-nav" onClick={() => navigate(-1)}>
        <i className="bi bi-arrow-left"></i> Return to Dashboard
      </button>

      <div className="landscape-card">
        {/* Case File Header Title Context */}
        <div className="card-top">
          <div>
            <h1>Reservation Case File</h1>
            <span>Tracking Reference: {data.tracking_code || `AMN-00${id}`}</span>
          </div>
          <div className={`status-pill-large tag-${data.status?.toLowerCase()}`}>
            {data.status}
          </div>
        </div>

        {/* Structured Row-by-Row Specifications Layout Grid */}
        <div className="grid-info">
          
          {/* Box 1: Resident Profile Name */}
          <div className="data-box">
            <i className="bi bi-person-badge"></i>
            <div className="data-box-meta">
              <label>Resident Profile</label>
              <p>{data.contact_name || data.name}</p>
            </div>
          </div>

          {/* Box 2: Targeted Asset Facility */}
          <div className="data-box">
            <i className="bi bi-building-check"></i>
            <div className="data-box-meta">
              <label>Target Facility</label>
              <p className="venue-hl">{data.venue}</p>
            </div>
          </div>

          {/* Box 3: Reserved Target Date */}
          <div className="data-box">
            <i className="bi bi-calendar-event"></i>
            <div className="data-box-meta">
              <label>Reserved Date</label>
              <p>{data.reservation_date}</p>
            </div>
          </div>

          {/* Box 4: Allocated Time Slot Frame */}
          <div className="data-box">
            <i className="bi bi-clock"></i>
            <div className="data-box-meta">
              <label>Assigned Time Slot</label>
              <p>{data.time_slot}</p>
            </div>
          </div>

          {/* Large Subsections Rows: Purpose Narratives */}
          <div className="remarks-section">
            <span className="section-lbl-badge">Activity Purpose / Special Requirements</span>
            <p className="remarks-text">
              "{data.purpose || "No special instructions or narratives brief logs were provided for this specific amenity reservation."}"
            </p>
          </div>

          {/* Box 5: Document Registration Logs Creation Date */}
          <div className="data-box data-box-span-2">
            <i className="bi bi-file-earmark-medical"></i>
            <div className="data-box-meta">
              <label>Registration Log Timestamp (Date Filed)</label>
              <p>{data.created_at || 'Information record date unavailable'}</p>
            </div>
          </div>

          {/* Box 6: Registered Phone Number Details */}
          <div className="data-box data-box-span-2">
            <i className="bi bi-telephone-outbound"></i>
            <div className="data-box-meta">
              <label>Registered Phone Number</label>
              <p>{data.contact_number || 'No baseline contacts filed'}</p>
            </div>
          </div>

          {/* Dynamic Overtime Modification Panel Control (Triggers on Approved items only) */}
          {data.status === 'Approved' && (
            <div className="overtime-action-block">
              <div className="ot-message">
                <h4>Dynamic Duration Extension</h4>
                <p>Append unexpected overtimes or extended hours instantly to this active allocation.</p>
              </div>
              <div className="ot-form-controls">
                <select 
                  className="ot-dropdown"
                  value={overtimeHours}
                  onChange={(e) => setOvertimeHours(parseInt(e.target.value))}
                >
                  <option value={1}>+ 1 Hour Extension</option>
                  <option value={2}>+ 2 Hours Extension</option>
                  <option value={3}>+ 3 Hours Extension</option>
                  <option value={4}>+ 4 Hours Extension</option>
                </select>
                <button 
                  className="ot-submit-btn" 
                  onClick={handleExtendHours}
                  disabled={isExtending}
                >
                  <i className="bi bi-check2-square"></i> Apply Overtime
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default AmenityDetail;