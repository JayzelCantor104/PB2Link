import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import axios from 'axios';
import Toast from '../components/Toast';
import { useToast } from '../lib/useToast';
import { useAdminAccess } from '../lib/adminAccess';
import { peso } from '../lib/payment';
import './AdminServices.css';
import useFormDraft from '../lib/useFormDraft';

const API_BASE = '/api_backend';

// Services & Form Builder (backend/api/services.php). Every service on the
// resident Services page is managed here:
// - Built-in services (Barangay Clearance ... Report Incident) keep their own
//   forms and rules. Staff edit their card (name, description, category, icon),
//   open or close them, and add extra questions at the end of their form
//   (migration 031). Certificates, emails and staff lists keep the official name.
// - Custom services are built here entirely and open
//   src/pages/DynamicRequestForm.jsx (/request/:serviceId). That form asks for
//   the applicant's identity, address and valid ID on its own.

const CATEGORIES = ['Clearance & Certification', 'Facility Reservation', 'Permit', 'Registration', 'Other'];
const FILTER_OF = { 'Clearance & Certification': 'Documents', Permit: 'Permits' };
const filterOf = (c) => FILTER_OF[c] || 'Community';
const titleKey = (t) => String(t || '').toUpperCase().replace(/[^A-Z0-9Ñ]+/g, ' ').trim();

// The four steps of a custom service's form, named as residents see them.
const STEPS = [
  { key: 'Identity', label: 'Step 1 · Identity', auto: 'Name, birth date, sex, civil status and mobile number: from the profile for "Myself", typed in for someone else.' },
  { key: 'Residency', label: 'Step 2 · Details', auto: 'The address: from the profile, or the one typed for someone else.' },
  { key: 'Uploads', label: 'Step 3 · Uploads', auto: 'A valid ID: the one from registration for "Myself", an upload for someone else.' },
  { key: 'Review', label: 'Step 4 · Review', auto: 'A summary of every answer, then payment if the service has a fee.' },
];

const FIELD_TYPES = [
  { value: 'text', label: 'Short answer', icon: 'bi-input-cursor-text' },
  { value: 'textarea', label: 'Long answer (paragraph)', icon: 'bi-text-paragraph' },
  { value: 'number', label: 'Number', icon: 'bi-123' },
  { value: 'date', label: 'Date', icon: 'bi-calendar3' },
  { value: 'time', label: 'Time', icon: 'bi-clock' },
  { value: 'select', label: 'Dropdown (pick one)', icon: 'bi-menu-button-wide' },
  { value: 'radio', label: 'Multiple choice (pick one)', icon: 'bi-ui-radios' },
  { value: 'checkbox', label: 'Checkboxes (pick any)', icon: 'bi-ui-checks' },
  { value: 'file', label: 'File upload (image or PDF)', icon: 'bi-paperclip' },
];
const TYPE = Object.fromEntries(FIELD_TYPES.map((t) => [t.value, t]));
const HAS_CHOICES = ['select', 'radio', 'checkbox'];

const TARGETS = [
  { value: 'all', label: 'Everyone' },
  { value: 'myself_only', label: 'Only when requesting for themselves' },
  { value: 'someone_else_only', label: 'Only when requesting for someone else' },
];
const TARGET_SHORT = { all: 'Everyone', myself_only: 'Myself only', someone_else_only: 'Someone else only' };

// Questions a custom form already asks on its own.
const AUTOMATIC = ['FIRST NAME', 'MIDDLE NAME', 'LAST NAME', 'FULL NAME', 'NAME', 'SUFFIX', 'ADDRESS', 'HOME ADDRESS',
  'BIRTH DATE', 'BIRTHDATE', 'BIRTHDAY', 'DATE OF BIRTH', 'AGE', 'SEX', 'GENDER', 'CIVIL STATUS', 'CONTACT NUMBER',
  'MOBILE NUMBER', 'PHONE NUMBER', 'VALID ID', 'GOVERNMENT ID', 'ID'];
const isAutomatic = (label) => AUTOMATIC.includes(titleKey(label));

// Where staff handle each built-in service's requests.
const BUILTIN_QUEUE = {
  clearance: ['/admin/documents?tab=Barangay%20Clearance', 'module.documents'],
  residency: ['/admin/documents?tab=Certificate%20of%20Residency', 'module.documents'],
  barangay_id: ['/admin/documents?tab=Barangay%20ID', 'module.documents'],
  business: ['/admin/documents?tab=Business%20Clearance', 'module.documents'],
  indigency: ['/admin/documents?tab=Certificate%20of%20Indigency', 'module.documents'],
  volunteer: ['/admin/documents?tab=Volunteer%20Registration', 'module.documents'],
  amenity: ['/admin/amenities', 'module.amenities'],
  incident: ['/admin/incidents', 'module.incidents'],
};

const parseOptions = (raw) => {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return String(raw).split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
  }
};

const EMPTY_SERVICE = { service_id: null, title: '', category: 'Clearance & Certification', icon: '', description: '', allow_third_party: 1, is_active: 0 };
const emptyField = (step = 'Residency') => ({
  field_id: null, step_section: step, field_label: '', field_type: 'text', options: '', help_text: '', is_required: 1, show_for_target: 'all',
});

const IconPicker = ({ icons, value, onChange }) => (
  <div className="asv-icons" role="radiogroup" aria-label="Icon">
    {icons.map((ic) => (
      <button key={ic} type="button" role="radio" aria-checked={value === ic} aria-label={ic.replace(/^bi-|-fill$/g, '').replace(/-/g, ' ')}
        className={`asv-icon-choice${value === ic ? ' is-selected' : ''}`} onClick={() => onChange(ic)}>
        <i className={`bi ${ic}`} aria-hidden="true"></i>
      </button>
    ))}
  </div>
);

