import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './DisasterRiskSMS.css'; // <-- Import your separated CSS file here
import Toast from './Toast';
import { useToast } from '../lib/useToast';

const API_BASE = '/api_backend';

const DisasterRiskSMS = ({ isOpen, onClose, activeAlert }) => {
  const [targetType, setTargetType] = useState('area');
  const [targetValue, setTargetValue] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast, showToast, confirmToast, closeToast } = useToast();

  useEffect(() => {
    if (activeAlert) {
      setTargetValue(activeAlert.affected_areas ? activeAlert.affected_areas : '');
      setMessage(`[BDRRMC ALERT] ${activeAlert.title ? activeAlert.title : 'Disaster Alert'}: ${activeAlert.instructions ? activeAlert.instructions : ''}`);
    } else {
      setTargetValue('');
      setMessage('');
    }
  }, [activeAlert, isOpen]);

  if (!isOpen) return null;

  const handleQuickSelect = (type, val) => {
    setTargetType(type);
    setTargetValue(val);
  };

  const handleBroadcast = async (e) => {
    e.preventDefault();
    // A broadcast texts real residents and can't be recalled.
    const ok = await confirmToast(
      'Send this SMS broadcast?',
      targetType === 'all'
        ? 'It goes out now to EVERY active resident with a mobile number on file. Text messages cannot be recalled once sent.'
        : `It goes out now to ${targetType === 'individual' ? 'the number' : targetType === 'sector' ? 'every resident in the sector' : 'every resident in the area'} "${targetValue}". Text messages cannot be recalled once sent.`,
      { confirmLabel: 'Send SMS', danger: true }
    );
    if (!ok) return;

    setLoading(true);
    try {
      const res = await axios.post(`${API_BASE}/broadcast_sms.php`, {
        target_type: targetType,
        target_value: targetType === 'all' ? 'ALL RESIDENTS' : targetValue,
        message: message
      });

      if (res.data && res.data.success) {
        showToast('Broadcast Sent', res.data.message, 'success');
        setTimeout(onClose, 1800);
      } else {
        showToast('Broadcast Failed', res.data?.message || 'Check database records or API key.', 'error');
      }
    } catch (err) {
      console.error('SMS Send Error:', err);
      showToast('Connection Error', 'Error connecting to backend SMS service.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // The Toast sits outside the overlay: a click on the overlay closes the
  // dispatcher, so clicks on the confirmation must not bubble into it.
  return (
    <>
    <Toast toast={toast} onClose={closeToast} />
    <div className="sms-modal-overlay" onClick={onClose}>
      <div className="sms-modal-card" onClick={(e) => e.stopPropagation()}>
        <h3 className="sms-modal-title">
          📢 DRRM Emergency SMS Dispatcher
        </h3>
        <p className="sms-modal-desc">
          Choose who receives the emergency alert to prevent unnecessary broadcasts.
        </p>

        {/* Quick Selection Shortcuts */}
        <div>
          <label className="sms-preset-label">QUICK TARGET PRESETS:</label>
          <div className="sms-preset-group">
            <button
              type="button"
              className="sms-preset-btn"
              onClick={() => handleQuickSelect('all', '')}
            >
              📣 All Residents
            </button>
            <button 
              type="button" 
              className="sms-preset-btn"
              onClick={() => handleQuickSelect('sector', 'Senior Citizen')}
            >
              👵 Seniors
            </button>
            <button 
              type="button" 
              className="sms-preset-btn"
              onClick={() => handleQuickSelect('sector', 'PWD')}
            >
              ♿ PWDs
            </button>
            <button 
              type="button" 
              className="sms-preset-btn"
              onClick={() => handleQuickSelect('sector', '4Ps')}
            >
              💳 4Ps Beneficiaries
            </button>
            <button 
              type="button" 
              className="sms-preset-btn"
              onClick={() => handleQuickSelect('area', 'Phase 1')}
            >
              📍 Phase 1
            </button>
            <button 
              type="button" 
              className="sms-preset-btn"
              onClick={() => handleQuickSelect('area', 'Canterbury')}
            >
              📍 Canterbury St.
            </button>
          </div>
        </div>

        <form onSubmit={handleBroadcast}>
          <div className="sms-form-group">
            <label className="sms-label">Target Mode:</label>
            <select 
              className="sms-select"
              value={targetType} 
              onChange={(e) => setTargetType(e.target.value)}
            >
              <option value="all">All Residents (everyone with a mobile number)</option>
              <option value="area">Affected Area / Street / Subdivision</option>
              <option value="sector">Specific Sector (Seniors / PWD / 4Ps / Indigent)</option>
              <option value="individual">Single Resident Phone Number</option>
            </select>
          </div>

          {targetType !== 'all' && (
          <div className="sms-form-group">
            <label className="sms-label">Target Value / Keyword:</label>
            <input
              type="text"
              required
              className="sms-input"
              placeholder={targetType === 'area' ? 'e.g. Canterbury Street, Phase 1' : targetType === 'sector' ? 'e.g. Senior Citizen, PWD, 4Ps' : '09537926555'}
              value={targetValue}
              onChange={(e) => setTargetValue(e.target.value)}
            />
          </div>
          )}

          <div className="sms-form-group">
            <label className="sms-label">SMS Message Body:</label>
            <textarea
              rows="4"
              required
              maxLength="160"
              className="sms-textarea keep-case"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
            <small className="sms-counter">
              {message.length}/160 characters (1 SMS credit per recipient)
            </small>
          </div>

          <div className="sms-modal-footer">
            <button 
              type="button" 
              className="sms-btn-cancel"
              onClick={onClose} 
              disabled={loading}
            >
              Cancel
            </button>
            <button 
              type="submit" 
              className="sms-btn-submit"
              disabled={loading}
            >
              {loading ? 'Querying & Sending...' : 'Send Emergency SMS'}
            </button>
          </div>
        </form>
      </div>
    </div>
    </>
  );
};

export default DisasterRiskSMS;