import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import IssueMap from '../components/IssueMap';
import Toast from '../components/Toast';
import { useToast } from '../lib/useToast';
import {
  CATEGORY_LOOKUP, DEFAULT_TIERS, ISSUE_CATEGORIES, OPEN_STATUSES, STATUS_STYLE, TIER_COLORS,
  formatIssueDate, tierLegend,
} from '../components/issueMapConfig';
import './IssueMap.css';

const API_BASE = '/api_backend';
const REFRESH_MS = 60000;
const STATUS_FILTERS = [
  { value: 'open', label: 'Open (Reported, Acknowledged, In Progress)' },
  { value: 'Reported', label: 'Reported' },
  { value: 'Acknowledged', label: 'Acknowledged' },
  { value: 'In Progress', label: 'In Progress' },
  { value: 'closed', label: 'Closed (Resolved, Rejected)' },
  { value: 'Merged', label: 'Merged duplicates' },
  { value: 'all', label: 'All' },
];
const MAP_LAYERS = [
  { value: 'flags', label: 'Flags', icon: 'bi-flag-fill' },
  { value: 'heat', label: 'Heatmap', icon: 'bi-fire' },
  { value: 'both', label: 'Both', icon: 'bi-layers-fill' },
];

const StatusBadge = ({ status }) => {
  const s = STATUS_STYLE[status] || STATUS_STYLE.Reported;
  return <span className={`aim-status ${s.cls}`}><i className={`bi ${s.icon}`}></i> {status}</span>;
};

const distanceM = (a, b) => {
  const r = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * r * Math.asin(Math.min(1, Math.sqrt(h))));
};

/**
 * Staff view of the Community Issue Map (backend/api/admin_issue_map.php):
 * every pin with who reported it, status changes with a public remark
 * (reporters are notified), comment moderation, and merging duplicate pins.
 */
