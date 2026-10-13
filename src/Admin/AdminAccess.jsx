import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { forceAdminReauth, isAuthFailure } from '../lib/apiClient';

const API_BASE = '/api_backend';

/**
 * Super Admin: an admin's barangay position and permission overrides
 * (admin_manage.php action 'set_access', admin_permissions.php, migration 020).
 * Each permission either follows the position's default, or is allowed /
 * denied for this admin only. Super Admins always have every permission.
 *
 * props: admin (row from admin_manage.php), meta { positions, permission_labels,
 *        position_permissions }, onClose(), onSaved(), notify(title, message, type)
 */
export const AccessModal = ({ admin, meta, onClose, onSaved, notify }) => {
  const [position, setPosition] = useState(admin.position || '');
  const [overrides, setOverrides] = useState(admin.permission_overrides || {});
  const [busy, setBusy] = useState(false);
  const perms = Object.entries(meta.permission_labels || {});
  const fromPosition = (perm) => (meta.position_permissions?.[position] || []).includes(perm);
  const effective = (perm) => (admin.role === 'Super' ? true : perm in overrides ? overrides[perm] : fromPosition(perm));

  const setOverride = (perm, v) => setOverrides((o) => {
    const next = { ...o };
    if (v === 'default') delete next[perm]; else next[perm] = v === 'allow';
    return next;
  });

  const save = async () => {
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/admin_manage.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'set_access', admin_id: admin.admin_id, position, overrides }),
      });
      if (isAuthFailure(res.status)) { forceAdminReauth(); return; }
      const data = await res.json();
      const ok = data.status === 'success';
      notify(ok ? 'Access Saved' : 'Not Saved', data.message, ok ? 'success' : 'error');
      if (ok) onSaved();
    } catch {
      notify('Connection Error', 'Unable to reach the server.', 'error');
    } finally {
      setBusy(false);
    }
  };

  // Portal: the admin content area forms its own stacking context, which put
  // the sidebar over the dialog.
  return createPortal(
    <div className="am-access-overlay" onClick={onClose}>
      <div className="am-access-modal" role="dialog" aria-modal="true" aria-labelledby="am-access-title" onClick={(e) => e.stopPropagation()}>
        <h3 id="am-access-title">Position & access: {admin.fullname || admin.username}</h3>
        {admin.role === 'Super' && <p className="am-access-note">Super Admins always have every permission. The position is shown for reference.</p>}
        <label className="am-access-field">
          Barangay position
          <select value={position} onChange={(e) => setPosition(e.target.value)}>
            <option value="">No position</option>
            {(meta.positions || []).map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <table className="am-access-table">
          <thead><tr><th>Permission</th><th>For this admin</th><th>Result</th></tr></thead>
          <tbody>
            {perms.map(([perm, label]) => (
              <tr key={perm}>
                <td>{label}</td>
                <td>
                  <select
                    value={perm in overrides ? (overrides[perm] ? 'allow' : 'deny') : 'default'}
                    onChange={(e) => setOverride(perm, e.target.value)}
                    disabled={admin.role === 'Super'}
                    aria-label={`${label} for this admin`}
                  >
                    <option value="default">Follow position ({fromPosition(perm) ? 'allowed' : 'not allowed'})</option>
                    <option value="allow">Allow</option>
                    <option value="deny">Deny</option>
                  </select>
                </td>
                <td>{effective(perm) ? <span className="am-perm-yes">Allowed</span> : <span className="am-perm-no">No</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="am-access-actions">
          <button type="button" className="am-setting-btn is-off" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="am-setting-btn" onClick={save} disabled={busy}>{busy ? 'Saving...' : 'Save Access'}</button>
        </div>
      </div>
    </div>,
    document.body
  );
};

/**
 * Super Admin: default permissions per barangay position
 * (system_settings 'position_permissions'). An admin's own overrides win.
 */
export const PositionPermissionsCard = ({ meta, onSaved, notify }) => {
  const [matrix, setMatrix] = useState(meta.position_permissions || {});
  const [busy, setBusy] = useState(false);
  const perms = Object.entries(meta.permission_labels || {});

  const toggle = (pos, perm) => setMatrix((m) => {
    const list = m[pos] || [];
    return { ...m, [pos]: list.includes(perm) ? list.filter((p) => p !== perm) : [...list, perm] };
  });

  const save = async () => {
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/system_settings.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ position_permissions: matrix }),
      });
      if (isAuthFailure(res.status)) { forceAdminReauth(); return; }
      const data = await res.json();
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
        <h4>Permissions by position</h4>
        <p>What each barangay position may do by default. You can still allow or deny a permission for one admin with the key button in the table.</p>
        <div className="am-access-wrap">
          <table className="am-access-table">
            <thead><tr><th>Position</th>{perms.map(([perm, label]) => <th key={perm}>{label}</th>)}</tr></thead>
            <tbody>
              {(meta.positions || []).map((pos) => (
                <tr key={pos}>
                  <td>{pos}</td>
                  {perms.map(([perm, label]) => (
                    <td key={perm} className="am-center">
                      <input type="checkbox" checked={(matrix[pos] || []).includes(perm)} onChange={() => toggle(pos, perm)} aria-label={`${pos}: ${label}`} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <button type="button" className="am-setting-btn" onClick={save} disabled={busy}>{busy ? 'Saving...' : 'Save Positions'}</button>
    </div>
  );
};
