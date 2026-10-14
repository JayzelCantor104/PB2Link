import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { CATEGORY_LOOKUP } from '../components/issueMapConfig';
import { peso } from '../lib/payment';
import './Dashboard.css';

const API_BASE = '/api_backend';
const REFRESH_MS = 120000;
const TAB_KEY = 'pb2_dashboard_tab';

const fmtTime = (t) => {
  if (!t) return '';
  const [h, m] = String(t).split(':');
  const d = new Date();
  d.setHours(Number(h), Number(m || 0));
  return d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
};
const fmtDate = (v, withTime = false) => {
  if (!v) return '';
  const d = new Date(String(v).replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleString('en-PH', withTime
    ? { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }
    : { month: 'short', day: 'numeric', year: 'numeric' });
};
const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
};

// Small building blocks ------------------------------------------------------------
const Card = ({ title, icon, action, onAction, children, className = '' }) => (
  <div className={`db-card ${className}`}>
    <div className="db-card-head">
      <h3><i className={`bi ${icon}`} aria-hidden="true"></i> {title}</h3>
      {action && <button type="button" className="db-link" onClick={onAction}>{action} <i className="bi bi-arrow-right"></i></button>}
    </div>
    {children}
  </div>
);

const Empty = ({ children }) => <p className="db-empty">{children}</p>;

