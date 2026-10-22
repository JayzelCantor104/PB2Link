import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { forceAdminReauth, isAuthFailure } from '../lib/apiClient';
import { PERMISSION_LOOKUP, shortPermission } from '../lib/adminAccess';

const API_BASE = '/api_backend';

/*
 * Super Admin: what standard admins may open (admin_permissions.php).
 * A standard admin's access is worked out in three layers:
 *   1. Standard admin access: what every standard admin gets;
 *   2. their barangay position, which only adds;
 *   3. Allow / Deny for one person, where Deny always wins.
 * Super Admins always have everything. Manage Admins, the Audit Log and
 * system settings stay Super-only and can't be given.
 *
 * meta (from admin_manage.php GET): { positions, permission_labels,
 *   position_permissions, standard_permissions }
 */

const permRows = (meta) => Object.entries(meta.permission_labels || {}).map(([key, label]) => ({
  key,
  label,
  group: PERMISSION_LOOKUP[key]?.group || 'Tabs',
  icon: PERMISSION_LOOKUP[key]?.icon || 'bi-dot',
  note: PERMISSION_LOOKUP[key]?.note || '',
}));

const groupRows = (rows) => ['Tabs', 'Payments'].map((g) => [g, rows.filter((r) => r.group === g)]).filter(([, list]) => list.length);

const GROUP_TITLES = { Tabs: 'Sidebar tabs', Payments: 'Payments' };

/** The default an admin gets before any Allow / Deny of their own. */
const defaultFor = (meta, position, perm) => {
  if ((meta.standard_permissions || []).includes(perm)) return 'standard';
  if (position && (meta.position_permissions?.[position] || []).includes(perm)) return 'position';
  return null;
};

const postJson = async (url, body) => {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  if (isAuthFailure(res.status)) { forceAdminReauth(); return null; }
  return res.json();
};

/**
 * One admin's position and Allow / Deny (admin_manage.php action 'set_access').
 * props: admin, meta, onClose(), onSaved(), notify(title, message, type)
 */
