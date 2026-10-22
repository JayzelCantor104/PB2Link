import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import '../styles/preparedness.css';

const API_BASE = '/api_backend';

// The officials' checklist for one advisory (disaster_risk.php get_tasks /
// toggle_task, migration 033). Tasks of the advisory's level and below.
const AdvisoryChecklist = ({ alert, onClose, onChanged, showToast }) => {
  const [tasks, setTasks] = useState(null);
  const [busy, setBusy] = useState(0);
  const active = Number(alert.is_active) === 1;

  useEffect(() => {
    let cancelled = false;
    axios.get(`${API_BASE}/disaster_risk.php`, { params: { action: 'get_tasks', alert_id: alert.id } })
      .then((res) => {
        if (cancelled) return;
        if (res.data?.success) setTasks(res.data.tasks || []);
        else { setTasks([]); showToast(res.data?.message || 'The checklist could not be loaded.', 'error'); }
      })
      .catch(() => { if (!cancelled) { setTasks([]); showToast('Network error while loading the checklist.', 'error'); } });
    return () => { cancelled = true; };
  }, [alert.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = async (t) => {
    setBusy(t.id);
    try {
      const res = await axios.post(`${API_BASE}/disaster_risk.php?action=toggle_task`, { alert_id: alert.id, task_id: t.id, done: !t.done });
      if (res.data?.success) {
        setTasks(res.data.tasks || []);
        onChanged?.();
      } else {
        showToast(res.data?.message || 'Could not update the task.', 'error');
      }
    } catch {
      showToast('Network error.', 'error');
    } finally {
      setBusy(0);
    }
  };

  const done = (tasks || []).filter((t) => t.done).length;

  // On <body>: the admin content column is its own stacking layer, under the sidebar.
  return createPortal(
    <div className="modal-backdrop prep-modal" onClick={onClose}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="adv-tasks-h">
        <div className="modal-header">
          <h4 id="adv-tasks-h"><i className="bi bi-list-check" style={{ color: '#047857' }}></i> Officials’ checklist</h4>
          <button type="button" className="modal-close-btn" aria-label="Close" onClick={onClose}><i className="bi bi-x-lg"></i></button>
        </div>
        <div className="modal-body">
          <p style={{ margin: '0 0 6px', fontWeight: 700, color: '#0f172a' }}>
            {alert.title} <span className={`alert-badge badge-${(alert.alert_level || 'advisory').toLowerCase()}`}>{alert.alert_level}</span>
            {Number(alert.is_practice) === 1 && <span className="adv-practice-tag"><i className="bi bi-mortarboard"></i> PRACTICE</span>}
          </p>
          {tasks === null ? <p className="prep-muted">Loading…</p> : tasks.length === 0 ? (
            <p className="prep-muted">No checklist tasks for this level. Add them on the Preparedness & Checklists tab.</p>
          ) : (
            <>
              <p className="prep-muted" style={{ marginTop: 0 }}>
                {done} of {tasks.length} done.{!active && ' This advisory is no longer active, so the checklist is read-only.'}
              </p>
              <div className="prep-bar" aria-hidden="true"><span style={{ width: `${(done / tasks.length) * 100}%` }}></span></div>
              <ul className="adv-tasks">
                {tasks.map((t) => (
                  <li key={t.id} className={`adv-task ${t.done ? 'is-done' : ''}`}>
                    <label>
                      <input type="checkbox" checked={t.done} disabled={!active || busy === t.id} onChange={() => toggle(t)} />
                      <span className="adv-task-text">
                        {t.task}
                        {t.done && <span className="adv-task-meta">Done by {t.done_by || 'staff'} · {t.done_at}</span>}
                      </span>
                      <span className="adv-task-level">{t.alert_level}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
        <div className="modal-footer">
          <button type="button" className="btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default AdvisoryChecklist;
