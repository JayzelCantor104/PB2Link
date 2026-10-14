import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import Toast from '../components/Toast';
import { useToast } from '../lib/useToast';
import { setAddressOptions } from '../lib/addressOptions';
import './AddressList.css';

// Street and subdivision pick lists behind the address fields (migration 026,
// address_options.php). Seeded from OpenStreetMap; residents' typed-in names
// arrive as suggestions. Entries are hidden, never deleted.

const API_BASE = '/api_backend';
const KINDS = [
  { value: 'subdivision', label: 'Subdivision' },
  { value: 'village', label: 'Village' },
  { value: 'compound', label: 'Compound' },
  { value: 'area', label: 'Area / Purok' },
];
const SOURCE_LABEL = { osm: 'OpenStreetMap', staff: 'Staff', resident: 'Resident' };
const EMPTY_SUB = { id: 0, name: '', kind: 'subdivision', is_active: 1 };
const EMPTY_STREET = { id: 0, name: '', subdivision_id: '', is_active: 1 };

const formatDate = (value) => {
  if (!value) return '';
  const d = new Date(String(value).replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
};

const AddressList = () => {
  const { toast, showToast, closeToast } = useToast();
  const [data, setData] = useState({ subdivisions: [], streets: [], suggestions: [] });
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('suggestions');
  const [search, setSearch] = useState('');
  const [subFilter, setSubFilter] = useState('all');
  const [showHidden, setShowHidden] = useState(false);
  const [form, setForm] = useState(null); // { type: 'subdivision'|'street', ...fields, suggestion_id? }
  const [saving, setSaving] = useState(false);

  const apply = useCallback((json) => {
    const next = { subdivisions: json.subdivisions || [], streets: json.streets || [], suggestions: json.suggestions || [] };
    setData(next);
    setAddressOptions(next); // open address fields pick up the change
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE}/address_options.php`, { params: { all: 1 } });
      if (res.data.success) apply(res.data);
      else showToast('Error', res.data.message || 'Could not load the address list.', 'error');
    } catch {
      showToast('Error', 'Could not load the address list.', 'error');
    } finally {
      setLoading(false);
    }
  }, [apply, showToast]);

  useEffect(() => { load(); }, [load]);

  // Start on the lists once there is nothing to review.
  useEffect(() => {
    if (!loading && data.suggestions.length === 0) setTab((t) => (t === 'suggestions' ? 'subdivisions' : t));
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

  const post = async (action, body, okTitle = 'Saved') => {
    setSaving(true);
    try {
      const res = await axios.post(`${API_BASE}/address_options.php?action=${action}`, body);
      if (!res.data.success) {
        showToast('Not saved', res.data.message || 'Please try again.', 'error');
        return false;
      }
      apply(res.data);
      showToast(okTitle, res.data.message, 'success');
      return true;
    } catch {
      showToast('Error', 'The server could not be reached.', 'error');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const subById = useMemo(() => new Map(data.subdivisions.map((s) => [s.id, s])), [data.subdivisions]);
  const streetCount = useMemo(() => {
    const m = new Map();
    data.streets.forEach((s) => { if (s.subdivision_id) m.set(s.subdivision_id, (m.get(s.subdivision_id) || 0) + 1); });
    return m;
  }, [data.streets]);

  const q = search.trim().toUpperCase();
  const subdivisions = data.subdivisions.filter((s) => (showHidden || s.is_active) && (!q || s.name.includes(q)));
  const streets = data.streets.filter((s) => {
    if (!showHidden && !s.is_active) return false;
    if (q && !s.name.includes(q)) return false;
    if (subFilter === 'none') return !s.subdivision_id;
    if (subFilter !== 'all') return s.subdivision_id === Number(subFilter);
    return true;
  });
  const activeSubs = data.subdivisions.filter((s) => s.is_active);

  const openForm = (type, row = null, extra = {}) => {
    if (type === 'subdivision') setForm({ type, ...EMPTY_SUB, ...(row || {}), ...extra });
    else setForm({ type, ...EMPTY_STREET, ...(row || {}), subdivision_id: row?.subdivision_id ?? (extra.subdivision_id ?? ''), ...extra });
  };

  const saveForm = async (e) => {
    e.preventDefault();
    const body = {
      id: form.id || 0,
      name: form.name,
      is_active: form.is_active ? 1 : 0,
      ...(form.suggestion_id ? { suggestion_id: form.suggestion_id } : {}),
    };
    if (form.type === 'subdivision') body.kind = form.kind;
    else body.subdivision_id = form.subdivision_id === '' ? null : Number(form.subdivision_id);
    if (await post(form.type === 'subdivision' ? 'save_subdivision' : 'save_street', body)) setForm(null);
  };

  const toggleHidden = (type, row) => post(type === 'subdivision' ? 'save_subdivision' : 'save_street', {
    ...row,
    subdivision_id: row.subdivision_id ?? null,
    is_active: row.is_active ? 0 : 1,
  }, row.is_active ? 'Hidden' : 'Shown again');

  // "Edit, then add": open the matching form pre-filled from the suggestion.
  const editSuggestion = (s) => {
    if (s.kind === 'subdivision') {
      setTab('subdivisions');
      openForm('subdivision', null, { name: s.name, suggestion_id: s.id });
    } else {
      const sub = data.subdivisions.find((d) => d.name === s.subdivision_name);
      setTab('streets');
      openForm('street', null, { name: s.name, subdivision_id: sub ? sub.id : '', suggestion_id: s.id });
    }
  };

  const tabs = [
    { key: 'suggestions', label: 'To review', icon: 'bi-inbox', count: data.suggestions.length },
    { key: 'subdivisions', label: 'Subdivisions', icon: 'bi-houses', count: data.subdivisions.filter((s) => s.is_active).length },
    { key: 'streets', label: 'Streets', icon: 'bi-signpost-split', count: data.streets.filter((s) => s.is_active).length },
  ];

  return (
    <div className="al-page">
      <Toast toast={toast} onClose={closeToast} />

      <div className="al-intro">
        <div>
          <h2>Address List</h2>
          <p>
            These names fill the Subdivision and Street dropdowns on registration, Edit Profile and every request form.
            Residents can still type a name that isn't listed; it appears under <strong>To review</strong> so you can add it.
          </p>
        </div>
        <div className="al-intro-actions">
          <button type="button" className="al-btn al-btn-ghost" onClick={() => { setTab('subdivisions'); openForm('subdivision'); }}>
            <i className="bi bi-plus-lg"></i> Subdivision
          </button>
          <button type="button" className="al-btn al-btn-primary" onClick={() => { setTab('streets'); openForm('street', null, { subdivision_id: subFilter !== 'all' && subFilter !== 'none' ? Number(subFilter) : '' }); }}>
            <i className="bi bi-plus-lg"></i> Street
          </button>
        </div>
      </div>

      <div className="al-tabs" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            className={`al-tab${tab === t.key ? ' is-active' : ''}`}
            onClick={() => { setTab(t.key); setSearch(''); }}
          >
            <i className={`bi ${t.icon}`}></i> {t.label}
            <span className={`al-count${t.key === 'suggestions' && t.count ? ' is-alert' : ''}`}>{t.count}</span>
          </button>
        ))}
      </div>

      {form && (
        <form className="al-form" onSubmit={saveForm}>
          <div className="al-form-head">
            <strong>
              {form.id ? 'Edit' : 'Add'} {form.type === 'subdivision' ? 'subdivision' : 'street'}
              {form.suggestion_id ? ' from a resident’s entry' : ''}
            </strong>
            <button type="button" className="al-icon-btn" onClick={() => setForm(null)} aria-label="Close"><i className="bi bi-x-lg"></i></button>
          </div>
          <div className="al-form-grid">
            <label className="al-field al-field-wide">
              <span>Name</span>
              <input
                type="text"
                value={form.name}
                maxLength={150}
                required
                autoFocus
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder={form.type === 'subdivision' ? 'e.g. MOLINO HOMES 2' : 'e.g. SAMPAGUITA STREET'}
              />
            </label>
            {form.type === 'subdivision' ? (
              <label className="al-field">
                <span>Type</span>
                <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                  {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                </select>
              </label>
            ) : (
              <label className="al-field">
                <span>Subdivision</span>
                <select value={form.subdivision_id ?? ''} onChange={(e) => setForm({ ...form, subdivision_id: e.target.value })}>
                  <option value="">Not assigned (shown for every subdivision)</option>
                  {activeSubs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
            )}
            <label className="al-check">
              <input type="checkbox" checked={!!form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked ? 1 : 0 })} />
              Show in the dropdown
            </label>
          </div>
          <div className="al-form-actions">
            <button type="button" className="al-btn al-btn-ghost" onClick={() => setForm(null)}>Cancel</button>
            <button type="submit" className="al-btn al-btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      )}

      <div className="al-panel">
        {tab !== 'suggestions' && (
          <div className="al-toolbar">
            <div className="al-search">
              <i className="bi bi-search"></i>
              <input type="text" placeholder={`Search ${tab}`} value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            {tab === 'streets' && (
              <select className="al-select" value={subFilter} onChange={(e) => setSubFilter(e.target.value)} aria-label="Filter by subdivision">
                <option value="all">All subdivisions</option>
                <option value="none">Not assigned to a subdivision</option>
                {activeSubs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}
            <label className="al-check">
              <input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} /> Show hidden
            </label>
          </div>
        )}

        {loading ? (
          <div className="al-empty"><i className="bi bi-arrow-repeat"></i> Loading…</div>
        ) : tab === 'suggestions' ? (
          data.suggestions.length === 0 ? (
            <div className="al-empty"><i className="bi bi-check2-circle"></i> Nothing to review. Names residents type that aren't on the list will show here.</div>
          ) : (
            <div className="al-table-wrap">
              <table className="al-table">
                <thead>
                  <tr><th>Typed by residents</th><th>Type</th><th>Their subdivision</th><th>Times</th><th>Last seen</th><th></th></tr>
                </thead>
                <tbody>
                  {data.suggestions.map((s) => (
                    <tr key={s.id}>
                      <td className="al-name">{s.name}</td>
                      <td>{s.kind === 'street' ? 'Street' : 'Subdivision'}</td>
                      <td>{s.kind === 'street' ? (s.subdivision_name || <span className="al-muted">None given</span>) : <span className="al-muted">-</span>}</td>
                      <td>{s.times_seen}</td>
                      <td>{formatDate(s.last_seen)}</td>
                      <td className="al-actions">
                        <button type="button" className="al-btn al-btn-primary al-btn-sm" disabled={saving} onClick={() => post('add_suggestion', { id: s.id }, 'Added')}>
                          <i className="bi bi-plus-lg"></i> Add
                        </button>
                        <button type="button" className="al-btn al-btn-ghost al-btn-sm" disabled={saving} onClick={() => editSuggestion(s)} title="Fix the spelling or subdivision first">
                          <i className="bi bi-pencil"></i> Edit, then add
                        </button>
                        <button type="button" className="al-btn al-btn-ghost al-btn-sm" disabled={saving} onClick={() => post('dismiss_suggestion', { id: s.id }, 'Dismissed')}>
                          Dismiss
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : tab === 'subdivisions' ? (
          subdivisions.length === 0 ? (
            <div className="al-empty">No subdivision matches.</div>
          ) : (
            <div className="al-table-wrap">
              <table className="al-table">
                <thead><tr><th>Name</th><th>Type</th><th>Streets</th><th>Source</th><th></th></tr></thead>
                <tbody>
                  {subdivisions.map((s) => (
                    <tr key={s.id} className={s.is_active ? '' : 'is-hidden'}>
                      <td className="al-name">{s.name}{!s.is_active && <span className="al-tag">Hidden</span>}</td>
                      <td>{KINDS.find((k) => k.value === s.kind)?.label || s.kind}</td>
                      <td>
                        <button type="button" className="al-link" onClick={() => { setTab('streets'); setSubFilter(String(s.id)); setSearch(''); }}>
                          {streetCount.get(s.id) || 0}
                        </button>
                      </td>
                      <td className="al-muted">{SOURCE_LABEL[s.source] || s.source}</td>
                      <td className="al-actions">
                        <button type="button" className="al-btn al-btn-ghost al-btn-sm" onClick={() => openForm('subdivision', s)}><i className="bi bi-pencil"></i> Edit</button>
                        <button type="button" className="al-btn al-btn-ghost al-btn-sm" disabled={saving} onClick={() => toggleHidden('subdivision', s)}>
                          <i className={`bi ${s.is_active ? 'bi-eye-slash' : 'bi-eye'}`}></i> {s.is_active ? 'Hide' : 'Show'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : streets.length === 0 ? (
          <div className="al-empty">No street matches.</div>
        ) : (
          <div className="al-table-wrap">
            <table className="al-table">
              <thead><tr><th>Name</th><th>Subdivision</th><th>Source</th><th></th></tr></thead>
              <tbody>
                {streets.map((s) => (
                  <tr key={s.id} className={s.is_active ? '' : 'is-hidden'}>
                    <td className="al-name">{s.name}{!s.is_active && <span className="al-tag">Hidden</span>}</td>
                    <td>{s.subdivision_id ? (subById.get(s.subdivision_id)?.name || '-') : <span className="al-muted">Not assigned</span>}</td>
                    <td className="al-muted">{SOURCE_LABEL[s.source] || s.source}</td>
                    <td className="al-actions">
                      <button type="button" className="al-btn al-btn-ghost al-btn-sm" onClick={() => openForm('street', s)}><i className="bi bi-pencil"></i> Edit</button>
                      <button type="button" className="al-btn al-btn-ghost al-btn-sm" disabled={saving} onClick={() => toggleHidden('street', s)}>
                        <i className={`bi ${s.is_active ? 'bi-eye-slash' : 'bi-eye'}`}></i> {s.is_active ? 'Hide' : 'Show'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="al-credit">
        The starting list of names comes from{' '}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors</a>{' '}
        (ODbL), cleaned up for Pasong Buaya II. Hidden names stay on old records but no longer appear in the dropdowns.
      </p>
    </div>
  );
};

export default AddressList;