export const AccessModal = ({ admin, meta, onClose, onSaved, notify }) => {
  const [position, setPosition] = useState(admin.position || '');
  const [overrides, setOverrides] = useState(admin.permission_overrides || {});
  const [busy, setBusy] = useState(false);
  const isSuper = admin.role === 'Super';
  const rows = permRows(meta);
  const effective = (perm) => (isSuper ? true : perm in overrides ? overrides[perm] : !!defaultFor(meta, position, perm));
  const granted = rows.filter((r) => effective(r.key));

  const setOverride = (perm, v) => setOverrides((o) => {
    const next = { ...o };
    if (v === 'default') delete next[perm]; else next[perm] = v === 'allow';
    return next;
  });

  const save = async () => {
    setBusy(true);
    try {
      const data = await postJson(`${API_BASE}/admin_manage.php`, { action: 'set_access', admin_id: admin.admin_id, position, overrides });
      if (!data) return;
      const ok = data.status === 'success';
      notify(ok ? 'Access Saved' : 'Not Saved', data.message, ok ? 'success' : 'error');
      if (ok) onSaved();
    } catch {
      notify('Connection Error', 'Unable to reach the server.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const defaultLabel = (perm) => {
    const src = defaultFor(meta, position, perm);
    if (src === 'standard') return 'Default: yes (all admins)';
    if (src === 'position') return `Default: yes (${position})`;
    return 'Default: no';
  };

  // Portal: the admin content area forms its own stacking context, which put
  // the sidebar over the dialog.
  return createPortal(
    <div className="am-access-overlay" onClick={onClose}>
      <div className="am-access-modal" role="dialog" aria-modal="true" aria-labelledby="am-access-title" onClick={(e) => e.stopPropagation()}>
        <h3 id="am-access-title">Access: {admin.fullname || admin.username}</h3>
        {isSuper ? (
          <p className="am-access-note">Super Admins always have every tab and permission. The position is shown for reference.</p>
        ) : (
          <p className="am-access-note">
            Each line starts from the default: what every standard admin gets, plus their position. Choose <strong>Allow</strong> or <strong>Deny</strong> to change it for this person only. A Deny always wins.
          </p>
        )}
        <label className="am-access-field">
          Barangay position
          <select value={position} onChange={(e) => setPosition(e.target.value)}>
            <option value="">No position</option>
            {(meta.positions || []).map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <div className="am-access-wrap">
          <table className="am-access-table">
            <thead><tr><th>Can open / do</th><th>For this admin</th><th>Result</th></tr></thead>
            {groupRows(rows).map(([group, list]) => (
              <tbody key={group}>
                <tr className="am-access-group"><th colSpan={3}>{GROUP_TITLES[group]}</th></tr>
                {list.map((r) => (
                  <tr key={r.key}>
                    <td><i className={`bi ${r.icon}`} aria-hidden="true"></i> {r.label}{r.note && <small className="am-access-hint">{r.note}</small>}</td>
                    <td>
                      <select
                        value={r.key in overrides ? (overrides[r.key] ? 'allow' : 'deny') : 'default'}
                        onChange={(e) => setOverride(r.key, e.target.value)}
                        disabled={isSuper}
                        aria-label={`${r.label} for this admin`}
                      >
                        <option value="default">{defaultLabel(r.key)}</option>
                        <option value="allow">Allow</option>
                        <option value="deny">Deny</option>
                      </select>
                    </td>
                    <td>{effective(r.key) ? <span className="am-perm-yes">Yes</span> : <span className="am-perm-no">No</span>}</td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
        {!isSuper && (
          <p className="am-access-summary" aria-live="polite">
            {granted.length === 0
              ? 'This admin will only see the Dashboard.'
              : `This admin will see: Dashboard, ${granted.map((r) => shortPermission(r.key)).join(', ')}.`}
          </p>
        )}
        <div className="am-access-actions">
          <button type="button" className="am-setting-btn is-off" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="am-setting-btn" onClick={save} disabled={busy || isSuper}>{busy ? 'Saving...' : 'Save Access'}</button>
        </div>
      </div>
    </div>,
    document.body
  );
};

/**
 * What every standard admin gets (system_settings 'standard_admin_permissions').
 */
export const StandardAccessCard = ({ meta, onSaved, notify }) => {
  const [list, setList] = useState(meta.standard_permissions || []);
  const [busy, setBusy] = useState(false);
  const rows = permRows(meta);
  const saved = meta.standard_permissions || [];
  const dirty = list.length !== saved.length || list.some((p) => !saved.includes(p));

  const toggle = (perm) => setList((l) => (l.includes(perm) ? l.filter((p) => p !== perm) : [...l, perm]));

  const save = async () => {
    setBusy(true);
    try {
      const data = await postJson(`${API_BASE}/system_settings.php`, { standard_admin_permissions: list });
      if (!data) return;
      notify(data.success ? 'Setting Saved' : 'Not Saved', data.message, data.success ? 'success' : 'error');
      if (data.success) onSaved();
    } catch {
      notify('Connection Error', 'Unable to reach the server.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="am-setting-card am-positions">
      <div>
        <h4>Standard admin access</h4>
        <p>
          The tabs every standard admin can open. Untick a tab to hide it from the sidebar and block it on the server for every standard admin.
          A position below, or the <strong>Access</strong> button for one person, can still add it back. The Dashboard is always shown, and only shows what each admin can open.
        </p>
        {groupRows(rows).map(([group, list2]) => (
          <fieldset key={group} className="am-std-group">
            <legend>{GROUP_TITLES[group]}</legend>
            <div className="am-std-grid">
              {list2.map((r) => (
                <label key={r.key} className={`am-std-item${list.includes(r.key) ? ' is-on' : ''}`}>
                  <input type="checkbox" checked={list.includes(r.key)} onChange={() => toggle(r.key)} />
                  <i className={`bi ${r.icon}`} aria-hidden="true"></i>
                  <span>{r.label}{r.note && <small>{r.note}</small>}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ))}
        <p className="am-std-fixed"><i className="bi bi-lock" aria-hidden="true"></i> Manage Admins, the Audit Log and system settings are for Super Admins only and can't be given.</p>
      </div>
      <button type="button" className="am-setting-btn" onClick={save} disabled={busy || !dirty}>{busy ? 'Saving...' : 'Save Standard Access'}</button>
    </div>
  );
};

/**
 * What each barangay position adds on top of standard access
 * (system_settings 'position_permissions'). Rows are permissions, columns positions.
 */
export const PositionPermissionsCard = ({ meta, onSaved, notify }) => {
  const [matrix, setMatrix] = useState(meta.position_permissions || {});
  const [busy, setBusy] = useState(false);
  const rows = permRows(meta);
  const positions = meta.positions || [];
  const standard = meta.standard_permissions || [];

  const toggle = (pos, perm) => setMatrix((m) => {
    const list = m[pos] || [];
    return { ...m, [pos]: list.includes(perm) ? list.filter((p) => p !== perm) : [...list, perm] };
  });

  const save = async () => {
    setBusy(true);
    try {
      const data = await postJson(`${API_BASE}/system_settings.php`, { position_permissions: matrix });
      if (!data) return;
      notify(data.success ? 'Setting Saved' : 'Not Saved', data.message, data.success ? 'success' : 'error');
      if (data.success) onSaved();
    } catch {
      notify('Connection Error', 'Unable to reach the server.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="am-setting-card am-positions">
      <div>
        <h4>Extra access by position</h4>
        <p>What a barangay position adds on top of standard access, for example payments for the Treasurer. Lines every admin already has are ticked and locked.</p>
        <div className="am-access-wrap">
          <table className="am-access-table am-pos-table">
            <thead>
              <tr><th>Can open / do</th>{positions.map((pos) => <th key={pos} className="am-center">{pos}</th>)}</tr>
            </thead>
            {groupRows(rows).map(([group, list]) => (
              <tbody key={group}>
                <tr className="am-access-group"><th colSpan={positions.length + 1}>{GROUP_TITLES[group]}</th></tr>
                {list.map((r) => {
                  const everyone = standard.includes(r.key);
                  return (
                    <tr key={r.key} className={everyone ? 'is-standard' : ''}>
                      <td><i className={`bi ${r.icon}`} aria-hidden="true"></i> {r.label}{everyone && <small className="am-access-hint">All admins have this</small>}</td>
                      {positions.map((pos) => (
                        <td key={pos} className="am-center">
                          <input
                            type="checkbox"
                            checked={everyone || (matrix[pos] || []).includes(r.key)}
                            disabled={everyone}
                            onChange={() => toggle(pos, r.key)}
                            aria-label={`${pos}: ${r.label}`}
                          />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            ))}
          </table>
        </div>
      </div>
      <button type="button" className="am-setting-btn" onClick={save} disabled={busy}>{busy ? 'Saving...' : 'Save Positions'}</button>
    </div>
  );
};