const AdminServices = () => {
  const { toast, showToast, confirmToast, closeToast } = useToast();
  const { can } = useAdminAccess();
  const [services, setServices] = useState([]);
  const [builtins, setBuiltins] = useState([]);
  const [icons, setIcons] = useState([]);
  const [needsMigration, setNeedsMigration] = useState(false);
  const [maxFields, setMaxFields] = useState(40);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null); // { kind: 'builtin' | 'custom', id }
  const [fields, setFields] = useState([]);
  const [fieldsLoading, setFieldsLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [listFilter, setListFilter] = useState('all');
  const [search, setSearch] = useState('');

  const [serviceForm, setServiceForm] = useState(null);
  const [builtinForm, setBuiltinForm] = useState(null);
  const [fieldForm, setFieldForm] = useState(null);
  const [preview, setPreview] = useState(false);
  const [orderList, setOrderList] = useState(null);

  // Drafts (src/lib/useFormDraft.jsx) of the three pop-up forms: a service's
  // details, a built-in service's card, and a question. They survive a refresh
  // or an accidental close and are cleared on save.
  const draftOpts = { owner: 'admin', trigger: 'change' };
  const serviceDraft = useFormDraft(serviceForm?.service_id ? `service_${serviceForm.service_id}` : 'service_new', serviceForm || {},
    (d) => setServiceForm((prev) => (prev ? { ...prev, ...d } : prev)), { ...draftOpts, enabled: !!serviceForm });
  const builtinDraft = useFormDraft(`service_builtin_${builtinForm?.key || ''}`, builtinForm || {},
    (d) => setBuiltinForm((prev) => (prev ? { ...prev, ...d } : prev)), { ...draftOpts, enabled: !!builtinForm });
  const fieldDraft = useFormDraft(
    fieldForm?.field_id ? `service_question_${fieldForm.field_id}` : `service_question_new_${selected?.kind || ''}_${selected?.id || ''}`,
    fieldForm || {}, (d) => setFieldForm((prev) => (prev ? { ...prev, ...d } : prev)), { ...draftOpts, enabled: !!fieldForm });

  const isBuiltin = selected?.kind === 'builtin';
  const current = isBuiltin
    ? builtins.find((b) => b.key === selected.id) || null
    : services.find((s) => s.service_id === selected?.id) || null;
  const owner = isBuiltin ? { builtin_key: selected?.id } : { service_id: selected?.id };
  const hasMode = isBuiltin ? !!current?.has_mode : !!current?.allow_third_party;

  const post = async (action, body) => {
    const res = await axios.post(`${API_BASE}/services.php?action=${action}`, body);
    return res.data || {};
  };

  const loadServices = useCallback(async (keep) => {
    try {
      const res = await axios.get(`${API_BASE}/services.php?action=get_admin`);
      if (res.data?.success) {
        setServices(res.data.services || []);
        setBuiltins(res.data.builtins || []);
        setIcons(res.data.icons || []);
        setNeedsMigration(!!res.data.needs_migration);
        setMaxFields(res.data.max_fields || 40);
        if (keep !== undefined) setSelected(keep);
      } else {
        showToast('Could not load', res.data?.message || 'The services could not be loaded.', 'error');
      }
    } catch {
      showToast('Connection Error', 'The services could not be loaded.', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  const loadFields = useCallback(async (sel) => {
    if (!sel) { setFields([]); return; }
    setFieldsLoading(true);
    try {
      const q = sel.kind === 'builtin' ? `builtin_key=${encodeURIComponent(sel.id)}` : `service_id=${sel.id}`;
      const res = await axios.get(`${API_BASE}/services.php?action=get_fields&${q}`);
      setFields(res.data?.success ? res.data.fields || [] : []);
    } catch {
      setFields([]);
    } finally {
      setFieldsLoading(false);
    }
  }, []);

  useEffect(() => { loadServices(); }, [loadServices]);
  useEffect(() => { loadFields(selected); }, [selected, loadFields]);

  const matches = (title, active) => {
    if (listFilter === 'open' && !active) return false;
    if (listFilter === 'closed' && active) return false;
    return !search.trim() || String(title).toLowerCase().includes(search.trim().toLowerCase());
  };
  const visibleBuiltins = builtins.filter((b) => matches(b.title, b.is_active));
  const visibleServices = services.filter((s) => matches(s.title, s.is_active));

  const fieldsByStep = useMemo(() => Object.fromEntries(
    STEPS.map((s) => [s.key, fields.filter((f) => f.step_section === s.key).sort((a, b) => a.sort_order - b.sort_order || a.field_id - b.field_id)])
  ), [fields]);
  const builtinFields = useMemo(() => [...fields].sort((a, b) => a.sort_order - b.sort_order || a.field_id - b.field_id), [fields]);

  const refresh = () => Promise.all([loadFields(selected), loadServices()]);

  // ---- Custom service actions ----------------------------------------------------
  const saveService = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const data = await post('save_service', serviceForm);
      if (data.success) {
        showToast('Saved', data.message, 'success');
        serviceDraft.clear();
        setServiceForm(null);
        await loadServices({ kind: 'custom', id: data.service_id });
      } else {
        showToast('Not saved', data.message || 'Please check the details.', 'error');
      }
    } catch {
      showToast('Connection Error', 'The service could not be saved.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const toggleCustom = async (s) => {
    const opening = !s.is_active;
    if (opening && s.field_count === 0) {
      const ok = await confirmToast('Open without extra questions?',
        `"${s.title}" has no questions of its own yet. Residents will only give their details and a valid ID. Open it anyway?`,
        { confirmLabel: 'Open anyway' });
      if (!ok) return;
    } else if (!opening) {
      const ok = await confirmToast(`Close "${s.title}"?`,
        `Residents will no longer see it on the Services page.${s.open_count ? ` The ${s.open_count} request(s) still in progress are kept and can be finished.` : ''}`,
        { confirmLabel: 'Close service', danger: true });
      if (!ok) return;
    }
    setBusy(true);
    try {
      const data = await post('toggle_status', { service_id: s.service_id, is_active: opening ? 1 : 0 });
      showToast(data.success ? (opening ? 'Service open' : 'Service closed') : 'Not changed', data.message, data.success ? 'success' : 'error');
      if (data.success) await loadServices();
    } catch {
      showToast('Connection Error', 'The status could not be changed.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const deleteService = async (s) => {
    const ok = await confirmToast(`Delete "${s.title}"?`,
      'It has never been used, so it will be removed with its questions. This cannot be undone.',
      { confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    setBusy(true);
    try {
      const data = await post('delete_service', { service_id: s.service_id });
      showToast(data.success ? 'Deleted' : 'Not deleted', data.message, data.success ? 'success' : 'error');
      if (data.success) { setSelected(null); await loadServices(); }
    } catch {
      showToast('Connection Error', 'The service could not be deleted.', 'error');
    } finally {
      setBusy(false);
    }
  };

  // ---- Built-in service actions -------------------------------------------------------
  const saveBuiltin = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const data = await post('save_builtin', builtinForm);
      if (data.success) {
        showToast('Saved', data.message, 'success');
        builtinDraft.clear();
        setBuiltinForm(null);
        await loadServices();
      } else {
        showToast('Not saved', data.message || 'Please check the details.', 'error');
      }
    } catch {
      showToast('Connection Error', 'The service could not be saved.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const toggleBuiltin = async (b) => {
    const opening = !b.is_active;
    const ok = await confirmToast(opening ? `Open ${b.label} again?` : `Close ${b.label}?`,
      opening
        ? 'Residents can send new requests again.'
        : `Residents will see it as unavailable${b.closed_message ? ' with your closed message' : ''}, and new requests are refused. Requests already sent can still be processed.${b.closed_message ? '' : ' Tip: add a closed message with Edit card first (e.g. when it reopens).'}`,
      { confirmLabel: opening ? 'Open' : 'Close service', danger: !opening });
    if (!ok) return;
    setBusy(true);
    try {
      const data = await post('toggle_builtin', { key: b.key, is_active: opening ? 1 : 0 });
      showToast(data.success ? (opening ? 'Service open' : 'Service closed') : 'Not changed', data.message, data.success ? 'success' : 'error');
      if (data.success) await loadServices();
    } catch {
      showToast('Connection Error', 'The status could not be changed.', 'error');
    } finally {
      setBusy(false);
    }
  };

  // ---- Services page order ------------------------------------------------------------
  const openOrder = () => {
    const all = [
      ...builtins.map((b) => ({ ref: `builtin:${b.key}`, title: b.title, icon: b.icon, sort: b.sort_order, note: b.is_active ? 'Built-in' : 'Built-in · closed' })),
      ...services.map((s) => ({ ref: `service:${s.service_id}`, title: s.title, icon: s.icon || 'bi-layers-fill', sort: s.sort_order ?? 100, note: s.is_active ? 'Custom' : 'Custom · closed (hidden)' })),
    ].sort((a, b) => a.sort - b.sort || a.title.localeCompare(b.title));
    setOrderList(all);
  };
  const moveOrder = (i, dir) => setOrderList((l) => {
    const next = [...l];
    const to = i + dir;
    if (to < 0 || to >= next.length) return l;
    [next[i], next[to]] = [next[to], next[i]];
    return next;
  });
  const saveOrder = async () => {
    setBusy(true);
    try {
      const data = await post('save_order', { order: orderList.map((x) => x.ref) });
      showToast(data.success ? 'Order saved' : 'Not saved', data.message, data.success ? 'success' : 'error');
      if (data.success) { setOrderList(null); await loadServices(); }
    } catch {
      showToast('Connection Error', 'The order could not be saved.', 'error');
    } finally {
      setBusy(false);
    }
  };

  // ---- Questions --------------------------------------------------------------------------
  const openField = (field, step) => {
    if (field) {
      setFieldForm({ ...field, options: parseOptions(field.field_options).join('\n'), help_text: field.help_text || '' });
    } else {
      if (fields.length >= maxFields) {
        showToast('Limit reached', `A service can have up to ${maxFields} questions.`, 'error');
        return;
      }
      setFieldForm(emptyField(isBuiltin ? 'Review' : step));
    }
  };

  const saveField = async (e) => {
    e.preventDefault();
    const f = fieldForm;
    const options = f.options.split('\n').map((o) => o.trim()).filter(Boolean);
    if (['select', 'radio'].includes(f.field_type) && options.length < 2) {
      showToast('Add choices', 'A dropdown or multiple-choice question needs at least two choices, one per line.', 'error');
      return;
    }
    setBusy(true);
    try {
      const data = await post('save_field', {
        ...owner, field_id: f.field_id, step_section: f.step_section, field_label: f.field_label,
        field_type: f.field_type, field_options: HAS_CHOICES.includes(f.field_type) ? options : [],
        help_text: f.help_text, is_required: f.is_required, show_for_target: hasMode ? f.show_for_target : 'all',
      });
      if (data.success) {
        showToast('Saved', data.message, 'success');
        fieldDraft.clear();
        setFieldForm(null);
        await refresh();
      } else {
        showToast('Not saved', data.message || 'Please check the question.', 'error');
      }
    } catch {
      showToast('Connection Error', 'The question could not be saved.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const deleteField = async (field) => {
    const ok = await confirmToast(`Remove "${field.field_label}"?`,
      'New requests won\'t ask it any more. Answers already sent with earlier requests are kept.',
      { confirmLabel: 'Remove', danger: true });
    if (!ok) return;
    setBusy(true);
    try {
      const data = await post('delete_field', { ...owner, field_id: field.field_id });
      showToast(data.success ? 'Removed' : 'Not removed', data.message, data.success ? 'success' : 'error');
      if (data.success) await refresh();
    } catch {
      showToast('Connection Error', 'The question could not be removed.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const moveField = async (list, step, index, dir) => {
    const next = [...list];
    const to = index + dir;
    if (to < 0 || to >= next.length) return;
    [next[index], next[to]] = [next[to], next[index]];
    setFields((prev) => prev.map((f) => {
      const pos = next.findIndex((x) => x.field_id === f.field_id);
      return pos >= 0 ? { ...f, sort_order: pos + 1 } : f;
    }));
    try {
      const data = await post('reorder_fields', { ...owner, step_section: step, order: next.map((f) => f.field_id) });
      if (!data.success) showToast('Order not saved', data.message, 'error');
    } catch {
      showToast('Connection Error', 'The new order could not be saved.', 'error');
    } finally {
      loadFields(selected);
    }
  };

  const renderFieldList = (list, step) => (
    <ol className="asv-fields">
      {list.map((f, i) => (
        <li key={f.field_id} className="asv-field">
          <div className="asv-field-main">
            <i className={`bi ${TYPE[f.field_type]?.icon || 'bi-question'} asv-field-icon`} aria-hidden="true"></i>
            <div>
              <span className="asv-field-label">{f.field_label}{Number(f.is_required) === 1 && <b className="asv-req" title="Required"> *</b>}</span>
              <span className="asv-field-meta">
                {TYPE[f.field_type]?.label || f.field_type}
                {hasMode ? ` · ${TARGET_SHORT[f.show_for_target] || 'Everyone'}` : ''}
                {Number(f.is_required) === 1 ? ' · Required' : ' · Optional'}
              </span>
              {HAS_CHOICES.includes(f.field_type) && parseOptions(f.field_options).length > 0 && (
                <span className="asv-field-choices">{parseOptions(f.field_options).join(' · ')}</span>
              )}
              {f.help_text && <span className="asv-field-help">Hint: {f.help_text}</span>}
              {!isBuiltin && isAutomatic(f.field_label) && (
                <span className="asv-field-warn"><i className="bi bi-exclamation-circle"></i> The form already asks for this. Consider removing it.</span>
              )}
            </div>
          </div>
          <div className="asv-field-actions">
            <button type="button" className="asv-icon-btn" onClick={() => moveField(list, step, i, -1)} disabled={busy || i === 0} aria-label={`Move ${f.field_label} up`} title="Move up"><i className="bi bi-arrow-up"></i></button>
            <button type="button" className="asv-icon-btn" onClick={() => moveField(list, step, i, 1)} disabled={busy || i === list.length - 1} aria-label={`Move ${f.field_label} down`} title="Move down"><i className="bi bi-arrow-down"></i></button>
            <button type="button" className="asv-icon-btn" onClick={() => openField(f)} disabled={busy} aria-label={`Edit ${f.field_label}`} title="Edit"><i className="bi bi-pencil"></i></button>
            <button type="button" className="asv-icon-btn is-danger" onClick={() => deleteField(f)} disabled={busy} aria-label={`Remove ${f.field_label}`} title="Remove"><i className="bi bi-trash3"></i></button>
          </div>
        </li>
      ))}
    </ol>
  );

  // ---- Render --------------------------------------------------------------------------
  const allActive = [...builtins.map((b) => b.is_active), ...services.map((s) => s.is_active)];
  const counts = { all: allActive.length, open: allActive.filter(Boolean).length, closed: allActive.filter((a) => !a).length };
  const formNameClash = serviceForm && serviceForm.title.trim() && (
    builtins.some((b) => titleKey(b.title) === titleKey(serviceForm.title) || titleKey(b.label) === titleKey(serviceForm.title))
    || services.some((s) => s.service_id !== serviceForm.service_id && titleKey(s.title) === titleKey(serviceForm.title)));
  const builtinNameClash = builtinForm && builtinForm.title.trim() && (
    builtins.some((b) => b.key !== builtinForm.key && (titleKey(b.title) === titleKey(builtinForm.title) || titleKey(b.label) === titleKey(builtinForm.title)))
    || services.some((s) => titleKey(s.title) === titleKey(builtinForm.title)));
  const queue = isBuiltin ? BUILTIN_QUEUE[current?.key] : null;

  const listItem = (key, kind, id, title, active, meta, warn, icon) => (
    <li key={key}>
      <button type="button" className={`asv-item${selected?.kind === kind && selected?.id === id ? ' is-selected' : ''}`}
        onClick={() => setSelected({ kind, id })} aria-current={selected?.kind === kind && selected?.id === id}>
        <span className="asv-item-top">
          <span className="asv-item-title"><i className={`bi ${icon || 'bi-layers-fill'} asv-item-icon`} aria-hidden="true"></i>{title}</span>
          <span className={`asv-status ${active ? 'is-open' : 'is-closed'}`}>{active ? 'Open' : 'Closed'}</span>
        </span>
        <span className="asv-item-meta">{meta}</span>
        {warn && <span className="asv-item-warn"><i className="bi bi-exclamation-triangle-fill"></i> Needs attention</span>}
      </button>
    </li>
  );

  return (
    <div className="asv-page">
      <Toast toast={toast} onClose={closeToast} />

      <div className="asv-intro">
        <div>
          <h2>Services &amp; Form Builder</h2>
          <p>
            Every service on the resident <strong>Services</strong> page. Built-in services keep their own forms: edit their card,
            open or close them, and add extra questions. Custom services are built here entirely.
          </p>
        </div>
        <div className="asv-intro-actions">
          <button type="button" className="asv-btn asv-btn-ghost" onClick={openOrder} disabled={loading || needsMigration}>
            <i className="bi bi-sort-down"></i> Services page order
          </button>
          <button type="button" className="asv-btn asv-btn-primary" onClick={() => setServiceForm({ ...EMPTY_SERVICE })}>
            <i className="bi bi-plus-lg"></i> New Service
          </button>
        </div>
      </div>

      {needsMigration && (
        <p className="asv-alert is-warn"><i className="bi bi-exclamation-triangle-fill"></i> The built-in services can't be edited yet: the database needs an update. Ask the system administrator to apply <code>031_builtin_services.sql</code>.</p>
      )}

      <div className="asv-layout">
        {/* ---- Service list ---- */}
        <aside className="asv-list" aria-label="Services">
          <div className="asv-list-tools">
            <input type="text" className="keep-case" placeholder="Search services" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search services" />
            <div className="asv-chips" role="group" aria-label="Show">
              {[['all', 'All'], ['open', 'Open'], ['closed', 'Closed']].map(([k, l]) => (
                <button key={k} type="button" className={`asv-chip${listFilter === k ? ' is-active' : ''}`} aria-pressed={listFilter === k} onClick={() => setListFilter(k)}>
                  {l} <span>{counts[k]}</span>
                </button>
              ))}
            </div>
          </div>
          {loading ? (
            <p className="asv-empty">Loading services…</p>
          ) : (
            <>
              <h4 className="asv-group">Built-in services</h4>
              {visibleBuiltins.length === 0 ? <p className="asv-empty">None match.</p> : (
                <ul>
                  {visibleBuiltins.map((b) => listItem(`b-${b.key}`, 'builtin', b.key, b.title, b.is_active,
                    <>{filterOf(b.category)} · {b.field_count} extra question{b.field_count === 1 ? '' : 's'} · {b.request_count} request{b.request_count === 1 ? '' : 's'}{b.open_count > 0 && <em> ({b.open_count} in progress)</em>}</>,
                    false, b.icon))}
                </ul>
              )}
              <h4 className="asv-group">Custom services</h4>
              {visibleServices.length === 0 ? (
                <p className="asv-empty">{services.length ? 'None match.' : 'No custom services yet. Create one with New Service.'}</p>
              ) : (
                <ul>
                  {visibleServices.map((s) => listItem(`c-${s.service_id}`, 'custom', s.service_id, s.title, s.is_active,
                    <>{filterOf(s.category)} · {s.field_count} question{s.field_count === 1 ? '' : 's'} · {s.request_count} request{s.request_count === 1 ? '' : 's'}{s.open_count > 0 && <em> ({s.open_count} in progress)</em>}</>,
                    s.warnings.length > 0, s.icon))}
                </ul>
              )}
            </>
          )}
        </aside>

        {/* ---- Detail ---- */}
        <section className="asv-detail" aria-live="polite">
          {!current ? (
            <div className="asv-placeholder">
              <i className="bi bi-ui-checks-grid"></i>
              <p>Select a service to edit it, or create a new one.</p>
            </div>
          ) : isBuiltin ? (
            <>
              <div className="asv-detail-head">
                <div>
                  <h3><i className={`bi ${current.icon}`} aria-hidden="true"></i> {current.title}</h3>
                  <div className="asv-facts">
                    <span className={`asv-status ${current.is_active ? 'is-open' : 'is-closed'}`}>{current.is_active ? 'Open to residents' : 'Closed'}</span>
                    <span className="asv-builtin-tag"><i className="bi bi-lock"></i> Built-in form</span>
                    <span><i className="bi bi-tag"></i> {current.category} ({filterOf(current.category)} filter)</span>
                    {current.has_fee && (
                      <span>
                        <i className="bi bi-cash-coin"></i> {current.fee ? peso(current.fee) : 'Free'}
                        {can('payments.settings') ? <Link to="/admin/payments" className="asv-inline-link">Change fee</Link> : <small> (fee set on Payments)</small>}
                      </span>
                    )}
                    <span>
                      <i className="bi bi-inbox"></i> {current.request_count} request{current.request_count === 1 ? '' : 's'}
                      {queue && current.request_count > 0 && can(queue[1]) && <Link to={queue[0]} className="asv-inline-link">View requests</Link>}
                    </span>
                  </div>
                  <p className="asv-desc">Official name: <strong>{current.label}</strong>. Certificates, emails and staff lists keep it; the card name above shows on the Services page and the form heading.</p>
                  {current.description && <p className="asv-desc">{current.description}</p>}
                  {!current.is_active && current.closed_message && <p className="asv-desc"><strong>Closed message:</strong> {current.closed_message}</p>}
                </div>
                <div className="asv-head-actions">
                  <button type="button" className={`asv-btn ${current.is_active ? 'asv-btn-ghost' : 'asv-btn-primary'}`} onClick={() => toggleBuiltin(current)} disabled={busy || needsMigration}>
                    <i className={`bi ${current.is_active ? 'bi-pause-circle' : 'bi-play-circle'}`}></i> {current.is_active ? 'Close' : 'Open again'}
                  </button>
                  <button type="button" className="asv-btn asv-btn-ghost" onClick={() => setBuiltinForm({ key: current.key, title: current.title, description: current.description || '', category: current.category, icon: current.icon, closed_message: current.closed_message || '' })} disabled={needsMigration}>
                    <i className="bi bi-pencil"></i> Edit card
                  </button>
                </div>
              </div>

              <p className="asv-alert is-info">
                <i className="bi bi-info-circle-fill"></i>
                <span>This form&apos;s own questions, checks and payment stay as they are. Questions you add here appear at the <strong>end of the form</strong> under &quot;Additional Questions&quot;, and their answers show with the request for staff and in the resident&apos;s Track Request.</span>
              </p>

              <div className="asv-step">
                <div className="asv-step-head">
                  <h4>Extra questions</h4>
                  <button type="button" className="asv-btn asv-btn-sm asv-btn-ghost" onClick={() => openField(null)} disabled={busy || needsMigration}>
                    <i className="bi bi-plus-lg"></i> Add question
                  </button>
                </div>
                {fieldsLoading ? <p className="asv-empty">Loading questions…</p>
                  : builtinFields.length === 0 ? <p className="asv-step-empty">No extra questions. The form works as it always has.</p>
                  : renderFieldList(builtinFields, 'Review')}
              </div>
            </>
          ) : (
            <>
              <div className="asv-detail-head">
                <div>
                  <h3><i className={`bi ${current.icon || 'bi-layers-fill'}`} aria-hidden="true"></i> {current.title}</h3>
                  <div className="asv-facts">
                    <span className={`asv-status ${current.is_active ? 'is-open' : 'is-closed'}`}>{current.is_active ? 'Open to residents' : 'Closed'}</span>
                    <span><i className="bi bi-tag"></i> {current.category} ({filterOf(current.category)} filter)</span>
                    <span><i className="bi bi-people"></i> {current.allow_third_party ? 'For themself or someone else' : 'For themself only'}</span>
                    <span>
                      <i className="bi bi-cash-coin"></i> {current.fee ? peso(current.fee) : 'Free'}
                      {can('payments.settings') ? <Link to="/admin/payments" className="asv-inline-link">Change fee</Link> : <small> (fee set on Payments)</small>}
                    </span>
                    <span>
                      <i className="bi bi-inbox"></i> {current.request_count} request{current.request_count === 1 ? '' : 's'}
                      {current.request_count > 0 && can('module.documents') && <Link to="/admin/documents?tab=Custom%20Services" className="asv-inline-link">View requests</Link>}
                    </span>
                  </div>
                  {current.description && <p className="asv-desc">{current.description}</p>}
                </div>
                <div className="asv-head-actions">
                  <button type="button" className={`asv-btn ${current.is_active ? 'asv-btn-ghost' : 'asv-btn-primary'}`} onClick={() => toggleCustom(current)} disabled={busy}>
                    <i className={`bi ${current.is_active ? 'bi-pause-circle' : 'bi-play-circle'}`}></i> {current.is_active ? 'Close' : 'Open to residents'}
                  </button>
                  <button type="button" className="asv-btn asv-btn-ghost" onClick={() => setPreview(true)}><i className="bi bi-eye"></i> Preview</button>
                  <button type="button" className="asv-btn asv-btn-ghost" onClick={() => setServiceForm({ ...current, icon: current.icon || '' })}><i className="bi bi-pencil"></i> Edit details</button>
                  <button type="button" className="asv-btn asv-btn-danger" onClick={() => deleteService(current)} disabled={busy || current.request_count > 0}
                    title={current.request_count > 0 ? 'Residents have used this service, so it can only be closed.' : 'Delete this unused service'} aria-label="Delete service">
                    <i className="bi bi-trash3"></i>
                  </button>
                </div>
              </div>

              {current.warnings.map((w) => <p className="asv-alert is-warn" key={w}><i className="bi bi-exclamation-triangle-fill"></i> {w}</p>)}

              <p className="asv-alert is-info">
                <i className="bi bi-info-circle-fill"></i>
                <span>The form already asks for the applicant&apos;s details, address and valid ID, and handles the fee. Add only the questions <strong>this</strong> service needs, like its purpose or a supporting document.</span>
              </p>

              {fieldsLoading ? <p className="asv-empty">Loading questions…</p> : STEPS.map((step) => {
                const list = fieldsByStep[step.key];
                return (
                  <div className="asv-step" key={step.key}>
                    <div className="asv-step-head">
                      <h4>{step.label}</h4>
                      <button type="button" className="asv-btn asv-btn-sm asv-btn-ghost" onClick={() => openField(null, step.key)} disabled={busy}>
                        <i className="bi bi-plus-lg"></i> Add question
                      </button>
                    </div>
                    <p className="asv-step-auto"><i className="bi bi-magic"></i> Always included: {step.auto}</p>
                    {list.length === 0 ? <p className="asv-step-empty">No extra questions in this step.</p> : renderFieldList(list, step.key)}
                  </div>
                );
              })}
            </>
          )}
        </section>
      </div>

      {/* ---- Custom service details ---- */}
      {serviceForm && createPortal(
        <div className="asv-overlay" onClick={() => !busy && setServiceForm(null)}>
          <form className="asv-modal" role="dialog" aria-modal="true" aria-labelledby="asv-service-title" onClick={(e) => e.stopPropagation()} onSubmit={saveService}>
            <div className="asv-modal-head">
              <h3 id="asv-service-title">{serviceForm.service_id ? 'Edit service details' : 'New service'}</h3>
              <button type="button" className="asv-icon-btn" onClick={() => setServiceForm(null)} aria-label="Close" disabled={busy}><i className="bi bi-x-lg"></i></button>
            </div>
            {serviceDraft.notice}
            <label className="asv-field-input">
              <span>Service name *</span>
              <input type="text" required maxLength={150} value={serviceForm.title} onChange={(e) => setServiceForm({ ...serviceForm, title: e.target.value })} placeholder="e.g. Burial Assistance" autoFocus />
              {formNameClash && <small className="asv-hint is-error">Another service on the Services page already uses this name.</small>}
            </label>
            <label className="asv-field-input">
              <span>Category</span>
              <select value={serviceForm.category} onChange={(e) => setServiceForm({ ...serviceForm, category: e.target.value })}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c} ({filterOf(c)} filter)</option>)}
              </select>
            </label>
            <div className="asv-field-input">
              <span>Icon on the Services page</span>
              <IconPicker icons={icons} value={serviceForm.icon} onChange={(ic) => setServiceForm({ ...serviceForm, icon: ic })} />
              <small className="asv-hint">Without one, an icon is picked from the name and category.</small>
            </div>
            <label className="asv-field-input">
              <span>Description</span>
              <textarea rows="3" maxLength={1000} value={serviceForm.description || ''} onChange={(e) => setServiceForm({ ...serviceForm, description: e.target.value })} placeholder="What this service is for and who can apply" />
              <small className="asv-hint">Shown on the service card and at the top of the form.</small>
            </label>
            <label className="asv-check">
              <input type="checkbox" checked={Number(serviceForm.allow_third_party) === 1} onChange={(e) => setServiceForm({ ...serviceForm, allow_third_party: e.target.checked ? 1 : 0 })} />
              <span>Residents may also request it for someone else (a family member, for example). That person&apos;s details and valid ID are then asked.</span>
            </label>
            {!serviceForm.service_id && <p className="asv-hint">New services start <strong>closed</strong>, so you can add questions and preview the form before residents see it.</p>}
            <div className="asv-modal-actions">
              <button type="button" className="asv-btn asv-btn-ghost" onClick={() => setServiceForm(null)} disabled={busy}>Cancel</button>
              <button type="submit" className="asv-btn asv-btn-primary" disabled={busy || formNameClash}>{busy ? 'Saving…' : 'Save'}</button>
            </div>
          </form>
        </div>,
        document.body
      )}

      {/* ---- Built-in card ---- */}
      {builtinForm && createPortal(
        <div className="asv-overlay" onClick={() => !busy && setBuiltinForm(null)}>
          <form className="asv-modal" role="dialog" aria-modal="true" aria-labelledby="asv-builtin-title" onClick={(e) => e.stopPropagation()} onSubmit={saveBuiltin}>
            <div className="asv-modal-head">
              <h3 id="asv-builtin-title">Edit card: {builtins.find((b) => b.key === builtinForm.key)?.label}</h3>
              <button type="button" className="asv-icon-btn" onClick={() => setBuiltinForm(null)} aria-label="Close" disabled={busy}><i className="bi bi-x-lg"></i></button>
            </div>
            {builtinDraft.notice}
            <label className="asv-field-input">
              <span>Name residents see *</span>
              <input type="text" required maxLength={150} value={builtinForm.title} onChange={(e) => setBuiltinForm({ ...builtinForm, title: e.target.value })} autoFocus />
              <small className="asv-hint">On the Services page and the form heading. Certificates, emails and staff lists keep the official name.</small>
              {builtinNameClash && <small className="asv-hint is-error">Another service already uses this name.</small>}
            </label>
            <label className="asv-field-input">
              <span>Description</span>
              <textarea rows="3" maxLength={1000} value={builtinForm.description} onChange={(e) => setBuiltinForm({ ...builtinForm, description: e.target.value })} />
            </label>
            <label className="asv-field-input">
              <span>Category</span>
              <select value={builtinForm.category} onChange={(e) => setBuiltinForm({ ...builtinForm, category: e.target.value })}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c} ({filterOf(c)} filter)</option>)}
              </select>
            </label>
            <div className="asv-field-input">
              <span>Icon</span>
              <IconPicker icons={icons} value={builtinForm.icon} onChange={(ic) => setBuiltinForm({ ...builtinForm, icon: ic })} />
            </div>
            <label className="asv-field-input">
              <span>Message while closed (optional)</span>
              <input type="text" maxLength={300} value={builtinForm.closed_message} onChange={(e) => setBuiltinForm({ ...builtinForm, closed_message: e.target.value })} placeholder="e.g. Back on Monday, 3 November" />
              <small className="asv-hint">Shown on the card and the form when you close the service.</small>
            </label>
            <div className="asv-modal-actions">
              <button type="button" className="asv-btn asv-btn-ghost" onClick={() => setBuiltinForm(null)} disabled={busy}>Cancel</button>
              <button type="submit" className="asv-btn asv-btn-primary" disabled={busy || builtinNameClash}>{busy ? 'Saving…' : 'Save'}</button>
            </div>
          </form>
        </div>,
        document.body
      )}

      {/* ---- Question ---- */}
      {fieldForm && createPortal(
        <div className="asv-overlay" onClick={() => !busy && setFieldForm(null)}>
          <form className="asv-modal" role="dialog" aria-modal="true" aria-labelledby="asv-field-title" onClick={(e) => e.stopPropagation()} onSubmit={saveField}>
            <div className="asv-modal-head">
              <h3 id="asv-field-title">{fieldForm.field_id ? 'Edit question' : 'Add question'}</h3>
              <button type="button" className="asv-icon-btn" onClick={() => setFieldForm(null)} aria-label="Close" disabled={busy}><i className="bi bi-x-lg"></i></button>
            </div>
            {fieldDraft.notice}
            <label className="asv-field-input">
              <span>Question *</span>
              <input type="text" required maxLength={150} value={fieldForm.field_label} onChange={(e) => setFieldForm({ ...fieldForm, field_label: e.target.value })} placeholder="e.g. Purpose of request" autoFocus />
              {!isBuiltin && isAutomatic(fieldForm.field_label) && <small className="asv-hint is-warn">The form already asks for this on its own. You don&apos;t need to add it.</small>}
            </label>
            <div className={isBuiltin ? '' : 'asv-two'}>
              <label className="asv-field-input">
                <span>Answer type</span>
                <select value={fieldForm.field_type} onChange={(e) => setFieldForm({ ...fieldForm, field_type: e.target.value })}>
                  {FIELD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </label>
              {!isBuiltin && (
                <label className="asv-field-input">
                  <span>Step</span>
                  <select value={fieldForm.step_section} onChange={(e) => setFieldForm({ ...fieldForm, step_section: e.target.value })}>
                    {STEPS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>
                </label>
              )}
            </div>
            {HAS_CHOICES.includes(fieldForm.field_type) && (
              <label className="asv-field-input">
                <span>Choices (one per line){fieldForm.field_type === 'checkbox' ? '' : ' *'}</span>
                <textarea rows="4" value={fieldForm.options} onChange={(e) => setFieldForm({ ...fieldForm, options: e.target.value })} placeholder={'e.g.\nEmployment\nScholarship\nMedical'} />
                {fieldForm.field_type === 'checkbox' && <small className="asv-hint">Leave empty for a single &quot;Yes&quot; tick box (for an agreement, for example).</small>}
              </label>
            )}
            {fieldForm.field_type === 'file' && <p className="asv-hint">Residents can upload a JPEG, PNG, WebP image or a PDF, up to 10 MB.</p>}
            <label className="asv-field-input">
              <span>Hint under the question (optional)</span>
              <input type="text" maxLength={300} value={fieldForm.help_text} onChange={(e) => setFieldForm({ ...fieldForm, help_text: e.target.value })} placeholder="e.g. As written on the school ID" />
            </label>
            {hasMode && (
              <label className="asv-field-input">
                <span>Who is asked</span>
                <select value={fieldForm.show_for_target} onChange={(e) => setFieldForm({ ...fieldForm, show_for_target: e.target.value })}>
                  {TARGETS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </label>
            )}
            <label className="asv-check">
              <input type="checkbox" checked={Number(fieldForm.is_required) === 1} onChange={(e) => setFieldForm({ ...fieldForm, is_required: e.target.checked ? 1 : 0 })} />
              <span>Required: the resident can&apos;t submit without answering</span>
            </label>
            <div className="asv-modal-actions">
              <button type="button" className="asv-btn asv-btn-ghost" onClick={() => setFieldForm(null)} disabled={busy}>Cancel</button>
              <button type="submit" className="asv-btn asv-btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save question'}</button>
            </div>
          </form>
        </div>,
        document.body
      )}

      {/* ---- Services page order ---- */}
      {orderList && createPortal(
        <div className="asv-overlay" onClick={() => !busy && setOrderList(null)}>
          <div className="asv-modal" role="dialog" aria-modal="true" aria-labelledby="asv-order-title" onClick={(e) => e.stopPropagation()}>
            <div className="asv-modal-head">
              <h3 id="asv-order-title">Order on the Services page</h3>
              <button type="button" className="asv-icon-btn" onClick={() => setOrderList(null)} aria-label="Close" disabled={busy}><i className="bi bi-x-lg"></i></button>
            </div>
            <p className="asv-hint">Top to bottom, the order residents see. Closed custom services stay hidden until opened.</p>
            <ol className="asv-order">
              {orderList.map((x, i) => (
                <li key={x.ref}>
                  <span className="asv-order-name"><i className={`bi ${x.icon}`} aria-hidden="true"></i> {x.title}<small>{x.note}</small></span>
                  <span className="asv-field-actions">
                    <button type="button" className="asv-icon-btn" onClick={() => moveOrder(i, -1)} disabled={i === 0} aria-label={`Move ${x.title} up`}><i className="bi bi-arrow-up"></i></button>
                    <button type="button" className="asv-icon-btn" onClick={() => moveOrder(i, 1)} disabled={i === orderList.length - 1} aria-label={`Move ${x.title} down`}><i className="bi bi-arrow-down"></i></button>
                  </span>
                </li>
              ))}
            </ol>
            <div className="asv-modal-actions">
              <button type="button" className="asv-btn asv-btn-ghost" onClick={() => setOrderList(null)} disabled={busy}>Cancel</button>
              <button type="button" className="asv-btn asv-btn-primary" onClick={saveOrder} disabled={busy}>{busy ? 'Saving…' : 'Save order'}</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {preview && current && !isBuiltin && createPortal(
        <FormPreview service={current} fieldsByStep={fieldsByStep} onClose={() => setPreview(false)} />,
        document.body
      )}
    </div>
  );
};

// What the resident sees on a custom service's form, step by step.
const FormPreview = ({ service, fieldsByStep, onClose }) => {
  const [mode, setMode] = useState('Self');
  const shown = (f) => f.show_for_target === 'all' || (f.show_for_target === 'myself_only' ? mode === 'Self' : mode === 'Others');
  const control = (f) => {
    const opts = parseOptions(f.field_options);
    switch (f.field_type) {
      case 'textarea': return <textarea rows="2" disabled />;
      case 'select': return <select disabled><option>Select an option</option>{opts.map((o) => <option key={o}>{o}</option>)}</select>;
      case 'radio': case 'checkbox':
        return (
          <div className="asv-pv-choices">
            {(opts.length ? opts : ['Yes']).map((o) => <label key={o}><input type={f.field_type} disabled /> {o}</label>)}
          </div>
        );
      case 'file': return <div className="asv-pv-file"><i className="bi bi-cloud-arrow-up"></i> Choose a file (JPEG, PNG, WebP or PDF)</div>;
      default: return <input type={['number', 'date', 'time'].includes(f.field_type) ? f.field_type : 'text'} disabled />;
    }
  };
  return (
    <div className="asv-overlay" onClick={onClose}>
      <div className="asv-modal asv-modal-wide" role="dialog" aria-modal="true" aria-labelledby="asv-preview-title" onClick={(e) => e.stopPropagation()}>
        <div className="asv-modal-head">
          <h3 id="asv-preview-title">Preview: {service.title}</h3>
          <button type="button" className="asv-icon-btn" onClick={onClose} aria-label="Close"><i className="bi bi-x-lg"></i></button>
        </div>
        {service.allow_third_party ? (
          <div className="asv-chips" role="group" aria-label="Requesting for">
            {[['Self', 'Myself'], ['Others', 'Someone else']].map(([k, l]) => (
              <button key={k} type="button" className={`asv-chip${mode === k ? ' is-active' : ''}`} aria-pressed={mode === k} onClick={() => setMode(k)}>{l}</button>
            ))}
          </div>
        ) : <p className="asv-hint">Residents can request this for themselves only.</p>}
        {service.description && <p className="asv-desc">{service.description}</p>}
        {STEPS.map((s) => {
          const list = fieldsByStep[s.key].filter(shown);
          return (
            <div className="asv-pv-step" key={s.key}>
              <h4>{s.label}</h4>
              <p className="asv-step-auto"><i className="bi bi-magic"></i> {s.key === 'Uploads' && mode === 'Self' ? 'The valid ID from registration is used (no upload).' : s.key === 'Uploads' ? "Upload of the person's valid ID." : s.auto}</p>
              {list.map((f) => (
                <div className="asv-pv-field" key={f.field_id}>
                  <span className="asv-pv-label">{f.field_label}{Number(f.is_required) === 1 ? ' *' : ''}</span>
                  {control(f)}
                  {f.help_text && <small className="asv-hint">{f.help_text}</small>}
                </div>
              ))}
            </div>
          );
        })}
        <p className="asv-hint">{service.fee ? `A fee of ${peso(service.fee)} is collected on the last step.` : 'No fee: the last step has no payment.'}</p>
        <div className="asv-modal-actions">
          <button type="button" className="asv-btn asv-btn-primary" onClick={onClose}>Close preview</button>
        </div>
      </div>
    </div>
  );
};

export default AdminServices;
