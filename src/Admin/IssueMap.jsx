import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Link, useSearchParams } from 'react-router-dom';
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
  { value: 'attention', label: 'Posts to check (new, waiting to be posted, reported by residents)' },
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

// Reasons staff pick when taking a post down (the resident is emailed it).
const REMOVE_REASONS = [
  'Offensive or insulting language',
  'Names or accuses a person',
  'Shares private information',
  'False report: the problem was not found',
  'Not a community issue (use Report Incident for private complaints)',
];
const SUSPEND_CHOICES = [
  { value: '', label: "Don't pause posting" },
  { value: '7', label: 'Pause posting for 7 days' },
  { value: '30', label: 'Pause posting for 30 days' },
  { value: 'permanent', label: 'Pause posting until lifted' },
];
const untilText = (endsAt) => (endsAt ? `until ${formatIssueDate(endsAt, true)}` : 'until lifted');
const tellLayout = () => window.dispatchEvent(new Event('pb2-issue-counts'));

/** A reporter's record on the map, so staff can see repeat problems. */
const ConductLine = ({ c }) => {
  if (!c) return null;
  const parts = [];
  if (c.removed) parts.push(`${c.removed} removed`);
  if (c.hidden) parts.push(`${c.hidden} hidden`);
  if (c.rejected_pins) parts.push(`${c.rejected_pins} rejected pin${c.rejected_pins === 1 ? '' : 's'}`);
  if (c.flagged) parts.push(`${c.flagged} reported by residents`);
  if (c.suspensions?.length) parts.push(`${c.suspensions.length} pause${c.suspensions.length === 1 ? '' : 's'}`);
  if (!parts.length && !c.active_suspension) return null;
  return (
    <div className={`aim-conduct${c.repeat ? ' is-repeat' : ''}`}>
      <i className={`bi ${c.repeat ? 'bi-exclamation-octagon-fill' : 'bi-info-circle'}`} aria-hidden="true"></i>
      <span>
        {c.active_suspension && <strong>Posting paused {untilText(c.active_suspension.ends_at)}. </strong>}
        {parts.length > 0 && <>Record on the map: {parts.join(', ')} (of {c.reports} post{c.reports === 1 ? '' : 's'}).</>}
      </span>
    </div>
  );
};

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
  const [searchParams] = useSearchParams();
  const [issues, setIssues] = useState([]);
  const [openIssues, setOpenIssues] = useState([]);
  const [tiers, setTiers] = useState(DEFAULT_TIERS);
  // ?view=attention (from the dashboard to-do) opens the posts to check.
  const [statusFilter, setStatusFilter] = useState(searchParams.get('view') === 'attention' ? 'attention' : 'open');
  const [counts, setCounts] = useState(null);
  const [reviewMode, setReviewMode] = useState('off');
  // Take-down form for one report: { report_id, held, preset, reason, suspend }.
  const [removeTarget, setRemoveTarget] = useState(null);
  // Pause posting for one resident: { resident_id, name, length, reason }.
  const [suspendTarget, setSuspendTarget] = useState(null);
  const [suspensions, setSuspensions] = useState(null); // null = panel closed
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
      const [list, open, cnt] = await Promise.all([
        axios.get(`${API_BASE}/admin_issue_map.php`, { params }),
        axios.get(`${API_BASE}/admin_issue_map.php`, { params: { action: 'list', status: 'open' } }),
        axios.get(`${API_BASE}/admin_issue_map.php`, { params: { action: 'counts' } }),
      ]);
      if (list.data.success) {
        setIssues(list.data.issues || []);
        setTiers(list.data.tiers || DEFAULT_TIERS);
        setReviewMode(list.data.review_mode || 'off');
      }
      if (open.data.success) setOpenIssues(open.data.issues || []);
      if (cnt.data.success) setCounts(cnt.data.counts);
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
        tellLayout(); // opening it marked its reports as seen
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
    setRemoveTarget(null);
    setSuspendTarget(null);
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
      if (data.success) tellLayout();
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
    if (await post({ action: 'unhide', report_id: reportId })) await refreshAll(detail.issue_id);
  };

  // ---- Safeguards: held reports, take-downs, pauses
  const approveHeld = async (reportId) => {
    if (await post({ action: 'approve', report_id: reportId })) await refreshAll(detail.issue_id);
  };

  const saveRemove = async () => {
    const reason = (removeTarget.preset === 'other' ? removeTarget.reason : removeTarget.preset).trim();
    if (!reason) {
      showToast('Reason needed', 'Choose or type the reason. The resident is emailed it.', 'error');
      return;
    }
    const pause = SUSPEND_CHOICES.find((s) => s.value === removeTarget.suspend);
    const ok = await confirmToast(
      removeTarget.held ? "Don't post this report?" : 'Remove this post?',
      `${removeTarget.held ? 'It will not appear on the map.' : 'It leaves the map and no longer counts as a report.'} The resident is emailed the reason${removeTarget.suspend ? ` and that their posting is paused (${pause.label.replace('Pause posting ', '')})` : ''}. You can restore the post later.`,
      { confirmLabel: removeTarget.held ? "Don't Post" : 'Remove Post', danger: true },
    );
    if (!ok) return;
    if (await post({ action: 'remove', report_id: removeTarget.report_id, reason, suspend: removeTarget.suspend })) {
      setRemoveTarget(null);
      await refreshAll(detail.issue_id);
    }
  };

  const restore = async (reportId) => {
    const ok = await confirmToast('Restore this post?', 'It goes back on the map and counts as a report again. A pause on posting stays until you lift it.', { confirmLabel: 'Restore' });
    if (ok && await post({ action: 'restore', report_id: reportId })) await refreshAll(detail.issue_id);
  };

  const saveSuspend = async () => {
    if (!suspendTarget.reason.trim()) {
      showToast('Reason needed', 'Give the reason. The resident is emailed it.', 'error');
      return;
    }
    const pause = SUSPEND_CHOICES.find((s) => s.value === suspendTarget.length);
    const ok = await confirmToast(
      `Pause posting for ${suspendTarget.name}?`,
      `${pause.label}. They can still view the map, and they are emailed the reason.`,
      { confirmLabel: 'Pause Posting', danger: true },
    );
    if (!ok) return;
    if (await post({ action: 'suspend', resident_id: suspendTarget.resident_id, length: suspendTarget.length, reason: suspendTarget.reason.trim() })) {
      setSuspendTarget(null);
      await refreshAll(detail?.issue_id);
      if (suspensions) await loadSuspensions();
    }
  };

  const loadSuspensions = async () => {
    try {
      const { data } = await axios.get(`${API_BASE}/admin_issue_map.php`, { params: { action: 'suspensions' } });
      if (data.success) setSuspensions(data.suspensions || []);
    } catch {
      showToast('Error', 'Could not load the paused residents.', 'error');
    }
  };

  const lift = async (s) => {
    const ok = await confirmToast(`Let ${s.name} post again?`, 'Their pause ends now and they are emailed that they can post again.', { confirmLabel: 'Lift Pause' });
    if (!ok) return;
    if (await post({ action: 'lift', suspension_id: s.suspension_id })) {
      await loadSuspensions();
      await refreshAll(detail?.issue_id);
    }
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

        {detail.report_count === 0 && detail.reports?.some((r) => r.held) && (
          <p className="aim-note is-held">
            <i className="bi bi-eye-slash" aria-hidden="true"></i> Not on the public map yet: its report is waiting for a staff check below.
          </p>
        )}

        <dl className="aim-facts">
          {detail.landmark && (<><dt>Landmark</dt><dd>{detail.landmark}</dd></>)}
          <dt>Map pin</dt>
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
              <select value={statusForm.status} onChange={(e) => setStatusForm((f) => ({ ...f, status: e.target.value }))} aria-label="New status">
                {detail.allowed_next.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <label className="aim-field-label" htmlFor="aim-status-remark">Public remark (required)</label>
            <textarea
              id="aim-status-remark"
              rows={3}
              maxLength={500}
              value={statusForm.remarks}
              placeholder="e.g. Reported to Meralco; repair scheduled Oct 14."
              onChange={(e) => setStatusForm((f) => ({ ...f, remarks: e.target.value }))}
            />
            <p className="aim-muted">
              Everyone sees this remark on the map, without your name. Reporters who chose email get it by email{statusForm.status === 'Resolved' ? ', and those who chose SMS get a text' : ''}.
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
                <select value={mergeForm.into} onChange={(e) => setMergeForm((f) => ({ ...f, into: e.target.value }))} aria-label="Issue to merge into">
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
                  aria-label="Public remark (optional)"
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
            <li key={r.report_id} className={`${r.hidden || r.removed ? 'is-hidden' : ''}${r.held ? ' is-held' : ''}`}>
              <div className="aim-report-head">
                <div>
                  <strong>{r.name}</strong>
                  {r.is_first && <span className="aim-tag">First to report</span>}
                  {r.is_new && <span className="aim-tag is-new">New</span>}
                  {r.held && <span className="aim-tag is-held">Waiting to be posted</span>}
                  {r.removed && <span className="aim-tag is-removed">Removed</span>}
                  {r.flag_count > 0 && <span className="aim-tag is-flagged">Reported by {r.flag_count} resident{r.flag_count === 1 ? '' : 's'}</span>}
                  <small>{r.control_num} · {r.contact_num}</small>
                </div>
                <small>{formatIssueDate(r.created_at, true)}</small>
              </div>
              <ConductLine c={r.conduct} />
              <p>{r.comment}</p>
              {r.photo_url && (
                <a href={r.photo_url} target="_blank" rel="noreferrer"><img src={r.photo_url} alt="Reported problem" loading="lazy" /></a>
              )}
              {r.held && r.held_reason && (
                <p className="aim-note is-held"><i className="bi bi-hourglass-split" aria-hidden="true"></i> {r.held_reason}</p>
              )}
              {r.flags?.length > 0 && (
                <p className="aim-note is-flagged">
                  <i className="bi bi-flag" aria-hidden="true"></i> Residents said: {r.flags.map((f) => `${f.label}${f.count > 1 ? ` (${f.count})` : ''}`).join(', ')}
                </p>
              )}
              {r.reviewed_by_name && !r.held && !r.removed && (
                <p className="aim-muted"><i className="bi bi-check2-circle" aria-hidden="true"></i> Checked by {r.reviewed_by_name}</p>
              )}

              {removeTarget?.report_id === r.report_id ? (
                <div className="aim-remove-form">
                  <h5>{r.held ? "Don't post this report" : 'Report abuse: remove this post'}</h5>
                  <label className="aim-field-label" htmlFor={`aim-rm-reason-${r.report_id}`}>Reason (the resident is emailed it)</label>
                  <select
                    id={`aim-rm-reason-${r.report_id}`}
                    value={removeTarget.preset}
                    onChange={(e) => setRemoveTarget((t) => ({ ...t, preset: e.target.value }))}
                  >
                    {REMOVE_REASONS.map((x) => <option key={x} value={x}>{x}</option>)}
                    <option value="other">Other reason…</option>
                  </select>
                  {removeTarget.preset === 'other' && (
                    <input
                      type="text"
                      maxLength={255}
                      autoFocus
                      value={removeTarget.reason}
                      aria-label="Other reason"
                      placeholder="Type the reason"
                      onChange={(e) => setRemoveTarget((t) => ({ ...t, reason: e.target.value }))}
                    />
                  )}
                  <label className="aim-field-label" htmlFor={`aim-rm-pause-${r.report_id}`}>Posting</label>
                  <select
                    id={`aim-rm-pause-${r.report_id}`}
                    value={removeTarget.suspend}
                    onChange={(e) => setRemoveTarget((t) => ({ ...t, suspend: e.target.value }))}
                  >
                    {SUSPEND_CHOICES.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
                  </select>
                  {r.conduct?.repeat && !removeTarget.suspend && (
                    <p className="aim-note is-flagged">This resident has had posts removed, hidden or rejected before. Consider pausing their posting.</p>
                  )}
                  <div className="aim-actions">
                    <button type="button" className="aim-btn is-ghost" onClick={() => setRemoveTarget(null)} disabled={busy}>Cancel</button>
                    <button type="button" className="aim-btn is-danger" onClick={saveRemove} disabled={busy}>{r.held ? "Don't Post" : 'Remove Post'}</button>
                  </div>
                </div>
              ) : r.removed ? (
                <div className="aim-hidden-note">
                  <span><i className="bi bi-trash3" aria-hidden="true"></i> Removed by {r.removed_by_name || 'staff'}: {r.removed_reason}</span>
                  <button type="button" className="aim-link" onClick={() => restore(r.report_id)} disabled={busy}>Restore</button>
                </div>
              ) : r.held ? (
                <div className="aim-actions is-left">
                  <button type="button" className="aim-btn is-small" onClick={() => approveHeld(r.report_id)} disabled={busy}><i className="bi bi-check-lg" aria-hidden="true"></i> Post it</button>
                  <button type="button" className="aim-btn is-small is-danger" onClick={() => setRemoveTarget({ report_id: r.report_id, held: true, preset: REMOVE_REASONS[1], reason: '', suspend: '' })} disabled={busy}>Don't post</button>
                </div>
              ) : r.hidden ? (
                <div className="aim-hidden-note">
                  <span><i className="bi bi-eye-slash"></i> {r.auto_hidden ? r.hidden_reason : <>Hidden from residents by {r.hidden_by_name || 'staff'}: {r.hidden_reason}</>}</span>
                  <span className="aim-inline-actions">
                    <button type="button" className="aim-link" onClick={() => unhide(r.report_id)} disabled={busy}>{r.auto_hidden ? "It's fine, show again" : 'Show again'}</button>
                    <button type="button" className="aim-link is-danger" onClick={() => setRemoveTarget({ report_id: r.report_id, held: false, preset: REMOVE_REASONS[0], reason: '', suspend: '' })} disabled={busy}>Report abuse</button>
                  </span>
                </div>
              ) : hideTarget?.report_id === r.report_id ? (
                <div className="aim-row">
                  <input
                    type="text"
                    maxLength={255}
                    autoFocus
                    value={hideTarget.reason}
                    aria-label="Reason for hiding (staff only)"
                    placeholder="Reason, e.g. offensive language"
                    onChange={(e) => setHideTarget((h) => ({ ...h, reason: e.target.value }))}
                  />
                  <button type="button" className="aim-btn is-small is-danger" onClick={saveHide} disabled={busy}>Hide</button>
                  <button type="button" className="aim-btn is-small is-ghost" onClick={() => setHideTarget(null)}>Cancel</button>
                </div>
              ) : (
                <span className="aim-inline-actions">
                  <button type="button" className="aim-link is-muted" onClick={() => setHideTarget({ report_id: r.report_id, reason: '' })}>
                    <i className="bi bi-eye-slash"></i> Hide comment
                  </button>
                  <button type="button" className="aim-link is-danger" onClick={() => setRemoveTarget({ report_id: r.report_id, held: false, preset: REMOVE_REASONS[0], reason: '', suspend: '' })}>
                    <i className="bi bi-shield-exclamation" aria-hidden="true"></i> Report abuse
                  </button>
                </span>
              )}

              {/* Pause this resident's posting without removing a post. */}
              {suspendTarget?.resident_id === r.resident_id && suspendTarget?.report_id === r.report_id ? (
                <div className="aim-remove-form">
                  <h5>Pause posting for {r.name}</h5>
                  <select value={suspendTarget.length} aria-label="How long" onChange={(e) => setSuspendTarget((t) => ({ ...t, length: e.target.value }))}>
                    {SUSPEND_CHOICES.filter((x) => x.value).map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
                  </select>
                  <input
                    type="text"
                    maxLength={500}
                    value={suspendTarget.reason}
                    aria-label="Reason (the resident is emailed it)"
                    placeholder="Reason (the resident is emailed it)"
                    onChange={(e) => setSuspendTarget((t) => ({ ...t, reason: e.target.value }))}
                  />
                  <div className="aim-actions">
                    <button type="button" className="aim-btn is-ghost" onClick={() => setSuspendTarget(null)} disabled={busy}>Cancel</button>
                    <button type="button" className="aim-btn is-danger" onClick={saveSuspend} disabled={busy}>Pause Posting</button>
                  </div>
                </div>
              ) : !r.conduct?.active_suspension && (
                <button type="button" className="aim-link is-muted aim-pause-link" onClick={() => setSuspendTarget({ resident_id: r.resident_id, report_id: r.report_id, name: r.name, length: '7', reason: '' })}>
                  <i className="bi bi-pause-circle" aria-hidden="true"></i> Pause this resident's posting
                </button>
              )}
              <Link className="aim-link is-muted aim-pause-link" to={`/admin/profiling?open=${r.resident_id}`}>
                <i className="bi bi-person-vcard" aria-hidden="true"></i> Open resident record
              </Link>
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
          <h2><i className="bi bi-flag-fill" style={{ color: '#047857' }}></i> Community Issue Map</h2>
          <p>Problems pinned by residents. More reports mean more residents are affected.</p>
        </div>
        <div className="aim-legend">
          {tierLegend(tiers).map((t) => <span key={t.tier}><i style={{ background: TIER_COLORS[t.tier] }}></i>{t.label}</span>)}
        </div>
      </div>

      {reviewMode === 'all' && (
        <p className="aim-review-banner">
          <i className="bi bi-shield-check" aria-hidden="true"></i>
          Manual review is on: every new report waits here until staff post it. A Super Admin can turn this off on Manage Admins.
        </p>
      )}

      {counts && (counts.issues > 0 || counts.suspended > 0) && (
        <div className="aim-check-bar">
          {counts.issues > 0 && (
            <button type="button" className={`aim-check-chip${statusFilter === 'attention' ? ' is-active' : ''}`} onClick={() => setStatusFilter('attention')}>
              <i className="bi bi-shield-exclamation" aria-hidden="true"></i>
              <strong>{counts.issues}</strong> issue{counts.issues === 1 ? '' : 's'} with posts to check
              <small>{[counts.new && `${counts.new} new`, counts.held && `${counts.held} waiting to be posted`, counts.flagged && `${counts.flagged} reported by residents`].filter(Boolean).join(' · ')}</small>
            </button>
          )}
          {counts.suspended > 0 && (
            <button type="button" className="aim-check-chip" onClick={loadSuspensions}>
              <i className="bi bi-pause-circle" aria-hidden="true"></i>
              <strong>{counts.suspended}</strong> resident{counts.suspended === 1 ? '' : 's'} paused from posting
            </button>
          )}
        </div>
      )}

      {suspensions && (
        <div className="aim-suspensions">
          <div className="aim-panel-head">
            <h3>Residents paused from posting</h3>
            <button type="button" className="aim-link" onClick={() => setSuspensions(null)}><i className="bi bi-x-lg" aria-hidden="true"></i> Close</button>
          </div>
          {suspensions.length === 0 ? <p className="aim-muted">Nobody is paused right now.</p> : (
            <ul>
              {suspensions.map((s) => (
                <li key={s.suspension_id}>
                  <div>
                    <strong>{s.name}</strong> <small>{s.control_num}</small>
                    <p>{s.reason}</p>
                    <small>Paused {formatIssueDate(s.starts_at, true)} by {s.created_by_name || 'staff'} · {untilText(s.ends_at)}</small>
                  </div>
                  <button type="button" className="aim-btn is-small is-ghost" onClick={() => lift(s)} disabled={busy}>Lift pause</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="aim-stats">
        <div><strong>{stats.open}</strong><span>Open issues</span></div>
        <div><strong>{stats.Reported}</strong><span>New (not yet acknowledged)</span></div>
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
                    <tr key={i.issue_id} className={i.issue_id === selectedId ? 'is-selected' : ''} onClick={() => select(i)}
                      tabIndex={0} aria-selected={i.issue_id === selectedId}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(i); } }}>
                      <td>{i.issue_id}</td>
                      <td>
                        <div className="aim-issue-cell">
                          <span className="aim-flag is-small" style={{ background: OPEN_STATUSES.includes(i.status) ? TIER_COLORS[i.tier] : '#64748b' }}>{CATEGORY_LOOKUP[i.category]?.emoji}</span>
                          <span className="aim-cell-text">
                            <strong>{CATEGORY_LOOKUP[i.category]?.label}</strong>
                            {i.landmark && <small>{i.landmark}</small>}
                            {(i.new_count > 0 || i.held_count > 0 || i.flagged_count > 0) && (
                              <span className="aim-cell-tags">
                                {i.new_count > 0 && <span className="aim-tag is-new">{i.new_count} new</span>}
                                {i.held_count > 0 && <span className="aim-tag is-held">{i.held_count} waiting to be posted</span>}
                                {i.flagged_count > 0 && <span className="aim-tag is-flagged">{i.flagged_count} reported</span>}
                              </span>
                            )}
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
