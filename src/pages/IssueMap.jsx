import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Header from '../components/Header';
import Footer from '../components/Footer';
import Preloader from '../components/Preloader';
import IssueMap from '../components/IssueMap';
import { useAuth } from '../context/AuthContext';
import {
  CATEGORY_LOOKUP, COMMENT_MAX, DEFAULT_TIERS, ISSUE_CATEGORIES, LANDMARK_MAX, OPEN_STATUSES,
  STATUS_STYLE, TIER_COLORS, formatIssueDate, isInsidePb2, tierLegend,
} from '../components/issueMapConfig';
import './CSS/IssueMap.css';

const API_BASE = '/api_backend';
const REFRESH_MS = 60000;
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const StatusBadge = ({ status }) => {
  const s = STATUS_STYLE[status] || STATUS_STYLE.Reported;
  return <span className={`im-status ${s.cls}`}><i className={`bi ${s.icon}`}></i> {status}</span>;
};

const PhotoInput = ({ file, onChange, id }) => (
  <div className="im-photo">
    <label htmlFor={id} className="im-photo-btn"><i className="bi bi-camera"></i> {file ? 'Change photo' : 'Add a photo (optional)'}</label>
    <input id={id} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={(e) => onChange(e.target.files?.[0] || null)} hidden />
    {file && (
      <span className="im-photo-name">
        <i className="bi bi-check-circle-fill"></i> {file.name}
        <button type="button" onClick={() => onChange(null)} aria-label="Remove photo"><i className="bi bi-x"></i></button>
      </span>
    )}
  </div>
);

/**
 * Barangay Community Issue Map (migration 019, backend/api/issue_map.php).
 * Anyone sees the flags, counts and staff updates; a signed-in Active
 * resident can pin a problem, add their report (the vote) to an existing
 * pin, read the anonymous comments and withdraw their own report.
 */
