import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './DisasterRisk.css';
import Toast from '../components/Toast';
import DisasterMap from '../components/DisasterMap';
import DisasterRiskSMS from '../components/DisasterRiskSMS';
import LiveHazards from '../components/LiveHazards';
import { useToast } from '../lib/useToast';
import { useAdminAccess } from '../lib/adminAccess';
import AlertsOnDevice from '../components/AlertsOnDevice';
import DisasterPreparedness from './DisasterPreparedness';
import AdvisoryChecklist from './AdvisoryChecklist';
import VulnerableRegistry from './VulnerableRegistry';
import '../styles/advisory-tools.css';

const API_BASE = '/api_backend';

const initialAlertForm = {
  id: null,
  title: '',
  alert_level: 'Watch',
  calamity_type: 'Heavy Rainfall / Flood Watch',
  affected_areas: '',
  evacuation_schedule: '',
  instructions: '',
  // Filipino version (migration 032), optional; templates fill both.
  title_fil: '',
  instructions_fil: '',
  // A drill: staff only, never sent to residents.
  is_practice: 0,
  is_active: 1
};

const initialTemplateForm = {
  id: null, name: '', calamity_type: '', alert_level: 'Advisory', title: '', instructions: '',
  title_fil: '', instructions_fil: '', evacuation_schedule: '', is_active: 1
};
// Template blanks staff must fill in, e.g. {AREAS} (same pattern as disaster_risk.php).
const BLANK = /\{[A-Za-z_ ]+\}/g;
// The advisory text residents get, mirroring pb2_advisory_sms_text() in
// advisory_sms.php: one SMS of 160 plain characters, ending with the
// emergency page link when PB2_SITE_URL is set (never on practice texts).
const smsPlain = (s) => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-')
  .replace(/[^\x20-\x7E]/g, '').replace(/\s+/g, ' ').trim();
const smsPreview = (form, lang, link) => {
  const fil = lang === 'fil' && (form.title_fil || '').trim() !== '';
  const title = fil ? form.title_fil : form.title;
  const body = fil && (form.instructions_fil || '').trim() ? form.instructions_fil : form.instructions;
  const prefix = Number(form.is_practice) === 1 ? 'PRACTICE - ' : '';
  let text = smsPlain(`${prefix}BRGY PASONG BUAYA II ${String(form.alert_level || 'Advisory').toUpperCase()}: ${String(title || '').trim()}. ${String(body || '').trim()}`);
  const tail = link && Number(form.is_practice) !== 1 ? ` Info: ${link}` : '';
  const room = 160 - tail.length;
  if (text.length > room) {
    const cut = text.slice(0, room - 3);
    const space = cut.lastIndexOf(' ');
    text = `${space > room - 40 ? cut.slice(0, space) : cut}...`;
  }
  return text + tail;
};
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const LEVELS = ['Advisory', 'Watch', 'Warning', 'Severe'];

const blanksIn = (form) => [...new Set(['title', 'instructions', 'title_fil', 'instructions_fil', 'affected_areas', 'evacuation_schedule']
  .flatMap((k) => String(form[k] || '').match(BLANK) || []))];

const initialCenterForm = {
  id: null,
  name: '',
  location: '',
  capacity_families: 100,
  current_families: 0,
  status: 'Available',
  facilities: '',
  contact_person: '',
  contact_number: '',
  latitude: '',
  longitude: ''
};

