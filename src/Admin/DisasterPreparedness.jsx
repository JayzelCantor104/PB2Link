import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { GUIDE_HAZARDS, GUIDE_PHASES, HOTLINE_CATEGORIES, loadPreparedness } from '../lib/preparedness';
import '../styles/preparedness.css';

const API_BASE = '/api_backend';
const LEVELS = ['Advisory', 'Watch', 'Warning', 'Severe'];
const emptyHotline = { id: 0, name: '', number: '', category: 'barangay', note: '', is_active: 1 };

// Admin Disaster Risk → "Preparedness & Checklists" (migration 033):
// emergency hotlines, the officials' checklist per alert level, and the
// before / during / after guides residents see on /preparedness.
const DisasterPreparedness = ({ showToast, confirmToast }) => {
  const [hotlines, setHotlines] = useState([]);
  const [guides, setGuides] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hotlineForm, setHotlineForm] = useState(null);
  const [newTask, setNewTask] = useState({});
  const [taskEdit, setTaskEdit] = useState(null); // { id, alert_level, task, is_active }
  const [hazard, setHazard] = useState('typhoon');
  const [drafts, setDrafts] = useState({}); // "hazard.phase" -> { body, body_fil }
  const [saving, setSaving] = useState('');

  // Loaded once; showToast from the parent is a new function on every render.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [prep, tpl] = await Promise.all([
          axios.get(`${API_BASE}/preparedness.php`, { params: { action: 'admin' } }),
          axios.get(`${API_BASE}/disaster_risk.php`, { params: { action: 'get_task_templates' } }),
        ]);
        if (cancelled) return;
        if (prep.data?.success) {
          setHotlines(prep.data.hotlines || []);
          setGuides(prep.data.guides || []);
        } else if (prep.data?.message) {
          showToast(prep.data.message, 'error');
        }
        if (tpl.data?.success) setTasks(tpl.data.templates || []);
      } catch {
        if (!cancelled) showToast('Preparedness settings could not be loaded.', 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Hotlines ----
  const postPrep = async (action, body) => {
    const res = await axios.post(`${API_BASE}/preparedness.php?action=${action}`, body);
    if (res.data?.hotlines) setHotlines(res.data.hotlines);
    if (res.data?.guides) setGuides(res.data.guides);
    if (res.data?.success) loadPreparedness(true); // refresh the resident-side cards on this page
    return res.data || {};
  };

  const saveHotline = async (e) => {
    e.preventDefault();
    try {
      const data = await postPrep('save_hotline', hotlineForm);
      showToast(data.message || 'Saved.', data.success ? 'success' : 'error');
      if (data.success) setHotlineForm(null);
    } catch {
      showToast('Network error while saving the hotline.', 'error');
    }
  };

  const toggleHotline = async (h) => {
    try {
      const data = await postPrep('save_hotline', { ...h, is_active: h.is_active ? 0 : 1 });
      showToast(data.success ? (h.is_active ? 'Hidden from residents.' : 'Shown to residents.') : data.message, data.success ? 'success' : 'error');
    } catch {
      showToast('Network error.', 'error');
    }
  };

  const deleteHotline = async (h) => {
    if (!(await confirmToast(`Remove ${h.name}?`, `${h.number} will no longer be shown to residents. You can hide it instead to keep it for later.`, { confirmLabel: 'Remove', danger: true }))) return;
    try {
      const data = await postPrep('delete_hotline', { id: h.id });
      showToast(data.message || 'Removed.', data.success ? 'success' : 'error');
    } catch {
      showToast('Network error.', 'error');
    }
  };

  const moveHotline = async (index, dir) => {
    const ids = hotlines.map((h) => h.id);
    const j = index + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    try {
      const data = await postPrep('order_hotlines', { ids });
      if (!data.success) showToast(data.message || 'The order could not be saved.', 'error');
    } catch {
      showToast('Network error.', 'error');
    }
  };

  // ---- Officials' checklist ----
  const postTask = async (action, body, okMessage) => {
    try {
      const res = await axios.post(`${API_BASE}/disaster_risk.php?action=${action}`, body);
      showToast(res.data?.message || okMessage, res.data?.success ? 'success' : 'error');
      if (res.data?.success) {
        const tpl = await axios.get(`${API_BASE}/disaster_risk.php`, { params: { action: 'get_task_templates' } });
        if (tpl.data?.success) setTasks(tpl.data.templates || []);
      }
      return !!res.data?.success;
    } catch {
      showToast('Network error.', 'error');
      return false;
    }
  };

  const addTask = async (level) => {
    const text = (newTask[level] || '').trim();
    if (!text) return;
    if (await postTask('save_task_template', { alert_level: level, task: text, is_active: 1 }, 'Task added.')) {
      setNewTask((n) => ({ ...n, [level]: '' }));
    }
  };

  const saveTaskEdit = async (e) => {
    e.preventDefault();
    if (await postTask('save_task_template', taskEdit, 'Task saved.')) setTaskEdit(null);
  };

  const deleteTask = async (t) => {
    if (!(await confirmToast('Delete this task?', t.task, { confirmLabel: 'Delete', danger: true }))) return;
    postTask('delete_task_template', { id: t.id }, 'Task deleted.');
  };

  // ---- Guides ----
  const guideFor = (h, p) => guides.find((g) => g.hazard === h && g.phase === p);
  const draftFor = (h, p) => drafts[`${h}.${p}`] || { body: guideFor(h, p)?.body || '', body_fil: guideFor(h, p)?.body_fil || '' };
  const setDraft = (h, p, field, value) => setDrafts((d) => ({ ...d, [`${h}.${p}`]: { ...draftFor(h, p), [field]: value } }));
  const isDirty = (h, p) => {
    const d = drafts[`${h}.${p}`];
    if (!d) return false;
    const g = guideFor(h, p);
    return d.body !== (g?.body || '') || d.body_fil !== (g?.body_fil || '');
  };

  const saveGuide = async (p) => {
    const key = `${hazard}.${p}`;
    setSaving(key);
    try {
      const data = await postPrep('save_guide', { hazard, phase: p, ...draftFor(hazard, p) });
      showToast(data.message || 'Saved.', data.success ? 'success' : 'error');
      if (data.success) setDrafts((d) => { const n = { ...d }; delete n[key]; return n; });
    } catch {
      showToast('Network error while saving the guide.', 'error');
    } finally {
      setSaving('');
    }
  };

  if (loading) return <div className="table-card" style={{ padding: '24px', color: '#64748b' }}>Loading…</div>;

  return (
    <div className="prep-admin">
      {/* Hotlines */}
      <div className="table-card" style={{ padding: '20px' }}>
        <div className="prep-card-head">
          <div>
            <h4 style={{ margin: 0, color: '#043927', fontWeight: 800 }}><i className="bi bi-telephone-fill" style={{ color: '#b91c1c' }}></i> Emergency hotlines</h4>
            <small style={{ color: '#64748b' }}>Shown with tap-to-call on Home, Disaster Risk and the preparedness page, in this order. Check each number by calling it before adding it.</small>
          </div>
          <button type="button" className="btn-primary-action" onClick={() => setHotlineForm(emptyHotline)}><i className="bi bi-plus-lg"></i> Add hotline</button>
        </div>
        {hotlines.length === 0 ? <p className="prep-muted">No hotlines yet.</p> : (
          <ul className="prep-admin-list">
            {hotlines.map((h, i) => {
              const cat = HOTLINE_CATEGORIES[h.category] || HOTLINE_CATEGORIES.other;
              return (
                <li key={h.id} className={`prep-admin-row ${h.is_active ? '' : 'is-hidden'}`}>
                  <span className="prep-hotline-icon" aria-hidden="true"><i className={`bi ${cat.icon}`}></i></span>
                  <span className="prep-hotline-main">
                    <strong>{h.name} · {h.number}{!h.is_active && <span className="prep-chip">Hidden</span>}<span className="prep-chip">{cat.label}</span></strong>
                    {h.note && <small>{h.note}</small>}
                  </span>
                  <button type="button" className="btn-icon-action" title="Move up" aria-label={`Move ${h.name} up`} disabled={i === 0} onClick={() => moveHotline(i, -1)}><i className="bi bi-arrow-up"></i></button>
                  <button type="button" className="btn-icon-action" title="Move down" aria-label={`Move ${h.name} down`} disabled={i === hotlines.length - 1} onClick={() => moveHotline(i, 1)}><i className="bi bi-arrow-down"></i></button>
                  <button type="button" className="btn-icon-action" title={h.is_active ? 'Hide from residents' : 'Show to residents'} aria-label={`${h.is_active ? 'Hide' : 'Show'} ${h.name}`} onClick={() => toggleHotline(h)}>
                    <i className={h.is_active ? 'bi bi-eye-fill' : 'bi bi-eye-slash'}></i>
                  </button>
                  <button type="button" className="btn-icon-action" title="Edit" aria-label={`Edit ${h.name}`} onClick={() => setHotlineForm({ ...h, note: h.note || '' })}><i className="bi bi-pencil-fill"></i></button>
                  <button type="button" className="btn-icon-action danger" title="Remove" aria-label={`Remove ${h.name}`} onClick={() => deleteHotline(h)}><i className="bi bi-trash-fill"></i></button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Officials' checklist */}
      <div className="table-card" style={{ padding: '20px' }}>
        <h4 style={{ margin: '0 0 4px', color: '#043927', fontWeight: 800 }}><i className="bi bi-list-check" style={{ color: '#047857' }}></i> Officials’ checklist per alert level</h4>
        <small style={{ color: '#64748b', display: 'block', marginBottom: '12px' }}>
          Each active advisory shows the tasks of its level and every level below it. Staff tick them on the advisory (Advisories tab); ticks are kept with who did them and when.
        </small>
        <div style={{ display: 'grid', gap: '12px' }}>
          {LEVELS.map((level) => {
            const list = tasks.filter((t) => t.alert_level === level);
            return (
              <div key={level} className="prep-level-group">
                <h4><span className={`alert-badge badge-${level.toLowerCase()}`}>{level}</span> <small style={{ color: '#64748b', fontWeight: 600 }}>{list.filter((t) => Number(t.is_active) === 1).length} task(s)</small></h4>
                <ul className="prep-admin-list">
                  {list.map((t) => (
                    <li key={t.id} className={`prep-admin-row ${Number(t.is_active) === 1 ? '' : 'is-hidden'}`}>
                      <span className="prep-hotline-main"><strong style={{ fontWeight: 600 }}>{t.task}{Number(t.is_active) !== 1 && <span className="prep-chip">Hidden</span>}</strong></span>
                      <button type="button" className="btn-icon-action" title={Number(t.is_active) === 1 ? 'Hide' : 'Show'} aria-label={Number(t.is_active) === 1 ? 'Hide task' : 'Show task'}
                        onClick={() => postTask('save_task_template', { ...t, is_active: Number(t.is_active) === 1 ? 0 : 1 }, 'Saved.')}>
                        <i className={Number(t.is_active) === 1 ? 'bi bi-eye-fill' : 'bi bi-eye-slash'}></i>
                      </button>
                      <button type="button" className="btn-icon-action" title="Edit" aria-label="Edit task" onClick={() => setTaskEdit({ id: t.id, alert_level: t.alert_level, task: t.task, is_active: Number(t.is_active) })}><i className="bi bi-pencil-fill"></i></button>
                      <button type="button" className="btn-icon-action danger" title="Delete" aria-label="Delete task" onClick={() => deleteTask(t)}><i className="bi bi-trash-fill"></i></button>
                    </li>
                  ))}
                </ul>
                <form className="prep-form" style={{ gridTemplateColumns: '1fr auto', marginTop: '8px', alignItems: 'center' }} onSubmit={(e) => { e.preventDefault(); addTask(level); }}>
                  <input type="text" maxLength={255} value={newTask[level] || ''} placeholder={`New ${level} task`} aria-label={`New ${level} task`}
                    onChange={(e) => setNewTask((n) => ({ ...n, [level]: e.target.value }))} />
                  <button type="submit" className="btn-secondary" disabled={!(newTask[level] || '').trim()}><i className="bi bi-plus-lg"></i> Add</button>
                </form>
              </div>
            );
          })}
        </div>
      </div>

      {/* Guides */}
      <div className="table-card" style={{ padding: '20px' }}>
        <h4 style={{ margin: '0 0 4px', color: '#043927', fontWeight: 800 }}><i className="bi bi-journal-check" style={{ color: '#047857' }}></i> What to do: before, during, after</h4>
        <small style={{ color: '#64748b', display: 'block', marginBottom: '12px' }}>
          Shown on the public preparedness page. One step per line; written as typed (not in capitals). The Filipino version is optional and shown to residents who choose Filipino.
        </small>
        <div className="prep-hazard-tabs" role="tablist" aria-label="Hazard">
          {GUIDE_HAZARDS.map((h) => (
            <button key={h.key} type="button" role="tab" aria-selected={hazard === h.key} className={hazard === h.key ? 'is-active' : ''} onClick={() => setHazard(h.key)}>
              <i className={`bi ${h.icon}`} aria-hidden="true"></i> {h.label}{GUIDE_PHASES.some((p) => isDirty(h.key, p.key)) ? ' •' : ''}
            </button>
          ))}
        </div>
        <div className="prep-phases">
          {GUIDE_PHASES.map((p) => {
            const d = draftFor(hazard, p.key);
            const key = `${hazard}.${p.key}`;
            return (
              <div key={p.key} className={`prep-phase phase-${p.key} prep-form`}>
                <h3>{p.label}</h3>
                <label>English
                  <textarea className="keep-case" value={d.body} onChange={(e) => setDraft(hazard, p.key, 'body', e.target.value)} />
                </label>
                <label>Filipino <span className="prep-hint">(optional)</span>
                  <textarea className="keep-case" style={{ minHeight: '110px' }} value={d.body_fil} onChange={(e) => setDraft(hazard, p.key, 'body_fil', e.target.value)} />
                </label>
                <button type="button" className="btn-primary-action" disabled={!isDirty(hazard, p.key) || saving === key} onClick={() => saveGuide(p.key)}>
                  <i className="bi bi-save-fill"></i> {saving === key ? 'Saving…' : isDirty(hazard, p.key) ? `Save “${p.label}”` : 'Saved'}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Dialogs on <body>: the admin content column is its own stacking layer. */}
      {hotlineForm && createPortal(
        <div className="modal-backdrop prep-modal" onClick={() => setHotlineForm(null)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="hotline-form-h">
            <div className="modal-header">
              <h4 id="hotline-form-h"><i className="bi bi-telephone-fill" style={{ color: '#b91c1c' }}></i> {hotlineForm.id ? 'Edit hotline' : 'Add hotline'}</h4>
              <button type="button" className="modal-close-btn" aria-label="Close" onClick={() => setHotlineForm(null)}><i className="bi bi-x-lg"></i></button>
            </div>
            <form onSubmit={saveHotline}>
              <div className="modal-body prep-form">
                <label>Name *
                  <input type="text" required maxLength={120} value={hotlineForm.name} onChange={(e) => setHotlineForm({ ...hotlineForm, name: e.target.value })} placeholder="e.g. Barangay Pasong Buaya II Hall" />
                </label>
                <div className="prep-form-row">
                  <label>Number *
                    <input type="tel" inputMode="tel" required maxLength={40} value={hotlineForm.number} onChange={(e) => setHotlineForm({ ...hotlineForm, number: e.target.value })} placeholder="e.g. 0917 123 4567 or (046) 123-4567" />
                  </label>
                  <label>Type
                    <select value={hotlineForm.category} onChange={(e) => setHotlineForm({ ...hotlineForm, category: e.target.value })}>
                      {Object.entries(HOTLINE_CATEGORIES).map(([k, c]) => <option key={k} value={k}>{c.label}</option>)}
                    </select>
                  </label>
                </div>
                <label>Note <span className="prep-hint">(optional, e.g. hours or what it is for)</span>
                  <input type="text" maxLength={200} value={hotlineForm.note} onChange={(e) => setHotlineForm({ ...hotlineForm, note: e.target.value })} />
                </label>
                <label style={{ display: 'flex', gap: '8px', alignItems: 'center', fontWeight: 600 }}>
                  <input type="checkbox" style={{ width: 'auto' }} checked={Number(hotlineForm.is_active) === 1} onChange={(e) => setHotlineForm({ ...hotlineForm, is_active: e.target.checked ? 1 : 0 })} /> Show to residents
                </label>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setHotlineForm(null)}>Cancel</button>
                <button type="submit" className="btn-primary-action"><i className="bi bi-save-fill"></i> Save hotline</button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {taskEdit && createPortal(
        <div className="modal-backdrop prep-modal" onClick={() => setTaskEdit(null)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="task-form-h">
            <div className="modal-header">
              <h4 id="task-form-h"><i className="bi bi-list-check" style={{ color: '#047857' }}></i> Edit checklist task</h4>
              <button type="button" className="modal-close-btn" aria-label="Close" onClick={() => setTaskEdit(null)}><i className="bi bi-x-lg"></i></button>
            </div>
            <form onSubmit={saveTaskEdit}>
              <div className="modal-body prep-form">
                <label>Level
                  <select value={taskEdit.alert_level} onChange={(e) => setTaskEdit({ ...taskEdit, alert_level: e.target.value })}>
                    {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
                </label>
                <label>Task *
                  <input type="text" required maxLength={255} value={taskEdit.task} onChange={(e) => setTaskEdit({ ...taskEdit, task: e.target.value })} />
                </label>
                <small className="prep-hint">Advisories where this task was already ticked keep the wording it had then.</small>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setTaskEdit(null)}>Cancel</button>
                <button type="submit" className="btn-primary-action"><i className="bi bi-save-fill"></i> Save task</button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default DisasterPreparedness;