const IssueMapPage = () => {
  const { user } = useAuth();
  const [issues, setIssues] = useState([]);
  const [tiers, setTiers] = useState(DEFAULT_TIERS);
  const [signedIn, setSignedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('all');
  const [showClosed, setShowClosed] = useState(false);

  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [showComments, setShowComments] = useState(false);
  const [focus, setFocus] = useState(null);

  // 'browse' | 'pick' | 'form'
  const [mode, setMode] = useState('browse');
  const [picked, setPicked] = useState(null);
  const [form, setForm] = useState({ category: '', comment: '', landmark: '', photo: null });
  const [nearby, setNearby] = useState([]);
  const [addForm, setAddForm] = useState({ open: false, comment: '', photo: null });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null); // { type: 'success'|'error'|'info', text }
  const panelRef = useRef(null);

  const say = (type, text) => setNotice({ type, text });

  const loadList = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/issue_map.php?action=list${showClosed ? '&include_closed=1' : ''}`, { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setIssues(data.issues || []);
        setTiers(data.tiers || DEFAULT_TIERS);
        setSignedIn(!!data.signed_in);
      }
    } catch {
      // keep the last good list; the next refresh will try again
    } finally {
      setLoading(false);
    }
  }, [showClosed]);

  const loadDetail = useCallback(async (id) => {
    try {
      const res = await fetch(`${API_BASE}/issue_map.php?action=detail&issue_id=${id}`, { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setDetail(data.issue);
        setSignedIn(!!data.signed_in);
      } else {
        setDetail(null);
        setSelectedId(null);
        say('info', data.message || 'This issue is no longer on the map.');
      }
    } catch {
      say('error', 'Could not load this issue. Please check your connection.');
    }
  }, []);

  // Near-live: refresh every minute and whenever the tab comes back into view.
  useEffect(() => {
    loadList();
    const timer = setInterval(loadList, REFRESH_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') loadList(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [loadList]);

  const visible = useMemo(
    () => issues.filter((i) => category === 'all' || i.category === category),
    [issues, category],
  );
  const counts = useMemo(() => {
    const c = {};
    issues.forEach((i) => { if (OPEN_STATUSES.includes(i.status)) c[i.category] = (c[i.category] || 0) + 1; });
    return c;
  }, [issues]);
  const openTotal = issues.filter((i) => OPEN_STATUSES.includes(i.status)).length;

  const scrollPanel = () => {
    if (window.innerWidth < 960 && panelRef.current) panelRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const selectIssue = (issue) => {
    setMode('browse');
    setPicked(null);
    setSelectedId(issue.issue_id);
    setShowComments(false);
    setAddForm({ open: false, comment: '', photo: null });
    setDetail(null);
    setFocus({ lat: issue.lat, lng: issue.lng });
    loadDetail(issue.issue_id);
    scrollPanel();
  };

  const startReport = () => {
    setNotice(null);
    setSelectedId(null);
    setDetail(null);
    setPicked(null);
    setNearby([]);
    setForm({ category: category !== 'all' ? category : '', comment: '', landmark: '', photo: null });
    setMode('pick');
  };

  const cancelReport = () => {
    setMode('browse');
    setPicked(null);
    setNearby([]);
  };

  const onPick = ({ lat, lng }) => {
    if (!isInsidePb2(lat, lng)) {
      say('error', 'That spot is outside Barangay Pasong Buaya II. Please tap a spot inside the dashed boundary.');
      return;
    }
    setNotice(null);
    setPicked({ lat, lng });
    setMode('form');
    scrollPanel();
  };

  // Same problem already pinned nearby? Look it up as soon as both are known.
  useEffect(() => {
    if (mode !== 'form' || !picked || !form.category) { setNearby([]); return undefined; }
    let cancelled = false;
    fetch(`${API_BASE}/issue_map.php?action=nearby&lat=${picked.lat}&lng=${picked.lng}&category=${form.category}`, { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => { if (!cancelled && data.success) setNearby(data.issues || []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [mode, picked, form.category]);

  const validPhoto = (file) => {
    if (!file) return true;
    if (!PHOTO_TYPES.includes(file.type)) { say('error', 'Please choose a JPEG, PNG or WebP photo.'); return false; }
    if (file.size > 8 * 1024 * 1024) { say('error', 'The photo must be 8 MB or smaller.'); return false; }
    return true;
  };

  const handleAuthFailure = (data) => {
    if (data?.auth_error) {
      setSignedIn(false);
      say('error', 'Please log in again with an active resident account to report issues.');
      return true;
    }
    return false;
  };

  const submitNew = async (confirmNew = false) => {
    if (!form.category) { say('error', 'Please choose what kind of problem this is.'); return; }
    if (!form.comment.trim()) { say('error', 'Please describe the problem in your comment.'); return; }
    if (!validPhoto(form.photo)) return;
    setBusy(true);
    try {
      const body = new FormData();
      body.append('action', 'report');
      body.append('category', form.category);
      body.append('lat', String(picked.lat));
      body.append('lng', String(picked.lng));
      body.append('comment', form.comment.trim());
      if (form.landmark.trim()) body.append('landmark', form.landmark.trim());
      if (form.photo) body.append('photo', form.photo);
      if (confirmNew) body.append('confirm_new', '1');
      const res = await fetch(`${API_BASE}/issue_map.php`, { method: 'POST', body, credentials: 'include' });
      const data = await res.json();
      if (handleAuthFailure(data)) return;
      if (data.code === 'NEARBY_EXISTS') {
        setNearby(data.issues || []);
        say('info', 'This problem may already be on the map. Add your report to it, or pin a separate one if it is different.');
        return;
      }
      if (!data.success) { say('error', data.message || 'Your report could not be saved.'); return; }
      say('success', data.message);
      setMode('browse');
      setPicked(null);
      setNearby([]);
      await loadList();
      selectIssue(data.issue);
    } catch {
      say('error', 'Could not reach the server. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const submitAdd = async () => {
    if (!addForm.comment.trim()) { say('error', 'Please add a comment with your report.'); return; }
    if (!validPhoto(addForm.photo)) return;
    setBusy(true);
    try {
      const body = new FormData();
      body.append('action', 'report');
      body.append('issue_id', String(detail.issue_id));
      body.append('comment', addForm.comment.trim());
      if (addForm.photo) body.append('photo', addForm.photo);
      const res = await fetch(`${API_BASE}/issue_map.php`, { method: 'POST', body, credentials: 'include' });
      const data = await res.json();
      if (handleAuthFailure(data)) return;
      if (!data.success) { say('error', data.message || 'Your report could not be saved.'); return; }
      say('success', data.message);
      setAddForm({ open: false, comment: '', photo: null });
      await loadList();
      await loadDetail(data.issue.issue_id);
      setSelectedId(data.issue.issue_id);
    } catch {
      say('error', 'Could not reach the server. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const withdraw = async () => {
    if (!window.confirm('Withdraw your report on this issue? Your comment and photo will be removed.')) return;
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/issue_map.php`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'withdraw', issue_id: detail.issue_id }),
      });
      const data = await res.json();
      if (handleAuthFailure(data)) return;
      if (!data.success) { say('error', data.message); return; }
      say('success', data.message);
      await loadList();
      if (data.removed) { setSelectedId(null); setDetail(null); } else { await loadDetail(detail.issue_id); }
    } catch {
      say('error', 'Could not reach the server. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const openNearby = (issue) => {
    selectIssue(issue);
    if (!issue.mine) setAddForm({ open: true, comment: form.comment, photo: form.photo });
  };

  const loginPrompt = (
    <div className="im-login-note">
      <i className="bi bi-lock-fill"></i>
      <span>{user && !signedIn ? 'Your session has ended or your account is not active yet.' : 'Log in as a resident to report issues and read comments.'}</span>
      <Link to="/login" className="im-btn is-small">Log in</Link>
    </div>
  );

  // ------------------------------------------------------------------ panels
  const renderBrowse = () => (
    <div className="im-panel-body">
      <h3>How it works</h3>
      <ol className="im-steps">
        <li><strong>Tap a flag</strong> to see the problem, how many residents reported it, and updates from barangay staff.</li>
        <li><strong>Seen it too?</strong> Add your report. The more residents report it, the stronger the flag colour.</li>
        <li><strong>New problem?</strong> Use <em>Report an issue</em> and tap the exact spot.</li>
      </ol>
      <p className="im-muted"><i className="bi bi-shield-lock"></i> Your name is never shown to other residents. Only barangay staff can see who reported.</p>
      {visible.filter((i) => OPEN_STATUSES.includes(i.status)).length > 0 && (
        <>
          <h3>Most reported</h3>
          <ul className="im-top-list">
            {visible.filter((i) => OPEN_STATUSES.includes(i.status)).slice(0, 5).map((i) => (
              <li key={i.issue_id}>
                <button type="button" onClick={() => selectIssue(i)}>
                  <span className="im-top-flag" style={{ background: TIER_COLORS[i.tier] }}>{CATEGORY_LOOKUP[i.category]?.emoji}</span>
                  <span className="im-top-text">
                    <strong>{CATEGORY_LOOKUP[i.category]?.label}</strong>
                    <small>{i.landmark || `Pinned ${formatIssueDate(i.created_at)}`}</small>
                  </span>
                  <span className="im-top-count">{i.report_count}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {!signedIn && loginPrompt}
    </div>
  );

  const renderPick = () => (
    <div className="im-panel-body">
      <h3><i className="bi bi-geo-alt"></i> Where is the problem?</h3>
      <p>Tap the exact spot on the map. You can zoom in for a closer look.</p>
      <button type="button" className="im-btn is-ghost" onClick={cancelReport}>Cancel</button>
    </div>
  );

  const renderForm = () => (
    <div className="im-panel-body">
      <div className="im-panel-head">
        <h3>Report a new issue</h3>
        <button type="button" className="im-link" onClick={() => setMode('pick')}><i className="bi bi-arrow-repeat"></i> Move pin</button>
      </div>
      <label className="im-label">What kind of problem? *</label>
      <div className="im-cat-grid">
        {ISSUE_CATEGORIES.map((c) => (
          <button
            key={c.value}
            type="button"
            className={`im-cat${form.category === c.value ? ' is-active' : ''}`}
            onClick={() => setForm((f) => ({ ...f, category: c.value }))}
          >
            <span>{c.emoji}</span>{c.label}
          </button>
        ))}
      </div>

      {nearby.length > 0 && (
        <div className="im-nearby">
          <strong><i className="bi bi-exclamation-triangle-fill"></i> Already reported nearby</strong>
          <p>If it's the same problem, add your report to it instead. This makes its flag stronger.</p>
          {nearby.map((n) => (
            <div key={n.issue_id} className="im-nearby-row">
              <span className="im-top-flag" style={{ background: TIER_COLORS[n.tier] }}>{CATEGORY_LOOKUP[n.category]?.emoji}</span>
              <span className="im-top-text">
                <strong>{n.report_count} report{n.report_count === 1 ? '' : 's'} · {n.distance_m} m away</strong>
                <small>{n.landmark || `Pinned ${formatIssueDate(n.created_at)}`}</small>
              </span>
              <button type="button" className="im-btn is-small" onClick={() => openNearby(n)}>
                {n.mine ? 'View' : 'Add my report'}
              </button>
            </div>
          ))}
        </div>
      )}

      <label className="im-label" htmlFor="im-comment">Comment *</label>
      <textarea
        id="im-comment"
        rows={4}
        maxLength={COMMENT_MAX}
        value={form.comment}
        placeholder="Describe what you saw, e.g. the streetlight has been off for 3 nights."
        onChange={(e) => setForm((f) => ({ ...f, comment: e.target.value }))}
      />
      <span className="im-counter">{form.comment.length}/{COMMENT_MAX}</span>

      <label className="im-label" htmlFor="im-landmark">Landmark (optional)</label>
      <input
        id="im-landmark"
        type="text"
        maxLength={LANDMARK_MAX}
        value={form.landmark}
        placeholder="e.g. near the basketball court"
        onChange={(e) => setForm((f) => ({ ...f, landmark: e.target.value }))}
      />

      <PhotoInput id="im-new-photo" file={form.photo} onChange={(photo) => setForm((f) => ({ ...f, photo }))} />

      <div className="im-actions">
        <button type="button" className="im-btn is-ghost" onClick={cancelReport} disabled={busy}>Cancel</button>
        {nearby.length > 0 ? (
          <button type="button" className="im-btn" onClick={() => submitNew(true)} disabled={busy}>
            {busy ? 'Saving…' : "It's a different problem, pin it"}
          </button>
        ) : (
          <button type="button" className="im-btn" onClick={() => submitNew(false)} disabled={busy}>
            {busy ? 'Saving…' : 'Submit report'}
          </button>
        )}
      </div>
      <p className="im-muted"><i className="bi bi-shield-lock"></i> Other residents see your comment without your name.</p>
    </div>
  );

  const renderDetail = () => {
    if (!detail) return <div className="im-panel-body im-muted">Loading…</div>;
    const cat = CATEGORY_LOOKUP[detail.category] || {};
    const tierColor = OPEN_STATUSES.includes(detail.status) ? TIER_COLORS[detail.tier] : '#64748b';
    return (
      <div className="im-panel-body">
        <div className="im-panel-head">
          <button type="button" className="im-link" onClick={() => { setSelectedId(null); setDetail(null); }}><i className="bi bi-arrow-left"></i> Back</button>
          <span className="im-muted">Issue #{detail.issue_id}</span>
        </div>
        <div className="im-detail-title">
          <span className="im-detail-flag" style={{ background: tierColor }}>{cat.emoji}</span>
          <div>
            <h3>{cat.label || detail.category_label}</h3>
            <StatusBadge status={detail.status} />
          </div>
        </div>

        <div className="im-count-box" style={{ borderColor: tierColor }}>
          <strong>{detail.report_count}</strong>
          <span>resident{detail.report_count === 1 ? ' has' : 's have'} reported this</span>
        </div>

        <dl className="im-facts">
          {detail.landmark && (<><dt>Landmark</dt><dd>{detail.landmark}</dd></>)}
          <dt>First reported</dt><dd>{formatIssueDate(detail.created_at)}</dd>
          <dt>Latest report</dt><dd>{formatIssueDate(detail.last_reported_at)}</dd>
        </dl>

        {detail.timeline?.length > 0 && (
          <div className="im-timeline">
            <h4>Updates from the barangay</h4>
            {detail.timeline.slice().reverse().map((t, idx) => (
              <div key={idx} className="im-timeline-row">
                <StatusBadge status={t.new_status} />
                <p>{t.remarks}</p>
                <small>Barangay staff · {formatIssueDate(t.created_at, true)}</small>
              </div>
            ))}
          </div>
        )}

        {/* Reporting */}
        {signedIn ? (
          detail.mine ? (
            <div className="im-mine">
              <span><i className="bi bi-check-circle-fill"></i> You reported this issue.</span>
              {detail.open && <button type="button" className="im-link is-danger" onClick={withdraw} disabled={busy}>Withdraw my report</button>}
            </div>
          ) : detail.open ? (
            addForm.open ? (
              <div className="im-add">
                <label className="im-label" htmlFor="im-add-comment">Your comment *</label>
                <textarea
                  id="im-add-comment"
                  rows={3}
                  maxLength={COMMENT_MAX}
                  value={addForm.comment}
                  placeholder="What did you notice? e.g. still flooded this morning."
                  onChange={(e) => setAddForm((f) => ({ ...f, comment: e.target.value }))}
                />
                <span className="im-counter">{addForm.comment.length}/{COMMENT_MAX}</span>
                <PhotoInput id="im-add-photo" file={addForm.photo} onChange={(photo) => setAddForm((f) => ({ ...f, photo }))} />
                <div className="im-actions">
                  <button type="button" className="im-btn is-ghost" onClick={() => setAddForm({ open: false, comment: '', photo: null })} disabled={busy}>Cancel</button>
                  <button type="button" className="im-btn" onClick={submitAdd} disabled={busy}>{busy ? 'Saving…' : 'Add my report'}</button>
                </div>
              </div>
            ) : (
              <button type="button" className="im-btn is-wide" onClick={() => setAddForm({ open: true, comment: '', photo: null })}>
                <i className="bi bi-flag-fill"></i> I've seen this too, add my report
              </button>
            )
          ) : (
            <p className="im-muted">This issue is closed and no longer takes reports. If the problem is back, report it as a new issue.</p>
          )
        ) : loginPrompt}

        {/* Comments */}
        {signedIn && (
          <div className="im-comments">
            <button type="button" className="im-link" onClick={() => setShowComments((v) => !v)}>
              <i className={`bi ${showComments ? 'bi-chevron-up' : 'bi-chat-left-text'}`}></i>
              {showComments ? ' Hide comments' : ` See comments (${detail.comment_count})`}
            </button>
            {showComments && (
              <ul>
                {(detail.comments || []).map((c, idx) => (
                  <li key={idx} className={c.mine ? 'is-mine' : ''}>
                    <div className="im-comment-head">
                      <strong>{c.mine ? 'You' : 'Resident'}</strong>
                      <small>{formatIssueDate(c.created_at, true)}</small>
                    </div>
                    <p>{c.comment}</p>
                    {c.photo_url && (
                      <a href={c.photo_url} target="_blank" rel="noreferrer"><img src={c.photo_url} alt="Reported problem" loading="lazy" /></a>
                    )}
                  </li>
                ))}
                {detail.comments?.length === 0 && <li className="im-muted">No comments to show.</li>}
              </ul>
            )}
          </div>
        )}
      </div>
    );
  };

  let panel;
  if (mode === 'pick') panel = renderPick();
  else if (mode === 'form') panel = renderForm();
  else if (selectedId) panel = renderDetail();
  else panel = renderBrowse();

  return (
    <>
      <Preloader />
      <Header />
      <div className="issue-map-page">
        <div className="im-container">
          <div className="im-hero">
            <span className="im-badge">Community</span>
            <h1>Community Issue Map</h1>
            <p>See problems your neighbours have reported around Pasong Buaya II, add your voice to them, or pin a new one for the barangay to act on.</p>
          </div>

          <div className="im-toolbar">
            <div className="im-chips" role="group" aria-label="Filter by category">
              <button type="button" className={`im-chip${category === 'all' ? ' is-active' : ''}`} onClick={() => setCategory('all')}>
                All <span>{openTotal}</span>
              </button>
              {ISSUE_CATEGORIES.map((c) => (
                <button key={c.value} type="button" className={`im-chip${category === c.value ? ' is-active' : ''}`} onClick={() => setCategory(c.value)}>
                  {c.emoji} {c.label}{counts[c.value] ? <span>{counts[c.value]}</span> : null}
                </button>
              ))}
            </div>
            <div className="im-toolbar-row">
              <label className="im-toggle">
                <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} />
                Show recently resolved
              </label>
              <div className="im-legend" aria-label="Flag colours">
                {tierLegend(tiers).map((t) => (
                  <span key={t.tier}><i style={{ background: TIER_COLORS[t.tier] }}></i>{t.label}</span>
                ))}
              </div>
              {signedIn ? (
                mode === 'browse'
                  ? <button type="button" className="im-btn" onClick={startReport}><i className="bi bi-plus-lg"></i> Report an issue</button>
                  : <button type="button" className="im-btn is-ghost" onClick={cancelReport}>Cancel reporting</button>
              ) : (
                <Link to="/login" className="im-btn"><i className="bi bi-box-arrow-in-right"></i> Log in to report</Link>
              )}
            </div>
          </div>

          {notice && (
            <div className={`im-notice is-${notice.type}`} role="status">
              <span>{notice.text}</span>
              <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss"><i className="bi bi-x-lg"></i></button>
            </div>
          )}

          <div className="im-layout">
            <div className="im-map-col">
              <IssueMap
                issues={visible}
                selectedId={selectedId}
                onSelect={selectIssue}
                pickMode={mode === 'pick' || mode === 'form'}
                picked={picked}
                onPick={onPick}
                focus={focus}
              />
              {!loading && visible.length === 0 && (
                <p className="im-empty">No {category === 'all' ? '' : `${CATEGORY_LOOKUP[category]?.label.toLowerCase()} `}issues on the map right now.</p>
              )}
            </div>
            <aside className="im-panel" ref={panelRef}>{panel}</aside>
          </div>

          <p className="im-footnote">
            For emergencies, accidents or private complaints, use <Link to="/incident-report">Report Incident</Link> instead. Those go only to barangay staff.
          </p>
        </div>
      </div>
      <Footer />
    </>
  );
};

export default IssueMapPage;