const DisasterRisk = () => {
  // Manual SMS broadcasts need their own permission (disaster.sms, admin_permissions.php).
  const access = useAdminAccess();
  const canSms = access.can('disaster.sms');
  const canIssues = access.can('module.issues');
  const [activeTab, setActiveTab] = useState('centers'); // 'centers' | 'alerts' | 'protocols' | 'map' | 'templates' | 'vulnerable'
  // Officials' checklist of one advisory (migration 033), shown in a dialog.
  const [checklistAlert, setChecklistAlert] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [centers, setCenters] = useState([]);
  const [openIssues, setOpenIssues] = useState([]);
  const [stats, setStats] = useState({
    active_alerts_count: 0,
    total_centers: 0,
    available_centers: 0,
    total_capacity_families: 0,
    total_current_families: 0
  });
  const [loading, setLoading] = useState(true);

  // Modals
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [alertFormData, setAlertFormData] = useState(initialAlertForm);
  const [showCenterModal, setShowCenterModal] = useState(false);
  const [centerFormData, setCenterFormData] = useState(initialCenterForm);
  const [centerPickMode, setCenterPickMode] = useState(false);
  const [isSmsModalOpen, setIsSmsModalOpen] = useState(false);
  const [selectedSmsAlert, setSelectedSmsAlert] = useState(null);
  // Advisory templates (migration 032).
  const [templates, setTemplates] = useState([]);
  const [templateForm, setTemplateForm] = useState(null);

  // Quick occupancy modal
  const [occupancyModal, setOccupancyModal] = useState(null); // { id, name, current_families, status }

  // Toast
  const { toast, showToast: notify, confirmToast, closeToast } = useToast();
  const showToast = (message, type = 'success') =>
    notify(type === 'error' ? 'Something went wrong' : 'Success', message, type);

  // Hazards the live feeds detected (hazard_feeds.php), waiting for staff.
  const [hazardEvents, setHazardEvents] = useState([]);
  const [hazardMode, setHazardMode] = useState('draft');
  // Advisory SMS (migration 023): 'auto' texts every resident when an advisory goes live.
  const [smsAuto, setSmsAuto] = useState({ mode: 'manual', recipients: 0 });
  // Who an advisory reaches (push devices, staff mobiles, SMS link), for the form's "When you save" note.
  const [reach, setReach] = useState({ push_enabled: false, push_devices: 0, push_staff_devices: 0, staff_numbers: 0, sms_link: '' });
  // Flood-risk streets and checklist sizes for the advisory form (preparedness.php, migration 033).
  const [formHelpers, setFormHelpers] = useState(null);
  const fetchHazardEvents = async () => {
    try {
      const res = await axios.get(`${API_BASE}/hazard_feeds.php`, { params: { action: 'events' } });
      if (res.data && res.data.success) {
        setHazardEvents(res.data.events || []);
        setHazardMode(res.data.mode || 'draft');
        setSmsAuto({ mode: res.data.advisory_sms_mode || 'manual', recipients: res.data.sms_recipients || 0 });
        setReach({
          push_enabled: !!res.data.push_enabled, push_devices: res.data.push_devices || 0, push_staff_devices: res.data.push_staff_devices || 0,
          staff_numbers: res.data.staff_numbers || 0, sms_link: res.data.sms_link || '',
        });
      }
    } catch (err) {
      console.error('Error fetching detected hazards:', err);
    }
  };

  // Open the advisory form filled from the detection; saving it links the two.
  const reviewHazard = (ev) => {
    setAlertFormData({ ...initialAlertForm, ...(ev.draft || {}), evacuation_schedule: '', is_active: 1, hazard_event_id: ev.id });
    setShowAlertModal(true);
  };

  const dismissHazard = async (ev) => {
    const ok = await confirmToast(
      'Dismiss this detection?',
      `"${ev.headline}" will be removed from this list and no advisory will be published for it. Residents still see the live feed.`,
      { confirmLabel: 'Dismiss', danger: true }
    );
    if (!ok) return;
    try {
      const res = await axios.post(`${API_BASE}/hazard_feeds.php?action=dismiss`, { id: ev.id });
      showToast(res.data?.message || 'Dismissed.', res.data?.success ? 'success' : 'error');
      fetchHazardEvents();
    } catch {
      showToast('Network error while dismissing.', 'error');
    }
  };

  const fetchRiskData = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/disaster_risk.php?action=get_all`);
      if (res.data && res.data.success) {
        setAlerts(res.data.alerts || []);
        setCenters(res.data.centers || []);
        setStats(res.data.stats || {
          active_alerts_count: 0,
          total_centers: 0,
          available_centers: 0,
          total_capacity_families: 0,
          total_current_families: 0
        });
      }
    } catch (err) {
      console.error('Error fetching disaster risk data:', err);
      showToast('Loaded local information.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Open community issues, overlaid on the map so staff can see reports
  // (e.g. flooding) that fall inside hazard areas.
  const fetchOpenIssues = async () => {
    try {
      // Without Issue Map access, the public list (open issues, no names) is
      // enough for the overlay and isn't refused by the server.
      const res = canIssues
        ? await axios.get(`${API_BASE}/admin_issue_map.php`, { params: { action: 'list', status: 'open' } })
        : await axios.get(`${API_BASE}/issue_map.php`, { params: { action: 'list' } });
      if (res.data && res.data.success) setOpenIssues(res.data.issues || []);
    } catch (err) {
      console.error('Error fetching community issues:', err);
    }
  };

  const fetchTemplates = async () => {
    try {
      const res = await axios.get(`${API_BASE}/disaster_risk.php?action=get_templates`);
      if (res.data && res.data.success) setTemplates(res.data.templates || []);
    } catch (err) {
      console.error('Error fetching advisory templates:', err);
    }
  };

  useEffect(() => {
    fetchRiskData();
    fetchOpenIssues();
    fetchHazardEvents();
    fetchTemplates();
  }, []);

  // The real active advisory; a practice one is shown in its own banner.
  const activeAlert = alerts.find((a) => Number(a.is_active) === 1 && Number(a.is_practice || 0) === 0);
  const practiceAlert = alerts.find((a) => Number(a.is_active) === 1 && Number(a.is_practice || 0) === 1);
  const reviewDue = alerts.filter((a) => a.review_due);

  // Fill the advisory form from a template (both languages); blanks stay to be filled in.
  const applyTemplate = (id) => {
    const t = templates.find((x) => String(x.id) === String(id));
    if (!t) return;
    setAlertFormData((f) => ({
      ...f,
      title: t.title || '', instructions: t.instructions || '',
      title_fil: t.title_fil || '', instructions_fil: t.instructions_fil || '',
      alert_level: t.alert_level || f.alert_level, calamity_type: t.calamity_type || f.calamity_type,
      evacuation_schedule: t.evacuation_schedule || f.evacuation_schedule,
    }));
  };

  const confirmStillAccurate = async (item) => {
    try {
      const res = await axios.post(`${API_BASE}/disaster_risk.php?action=confirm_alert`, { id: item.id });
      showToast(res.data?.message || 'Confirmed.', res.data?.success ? 'success' : 'error');
      if (res.data?.success) fetchRiskData();
    } catch {
      showToast('Network error while confirming.', 'error');
    }
  };

  const saveTemplate = async (e) => {
    e.preventDefault();
    try {
      const res = await axios.post(`${API_BASE}/disaster_risk.php?action=save_template`, templateForm);
      showToast(res.data?.message || 'Saved.', res.data?.success ? 'success' : 'error');
      if (res.data?.success) { setTemplateForm(null); fetchTemplates(); }
    } catch {
      showToast('Network error while saving the template.', 'error');
    }
  };

  const deleteTemplate = async (t) => {
    if (!(await confirmToast(`Delete "${t.name}"?`, 'Advisories already published from it are not affected.', { confirmLabel: 'Delete', danger: true }))) return;
    try {
      const res = await axios.post(`${API_BASE}/disaster_risk.php?action=delete_template`, { id: t.id });
      showToast(res.data?.message || 'Deleted.', res.data?.success ? 'success' : 'error');
      if (res.data?.success) fetchTemplates();
    } catch {
      showToast('Network error while deleting the template.', 'error');
    }
  };

  const openSmsModal = (alert = activeAlert) => {
    setSelectedSmsAlert(alert || null);
    setIsSmsModalOpen(true);
  };

  // With automatic advisory SMS on, does this save text every resident?
  // Same rule as advisory_sms.php: active, and not yet texted at this level.
  const saveWillText = (form) => {
    if (smsAuto.mode !== 'auto' || Number(form.is_active) !== 1 || Number(form.is_practice) === 1) return false;
    const saved = form.id ? alerts.find((a) => Number(a.id) === Number(form.id)) : null;
    return !saved || saved.sms_sent_level !== form.alert_level;
  };

  // Does this save send a phone alert? Same rule as advisory_push.php:
  // active, and not yet pushed at this level (deactivating resets it).
  const savePushes = (form) => {
    if (!reach.push_enabled || Number(form.is_active) !== 1) return false;
    const saved = form.id ? alerts.find((a) => Number(a.id) === Number(form.id)) : null;
    return !saved || saved.push_sent_level !== form.alert_level;
  };

  // Loaded the first time the advisory form opens.
  useEffect(() => {
    if (!showAlertModal || formHelpers) return;
    axios.get(`${API_BASE}/preparedness.php`, { params: { action: 'form_helpers' } })
      .then((res) => { if (res.data?.success) setFormHelpers(res.data); })
      .catch(() => {});
  }, [showAlertModal, formHelpers]);

  // Adds street names to "Affected areas", skipping ones already there.
  const addAreas = (names) => {
    const current = alertFormData.affected_areas.split(',').map((s) => s.trim()).filter(Boolean);
    const have = new Set(current.map((s) => s.toUpperCase()));
    const next = [...current, ...names.filter((n) => !have.has(n.toUpperCase()))];
    setAlertFormData({ ...alertFormData, affected_areas: next.join(', ') });
  };

  // The "When you save" note: what this save shows and sends.
  const saveSummary = (form) => {
    const practice = Number(form.is_practice) === 1;
    const active = Number(form.is_active) === 1;
    const pushes = savePushes(form);
    // A practice is texted to staff once per level, like a real one (pb2_advisory_practice_sms).
    const saved = form.id ? alerts.find((a) => Number(a.id) === Number(form.id)) : null;
    const texts = practice ? active && (!saved || saved.sms_sent_level !== form.alert_level) : saveWillText(form);
    const items = [];
    if (!active) {
      items.push(['bi-file-earmark', 'Saved as a draft. Nothing is shown to residents or sent.']);
      return { items, texts: false, practice };
    }
    if (practice) {
      items.push(['bi-eye-slash', 'Shown to staff only, marked PRACTICE.']);
      items.push(['bi-chat-dots', texts ? `Texted to ${plural(reach.staff_numbers, 'verified staff mobile')}.` : 'Not texted again: already texted at this level.']);
      items.push(['bi-bell', !reach.push_enabled ? 'Phone alerts are off on this server.'
        : pushes ? `Phone alert to ${plural(reach.push_staff_devices, 'staff device')}.` : 'No new phone alert: already sent at this level.']);
    } else {
      items.push(['bi-house', 'Shown on Home, Disaster Risk and the offline emergency page.']);
      items.push(['bi-chat-dots', smsAuto.mode !== 'auto' ? 'Not texted: SMS is manual. Use Send SMS on the advisory if needed.'
        : texts ? `Texted to ${plural(smsAuto.recipients, 'resident')} (automatic SMS).` : 'Not texted again: already texted at this level.']);
      items.push(['bi-bell', !reach.push_enabled ? 'Phone alerts are off on this server.'
        : pushes ? `Phone alert to ${plural(reach.push_devices, 'device')} with alerts on.` : 'No new phone alert: already sent at this level.']);
    }
    if (formHelpers) {
      const tasks = LEVELS.slice(0, LEVELS.indexOf(form.alert_level) + 1).reduce((n, l) => n + (formHelpers.task_counts[l] || 0), 0);
      items.push(['bi-list-check', tasks > 0 ? `Officials' checklist: ${plural(tasks, 'task')} for this level.` : "No officials' checklist tasks for this level yet."]);
    }
    return { items, texts, practice };
  };

  // Save Disaster Alert
  const handleSaveAlert = async (e) => {
    e.preventDefault();
    const blanks = blanksIn(alertFormData);
    if (blanks.length) {
      showToast(`Fill in the blanks first: ${blanks.join(', ')}`, 'error');
      return;
    }
    if (Boolean(alertFormData.title_fil.trim()) !== Boolean(alertFormData.instructions_fil.trim())) {
      showToast('Fill in both the Filipino title and instructions, or leave both empty.', 'error');
      return;
    }
    if (!alertFormData.id && Number(alertFormData.is_practice) === 1 && Number(alertFormData.is_active) === 1) {
      const ok = await confirmToast(
        'Start a practice advisory?',
        'It is marked PRACTICE, shown to staff only, and sent only to staff (verified staff mobiles and staff devices with alerts on). Residents see and receive nothing.',
        { confirmLabel: 'Start practice' }
      );
      if (!ok) return;
    } else if (saveWillText(alertFormData)) {
      const ok = await confirmToast(
        'Publish and text all residents?',
        `Advisory SMS is set to automatic, so saving texts this ${alertFormData.alert_level} advisory to ${smsAuto.recipients} resident(s) right away. Texts cannot be recalled.`,
        { confirmLabel: 'Publish & Send SMS', danger: true }
      );
      if (!ok) return;
    }
    try {
      const res = await axios.post(`${API_BASE}/disaster_risk.php?action=save_alert`, alertFormData);
      if (res.data && res.data.success) {
        showToast(res.data.message || (alertFormData.id ? 'Advisory updated!' : 'Emergency alert issued!'));
        setShowAlertModal(false);
        setAlertFormData(initialAlertForm);
        fetchRiskData();
        if (alertFormData.hazard_event_id) fetchHazardEvents();
      } else {
        showToast(res.data.message || 'Error saving alert.', 'error');
      }
    } catch {
      showToast('Network error while saving alert.', 'error');
    }
  };

  // Toggle Alert Status
  const handleToggleAlert = async (id, currentActive) => {
    const nextState = currentActive ? 0 : 1;
    const item = alerts.find((a) => Number(a.id) === Number(id));
    if (nextState === 1 && smsAuto.mode === 'auto' && Number(item?.is_practice || 0) === 0) {
      const ok = await confirmToast(
        'Reactivate and text all residents?',
        `Advisory SMS is set to automatic, so reactivating this advisory texts it to ${smsAuto.recipients} resident(s) right away.`,
        { confirmLabel: 'Reactivate & Send SMS', danger: true }
      );
      if (!ok) return;
    }
    try {
      const res = await axios.post(`${API_BASE}/disaster_risk.php?action=toggle_alert_status`, {
        id,
        is_active: nextState
      });
      if (res.data && res.data.success) {
        showToast(nextState ? (res.data.message || 'Alert activated!') : 'Alert deactivated.');
        fetchRiskData();
      }
    } catch {
      showToast('Failed to toggle alert state.', 'error');
    }
  };

  // Delete Alert
  const handleDeleteAlert = async (id) => {
    if (!(await confirmToast('Delete Advisory?', 'This advisory bulletin will be removed from the public page.', { confirmLabel: 'Delete', danger: true }))) return;
    try {
      const res = await axios.post(`${API_BASE}/disaster_risk.php?action=delete_alert`, { id });
      if (res.data && res.data.success) {
        showToast('Advisory removed.');
        fetchRiskData();
      }
    } catch {
      showToast('Failed to delete bulletin.', 'error');
    }
  };

  // Save Evacuation Center
  const handleSaveCenter = async (e) => {
    e.preventDefault();
    try {
      const res = await axios.post(`${API_BASE}/disaster_risk.php?action=save_center`, centerFormData);
      if (res.data && res.data.success) {
        showToast(centerFormData.id ? 'Evacuation center updated!' : 'Evacuation center added!');
        setShowCenterModal(false);
        setCenterFormData(initialCenterForm);
        fetchRiskData();
      } else {
        showToast(res.data.message || 'Error saving center.', 'error');
      }
    } catch {
      showToast('Failed to save center data.', 'error');
    }
  };

  // Quick Occupancy Update
  const handleUpdateOccupancy = async (e) => {
    e.preventDefault();
    if (!occupancyModal) return;
    try {
      const res = await axios.post(`${API_BASE}/disaster_risk.php?action=update_center_occupancy`, {
        id: occupancyModal.id,
        current_families: occupancyModal.current_families,
        status: occupancyModal.status
      });
      if (res.data && res.data.success) {
        showToast('Center occupancy updated!');
        setOccupancyModal(null);
        fetchRiskData();
      }
    } catch {
      showToast('Failed to update occupancy.', 'error');
    }
  };

  // Delete Evacuation Center
  const handleDeleteCenter = async (id) => {
    if (!(await confirmToast('Remove Evacuation Center?', 'This evacuation center will be removed from the list residents see.', { confirmLabel: 'Remove', danger: true }))) return;
    try {
      const res = await axios.post(`${API_BASE}/disaster_risk.php?action=delete_center`, { id });
      if (res.data && res.data.success) {
        showToast('Evacuation center removed.');
        fetchRiskData();
      }
    } catch {
      showToast('Failed to delete center.', 'error');
    }
  };

  const openEditAlert = (item) => {
    setAlertFormData({
      id: item.id,
      title: item.title || '',
      alert_level: item.alert_level || 'Advisory',
      calamity_type: item.calamity_type || 'Typhoon / Heavy Rain',
      affected_areas: item.affected_areas || '',
      evacuation_schedule: item.evacuation_schedule || '',
      instructions: item.instructions || '',
      title_fil: item.title_fil || '',
      instructions_fil: item.instructions_fil || '',
      is_practice: Number(item.is_practice || 0),
      is_active: Number(item.is_active)
    });
    setShowAlertModal(true);
  };

  const openEditCenter = (item) => {
    setCenterFormData({
      id: item.id,
      name: item.name || '',
      location: item.location || '',
      capacity_families: item.capacity_families || 100,
      current_families: item.current_families || 0,
      status: item.status || 'Available',
      facilities: item.facilities || '',
      contact_person: item.contact_person || '',
      contact_number: item.contact_number || '',
      latitude: item.latitude || '',
      longitude: item.longitude || ''
    });
    setCenterPickMode(false);
    setShowCenterModal(true);
  };

  // Map clicks only ever place an evacuation center now.
  const handleMapPick = ({ lat, lng }) => {
    if (!centerPickMode) return;
    setCenterFormData((current) => ({ ...current, latitude: lat.toFixed(7), longitude: lng.toFixed(7) }));
    setCenterPickMode(false);
    setShowCenterModal(true);
  };

  // "Add evacuation center" on the map: pick the spot first, then fill in the form.
  const handleStartMapPick = (type) => {
    if (!type) {
      setCenterPickMode(false);
      return;
    }
    setShowCenterModal(false);
    setCenterFormData(initialCenterForm);
    setCenterPickMode(true);
  };

  // "Place on map" for a center saved without a location.
  const handlePlaceCenter = (center) => {
    setShowCenterModal(false);
    setCenterFormData({
      id: center.id,
      name: center.name || '',
      location: center.location || '',
      capacity_families: center.capacity_families || 100,
      current_families: center.current_families || 0,
      status: center.status || 'Available',
      facilities: center.facilities || '',
      contact_person: center.contact_person || '',
      contact_number: center.contact_number || '',
      latitude: '',
      longitude: ''
    });
    setCenterPickMode(true);
  };

  const toggleCenterPickMode = () => {
    if (centerPickMode) {
      setCenterPickMode(false);
      setShowCenterModal(true);
      return;
    }
    setActiveTab('map');
    setCenterPickMode(true);
    setShowCenterModal(false);
  };

  return (
    <div className="drrm-container">
      {/* Toast */}
      <Toast toast={toast} onClose={closeToast} />

      {/* Header */}
      <div className="page-header-row">
        <div className="page-title-group">
          <h2>
            <i className="bi bi-shield-exclamation" style={{ color: '#dc2626' }}></i>
            Disaster Risk Reduction & Management (DRRM)
          </h2>
          <p>Barangay Pasong Buaya II, Imus, Cavite &bull; Emergency Information & Evacuation Command</p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            className="btn-primary-action"
            onClick={() => {
              setCenterFormData(initialCenterForm);
              setCenterPickMode(false);
              setShowCenterModal(true);
            }}
          >
            <i className="bi bi-plus-circle-fill"></i> Add Evacuation Center
          </button>
          <button
            className="btn-danger-action"
            onClick={() => {
              setAlertFormData(initialAlertForm);
              setShowAlertModal(true);
            }}
          >
            <i className="bi bi-broadcast"></i> Issue Disaster Alert
          </button>
        </div>
      </div>

      {/* Detected by the live feeds, waiting for staff */}
      {hazardEvents.length > 0 && (
        <div className="hz-detected">
          <div className="hz-detected-head">
            <h3><i className="bi bi-radar"></i> Detected by the live feeds ({hazardEvents.length})</h3>
            <span>
              {hazardMode === 'auto'
                ? 'Typhoon and earthquake advisories publish automatically; these need a review.'
                : 'Review each one before anything is published or texted.'}
            </span>
          </div>
          <ul>
            {hazardEvents.map((ev) => (
              <li key={ev.id} className={`hz-event is-${ev.alert_level.toLowerCase()}`}>
                <span className={`alert-badge badge-${ev.alert_level.toLowerCase()}`}>{ev.alert_level}</span>
                <div className="hz-event-main">
                  <strong>{ev.headline}</strong>
                  <small>
                    {ev.details} · detected {new Date(ev.detected_at.replace(' ', 'T')).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    {ev.official_url && <> · <a href={ev.official_url} target="_blank" rel="noopener noreferrer">Official source</a></>}
                  </small>
                </div>
                <div className="hz-event-actions">
                  <button type="button" className="btn-danger-action" onClick={() => reviewHazard(ev)}>
                    <i className="bi bi-pencil-square"></i> Review & publish
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => dismissHazard(ev)}>Dismiss</button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {practiceAlert && (
        <div className="adv-practice-banner" role="status">
          <i className="bi bi-mortarboard-fill"></i>
          <span><strong>PRACTICE running:</strong> {practiceAlert.title} ({practiceAlert.alert_level}). Staff only, residents see nothing.</span>
          <button type="button" className="btn-secondary" onClick={() => handleToggleAlert(practiceAlert.id, 1)}>End practice</button>
        </div>
      )}

      {reviewDue.length > 0 && (
        <div className="hz-draft-note" role="status" style={{ marginBottom: '16px' }}>
          <i className="bi bi-clock-history"></i> {reviewDue.length} active advisor{reviewDue.length === 1 ? 'y has' : 'ies have'} not been confirmed for 24 hours.
          Check {reviewDue.length === 1 ? 'it' : 'them'} against the latest official bulletin: edit, deactivate, or mark as still accurate in <strong>Weather Advisories &amp; Alerts</strong>.
        </div>
      )}

      {/* ACTIVE DISASTER / WEATHER ALERT BANNER */}
      {activeAlert && (
        <div className={`active-alert-banner alert-level-${(activeAlert.alert_level || 'advisory').toLowerCase()}`}>
          <div className="banner-left">
            <div className="banner-icon">
              <i
                className={
                  activeAlert.alert_level === 'Severe'
                    ? 'bi bi-radioactive'
                    : activeAlert.alert_level === 'Warning'
                    ? 'bi bi-exclamation-triangle-fill'
                    : 'bi bi-cloud-lightning-rain-fill'
                }
              ></i>
            </div>
            <div>
              <div className="banner-title-line">
                <span className={`alert-badge badge-${(activeAlert.alert_level || 'advisory').toLowerCase()}`}>
                  {activeAlert.alert_level} Level
                </span>
                <h3>{activeAlert.title}</h3>
              </div>
              <p className="banner-desc">{activeAlert.instructions}</p>
              <div className="banner-meta">
                {activeAlert.affected_areas && (
                  <span>
                    <i className="bi bi-geo-alt-fill"></i> <strong>Affected:</strong> {activeAlert.affected_areas}
                  </span>
                )}
                {activeAlert.evacuation_schedule && (
                  <span>
                    <i className="bi bi-alarm-fill"></i> <strong>Evacuation Schedule:</strong>{' '}
                    {activeAlert.evacuation_schedule}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            {canSms && (
            <button
              className="btn-danger-action"
              onClick={() => openSmsModal(activeAlert)}
            >
              <i className="bi bi-chat-text-fill"></i> SMS Active Alert
            </button>
            )}
            <button
              className="btn-primary-action"
              style={{ background: '#1e293b' }}
              onClick={() => openEditAlert(activeAlert)}
            >
              <i className="bi bi-pencil-square"></i> Edit Alert
            </button>
            <button
              className="btn-secondary"
              onClick={() => handleToggleAlert(activeAlert.id, 1)}
            >
              Deactivate
            </button>
          </div>
        </div>
      )}

      <LiveHazards canRefresh />

      {/* Stat Cards */}
      <div className="drrm-stats-grid">
        <div className="drrm-stat-card">
          <div className="drrm-icon-box red">
            <i className="bi bi-bell-fill"></i>
          </div>
          <div>
            <h3>{stats.active_alerts_count}</h3>
            <p>Active Advisories</p>
          </div>
        </div>

        <div className="drrm-stat-card">
          <div className="drrm-icon-box green">
            <i className="bi bi-house-heart-fill"></i>
          </div>
          <div>
            <h3>{stats.available_centers} / {stats.total_centers}</h3>
            <p>Centers Available</p>
          </div>
        </div>

        <div className="drrm-stat-card">
          <div className="drrm-icon-box blue">
            <i className="bi bi-people-fill"></i>
          </div>
          <div>
            <h3>{stats.total_capacity_families} Families</h3>
            <p>Total Capacity</p>
          </div>
        </div>

        <div className="drrm-stat-card">
          <div className="drrm-icon-box amber">
            <i className="bi bi-person-walking"></i>
          </div>
          <div>
            <h3>{stats.total_current_families} Families</h3>
            <p>Current Evacuees</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="drrm-tabs-nav">
        <button
          className={`drrm-tab-btn ${activeTab === 'map' ? 'active' : ''}`}
          onClick={() => setActiveTab('map')}
        >
          <i className="bi bi-map"></i> Weather Forecast & Disaster Map
        </button>
        <button
          className={`drrm-tab-btn ${activeTab === 'centers' ? 'active' : ''}`}
          onClick={() => setActiveTab('centers')}
        >
          <i className="bi bi-buildings"></i> Evacuation Centers & Availability
        </button>
        <button
          className={`drrm-tab-btn ${activeTab === 'alerts' ? 'active' : ''}`}
          onClick={() => setActiveTab('alerts')}
        >
          <i className="bi bi-megaphone-fill"></i> Weather Advisories & Alerts
        </button>
        <button
          className={`drrm-tab-btn ${activeTab === 'protocols' ? 'active' : ''}`}
          onClick={() => setActiveTab('protocols')}
        >
          <i className="bi bi-list-check"></i> Preparedness & Checklists
        </button>
        <button
          className={`drrm-tab-btn ${activeTab === 'templates' ? 'active' : ''}`}
          onClick={() => setActiveTab('templates')}
        >
          <i className="bi bi-files"></i> Advisory Templates
        </button>
        {access.can('disaster.vulnerable') && (
          <button
            className={`drrm-tab-btn ${activeTab === 'vulnerable' ? 'active' : ''}`}
            onClick={() => setActiveTab('vulnerable')}
          >
            <i className="bi bi-heart-pulse"></i> Vulnerable Residents
          </button>
        )}
      </div>

      {activeTab === 'map' && (
        <div className="drrm-map-management">
          <DisasterMap
            centers={centers}
            issues={openIssues}
            editable
            pickMode={centerPickMode}
            pickHint={centerFormData.id ? `Click the map where ${centerFormData.name || 'this center'} is` : 'Click the map to place the new evacuation center'}
            onMapPick={handleMapPick}
            onStartPick={handleStartMapPick}
            onPlaceCenter={handlePlaceCenter}
          />
        </div>
      )}

      {/* TAB 1: EVACUATION CENTERS */}
      {activeTab === 'centers' && (
        <div className="evac-grid">
          {centers.map((center) => {
            const cap = Number(center.capacity_families) || 1;
            const curr = Number(center.current_families) || 0;
            const pct = Math.min(100, Math.round((curr / cap) * 100));

            let progressClass = 'progress-green';
            if (pct >= 80) progressClass = 'progress-red';
            else if (pct >= 50) progressClass = 'progress-amber';

            return (
              <div key={center.id} className="evac-card">
                <div className="evac-card-header">
                  <div>
                    <h4 className="evac-card-title">{center.name}</h4>
                    <div className="evac-location">
                      <i className="bi bi-geo-alt"></i> {center.location}
                    </div>
                  </div>
                  <span className={`evac-status-pill evac-${(center.status || 'available').toLowerCase()}`}>
                    {center.status}
                  </span>
                </div>

                {/* Occupancy Indicator */}
                <div className="occupancy-box">
                  <div className="occupancy-labels">
                    <span>
                      Occupancy: {curr} / {cap} Families
                    </span>
                    <span>{pct}% Full</span>
                  </div>
                  <div className="progress-track">
                    <div className={`progress-fill ${progressClass}`} style={{ width: `${pct}%` }}></div>
                  </div>
                </div>

                <div className="evac-facilities-box">
                  <strong style={{ display: 'block', marginBottom: '4px', color: '#1e293b' }}>
                    <i className="bi bi-check2-circle" style={{ color: '#047857' }}></i> Available Facilities:
                  </strong>
                  {center.facilities || 'Potable Water, Restrooms, First Aid Kit, Emergency Power'}
                </div>

                <div className="evac-footer">
                  <div>
                    <div><strong>Contact:</strong> {center.contact_person || 'BDRRMC Officer'}</div>
                    <div><i className="bi bi-telephone"></i> {center.contact_number || '(046) 471-0000'}</div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      className="btn-icon-action"
                      title="Update Occupancy"
                      style={{ background: '#ecfdf5', color: '#047857' }}
                      onClick={() =>
                        setOccupancyModal({
                          id: center.id,
                          name: center.name,
                          current_families: center.current_families,
                          status: center.status
                        })
                      }
                    >
                      <i className="bi bi-people"></i>
                    </button>
                    <button
                      className="btn-icon-action"
                      title="Edit Center"
                      onClick={() => openEditCenter(center)}
                    >
                      <i className="bi bi-pencil-fill"></i>
                    </button>
                    <button
                      className="btn-icon-action danger"
                      title="Delete Center"
                      onClick={() => handleDeleteCenter(center.id)}
                    >
                      <i className="bi bi-trash-fill"></i>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* TAB 2: WEATHER ADVISORIES & ALERTS */}
      {activeTab === 'alerts' && (
        <>
        <AlertsOnDevice staff />
        <div className="table-card">
          <table className="custom-data-table">
            <thead>
              <tr>
                <th>Advisory Title</th>
                <th>Alert Level</th>
                <th>Calamity Type</th>
                <th>Affected Areas</th>
                <th>Evacuation Timetable</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {alerts.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                    No weather advisories recorded.
                  </td>
                </tr>
              ) : (
                alerts.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong style={{ color: '#1e293b' }}>{item.title}</strong>
                      {Number(item.auto_generated) === 1 && <span className="hz-auto-tag" title="Published by the live hazard feed without staff review">Auto-published</span>}
                      {Number(item.is_practice) === 1 && <span className="adv-practice-tag"><i className="bi bi-mortarboard"></i> PRACTICE</span>}
                      {item.review_due && <span className="adv-review-tag" title="Not confirmed for 24 hours"><i className="bi bi-clock-history"></i> Review due</span>}
                      {item.title_fil && <span className="hz-sms-tag" title={item.title_fil}>EN + FIL</span>}
                      {Number(item.is_active) === 1 && item.tasks_total > 0 && (
                        <button type="button" className={`adv-tasks-tag ${item.tasks_done < item.tasks_total ? 'is-open' : ''}`} onClick={() => setChecklistAlert(item)} title="Open the officials' checklist">
                          <i className="bi bi-list-check"></i> Checklist {item.tasks_done}/{item.tasks_total}
                        </button>
                      )}
                      {item.sms_sent_at && <span className="hz-sms-tag" title={`Texted automatically on ${item.sms_sent_at}`}><i className="bi bi-chat-dots"></i> Texted to {item.sms_sent_count ?? '?'} ({item.sms_sent_level})</span>}
                      {item.push_sent_at && <span className="hz-sms-tag" title={`Pushed on ${item.push_sent_at}`}><i className="bi bi-bell"></i> Pushed to {item.push_sent_count ?? 0} device(s)</span>}
                      <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>
                        {item.instructions?.substring(0, 70)}...
                      </div>
                    </td>
                    <td>
                      <span className={`alert-badge badge-${(item.alert_level || 'advisory').toLowerCase()}`}>
                        {item.alert_level}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontWeight: 600, color: '#334155' }}>{item.calamity_type}</span>
                    </td>
                    <td style={{ maxWidth: '200px' }}>
                      <span style={{ fontSize: '0.8rem', color: '#475569' }}>
                        {item.affected_areas || 'Barangay-wide'}
                      </span>
                    </td>
                    <td style={{ maxWidth: '180px' }}>
                      <span style={{ fontSize: '0.8rem', color: '#043927', fontWeight: 600 }}>
                        {item.evacuation_schedule || 'Standard Standby'}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`status-pill ${
                          Number(item.is_active) === 1 ? 'status-active' : 'status-suspended'
                        }`}
                      >
                        {Number(item.is_active) === 1 ? 'Active Alert' : 'Deactivated'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="btn-icon-action" title="Officials' checklist" aria-label={`Checklist for ${item.title}`} onClick={() => setChecklistAlert(item)}>
                        <i className="bi bi-list-check" style={{ color: '#047857' }}></i>
                      </button>
                      {item.review_due && (
                        <button className="btn-icon-action" title="Still accurate: confirm and reset the 24-hour reminder" aria-label={`Mark ${item.title} as still accurate`} onClick={() => confirmStillAccurate(item)}>
                          <i className="bi bi-check2-circle" style={{ color: '#b45309' }}></i>
                        </button>
                      )}
                      {canSms && (
                      <button
                        className="btn-icon-action"
                        title="Send SMS for this advisory"
                        aria-label={`Send SMS for ${item.title}`}
                        onClick={() => openSmsModal(item)}
                      >
                        <i className="bi bi-chat-text-fill"></i>
                      </button>
                      )}
                      <button
                        className="btn-icon-action"
                        title={Number(item.is_active) === 1 ? 'Deactivate Alert' : 'Activate Alert'}
                        onClick={() => handleToggleAlert(item.id, Number(item.is_active))}
                      >
                        <i
                          className={
                            Number(item.is_active) === 1
                              ? 'bi bi-toggle-on'
                              : 'bi bi-toggle-off'
                          }
                          style={{ color: Number(item.is_active) === 1 ? '#047857' : '#94a3b8' }}
                        ></i>
                      </button>
                      <button
                        className="btn-icon-action"
                        title="Edit Advisory"
                        onClick={() => openEditAlert(item)}
                      >
                        <i className="bi bi-pencil-fill"></i>
                      </button>
                      <button
                        className="btn-icon-action danger"
                        title="Delete Advisory"
                        onClick={() => handleDeleteAlert(item.id)}
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

      {/* TAB 3: PREPAREDNESS & CHECKLISTS (migration 033): hotlines, officials' checklists, guides */}
      {activeTab === 'protocols' && <DisasterPreparedness showToast={showToast} confirmToast={confirmToast} />}

      {/* TAB: VULNERABLE RESIDENTS (disaster.vulnerable permission; views and prints are audit-logged) */}
      {activeTab === 'vulnerable' && access.can('disaster.vulnerable') && <VulnerableRegistry showToast={showToast} />}

      {/* TAB: ADVISORY TEMPLATES (migration 032) */}
      {activeTab === 'templates' && (
        <div className="table-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', padding: '16px 18px 4px' }}>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#475569', maxWidth: '640px' }}>
              Ready-made bulletins in English and Filipino. In the advisory form, pick one and fill in the blanks such as <strong>{'{AREAS}'}</strong>, <strong>{'{CENTER}'}</strong> and <strong>{'{TIME}'}</strong>; it can't be published while a blank is left.
            </p>
            <button type="button" className="btn-primary-action" onClick={() => setTemplateForm({ ...initialTemplateForm })}>
              <i className="bi bi-plus-circle-fill"></i> New Template
            </button>
          </div>
          <table className="custom-data-table">
            <thead><tr><th>Template</th><th>Level</th><th>Title (English / Filipino)</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
            <tbody>
              {templates.length === 0 ? (
                <tr><td colSpan="4" style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>No templates yet.</td></tr>
              ) : templates.map((t) => (
                <tr key={t.id} style={Number(t.is_active) ? undefined : { opacity: 0.55 }}>
                  <td><strong style={{ color: '#1e293b' }}>{t.name}</strong>{!Number(t.is_active) && <span className="hz-sms-tag">Hidden</span>}<div style={{ fontSize: '0.75rem', color: '#64748b' }}>{t.calamity_type}</div></td>
                  <td><span className={`alert-badge badge-${(t.alert_level || 'advisory').toLowerCase()}`}>{t.alert_level}</span></td>
                  <td style={{ fontSize: '0.8rem' }}>{t.title}{t.title_fil ? <div style={{ color: '#64748b' }}>{t.title_fil}</div> : <div style={{ color: '#b45309' }}>No Filipino version</div>}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn-icon-action" title="Edit template" onClick={() => setTemplateForm({ ...initialTemplateForm, ...t, title_fil: t.title_fil || '', instructions_fil: t.instructions_fil || '', evacuation_schedule: t.evacuation_schedule || '' })}><i className="bi bi-pencil-fill"></i></button>
                    <button className="btn-icon-action danger" title="Delete template" onClick={() => deleteTemplate(t)}><i className="bi bi-trash-fill"></i></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {templateForm && (
        <div className="modal-backdrop" onClick={() => setTemplateForm(null)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h4><i className="bi bi-files" style={{ color: '#047857' }}></i> {templateForm.id ? 'Edit Template' : 'New Template'}</h4>
              <button className="modal-close-btn" onClick={() => setTemplateForm(null)}><i className="bi bi-x-lg"></i></button>
            </div>
            <form onSubmit={saveTemplate}>
              <div className="modal-body">
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="lbDisasterRisk-1" className="form-label">Template name (staff only) *</label>
                    <input id="lbDisasterRisk-1" type="text" required maxLength={120} className="form-input keep-case" value={templateForm.name} onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })} placeholder="e.g. Typhoon - Signal No. 2" />
                  </div>
                  <div className="form-group">
                    <label htmlFor="lbDisasterRisk-2" className="form-label">Level</label>
                    <select id="lbDisasterRisk-2" className="form-select" value={templateForm.alert_level} onChange={(e) => setTemplateForm({ ...templateForm, alert_level: e.target.value })}>
                      {['Advisory', 'Watch', 'Warning', 'Severe'].map((l) => <option key={l} value={l}>{l}</option>)}
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label htmlFor="lbDisasterRisk-3" className="form-label">Calamity type</label>
                  <input id="lbDisasterRisk-3" type="text" className="form-input" value={templateForm.calamity_type} onChange={(e) => setTemplateForm({ ...templateForm, calamity_type: e.target.value })} />
                </div>
                <div className="form-group">
                  <label htmlFor="lbDisasterRisk-4" className="form-label">Title (English) *</label>
                  <input id="lbDisasterRisk-4" type="text" required maxLength={200} className="form-input" value={templateForm.title} onChange={(e) => setTemplateForm({ ...templateForm, title: e.target.value })} />
                </div>
                <div className="form-group">
                  <label htmlFor="lbDisasterRisk-5" className="form-label">Instructions (English) *</label>
                  <textarea id="lbDisasterRisk-5" rows="3" required className="form-textarea" value={templateForm.instructions} onChange={(e) => setTemplateForm({ ...templateForm, instructions: e.target.value })} placeholder="Use {AREAS}, {CENTER}, {TIME} for parts staff fill in" />
                </div>
                <div className="form-group">
                  <label htmlFor="lbDisasterRisk-6" className="form-label">Title (Filipino)</label>
                  <input id="lbDisasterRisk-6" type="text" maxLength={200} className="form-input" value={templateForm.title_fil} onChange={(e) => setTemplateForm({ ...templateForm, title_fil: e.target.value })} />
                </div>
                <div className="form-group">
                  <label htmlFor="lbDisasterRisk-7" className="form-label">Instructions (Filipino)</label>
                  <textarea id="lbDisasterRisk-7" rows="3" className="form-textarea" value={templateForm.instructions_fil} onChange={(e) => setTemplateForm({ ...templateForm, instructions_fil: e.target.value })} />
                </div>
                <div className="form-group">
                  <label htmlFor="lbDisasterRisk-8" className="form-label">Evacuation schedule (optional)</label>
                  <input id="lbDisasterRisk-8" type="text" className="form-input" value={templateForm.evacuation_schedule} onChange={(e) => setTemplateForm({ ...templateForm, evacuation_schedule: e.target.value })} />
                </div>
                <label style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '0.85rem' }}>
                  <input type="checkbox" checked={Number(templateForm.is_active) === 1} onChange={(e) => setTemplateForm({ ...templateForm, is_active: e.target.checked ? 1 : 0 })} /> Show in the advisory form
                </label>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setTemplateForm(null)}>Cancel</button>
                <button type="submit" className="btn-primary-action"><i className="bi bi-save-fill"></i> Save Template</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {checklistAlert && (
        <AdvisoryChecklist alert={checklistAlert} showToast={showToast} onClose={() => setChecklistAlert(null)} onChanged={fetchRiskData} />
      )}

      {/* MODAL: ISSUE / EDIT DISASTER ALERT */}
      {showAlertModal && (
        <div className="modal-backdrop" onClick={() => setShowAlertModal(false)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h4>
                <i className="bi bi-broadcast" style={{ color: '#dc2626' }}></i>
                {alertFormData.id ? 'Edit Disaster Alert' : alertFormData.hazard_event_id ? 'Review Detected Hazard' : 'Issue Disaster Risk Bulletin'}
              </h4>
              <button className="modal-close-btn" onClick={() => setShowAlertModal(false)}>
                <i className="bi bi-x-lg"></i>
              </button>
            </div>
            <form onSubmit={handleSaveAlert}>
              <div className="modal-body">
                {saveWillText(alertFormData) && (
                  <p className="hz-draft-note is-sms">
                    <i className="bi bi-chat-dots-fill"></i> Advisory SMS is automatic: saving texts this advisory to all {smsAuto.recipients} resident(s).
                  </p>
                )}
                {alertFormData.hazard_event_id && (
                  <p className="hz-draft-note">
                    <i className="bi bi-info-circle-fill"></i> Pre-filled from the live feed. Check the details against the official bulletin, edit as needed, then publish.
                  </p>
                )}
                {!alertFormData.id && templates.some((t) => Number(t.is_active)) && (
                  <div className="form-group">
                    <label htmlFor="lbDisasterRisk-9" className="form-label">Start from a template</label>
                    <select id="lbDisasterRisk-9" className="form-select" defaultValue="" onChange={(e) => applyTemplate(e.target.value)}>
                      <option value="">Choose a template (optional)</option>
                      {templates.filter((t) => Number(t.is_active)).map((t) => <option key={t.id} value={t.id}>{t.name} ({t.alert_level})</option>)}
                    </select>
                  </div>
                )}
                {blanksIn(alertFormData).length > 0 && (
                  <p className="hz-draft-note">
                    <i className="bi bi-pencil-square"></i> Fill in the blanks before publishing: <strong>{blanksIn(alertFormData).join(', ')}</strong>
                  </p>
                )}
                {!alertFormData.id ? (
                  <label className="adv-practice-check" style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', marginBottom: '14px', fontSize: '0.85rem', color: '#4c1d95' }}>
                    <input type="checkbox" checked={Number(alertFormData.is_practice) === 1} onChange={(e) => setAlertFormData({ ...alertFormData, is_practice: e.target.checked ? 1 : 0 })} />
                    <span><strong>Practice (drill)</strong>: marked PRACTICE, staff only. Texts and phone alerts go to staff, never to residents.</span>
                  </label>
                ) : Number(alertFormData.is_practice) === 1 && (
                  <p className="adv-practice-banner" style={{ marginBottom: '14px' }}><i className="bi bi-mortarboard-fill"></i> This is a practice advisory: staff only.</p>
                )}
                <div className="form-group">
                  <label htmlFor="lbDisasterRisk-10" className="form-label">Advisory / Bulletin Title *</label>
                  <input id="lbDisasterRisk-10"
                    type="text"
                    required
                    className="form-input"
                    placeholder="e.g. Typhoon Wind Signal #2 Alert & Flood Watch"
                    value={alertFormData.title}
                    onChange={(e) => setAlertFormData({ ...alertFormData, title: e.target.value })}
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="lbDisasterRisk-11" className="form-label">Alert Severity Level *</label>
                    <select id="lbDisasterRisk-11"
                      className="form-select"
                      value={alertFormData.alert_level}
                      onChange={(e) => setAlertFormData({ ...alertFormData, alert_level: e.target.value })}
                    >
                      <option value="Advisory">Advisory (Low / Weather Monitoring)</option>
                      <option value="Watch">Watch (Moderate / Voluntary Evacuation)</option>
                      <option value="Warning">Warning (High / Pre-emptive Evacuation)</option>
                      <option value="Severe">Severe (Critical / Forced Evacuation)</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label htmlFor="lbDisasterRisk-12" className="form-label">Calamity Type</label>
                    <input id="lbDisasterRisk-12"
                      type="text"
                      className="form-input"
                      placeholder="e.g. Typhoon / Heavy Monsoon Rain"
                      value={alertFormData.calamity_type}
                      onChange={(e) => setAlertFormData({ ...alertFormData, calamity_type: e.target.value })}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="lbDisasterRisk-13" className="form-label">Affected Areas / Subdivisions in Pasong Buaya II</label>
                  <input id="lbDisasterRisk-13"
                    type="text"
                    className="form-input"
                    placeholder="e.g. Phase 1 Low-lying, Bucandala riverbank, Purok 3 & 4"
                    value={alertFormData.affected_areas}
                    onChange={(e) => setAlertFormData({ ...alertFormData, affected_areas: e.target.value })}
                  />
                  {formHelpers && (formHelpers.flood_streets['3'].length > 0 || formHelpers.flood_streets['2'].length > 0) && (
                    <div className="adv-area-helpers">
                      <span>Add streets by flood risk (Project NOAH 100-year map):</span>
                      {formHelpers.flood_streets['3'].length > 0 && (
                        <button type="button" onClick={() => addAreas(formHelpers.flood_streets['3'])}>
                          <i className="bi bi-water"></i> High ({formHelpers.flood_streets['3'].length})
                        </button>
                      )}
                      {formHelpers.flood_streets['2'].length > 0 && (
                        <button type="button" onClick={() => addAreas(formHelpers.flood_streets['2'])}>
                          <i className="bi bi-water"></i> Medium ({formHelpers.flood_streets['2'].length})
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <div className="form-group">
                  <label htmlFor="lbDisasterRisk-14" className="form-label">Evacuation Schedule / Departure Notice</label>
                  <input id="lbDisasterRisk-14"
                    type="text"
                    className="form-input"
                    placeholder="e.g. Mandatory evacuation begins 3:00 PM; rescue trucks stationed at covered court"
                    value={alertFormData.evacuation_schedule}
                    onChange={(e) => setAlertFormData({ ...alertFormData, evacuation_schedule: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="lbDisasterRisk-15" className="form-label">Instructions & Reminders for Residents *</label>
                  <textarea id="lbDisasterRisk-15"
                    rows="3"
                    required
                    className="form-textarea"
                    placeholder="Provide actionable guidance for families (e.g. prepare Go Bags, disconnect power breakers, stay tuned)"
                    value={alertFormData.instructions}
                    onChange={(e) => setAlertFormData({ ...alertFormData, instructions: e.target.value })}
                  />
                </div>

                <details className="adv-fil-fields" open={Boolean(alertFormData.title_fil || alertFormData.instructions_fil)} style={{ marginBottom: '14px' }}>
                  <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem', color: '#064e3b' }}>Filipino version (for residents who chose Filipino)</summary>
                  <div className="form-group" style={{ marginTop: '10px' }}>
                    <label htmlFor="lbDisasterRisk-16" className="form-label">Pamagat (Title in Filipino)</label>
                    <input id="lbDisasterRisk-16" type="text" maxLength={200} className="form-input" value={alertFormData.title_fil}
                      onChange={(e) => setAlertFormData({ ...alertFormData, title_fil: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label htmlFor="lbDisasterRisk-17" className="form-label">Mga Tagubilin (Instructions in Filipino)</label>
                    <textarea id="lbDisasterRisk-17" rows="3" className="form-textarea" value={alertFormData.instructions_fil}
                      onChange={(e) => setAlertFormData({ ...alertFormData, instructions_fil: e.target.value })} />
                  </div>
                  <small style={{ fontSize: '0.75rem', color: '#64748b' }}>Leave both empty to send English to everyone. Fill both, or neither.</small>
                </details>

                <div className="form-group">
                  <label htmlFor="lbDisasterRisk-18" className="form-label">Publish Status</label>
                  <select id="lbDisasterRisk-18"
                    className="form-select"
                    value={alertFormData.is_active}
                    onChange={(e) => setAlertFormData({ ...alertFormData, is_active: Number(e.target.value) })}
                  >
                    <option value={1}>Active (Broadcast on System Dashboard)</option>
                    <option value={0}>Draft / Deactivated</option>
                  </select>
                </div>

                {/* What saving shows and sends, so nothing goes out by surprise. */}
                {(() => {
                  const { items, texts, practice } = saveSummary(alertFormData);
                  const active = Number(alertFormData.is_active) === 1;
                  const hasText = alertFormData.title.trim() && alertFormData.instructions.trim();
                  const showPreview = active && hasText && (texts || (!practice && smsAuto.mode !== 'auto'));
                  return (
                    <div className="adv-save-summary">
                      <strong><i className="bi bi-info-circle-fill"></i> When you save</strong>
                      <ul>{items.map(([icon, text]) => <li key={text}><i className={`bi ${icon}`}></i> {text}</li>)}</ul>
                      {showPreview && (
                        <div className="adv-sms-preview">
                          <span>{texts ? 'The text' : 'The text, if you send it'} ({alertFormData.title_fil.trim() ? 'English, then Filipino for residents who chose it' : 'English'}):</span>
                          <p>{smsPreview(alertFormData, 'en', reach.sms_link)}</p>
                          {alertFormData.title_fil.trim() && <p lang="fil">{smsPreview(alertFormData, 'fil', reach.sms_link)}</p>}
                          {!reach.sms_link && !practice && <small>No emergency page link in texts yet: set PB2_SITE_URL in backend/config.php to add one.</small>}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowAlertModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-danger-action">
                  <i className="bi bi-save-fill"></i> {Number(alertFormData.is_active) !== 1 ? 'Save Draft'
                    : Number(alertFormData.is_practice) === 1 ? (alertFormData.id ? 'Save Practice' : 'Start Practice')
                    : alertFormData.id ? 'Save Changes' : 'Publish Advisory'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD / EDIT EVACUATION CENTER */}
      {showCenterModal && (
        <div className="modal-backdrop" onClick={() => setShowCenterModal(false)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h4>
                <i className="bi bi-house-door-fill" style={{ color: '#047857' }}></i>
                {centerFormData.id ? 'Edit Evacuation Center' : 'Add Evacuation Center'}
              </h4>
              <button className="modal-close-btn" onClick={() => setShowCenterModal(false)}>
                <i className="bi bi-x-lg"></i>
              </button>
            </div>
            <form onSubmit={handleSaveCenter}>
              <div className="modal-body">
                <div className="form-group">
                  <label htmlFor="lbDisasterRisk-19" className="form-label">Center Name *</label>
                  <input id="lbDisasterRisk-19"
                    type="text"
                    required
                    className="form-input"
                    placeholder="e.g. Pasong Buaya II Covered Court"
                    value={centerFormData.name}
                    onChange={(e) => setCenterFormData({ ...centerFormData, name: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="lbDisasterRisk-20" className="form-label">Location / Address *</label>
                  <input id="lbDisasterRisk-20"
                    type="text"
                    required
                    className="form-input"
                    placeholder="e.g. Barangay Compound, Pasong Buaya II, Imus, Cavite"
                    value={centerFormData.location}
                    onChange={(e) => setCenterFormData({ ...centerFormData, location: e.target.value })}
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="lbDisasterRisk-21" className="form-label">Map latitude (optional)</label>
                    <input id="lbDisasterRisk-21" type="number" step="any" min="-90" max="90" className="form-input" value={centerFormData.latitude} onChange={(e) => setCenterFormData({ ...centerFormData, latitude: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label htmlFor="lbDisasterRisk-22" className="form-label">Map longitude (optional)</label>
                    <input id="lbDisasterRisk-22" type="number" step="any" min="-180" max="180" className="form-input" value={centerFormData.longitude} onChange={(e) => setCenterFormData({ ...centerFormData, longitude: e.target.value })} />
                  </div>
                </div>
                <div className="drrm-map-coordinate-heading">
                  <span>Or place the center directly on the map</span>
                  <button type="button" className="btn-secondary drrm-map-pick-button" onClick={toggleCenterPickMode}>
                    <i className="bi bi-crosshair"></i> Pick on map
                  </button>
                  </div>

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="lbDisasterRisk-23" className="form-label">Max Family Capacity *</label>
                    <input id="lbDisasterRisk-23"
                      type="number"
                      required
                      min="1"
                      className="form-input"
                      value={centerFormData.capacity_families}
                      onChange={(e) =>
                        setCenterFormData({ ...centerFormData, capacity_families: Number(e.target.value) })
                      }
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="lbDisasterRisk-24" className="form-label">Current Occupied Families</label>
                    <input id="lbDisasterRisk-24"
                      type="number"
                      min="0"
                      className="form-input"
                      value={centerFormData.current_families}
                      onChange={(e) =>
                        setCenterFormData({ ...centerFormData, current_families: Number(e.target.value) })
                      }
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="lbDisasterRisk-25" className="form-label">Center Status</label>
                    <select id="lbDisasterRisk-25"
                      className="form-select"
                      value={centerFormData.status}
                      onChange={(e) => setCenterFormData({ ...centerFormData, status: e.target.value })}
                    >
                      <option value="Available">Available</option>
                      <option value="Standby">On Standby</option>
                      <option value="Full">Full</option>
                      <option value="Closed">Closed</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label htmlFor="lbDisasterRisk-26" className="form-label">Contact Person</label>
                    <input id="lbDisasterRisk-26"
                      type="text"
                      className="form-input"
                      placeholder="e.g. Kagawad on Duty"
                      value={centerFormData.contact_person}
                      onChange={(e) => setCenterFormData({ ...centerFormData, contact_person: e.target.value })}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="lbDisasterRisk-27" className="form-label">Contact Hotline</label>
                  <input id="lbDisasterRisk-27"
                    type="text"
                    className="form-input"
                    placeholder="e.g. (046) 471-0000 / 0917-123-4567"
                    value={centerFormData.contact_number}
                    onChange={(e) => setCenterFormData({ ...centerFormData, contact_number: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="lbDisasterRisk-28" className="form-label">Available Facilities / Amenities</label>
                  <textarea id="lbDisasterRisk-28"
                    rows="2"
                    className="form-textarea"
                    placeholder="e.g. Clean Restrooms, Potable Water, Standby Clinic, Heavy Generator"
                    value={centerFormData.facilities}
                    onChange={(e) => setCenterFormData({ ...centerFormData, facilities: e.target.value })}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowCenterModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary-action">
                  <i className="bi bi-save-fill"></i> Save Evacuation Center
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* QUICK OCCUPANCY MODAL */}
      {occupancyModal && (
        <div className="modal-backdrop" onClick={() => setOccupancyModal(null)}>
          <div className="modal-dialog" style={{ maxWidth: '450px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h4>
                <i className="bi bi-people-fill" style={{ color: '#047857' }}></i>
                Quick Occupancy Update
              </h4>
              <button className="modal-close-btn" onClick={() => setOccupancyModal(null)}>
                <i className="bi bi-x-lg"></i>
              </button>
            </div>
            <form onSubmit={handleUpdateOccupancy}>
              <div className="modal-body">
                <div style={{ fontWeight: 700, color: '#1e293b' }}>{occupancyModal.name}</div>
                <div className="form-group">
                  <label htmlFor="lbDisasterRisk-29" className="form-label">Current Families Evacuated:</label>
                  <input id="lbDisasterRisk-29"
                    type="number"
                    min="0"
                    className="form-input"
                    value={occupancyModal.current_families}
                    onChange={(e) =>
                      setOccupancyModal({ ...occupancyModal, current_families: Number(e.target.value) })
                    }
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="lbDisasterRisk-30" className="form-label">Status</label>
                  <select id="lbDisasterRisk-30"
                    className="form-select"
                    value={occupancyModal.status}
                    onChange={(e) => setOccupancyModal({ ...occupancyModal, status: e.target.value })}
                  >
                    <option value="Available">Available</option>
                    <option value="Standby">On Standby</option>
                    <option value="Full">Full</option>
                    <option value="Closed">Closed</option>
                  </select>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setOccupancyModal(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary-action">
                  Update
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {canSms && <DisasterRiskSMS
        isOpen={isSmsModalOpen}
        onClose={() => setIsSmsModalOpen(false)}
        activeAlert={selectedSmsAlert}
      />}
    </div>
  );
};

export default DisasterRisk;

