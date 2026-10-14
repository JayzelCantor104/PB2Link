import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import './Profiling.css';
import Toast from '../components/Toast';
import { useToast } from '../lib/useToast';
import ResidentProfile from './ResidentProfile';
import {
  API_BASE, RESIDENCY_STATUSES, SECTORS, STATUS_CLASS, STATUS_LABEL, STATUS_VIEWS, ageGroup, fileUrl, fmtDate,
  fullAddress, initials, verificationChecks,
} from './residentConfig';

// Residents: every record, the registrations waiting for staff, and each
// resident's full profile (ResidentProfile.jsx). Data: admin_residents.php.
// Deep links: ?view=Pending (the review queue), ?open=<resident_id>.

const PAGE_SIZE = 25;
const EMPTY_FILTERS = { subdivision: '', street: '', sector: '', age: '', gender: '', residency: '', attention: '' };
const ATTENTION = [
  { value: 'id', label: 'ID scan not matched', test: (r) => r.id_verification_status !== 'Matched' },
  { value: 'selfie', label: 'Selfie needs review', test: (r) => r.selfie_check_status === 'Needs Review' },
  { value: 'philsys', label: 'PhilSys mismatch', test: (r) => r.philsys_verification_status === 'Mismatch' },
  { value: 'mobile', label: 'Mobile not verified', test: (r) => r.contact_num && !r.mobile_verified },
  { value: 'proof', label: 'Residency proof to check', test: (r) => r.proof_status === 'Pending' },
  { value: 'changes', label: 'Profile changes waiting', test: (r) => r.pending_changes > 0 },
  { value: 'resubmitted', label: 'Sent back by the resident', test: (r) => r.status === 'Pending' && !!r.resubmitted_at },
  { value: 'minor', label: 'Under 18 (guardian documents)', test: (r) => r.age !== null && r.age < 18 },
];
const SORTS = [
  { value: 'newest', label: 'Newest registered' },
  { value: 'oldest', label: 'Oldest registered' },
  { value: 'name', label: 'Name A–Z' },
  { value: 'name_desc', label: 'Name Z–A' },
];

const Avatar = ({ r }) => {
  const [broken, setBroken] = useState(false);
  return (
    <span className="pf-avatar">
      {r.profile_picture && !broken ? <img src={fileUrl(r.profile_picture)} alt="" loading="lazy" onError={() => setBroken(true)} /> : initials(r)}
    </span>
  );
};

const CheckIcons = ({ r }) => (
  <span className="pf-checks">
    {verificationChecks(r).filter((c) => c.tone !== 'none').map((c) => (
      <i
        key={c.key}
        className={`bi ${c.tone === 'ok' ? 'bi-check-circle-fill' : c.tone === 'bad' ? 'bi-x-circle-fill' : 'bi-dash-circle-fill'} is-${c.tone}`}
        title={`${c.label}: ${c.status}`}
        aria-label={`${c.label}: ${c.status}`}
      ></i>
    ))}
  </span>
);