const Meter = ({ label, used, cap, unit, of = 'of the monthly cap used' }) => {
  const pct = cap > 0 ? Math.min(100, Math.round((used / cap) * 100)) : 0;
  const tone = pct >= 90 ? 'is-critical' : pct >= 70 ? 'is-warning' : '';
  return (
    <div className="db-meter">
      <div className="db-meter-top">
        <span>{label}</span>
        <strong>{used.toLocaleString()} / {cap ? cap.toLocaleString() : '—'} {unit}</strong>
      </div>
      <div className="db-meter-track" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${label} ${pct}% used`}>
        <div className={`db-meter-fill ${tone}`} style={{ width: `${pct}%` }}></div>
      </div>
      <small>{pct}% {of}{pct >= 90 ? ' · almost at the limit' : ''}</small>
    </div>
  );
};

/** Requests per day, last 7 days: one series, so one hue and no legend. */
const TrendChart = ({ trend }) => {
  const max = Math.max(1, ...trend.map((t) => t.count));
  const total = trend.reduce((s, t) => s + t.count, 0);
  return (
    <div className="db-trend">
      <div className="db-trend-plot" role="img" aria-label={`Requests per day for the last 7 days: ${trend.map((t) => `${t.label} ${t.count}`).join(', ')}`}>
        {trend.map((t, i) => {
          const isToday = i === trend.length - 1;
          return (
            <div key={t.date} className="db-trend-col" tabIndex={0}>
              <span className="db-trend-tip">{fmtDate(t.date)}: {t.count} request{t.count === 1 ? '' : 's'}</span>
              {isToday && <span className="db-trend-val">{t.count}</span>}
              <div className={`db-trend-bar${isToday ? ' is-today' : ''}`} style={{ height: t.count ? `${Math.max(3, (t.count / max) * 100)}%` : 0 }}></div>
              <span className="db-trend-label">{isToday ? 'Today' : t.label}</span>
            </div>
          );
        })}
      </div>
      <p className="db-trend-sum">{total} request{total === 1 ? '' : 's'} in the last 7 days</p>
    </div>
  );
};

const STATUS_CLASS = {
  Pending: 'is-pending', Processing: 'is-processing', Approved: 'is-ok', Reported: 'is-pending',
  Acknowledged: 'is-processing', 'In Progress': 'is-processing', Active: 'is-ok', 'Action Required': 'is-warn',
};
const Badge = ({ status }) => <span className={`db-badge ${STATUS_CLASS[status] || ''}`}>{status || 'Pending'}</span>;

/**
 * Admin dashboard: what needs action now, today's operations, and how the
 * barangay's services are doing (backend/api/dashboard.php ?api=overview).
 */
const Dashboard = () => {
  const navigate = useNavigate();
  const { adminUser } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  // The open tab is a per-viewer convenience; the page works without storage.
  const [tab, setTabState] = useState(() => {
    try { return localStorage.getItem(TAB_KEY) || 'today'; } catch { return 'today'; }
  });
  const setTab = (key) => {
    setTabState(key);
    try { localStorage.setItem(TAB_KEY, key); } catch { /* storage blocked */ }
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/dashboard.php`, { params: { api: 'overview' } });
      if (res.data?.success) { setData(res.data); setError(''); } else setError(res.data?.message || 'Could not load the dashboard.');
    } catch (err) {
      if (err.response?.status !== 401) setError('Could not reach the server.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  if (!data) {
    return <div className="db-wrap"><p className="db-loading">{error || 'Loading dashboard…'}</p></div>;
  }

  const r = data.residents;
  const docs = data.documents;
  const pay = data.payments;
  const iss = data.issues;
  const dis = data.disaster;
  const occupancy = dis.capacity ? Math.round((dis.occupied / dis.capacity) * 100) : 0;

  // Everything waiting on staff, in the order it usually blocks residents.
  const todo = [
    { key: 'haz', label: 'Hazards detected by the live feeds', short: 'hazard detections', count: dis.hazards_detected || 0, icon: 'bi-radar', to: '/admin/disaster-risk' },
    { key: 'reg', label: 'Registrations to review', short: 'registrations', count: r.pending, icon: 'bi-person-plus-fill', to: '/admin/profiling?view=Pending' },
    { key: 'docs', label: 'Document requests pending', short: 'documents', count: docs.totals.Pending, icon: 'bi-file-earmark-text-fill', to: '/admin/documents' },
    { key: 'pay', label: 'Payments to verify', short: 'payments', count: pay.for_verification, icon: 'bi-wallet2', to: pay.can_see_amounts ? '/admin/payments' : '/admin/documents' },
    { key: 'prof', label: 'Profile changes to approve', short: 'profile changes', count: data.queues.profile_changes, icon: 'bi-person-gear', to: '/admin/profiles' },
    { key: 'proof', label: 'Residency proofs to check', short: 'residency proofs', count: data.queues.residency_proofs, icon: 'bi-house-check-fill', to: '/admin/profiling' },
    { key: 'amen', label: 'Amenity bookings pending', short: 'amenity bookings', count: data.amenities.pending, icon: 'bi-calendar-check-fill', to: '/admin/amenities' },
    { key: 'inc', label: 'Incident reports pending', short: 'incidents', count: data.incidents.pending, icon: 'bi-exclamation-triangle-fill', to: '/admin/incidents' },
    { key: 'iss', label: 'New community issues', short: 'community issues', count: iss.new, icon: 'bi-flag-fill', to: '/admin/issue-map' },
  ];
  const pending = todo.filter((t) => t.count > 0);
  const clear = todo.filter((t) => t.count === 0);
  const waiting = pending.reduce((s, t) => s + t.count, 0);

  const tabs = [
    { key: 'today', label: 'Today', icon: 'bi-sun', badge: data.amenities.today.length },
    { key: 'requests', label: 'Requests', icon: 'bi-files', badge: docs.totals.Pending },
    { key: 'community', label: 'Community', icon: 'bi-flag', badge: iss.new + data.incidents.pending },
    { key: 'residents', label: 'Residents', icon: 'bi-people', badge: r.pending },
    { key: 'system', label: 'System', icon: 'bi-gear', badge: 0 },
  ];
  const sectorMax = Math.max(1, ...Object.values(r.sectors));

  return (
    <div className="db-wrap">
      {/* ---- Header ---- */}
      <div className="db-hero">
        <div>
          <h2>{greeting()}, {adminUser?.fullname || adminUser?.username || 'Admin'}</h2>
          <p>{new Date().toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} · {waiting > 0 ? `${waiting} item${waiting === 1 ? '' : 's'} waiting for staff` : 'Nothing is waiting for staff right now'}</p>
        </div>
        <button type="button" className="db-refresh" onClick={load} disabled={loading}>
          <i className={`bi bi-arrow-clockwise${loading ? ' db-spin' : ''}`}></i> {loading ? 'Updating…' : `Updated ${fmtDate(data.generated_at, true)}`}
        </button>
      </div>

      {/* ---- Active disaster alert ---- */}
      {dis.active_alert && (
        <button type="button" className={`db-alert is-${String(dis.active_alert.alert_level || 'advisory').toLowerCase()}`} onClick={() => navigate('/admin/disaster-risk')}>
          <i className="bi bi-broadcast-pin"></i>
          <span>
            <strong>{dis.active_alert.alert_level} alert: {dis.active_alert.title}</strong>
            <small>{dis.active_alert.calamity_type}{dis.active_alert.affected_areas ? ` · ${dis.active_alert.affected_areas}` : ''}{dis.active_alerts > 1 ? ` · ${dis.active_alerts} active alerts` : ''}</small>
          </span>
          <span className="db-alert-cta">Manage <i className="bi bi-arrow-right"></i></span>
        </button>
      )}

      {/* ---- 1. What is waiting (only the queues that have something) ---- */}
      <div className="db-panel">
        <div className="db-panel-head">
          <h3><i className="bi bi-inbox-fill"></i> Needs your attention</h3>
          {pending.length > 0 && <span className="db-count">{waiting} total</span>}
        </div>
        {pending.length === 0 ? (
          <p className="db-caught-up"><i className="bi bi-check-circle-fill"></i> You're all caught up. Nothing is waiting for staff.</p>
        ) : (
          <ul className="db-todo">
            {pending.map((t) => (
              <li key={t.key}>
                <button type="button" className="db-todo-item" onClick={() => navigate(t.to)}>
                  <i className={`bi ${t.icon}`}></i>
                  <span className="db-todo-label">{t.label}</span>
                  <strong>{t.count}</strong>
                  <i className="bi bi-chevron-right db-todo-go"></i>
                </button>
              </li>
            ))}
          </ul>
        )}
        {clear.length > 0 && pending.length > 0 && (
          <p className="db-clear-note"><i className="bi bi-check2"></i> No backlog: {clear.map((t) => t.short).join(', ')}</p>
        )}
      </div>

      {/* ---- 2. Headline numbers ---- */}
      <div className="db-kpis">
        <button type="button" className="db-kpi" onClick={() => setTab('residents')}>
          <span className="db-kpi-label"><i className="bi bi-people-fill"></i> Active residents</span>
          <strong>{r.active.toLocaleString()}</strong>
          <small>+{r.new_this_month} registered this month</small>
        </button>
        <button type="button" className="db-kpi" onClick={() => setTab('requests')}>
          <span className="db-kpi-label"><i className="bi bi-file-earmark-text-fill"></i> Requests this month</span>
          <strong>{docs.totals.this_month.toLocaleString()}</strong>
          <small>{docs.totals.today} today · {docs.totals['Ready for Pick Up']} ready for pick-up</small>
        </button>
        {pay.can_see_amounts ? (
          <button type="button" className="db-kpi" onClick={() => navigate('/admin/payments')}>
            <span className="db-kpi-label"><i className="bi bi-wallet2"></i> Collected this month</span>
            <strong>{peso(pay.collected_month)}</strong>
            <small>{peso(pay.collected_today)} today · {pay.paid_month_count} payment{pay.paid_month_count === 1 ? '' : 's'}</small>
          </button>
        ) : (
          <button type="button" className="db-kpi" onClick={() => navigate('/admin/documents')}>
            <span className="db-kpi-label"><i className="bi bi-wallet2"></i> Payments</span>
            <strong>{pay.for_verification}</strong>
            <small>awaiting verification · {pay.unpaid_hall} to pay at the hall</small>
          </button>
        )}
        <button type="button" className="db-kpi" onClick={() => setTab('community')}>
          <span className="db-kpi-label"><i className="bi bi-flag-fill"></i> Open community issues</span>
          <strong>{iss.open}</strong>
          <small>{iss.new} new · {iss.in_progress} in progress</small>
        </button>
      </div>

      {/* ---- 3. Details, one group at a time ---- */}
      <div className="db-tabs" role="tablist" aria-label="Dashboard sections">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            id={`db-tab-${t.key}`}
            aria-selected={tab === t.key}
            aria-controls={`db-tabpanel-${t.key}`}
            className={`db-tab${tab === t.key ? ' is-active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            <i className={`bi ${t.icon}`}></i>
            <span>{t.label}</span>
            {t.badge > 0 && <em className="db-tab-badge">{t.badge}</em>}
          </button>
        ))}
      </div>

      <div className="db-tabpanel" role="tabpanel" id={`db-tabpanel-${tab}`} aria-labelledby={`db-tab-${tab}`}>
        {tab === 'today' && (
          <div className="db-grid db-grid-3">
            <Card title="Amenity bookings today" icon="bi-calendar-event" action="Calendar" onAction={() => navigate('/admin/amenities')}>
              {data.amenities.today.length === 0 ? <Empty>No bookings today.</Empty> : (
                <ul className="db-list">
                  {data.amenities.today.map((b) => (
                    <li key={b.request_id}>
                      <span className="db-list-main">
                        <strong>{b.name}</strong>
                        <small>{b.start_time ? `${fmtTime(b.start_time)}–${fmtTime(b.end_time)}` : b.time_slot || 'Whole day'}{b.category === 'Equipment' && b.quantity ? ` · ${b.quantity} pcs` : ''} · {b.resident}</small>
                      </span>
                      <Badge status={b.status} />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card title={`Garbage collection · ${data.waste.day}`} icon="bi-truck" action="Schedules" onAction={() => navigate('/admin/waste-management')}>
              {data.waste.today.length === 0 ? <Empty>No collection scheduled today.</Empty> : (
                <ul className="db-list">
                  {data.waste.today.map((w, i) => (
                    <li key={i}>
                      <span className="db-list-main"><strong>{w.zone_area}</strong><small>{w.collection_time} · {w.waste_type}</small></span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card title="Disaster readiness" icon="bi-shield-fill-check" action="DRRM" onAction={() => navigate('/admin/disaster-risk')}>
              <div className="db-stats-row">
                <div><strong>{dis.centers_available}/{dis.centers}</strong><span>centers available</span></div>
                <div><strong>{dis.active_alerts}</strong><span>active alert{dis.active_alerts === 1 ? '' : 's'}</span></div>
              </div>
              <Meter label="Evacuee families" used={dis.occupied} cap={dis.capacity} unit="families" of="of evacuation capacity in use" />
              {dis.live && (
                <ul className="db-list db-live">
                  <li>
                    <span className="db-list-main">
                      <strong>{dis.live.storm ? `${dis.live.storm.category || ''} ${dis.live.storm.name}`.trim() : dis.live.storm_active ? 'PAGASA bulletin active' : 'No tropical cyclone in PAR'}</strong>
                      <small>PAGASA{dis.live.storm ? ` · ${dis.live.storm.cavite_signal ? `Signal No. ${dis.live.storm.cavite_signal} over Cavite` : 'no signal over Cavite'}` : ''}</small>
                    </span>
                  </li>
                  <li>
                    <span className="db-list-main">
                      <strong>{dis.live.quakes_7d} earthquake{dis.live.quakes_7d === 1 ? '' : 's'} within 300 km (7 days)</strong>
                      <small>{dis.live.quake_source === 'usgs' ? 'USGS' : 'PHIVOLCS'}{dis.live.strongest_quake ? ` · strongest M${Number(dis.live.strongest_quake.mag).toFixed(1)}, ${dis.live.strongest_quake.distance_km} km away` : ''}</small>
                    </span>
                  </li>
                </ul>
              )}
              {!dis.active_alert && <p className="db-ok"><i className="bi bi-check-circle-fill"></i> Status normal: no active advisory.</p>}
              {occupancy >= 80 && <p className="db-warn"><i className="bi bi-exclamation-triangle-fill"></i> Centers are {occupancy}% full.</p>}
            </Card>
          </div>
        )}

        {tab === 'requests' && (
          <div className="db-grid db-grid-2">
            <Card title="Document requests by type" icon="bi-files" action="Open Documents" onAction={() => navigate('/admin/documents')}>
              <div className="db-table-wrap">
                <table className="db-table">
                  <thead><tr><th>Document</th><th>Pending</th><th>Processing</th><th>Ready</th><th>This month</th></tr></thead>
                  <tbody>
                    {docs.by_type.map((d) => (
                      <tr key={d.type}>
                        <td>{d.type}</td>
                        <td className={d.pending ? 'is-strong' : ''}>{d.pending}</td>
                        <td>{d.processing}</td>
                        <td>{d.ready}</td>
                        <td>{d.this_month}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr><td>Total</td><td>{docs.totals.Pending}</td><td>{docs.totals.Processing}</td><td>{docs.totals['Ready for Pick Up']}</td><td>{docs.totals.this_month}</td></tr>
                  </tfoot>
                </table>
              </div>
            </Card>
            <Card title="Requests per day" icon="bi-bar-chart-fill">
              <TrendChart trend={docs.trend} />
              <p className="db-note">{docs.totals.claimed_this_month} claimed this month{pay.unpaid_hall ? ` · ${pay.unpaid_hall} to pay at the hall` : ''}</p>
            </Card>
          </div>
        )}

        {tab === 'community' && (
          <div className="db-grid db-grid-2">
            <Card title="Most-reported community issues" icon="bi-flag-fill" action="Issue Map" onAction={() => navigate('/admin/issue-map')}>
              {iss.top.length === 0 ? <Empty>No open issues on the map.</Empty> : (
                <ul className="db-list">
                  {iss.top.map((i) => (
                    <li key={i.issue_id}>
                      <span className="db-emoji" aria-hidden="true">{CATEGORY_LOOKUP[i.category]?.emoji || '❗'}</span>
                      <span className="db-list-main">
                        <strong>#{i.issue_id} {CATEGORY_LOOKUP[i.category]?.label || i.category}</strong>
                        <small>{i.landmark || 'No landmark'} · {i.report_count} report{i.report_count === 1 ? '' : 's'}</small>
                      </span>
                      <Badge status={i.status} />
                    </li>
                  ))}
                </ul>
              )}
              <p className="db-note">{iss.resolved_30d} resolved in the last 30 days</p>
            </Card>
            <Card title="Open incident reports" icon="bi-exclamation-octagon" action="Incidents" onAction={() => navigate('/admin/incidents')}>
              <div className="db-stats-row">
                <div><strong>{data.incidents.pending}</strong><span>pending</span></div>
                <div><strong>{data.incidents.processing}</strong><span>processing</span></div>
                <div><strong>{data.incidents.this_month}</strong><span>this month</span></div>
              </div>
              {data.incidents.recent.length === 0 ? <Empty>No open incidents.</Empty> : (
                <ul className="db-list">
                  {data.incidents.recent.map((x) => (
                    <li key={x.id}>
                      <span className="db-list-main"><strong>{x.reporting_class || x.incident_class}</strong><small>{x.track_code} · {fmtDate(x.created_at, true)}</small></span>
                      <Badge status={x.status || 'Pending'} />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        )}

        {tab === 'residents' && (
          <div className="db-grid db-grid-2">
            <Card title="Sector membership" icon="bi-people-fill" action="Residents" onAction={() => navigate('/admin/profiling')}>
              <ul className="db-bars">
                {Object.entries(r.sectors).map(([name, n]) => (
                  <li key={name} title={`${name}: ${n}`}>
                    <span className="db-bars-label">{name}</span>
                    <span className="db-bars-track"><span className="db-bars-fill" style={{ width: `${(n / sectorMax) * 100}%` }}></span></span>
                    <span className="db-bars-val">{n}</span>
                  </li>
                ))}
              </ul>
              <p className="db-note">{r.total} accounts in total · {r.pending} pending · {r.action_required} returned for corrections{r.auto_approved_30d ? ` · ${r.auto_approved_30d} auto-approved (30 days)` : ''}</p>
            </Card>
            <Card title="Recent registrations" icon="bi-person-lines-fill" action="Residents" onAction={() => navigate('/admin/profiling')}>
              {data.recent_residents.length === 0 ? <Empty>No registrations yet.</Empty> : (
                <ul className="db-list">
                  {data.recent_residents.map((p) => (
                    <li key={p.resident_id}>
                      <span className="db-list-main">
                        <strong>{p.name}</strong>
                        <small>{p.control_num} · {fmtDate(p.date_registered)}{p.approval_method ? ` · ${p.approval_method === 'auto' ? 'auto-approved' : 'approved by staff'}` : ''}</small>
                      </span>
                      <Badge status={p.status} />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        )}

        {tab === 'system' && (
          <div className={`db-grid ${data.activity ? 'db-grid-3' : 'db-grid-2'}`}>
            <Card title="Latest announcements" icon="bi-megaphone-fill" action="Announcements" onAction={() => navigate('/admin/announcements')}>
              {data.announcements.length === 0 ? <Empty>No announcements posted.</Empty> : (
                <ul className="db-list">
                  {data.announcements.map((a) => (
                    <li key={a.announcement_id}>
                      <span className="db-list-main"><strong className="db-clamp">{a.caption || '(no caption)'}</strong><small>{fmtDate(a.created_at)} · {a.audience_type}</small></span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card title="Paid service usage this month" icon="bi-speedometer2">
              <Meter label="SMS (PhilSMS)" used={data.usage.sms_used} cap={data.usage.sms_cap} unit="texts" />
              <Meter label="ID scanner (Google Vision)" used={data.usage.ocr_used} cap={data.usage.ocr_cap} unit="calls" />
              <p className="db-note">Disaster broadcasts are counted but never blocked by the SMS cap.</p>
            </Card>
            {data.activity && (
              <Card title="Recent admin activity" icon="bi-journal-text" action="Audit Log" onAction={() => navigate('/admin/audit-log')}>
                {data.activity.length === 0 ? <Empty>No activity yet.</Empty> : (
                  <ul className="db-list">
                    {data.activity.map((a, i) => (
                      <li key={i}><span className="db-list-main"><strong className="db-clamp">{a.description}</strong><small>{a.actor_username} · {fmtDate(a.created_at, true)}</small></span></li>
                    ))}
                  </ul>
                )}
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