const AdminIssueMap = () => {
  const { toast, showToast, confirmToast, closeToast } = useToast();
  const [issues, setIssues] = useState([]);
  const [openIssues, setOpenIssues] = useState([]);
  const [tiers, setTiers] = useState(DEFAULT_TIERS);
  const [statusFilter, setStatusFilter] = useState('open');
  const [category, setCategory] = useState('');
  const [view, setView] = useState('map');
  const [mapLayer, setMapLayer] = useState('flags');
  const [sort, setSort] = useState('reports');
  const [loading, setLoading] = useState(true);

  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [focus, setFocus] = useState(null);
  const [statusForm, setStatusForm] = useState({ status: '', remarks: '' });
  const [mergeForm, setMergeForm] = useState({ open: false, into: '', remarks: '' });
  const [hideTarget, setHideTarget] = useState(null); // { report_id, reason }
  const [busy, setBusy] = useState(false);

  const loadList = useCallback(async () => {
    try {
      const params = { action: 'list', status: statusFilter };
      if (category) params.category = category;
      const [list, open] = await Promise.all([
        axios.get(`${API_BASE}/admin_issue_map.php`, { params }),
        axios.get(`${API_BASE}/admin_issue_map.php`, { params: { action: 'list', status: 'open' } }),
      ]);
      if (list.data.success) {
        setIssues(list.data.issues || []);
        setTiers(list.data.tiers || DEFAULT_TIERS);
      }
      if (open.data.success) setOpenIssues(open.data.issues || []);
    } catch {
      showToast('Error', 'Could not load the issue map.', 'error');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, category, showToast]);

  const loadDetail = useCallback(async (id) => {
    try {
      const { data } = await axios.get(`${API_BASE}/admin_issue_map.php`, { params: { action: 'detail', issue_id: id } });
      if (data.success) {
        setDetail(data.issue);
        setStatusForm({ status: data.issue.allowed_next?.[0] || '', remarks: '' });
      } else {
        showToast('Not found', data.message, 'error');
        setSelectedId(null);
        setDetail(null);
      }
    } catch {
      showToast('Error', 'Could not load this issue.', 'error');
    }
  }, [showToast]);

  useEffect(() => {
    loadList();
    const timer = setInterval(loadList, REFRESH_MS);
    return () => clearInterval(timer);
  }, [loadList]);

  const sorted = useMemo(() => {
    const list = [...issues];
    if (sort === 'newest') list.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    else if (sort === 'oldest') list.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    else if (sort === 'latest') list.sort((a, b) => String(b.last_reported_at).localeCompare(String(a.last_reported_at)));
    else list.sort((a, b) => b.report_count - a.report_count);
    return list;
  }, [issues, sort]);

  const stats = useMemo(() => {
    const s = { open: openIssues.length, Reported: 0, Acknowledged: 0, 'In Progress': 0, reports: 0 };
    openIssues.forEach((i) => { s[i.status] += 1; s.reports += i.report_count; });
    return s;
  }, [openIssues]);

  const select = (issue) => {
    setSelectedId(issue.issue_id);
    setDetail(null);
    setMergeForm({ open: false, into: '', remarks: '' });
    setHideTarget(null);
    setFocus({ lat: issue.lat, lng: issue.lng });
    loadDetail(issue.issue_id);
  };

  const refreshAll = async (id) => {
    await loadList();
    if (id) await loadDetail(id);
  };

  const post = async (payload) => {
    setBusy(true);
    try {
      const { data } = await axios.post(`${API_BASE}/admin_issue_map.php`, payload);
      showToast(data.success ? 'Saved' : 'Not saved', data.message, data.success ? 'success' : 'error');
      return data.success;
    } catch {
      showToast('Error', 'Could not reach the server.', 'error');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const saveStatus = async () => {
    if (!statusForm.status) return;
    if (!statusForm.remarks.trim()) {
      showToast('Remark needed', 'Add a short remark. Residents see it on the map.', 'error');
      return;
    }
    // The remark goes public and every reporter is notified (SMS too when Resolved).
    const n = detail.reports?.length || detail.report_count || 0;
    const ok = await confirmToast(
      `Mark issue #${detail.issue_id} as ${statusForm.status}?`,
      `Your remark is shown on the public map and ${n} reporter${n === 1 ? '' : 's'} will be notified${statusForm.status === 'Resolved' ? ' by email or SMS' : ' by email'}. Notices can't be taken back.`,
      { confirmLabel: `Set ${statusForm.status}`, danger: statusForm.status === 'Rejected' },
    );
    if (!ok) return;
    if (await post({ action: 'status', issue_id: detail.issue_id, status: statusForm.status, remarks: statusForm.remarks.trim() })) {
      await refreshAll(detail.issue_id);
    }
  };

  const saveHide = async () => {
    if (!hideTarget.reason.trim()) {
      showToast('Reason needed', 'Give a reason for hiding this comment.', 'error');
      return;
    }
    if (await post({ action: 'hide', report_id: hideTarget.report_id, reason: hideTarget.reason.trim() })) {
      setHideTarget(null);
      await loadDetail(detail.issue_id);
    }
  };

  const unhide = async (reportId) => {
    if (await post({ action: 'unhide', report_id: reportId })) await loadDetail(detail.issue_id);
  };

  const mergeCandidates = useMemo(() => {
    if (!detail) return [];
    return openIssues
      .filter((i) => i.issue_id !== detail.issue_id)
      .map((i) => ({ ...i, distance: distanceM(detail, i) }))
      .sort((a, b) => (a.category === detail.category ? 0 : 1) - (b.category === detail.category ? 0 : 1) || a.distance - b.distance)
      .slice(0, 30);
  }, [openIssues, detail]);

  const saveMerge = async () => {
    const into = Number(mergeForm.into);
    if (!into) return;
    const ok = await confirmToast(
      `Merge #${detail.issue_id} into #${into}?`,
      'Its reports move to the other issue (one per resident) and this pin leaves the map. Its reporters are emailed where their report now counts. This cannot be undone.',
      { confirmLabel: 'Merge', danger: true },
    );
    if (!ok) return;
    if (await post({ action: 'merge', issue_id: detail.issue_id, into_id: into, remarks: mergeForm.remarks.trim() })) {
      setMergeForm({ open: false, into: '', remarks: '' });
      setSelectedId(into);
      await refreshAll(into);
    }
  };

  const renderDetail = () => {
    if (!detail) return <div className="aim-panel-body aim-muted">Loading…</div>;
    const cat = CATEGORY_LOOKUP[detail.category] || {};
    const open = OPEN_STATUSES.includes(detail.status);
    const color = open ? TIER_COLORS[detail.tier] : '#64748b';
    return (
      <div className="aim-panel-body">
        <div className="aim-panel-head">
          <button type="button" className="aim-link" onClick={() => { setSelectedId(null); setDetail(null); }}><i className="bi bi-x-lg"></i> Close</button>
          <span className="aim-muted">Issue #{detail.issue_id}</span>
        </div>
        <div className="aim-title">
          <span className="aim-flag" style={{ background: color }}>{cat.emoji}</span>
          <div>
            <h3>{cat.label}</h3>
            <StatusBadge status={detail.status} />
          </div>
          <div className="aim-count" style={{ borderColor: color }}><strong>{detail.report_count}</strong><span>reports</span></div>
        </div>

        <dl className="aim-facts">
          {detail.landmark && (<><dt>Landmark</dt><dd>{detail.landmark}</dd></>)}
          <dt>Location</dt>
          <dd>
            <a href={`https://www.google.com/maps?q=${detail.lat},${detail.lng}`} target="_blank" rel="noreferrer">
              {detail.lat.toFixed(6)}, {detail.lng.toFixed(6)} <i className="bi bi-box-arrow-up-right"></i>
            </a>
          </dd>
          <dt>First reported</dt><dd>{formatIssueDate(detail.created_at, true)}</dd>
          <dt>Latest report</dt><dd>{formatIssueDate(detail.last_reported_at, true)}</dd>
          {detail.merged_into && (<><dt>Merged into</dt><dd><button type="button" className="aim-link" onClick={() => select({ issue_id: detail.merged_into, lat: detail.lat, lng: detail.lng })}>#{detail.merged_into}</button></dd></>)}
        </dl>

        {detail.allowed_next?.length > 0 && (
          <div className="aim-box">
            <h4>Update status</h4>
            <div className="aim-row">
              <select value={statusForm.status} onChange={(e) => setStatusForm((f) => ({ ...f, status: e.target.value }))}>
                {detail.allowed_next.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <textarea
              rows={3}
              maxLength={500}
              value={statusForm.remarks}
              placeholder="Public remark, e.g. Reported to Meralco; repair scheduled Oct 14."
              onChange={(e) => setStatusForm((f) => ({ ...f, remarks: e.target.value }))}
            />
            <p className="aim-muted">
              Residents see this remark on the map. Reporters get an email{statusForm.status === 'Resolved' ? ', and a text if they chose SMS' : ''}.
            </p>
            <button type="button" className="aim-btn" onClick={saveStatus} disabled={busy}>{busy ? 'Saving…' : 'Save status'}</button>
          </div>
        )}

        {detail.status !== 'Merged' && (
          <div className="aim-box">
            {!mergeForm.open ? (
              <button type="button" className="aim-link" onClick={() => setMergeForm({ open: true, into: mergeCandidates[0]?.issue_id || '', remarks: '' })}>
                <i className="bi bi-intersect"></i> This is a duplicate, merge it into another issue
              </button>
            ) : (
              <>
                <h4>Merge into</h4>
                <select value={mergeForm.into} onChange={(e) => setMergeForm((f) => ({ ...f, into: e.target.value }))}>
                  {mergeCandidates.length === 0 && <option value="">No other open issues</option>}
                  {mergeCandidates.map((c) => (
                    <option key={c.issue_id} value={c.issue_id}>
                      #{c.issue_id} · {CATEGORY_LOOKUP[c.category]?.label} · {c.report_count} reports · {c.distance} m away{c.landmark ? ` · ${c.landmark}` : ''}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  maxLength={500}
                  value={mergeForm.remarks}
                  placeholder={`Remark (optional), e.g. Same problem as issue #${mergeForm.into || '…'}`}
                  onChange={(e) => setMergeForm((f) => ({ ...f, remarks: e.target.value }))}
                />
                <div className="aim-actions">
                  <button type="button" className="aim-btn is-ghost" onClick={() => setMergeForm({ open: false, into: '', remarks: '' })}>Cancel</button>
                  <button type="button" className="aim-btn is-danger" onClick={saveMerge} disabled={busy || !mergeForm.into}>Merge</button>
                </div>
              </>
            )}
          </div>
        )}

        <h4 className="aim-section-title">Reporters ({detail.reports?.length || 0})</h4>
        <p className="aim-muted">Names are visible only to staff. Residents see these comments without names.</p>
        <ul className="aim-reports">
          {(detail.reports || []).map((r) => (
            <li key={r.report_id} className={r.hidden ? 'is-hidden' : ''}>
              <div className="aim-report-head">
                <div>
                  <strong>{r.name}</strong>{r.is_first && <span className="aim-tag">First to report</span>}
                  <small>{r.control_num} · {r.contact_num}</small>
                </div>
                <small>{formatIssueDate(r.created_at, true)}</small>
              </div>
              <p>{r.comment}</p>
              {r.photo_url && (
                <a href={r.photo_url} target="_blank" rel="noreferrer"><img src={r.photo_url} alt="Reported problem" loading="lazy" /></a>
              )}
              {r.hidden ? (
                <div className="aim-hidden-note">
                  <span><i className="bi bi-eye-slash"></i> Hidden from residents by {r.hidden_by_name || 'staff'}: {r.hidden_reason}</span>
                  <button type="button" className="aim-link" onClick={() => unhide(r.report_id)} disabled={busy}>Show again</button>
                </div>
              ) : hideTarget?.report_id === r.report_id ? (
                <div className="aim-row">
                  <input
                    type="text"
                    maxLength={255}
                    autoFocus
                    value={hideTarget.reason}
                    placeholder="Reason, e.g. offensive language"
                    onChange={(e) => setHideTarget((h) => ({ ...h, reason: e.target.value }))}
                  />
                  <button type="button" className="aim-btn is-small is-danger" onClick={saveHide} disabled={busy}>Hide</button>
                  <button type="button" className="aim-btn is-small is-ghost" onClick={() => setHideTarget(null)}>Cancel</button>
                </div>
              ) : (
                <button type="button" className="aim-link is-muted" onClick={() => setHideTarget({ report_id: r.report_id, reason: '' })}>
                  <i className="bi bi-eye-slash"></i> Hide comment
                </button>
              )}
            </li>
          ))}
          {detail.reports?.length === 0 && <li className="aim-muted">No reports left on this issue.</li>}
        </ul>

        {detail.timeline?.length > 0 && (
          <>
            <h4 className="aim-section-title">History</h4>
            <ul className="aim-timeline">
              {detail.timeline.slice().reverse().map((t, idx) => (
                <li key={idx}>
                  <div><StatusBadge status={t.new_status} /> <small>{t.staff || 'Staff'} · {formatIssueDate(t.created_at, true)}</small></div>
                  <p>{t.remarks}</p>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="aim-container">
      <Toast toast={toast} onClose={closeToast} />

      <div className="aim-header">
        <div>
          <h2><i className="bi bi-flag-fill" style={{ color: '#059669' }}></i> Community Issue Map</h2>
          <p>Problems pinned by residents. More reports mean more residents are affected.</p>
        </div>
        <div className="aim-legend">
          {tierLegend(tiers).map((t) => <span key={t.tier}><i style={{ background: TIER_COLORS[t.tier] }}></i>{t.label}</span>)}
        </div>
      </div>

      <div className="aim-stats">
        <div><strong>{stats.open}</strong><span>Open issues</span></div>
        <div><strong>{stats.Reported}</strong><span>New (Reported)</span></div>
        <div><strong>{stats.Acknowledged}</strong><span>Acknowledged</span></div>
        <div><strong>{stats['In Progress']}</strong><span>In Progress</span></div>
        <div><strong>{stats.reports}</strong><span>Resident reports on open issues</span></div>
      </div>

      <div className="aim-filters">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Status">
          {STATUS_FILTERS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
          <option value="">All categories</option>
          {ISSUE_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.emoji} {c.label}</option>)}
        </select>
        <div className="aim-view-toggle" role="group" aria-label="View">
          <button type="button" className={view === 'map' ? 'is-active' : ''} onClick={() => setView('map')}><i className="bi bi-map"></i> Map</button>
          <button type="button" className={view === 'list' ? 'is-active' : ''} onClick={() => setView('list')}><i className="bi bi-list-ul"></i> List</button>
        </div>
        {view === 'map' && (
          <div className="aim-view-toggle" role="group" aria-label="Map layer">
            {MAP_LAYERS.map((l) => (
              <button key={l.value} type="button" className={mapLayer === l.value ? 'is-active' : ''} aria-pressed={mapLayer === l.value} onClick={() => setMapLayer(l.value)}>
                <i className={`bi ${l.icon}`}></i> {l.label}
              </button>
            ))}
          </div>
        )}
        {view === 'list' && (
          <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
            <option value="reports">Most reported</option>
            <option value="latest">Latest report</option>
            <option value="newest">Newest pin</option>
            <option value="oldest">Oldest pin</option>
          </select>
        )}
      </div>

      <div className={`aim-layout${selectedId ? ' has-panel' : ''}`}>
        <div className="aim-main">
          {view === 'map' ? (
            <>
              <IssueMap issues={issues} selectedId={selectedId} onSelect={select} focus={focus} height={600} layer={mapLayer} tiers={tiers} />
              {mapLayer !== 'flags' && (
                <div className="aim-heat-legend">
                  <span>Fewer reports</span>
                  <i style={{ background: `linear-gradient(90deg, ${TIER_COLORS.yellow}, ${TIER_COLORS.orange}, ${TIER_COLORS.red}, ${TIER_COLORS.purple})` }}></i>
                  <span>More reports</span>
                  <small>
                    Shows where reports are concentrated for the status and category selected above. Each pin counts by its number of reports.
                    {mapLayer === 'heat' && ' Switch to Flags or Both to open an issue.'}
                  </small>
                </div>
              )}
            </>
          ) : (
            <div className="aim-table-wrap">
              <table className="aim-table">
                <thead>
                  <tr><th>#</th><th>Issue</th><th>Reports</th><th>Status</th><th>First reported</th><th>Latest report</th></tr>
                </thead>
                <tbody>
                  {sorted.map((i) => (
                    <tr key={i.issue_id} className={i.issue_id === selectedId ? 'is-selected' : ''} onClick={() => select(i)}>
                      <td>{i.issue_id}</td>
                      <td>
                        <div className="aim-issue-cell">
                          <span className="aim-flag is-small" style={{ background: OPEN_STATUSES.includes(i.status) ? TIER_COLORS[i.tier] : '#64748b' }}>{CATEGORY_LOOKUP[i.category]?.emoji}</span>
                          <span className="aim-cell-text">
                            <strong>{CATEGORY_LOOKUP[i.category]?.label}</strong>
                            {i.landmark && <small>{i.landmark}</small>}
                          </span>
                        </div>
                      </td>
                      <td><strong>{i.report_count}</strong>{i.photo_count > 0 && <small> · {i.photo_count} <i className="bi bi-image"></i></small>}{i.hidden_count > 0 && <small> · {i.hidden_count} hidden</small>}</td>
                      <td><StatusBadge status={i.status} /></td>
                      <td>{formatIssueDate(i.created_at)}</td>
                      <td>{formatIssueDate(i.last_reported_at)}</td>
                    </tr>
                  ))}
                  {!loading && sorted.length === 0 && (
                    <tr><td colSpan={6} className="aim-muted aim-empty">No issues match these filters.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
        {selectedId && <aside className="aim-panel">{renderDetail()}</aside>}
      </div>
    </div>
  );
};

export default AdminIssueMap;