const Profiling = () => {
  const { toast, showToast, closeToast } = useToast();
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState([]);
  const [counts, setCounts] = useState({});
  const [isSuper, setIsSuper] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  // The review queue reads oldest first: first come, first served.
  const [sort, setSort] = useState(() => (params.get('view') === 'Pending' ? 'oldest' : 'newest'));
  const [page, setPage] = useState(1);

  const view = STATUS_VIEWS.some((v) => v.key === params.get('view')) ? params.get('view') : 'all';
  const openId = Number(params.get('open')) || null;

  const setParam = (key, value) => {
    const next = new URLSearchParams(params);
    if (value === null || value === '' || value === 'all') next.delete(key); else next.set(key, value);
    setParams(next, { replace: true });
  };

  const load = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE}/admin_residents.php`, { params: { action: 'list' } });
      if (!res.data.success) throw new Error(res.data.message);
      setRows(res.data.residents);
      setCounts(res.data.counts || {});
      setIsSuper(!!res.data.is_super);
      setLoadError('');
    } catch {
      setLoadError('The resident list could not be loaded. Check the connection and try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [view, search, filters, sort]);

  const subdivisions = useMemo(() => [...new Set(rows.map((r) => r.subdivision).filter(Boolean))].sort(), [rows]);
  const streets = useMemo(() => [...new Set(rows.filter((r) => !filters.subdivision || r.subdivision === filters.subdivision)
    .map((r) => r.street).filter(Boolean))].sort(), [rows, filters.subdivision]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const digits = q.replace(/\D/g, '');
    const attention = ATTENTION.find((a) => a.value === filters.attention);
    const list = rows.filter((r) => {
      if (view !== 'all' && r.status !== view) return false;
      if (q) {
        const hay = `${r.full_name} ${r.lName}, ${r.fName} ${r.control_num} ${r.email || ''}`.toLowerCase();
        const phoneHit = digits.length >= 4 && (r.contact_num || '').includes(digits);
        if (!hay.includes(q) && !phoneHit) return false;
      }
      if (filters.subdivision && r.subdivision !== filters.subdivision) return false;
      if (filters.street && r.street !== filters.street) return false;
      if (filters.sector && Number(r[filters.sector]) !== 1) return false;
      if (filters.age && ageGroup(r.age) !== filters.age) return false;
      if (filters.gender && r.gender !== filters.gender) return false;
      if (filters.residency && r.residency_status !== filters.residency) return false;
      if (attention && !attention.test(r)) return false;
      return true;
    });
    const byName = (a, b) => `${a.lName} ${a.fName}`.localeCompare(`${b.lName} ${b.fName}`);
    list.sort((a, b) => {
      if (sort === 'name') return byName(a, b);
      if (sort === 'name_desc') return byName(b, a);
      const d = String(a.date_registered).localeCompare(String(b.date_registered));
      return sort === 'oldest' ? d : -d;
    });
    return list;
  }, [rows, view, search, filters, sort]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const shown = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const total = rows.length;

  const activeChips = [
    filters.subdivision && { key: 'subdivision', label: filters.subdivision },
    filters.street && { key: 'street', label: filters.street },
    filters.sector && { key: 'sector', label: SECTORS.find((s) => s.key === filters.sector)?.label },
    filters.age && { key: 'age', label: { minor: 'Under 18', adult: '18–59', senior: '60 and over' }[filters.age] },
    filters.gender && { key: 'gender', label: filters.gender },
    filters.residency && { key: 'residency', label: filters.residency },
    filters.attention && { key: 'attention', label: ATTENTION.find((a) => a.value === filters.attention)?.label },
  ].filter(Boolean);

  const setFilter = (key, value) => setFilters((f) => ({ ...f, [key]: value, ...(key === 'subdivision' ? { street: '' } : {}) }));
  const clearAll = () => { setFilters(EMPTY_FILTERS); setSearch(''); };

  const exportCsv = () => {
    const status = view === 'all' ? 'all' : view;
    window.location.href = `${API_BASE}/admin_residents.php?action=export&status=${encodeURIComponent(status)}`;
  };

  const open = (id) => setParam('open', id ? String(id) : null);

  return (
    <div className="pf-page">
      <Toast toast={toast} onClose={closeToast} />

      <div className="pf-head">
        <div>
          <h2>Residents</h2>
          <p>Every resident record in one place: review new registrations, check IDs, and keep details up to date.</p>
        </div>
        <div className="pf-head-actions">
          <button type="button" className="pf-btn pf-btn-ghost" onClick={() => { setLoading(true); load(); }} title="Reload the list">
            <i className="bi bi-arrow-clockwise"></i> Refresh
          </button>
          {isSuper && (
            <button type="button" className="pf-btn pf-btn-ghost" onClick={exportCsv} title="Super Admin only. The export is recorded in the audit log.">
              <i className="bi bi-download"></i> Export CSV
            </button>
          )}
        </div>
      </div>

      <div className="pf-views" role="tablist" aria-label="Account status">
        {STATUS_VIEWS.map((v) => {
          const n = v.key === 'all' ? total : (counts[v.key] || 0);
          return (
            <button
              key={v.key}
              type="button"
              role="tab"
              aria-selected={view === v.key}
              className={`pf-view${view === v.key ? ' is-active' : ''}${v.key === 'Pending' && n > 0 ? ' is-alert' : ''}`}
              onClick={() => { setParam('view', v.key); if (v.key === 'Pending') setSort('oldest'); }}
            >
              <i className={`bi ${v.icon}`}></i>
              <span>{v.label}</span>
              <b>{n}</b>
            </button>
          );
        })}
      </div>

      <div className="pf-toolbar">
        <div className="pf-search">
          <i className="bi bi-search"></i>
          <input type="search" placeholder="Search name, control no., email or mobile" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search residents" />
        </div>
        <button type="button" className={`pf-btn pf-btn-ghost${showFilters || activeChips.length ? ' is-on' : ''}`} onClick={() => setShowFilters((s) => !s)} aria-expanded={showFilters}>
          <i className="bi bi-funnel"></i> Filters{activeChips.length ? ` (${activeChips.length})` : ''}
        </button>
        <select className="pf-select" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
          {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>

      {showFilters && (
        <div className="pf-filters">
          <label><span>Subdivision</span>
            <select value={filters.subdivision} onChange={(e) => setFilter('subdivision', e.target.value)}>
              <option value="">Any</option>
              {subdivisions.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label><span>Street</span>
            <select value={filters.street} onChange={(e) => setFilter('street', e.target.value)}>
              <option value="">Any</option>
              {streets.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label><span>Sector</span>
            <select value={filters.sector} onChange={(e) => setFilter('sector', e.target.value)}>
              <option value="">Any</option>
              {SECTORS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </label>
          <label><span>Age</span>
            <select value={filters.age} onChange={(e) => setFilter('age', e.target.value)}>
              <option value="">Any</option>
              <option value="minor">Under 18</option>
              <option value="adult">18–59</option>
              <option value="senior">60 and over</option>
            </select>
          </label>
          <label><span>Sex</span>
            <select value={filters.gender} onChange={(e) => setFilter('gender', e.target.value)}>
              <option value="">Any</option>
              <option>Male</option><option>Female</option><option>Other</option>
            </select>
          </label>
          <label><span>Residency</span>
            <select value={filters.residency} onChange={(e) => setFilter('residency', e.target.value)}>
              <option value="">Any</option>
              {RESIDENCY_STATUSES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
          <label><span>Needs attention</span>
            <select value={filters.attention} onChange={(e) => setFilter('attention', e.target.value)}>
              <option value="">Anything</option>
              {ATTENTION.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
            </select>
          </label>
        </div>
      )}

      {(activeChips.length > 0 || search) && (
        <div className="pf-chips">
          {search && <button type="button" className="pf-chip" onClick={() => setSearch('')}>“{search}” <i className="bi bi-x"></i></button>}
          {activeChips.map((c) => (
            <button key={c.key} type="button" className="pf-chip" onClick={() => setFilter(c.key, '')}>{c.label} <i className="bi bi-x"></i></button>
          ))}
          <button type="button" className="pf-link" onClick={clearAll}>Clear all</button>
        </div>
      )}

      <div className="pf-summary">
        {loading ? 'Loading…' : `${filtered.length} of ${total} resident${total === 1 ? '' : 's'}`}
        {view === 'Pending' && sort === 'oldest' && !loading && filtered.length > 0 && <span> · oldest registrations first</span>}
      </div>

      {loadError && (
        <div className="pf-empty is-error">
          <i className="bi bi-wifi-off"></i>
          <p>{loadError}</p>
          <button type="button" className="pf-btn pf-btn-ghost" onClick={() => { setLoading(true); load(); }}>Try again</button>
        </div>
      )}

      {!loading && !loadError && filtered.length === 0 && (
        <div className="pf-empty">
          <i className={`bi ${view === 'Pending' ? 'bi-check2-circle' : 'bi-search'}`}></i>
          <p>
            {view === 'Pending' && !search && !activeChips.length
              ? 'No registrations are waiting for review.'
              : 'No resident matches the search and filters.'}
          </p>
          {(search || activeChips.length > 0) && <button type="button" className="pf-btn pf-btn-ghost" onClick={clearAll}>Clear search and filters</button>}
        </div>
      )}

      {/* The review queue as cards: what to decide, and why. */}
      {view === 'Pending' && shown.length > 0 && (
        <div className="pf-review-list">
          {shown.map((r) => (
            <article key={r.resident_id} className="pf-review">
              <div className="pf-review-who">
                <Avatar r={r} />
                <div>
                  <h3>{r.full_name}</h3>
                  <p>{r.control_num} · registered {fmtDate(r.date_registered, true)}</p>
                  <p className="pf-muted">{fullAddress(r) || 'No address'} · {r.age ?? '?'} yrs · {r.gender}</p>
                </div>
              </div>
              <div className="pf-review-checks">
                {verificationChecks(r).filter((c) => c.tone !== 'none').map((c) => (
                  <span key={c.key} className={`pf-pill is-${c.tone}`}>{c.label}: {c.status}</span>
                ))}
                {r.proof_status && <span className={`pf-pill is-${r.proof_status === 'Verified' ? 'ok' : r.proof_status === 'Rejected' ? 'bad' : 'warn'}`}>Residency proof: {r.proof_status}</span>}
                {r.age !== null && r.age < 18 && (
                  <span className={`pf-pill is-${r.guardian_status === 'Verified' ? 'ok' : r.guardian_status ? 'warn' : 'bad'}`}>
                    Under 18: {r.guardian_status ? `guardian documents ${r.guardian_status.toLowerCase()}` : 'no guardian documents'}
                  </span>
                )}
                {r.resubmitted_at && <span className="pf-pill is-info"><i className="bi bi-arrow-repeat"></i> Sent back by the resident ({r.resubmit_count}×)</span>}
              </div>
              {r.review_reasons.length > 0 ? (
                <ul className="pf-review-reasons">
                  {r.review_reasons.slice(0, 3).map((x) => <li key={x}>{x}</li>)}
                  {r.review_reasons.length > 3 && <li className="pf-muted">and {r.review_reasons.length - 3} more…</li>}
                </ul>
              ) : <p className="pf-muted pf-review-ok">No automatic check flagged this registration.</p>}
              <div className="pf-review-actions">
                <button type="button" className="pf-btn pf-btn-primary" onClick={() => open(r.resident_id)}>
                  <i className="bi bi-person-check"></i> Review and decide
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {view !== 'Pending' && shown.length > 0 && (
        <div className="pf-table-card">
          <table className="pf-table">
            <thead>
              <tr>
                <th>Resident</th>
                <th>Address</th>
                <th>Age / Sex</th>
                <th>Sectors</th>
                <th>Checks</th>
                <th>Status</th>
                <th><span className="pf-sr">Open</span></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.resident_id} onClick={() => open(r.resident_id)} className="pf-row" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') open(r.resident_id); }}>
                  <td data-label="Resident">
                    <div className="pf-who">
                      <Avatar r={r} />
                      <div>
                        <strong>{r.full_name}</strong>
                        <small>{r.control_num}</small>
                      </div>
                    </div>
                  </td>
                  <td data-label="Address" className="pf-addr" title={fullAddress(r)}>{fullAddress(r) || <span className="pf-muted">None</span>}</td>
                  <td data-label="Age / Sex">{r.age ?? '?'} · {r.gender ? r.gender[0] : '?'}</td>
                  <td data-label="Sectors">
                    <span className="pf-sectors">
                      {SECTORS.filter((s) => Number(r[s.key]) === 1).map((s) => <span key={s.key} className="pf-tag">{s.short}</span>)}
                      {SECTORS.every((s) => Number(r[s.key]) !== 1) && <span className="pf-muted">None</span>}
                    </span>
                  </td>
                  <td data-label="Checks">
                    <CheckIcons r={r} />
                    {r.pending_changes > 0 && <span className="pf-tag is-info" title="Profile changes waiting for approval">{r.pending_changes} change{r.pending_changes > 1 ? 's' : ''}</span>}
                  </td>
                  <td data-label="Status">
                    <span className={`pf-status ${STATUS_CLASS[r.status] || ''}`}>{STATUS_LABEL[r.status] || r.status}</span>
                    {r.status === 'Action Required' && (
                      <small className="pf-status-note">{r.fix_items?.length ? 'Fixing online' : 'Visit the hall'}</small>
                    )}
                  </td>
                  <td className="pf-open"><i className="bi bi-chevron-right" aria-hidden="true"></i></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <nav className="pf-pager" aria-label="Pages">
          <button type="button" className="pf-btn pf-btn-ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><i className="bi bi-chevron-left"></i> Previous</button>
          <span>Page {page} of {pages}</span>
          <button type="button" className="pf-btn pf-btn-ghost" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next <i className="bi bi-chevron-right"></i></button>
        </nav>
      )}

      {view !== 'Pending' && shown.length > 0 && (
        <p className="pf-legend">
          Checks: <i className="bi bi-check-circle-fill is-ok"></i> passed · <i className="bi bi-dash-circle-fill is-warn"></i> not checked or typed in ·{' '}
          <i className="bi bi-x-circle-fill is-bad"></i> didn't match. Hover an icon for ID scan, selfie, PhilSys and mobile.
        </p>
      )}

      {openId && (
        <ResidentProfile
          key={openId}
          residentId={openId}
          isSuper={isSuper}
          notify={showToast}
          onClose={() => open(null)}
          onChanged={load}
          onOpenResident={(id) => open(id)}
        />
      )}
    </div>
  );
};

export default Profiling;
