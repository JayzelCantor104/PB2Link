import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import './AboutPageEditor.css';
import { forceAdminReauth, isAuthFailure } from '../lib/apiClient';
import { ROLE_LABELS, initialsOf, officialName, officialPhotoUrl, setAboutData } from '../lib/officials';

const API_BASE = '/api_backend';
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

const emptyOfficial = { id: null, full_name: '', position: '', role_key: 'kagawad', show_on_about: 1, show_on_print: 1, photo_path: null };

/**
 * Admin editor for the public About page and the barangay council
 * (about_content.php). The council is one shared list: it also prints on
 * certificates (sidebar and signatures) and on the Barangay ID.
 */
const AboutPageEditor = ({ notify, confirm }) => {
  const [officials, setOfficials] = useState(null);
  const [content, setContent] = useState(null);
  const [savedContent, setSavedContent] = useState('');
  const [savingText, setSavingText] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [form, setForm] = useState(null); // official being added/edited
  const [photo, setPhoto] = useState(null); // { file, url }
  const [removePhoto, setRemovePhoto] = useState(false);
  const [savingOfficial, setSavingOfficial] = useState(false);

  const apply = (json) => {
    setOfficials(json.officials || []);
    const c = {
      hero_title: json.content?.hero_title || '',
      hero_subtitle: json.content?.hero_subtitle || '',
      mission: json.content?.mission || '',
      vision: json.content?.vision || '',
      timeline: (json.content?.timeline || []).map((t) => ({ ...t })),
    };
    setContent(c);
    setSavedContent(JSON.stringify(c));
    // Print previews and the About page in this browser pick the change up at once.
    setAboutData({ content: json.content, officials: json.officials });
  };

  const call = async (action, body, isForm = false) => {
    const res = await fetch(`${API_BASE}/about_content.php?action=${action}`, {
      method: 'POST',
      credentials: 'include',
      ...(isForm ? { body } : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    });
    if (isAuthFailure(res.status)) { forceAdminReauth(); throw new Error('auth'); }
    return res.json();
  };

  useEffect(() => {
    fetch(`${API_BASE}/about_content.php?all=1`, { credentials: 'include' })
      .then((r) => r.json())
      .then((json) => { if (json.success) apply(json); else notify('Error', json.message || 'Could not load the About page.', 'error'); })
      .catch(() => notify('Connection Error', 'Unable to reach the server.', 'error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => { if (photo?.url) URL.revokeObjectURL(photo.url); }, [photo]);

  if (!officials || !content) return <div className="ape-loading">Loading the About page…</div>;

  const textDirty = JSON.stringify(content) !== savedContent;
  const printList = officials.filter((o) => Number(o.show_on_print) === 1);
  const hasCaptain = printList.some((o) => o.role_key === 'punong_barangay');
  const hasSecretary = printList.some((o) => o.role_key === 'secretary');

  // ---- Council ----
  const openForm = (o = null) => {
    setForm(o ? { ...o } : { ...emptyOfficial });
    setPhoto(null);
    setRemovePhoto(false);
  };

  const pickPhoto = (file) => {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { notify('Photo not added', 'Use a JPEG, PNG or WEBP image.', 'error'); return; }
    if (file.size > MAX_PHOTO_BYTES) { notify('Photo not added', 'The photo must be 5 MB or smaller.', 'error'); return; }
    setPhoto({ file, url: URL.createObjectURL(file) });
    setRemovePhoto(false);
  };

  const saveOfficial = async (e) => {
    e.preventDefault();
    setSavingOfficial(true);
    try {
      const fd = new FormData();
      if (form.id) fd.append('id', form.id);
      fd.append('full_name', form.full_name);
      fd.append('position', form.position);
      fd.append('role_key', form.role_key);
      fd.append('show_on_about', form.show_on_about ? '1' : '0');
      fd.append('show_on_print', form.show_on_print ? '1' : '0');
      if (photo) fd.append('photo', photo.file);
      if (removePhoto) fd.append('remove_photo', '1');
      const json = await call('save_official', fd, true);
      if (json.success) {
        apply(json);
        setForm(null);
        notify('Saved', json.message, 'success');
      } else {
        notify('Not saved', json.message || 'Could not save.', 'error');
      }
    } catch (err) {
      if (err.message !== 'auth') notify('Connection Error', 'Unable to reach the server.', 'error');
    } finally {
      setSavingOfficial(false);
    }
  };

  const removeOfficial = async (o) => {
    const ok = await confirm(
      'Remove this council member?',
      `${officialName(o)} (${o.position}) will be removed from the About page and from printed certificates. To hide them from only one place, edit them instead.`,
      { confirmLabel: 'Remove', danger: true }
    );
    if (!ok) return;
    setBusyId(o.id);
    try {
      const json = await call('delete_official', { id: o.id });
      if (json.success) { apply(json); notify('Removed', json.message, 'success'); } else notify('Not removed', json.message, 'error');
    } catch (err) {
      if (err.message !== 'auth') notify('Connection Error', 'Unable to reach the server.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const move = async (index, dir) => {
    const next = [...officials];
    const j = index + dir;
    if (j < 0 || j >= next.length) return;
    [next[index], next[j]] = [next[j], next[index]];
    setOfficials(next); // show it at once; the server confirms below
    setBusyId(next[j].id);
    try {
      const json = await call('reorder', { ids: next.map((o) => o.id) });
      if (json.success) apply(json); else notify('Order not saved', json.message, 'error');
    } catch (err) {
      if (err.message !== 'auth') notify('Connection Error', 'Unable to reach the server.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  // ---- Page text ----
  const setField = (key, value) => setContent((c) => ({ ...c, [key]: value }));
  const setEntry = (i, key, value) => setContent((c) => ({ ...c, timeline: c.timeline.map((t, k) => (k === i ? { ...t, [key]: value } : t)) }));
  const moveEntry = (i, dir) => setContent((c) => {
    const t = [...c.timeline];
    const j = i + dir;
    if (j < 0 || j >= t.length) return c;
    [t[i], t[j]] = [t[j], t[i]];
    return { ...c, timeline: t };
  });
  const removeEntry = (i) => setContent((c) => ({ ...c, timeline: c.timeline.filter((_, k) => k !== i) }));
  const addEntry = () => setContent((c) => ({ ...c, timeline: [...c.timeline, { year: String(new Date().getFullYear()), title: '', description: '' }] }));

  const saveText = async () => {
    const ok = await confirm('Publish the About page text?', 'The title, mission, vision and timeline update on the public About page right away.', { confirmLabel: 'Publish' });
    if (!ok) return;
    setSavingText(true);
    try {
      const json = await call('save_content', content);
      if (json.success) { apply(json); notify('Published', json.message, 'success'); } else notify('Not saved', json.message, 'error');
    } catch (err) {
      if (err.message !== 'auth') notify('Connection Error', 'Unable to reach the server.', 'error');
    } finally {
      setSavingText(false);
    }
  };

  const previewUrl = photo?.url || (!removePhoto && form && officialPhotoUrl(form));

  return (
    <div className="ape">
      <div className="ape-intro">
        <p>
          <i className="bi bi-info-circle" aria-hidden="true"></i> The council list is shared: it appears on the public About page <strong>and</strong> prints on
          certificates (the officials' sidebar and the Prepared by / Approved by signatures) and on the Barangay ID.
        </p>
        <a className="ape-view" href="/about" target="_blank" rel="noopener noreferrer"><i className="bi bi-box-arrow-up-right" aria-hidden="true"></i> View About page</a>
      </div>

      {/* ---- Council ---- */}
      <section className="ape-section">
        <div className="ape-section-head">
          <div>
            <h4>Barangay Council</h4>
            <p>Shown in this order. "HON." is added automatically for the Punong Barangay, Kagawads and SK Chairperson.</p>
          </div>
          <button type="button" className="ann-btn-primary" onClick={() => openForm()}>
            <i className="bi bi-person-plus-fill" aria-hidden="true"></i> Add member
          </button>
        </div>

        {(!hasCaptain || !hasSecretary) && (
          <p className="ape-warn">
            <i className="bi bi-exclamation-triangle-fill" aria-hidden="true"></i>
            {!hasCaptain && ' No Punong Barangay is set to print, so certificates fall back to the previous name for "Approved by" and the Barangay ID.'}
            {!hasSecretary && ' No Barangay Secretary is set to print, so certificates fall back to the previous name for "Prepared by".'}
          </p>
        )}

        {officials.length === 0 ? (
          <div className="ape-empty">No council members yet. Add the Punong Barangay first.</div>
        ) : (
          <ol className="ape-officials">
            {officials.map((o, i) => (
              <li key={o.id} className={`ape-official${busyId === o.id ? ' is-busy' : ''}`}>
                <div className="ape-order" aria-label="Change order">
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0 || busyId !== null} aria-label={`Move ${o.full_name} up`}><i className="bi bi-chevron-up"></i></button>
                  <button type="button" onClick={() => move(i, 1)} disabled={i === officials.length - 1 || busyId !== null} aria-label={`Move ${o.full_name} down`}><i className="bi bi-chevron-down"></i></button>
                </div>
                <div className="ape-avatar">
                  {officialPhotoUrl(o) ? <img src={officialPhotoUrl(o)} alt="" /> : <span>{initialsOf(o.full_name)}</span>}
                </div>
                <div className="ape-official-main">
                  <strong>{officialName(o)}</strong>
                  <span>{o.position}</span>
                  <span className="ape-tags">
                    <em className="ape-role">{ROLE_LABELS[o.role_key] || o.role_key}</em>
                    <em className={Number(o.show_on_about) ? 'is-on' : 'is-off'}><i className={`bi ${Number(o.show_on_about) ? 'bi-eye' : 'bi-eye-slash'}`}></i> About page</em>
                    <em className={Number(o.show_on_print) ? 'is-on' : 'is-off'}><i className={`bi ${Number(o.show_on_print) ? 'bi-printer' : 'bi-slash-circle'}`}></i> Certificates</em>
                  </span>
                </div>
                <div className="ape-official-actions">
                  <button type="button" className="ape-action" onClick={() => openForm(o)}><i className="bi bi-pencil"></i> Edit</button>
                  <button type="button" className="ape-action is-danger" onClick={() => removeOfficial(o)} aria-label={`Remove ${o.full_name}`} title="Remove"><i className="bi bi-trash3"></i></button>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* ---- Page text ---- */}
      <section className="ape-section">
        <div className="ape-section-head">
          <div>
            <h4>About page text</h4>
            <p>The banner, mission, vision and the history timeline. Saved with the capitalisation you type.</p>
          </div>
          <button type="button" className="ann-btn-primary" onClick={saveText} disabled={!textDirty || savingText}>
            <i className="bi bi-cloud-upload" aria-hidden="true"></i> {savingText ? 'Publishing…' : textDirty ? 'Publish changes' : 'No changes'}
          </button>
        </div>

        <div className="ape-fields">
          <label>Banner title
            <input type="text" className="keep-case" maxLength={200} value={content.hero_title} onChange={(e) => setField('hero_title', e.target.value)} />
          </label>
          <label>Banner subtitle
            <textarea className="keep-case" rows={2} maxLength={400} value={content.hero_subtitle} onChange={(e) => setField('hero_subtitle', e.target.value)} />
          </label>
          <div className="ape-two">
            <label>Mission
              <textarea className="keep-case" rows={5} maxLength={2000} value={content.mission} onChange={(e) => setField('mission', e.target.value)} />
            </label>
            <label>Vision
              <textarea className="keep-case" rows={5} maxLength={2000} value={content.vision} onChange={(e) => setField('vision', e.target.value)} />
            </label>
          </div>
        </div>

        <div className="ape-timeline">
          <div className="ape-timeline-head">
            <h5>Timeline</h5>
            <button type="button" className="ann-btn-secondary" onClick={addEntry} disabled={content.timeline.length >= 20}><i className="bi bi-plus-lg"></i> Add entry</button>
          </div>
          {content.timeline.length === 0 && <div className="ape-empty">No timeline entries. The section shows empty on the About page.</div>}
          {content.timeline.map((t, i) => (
            <div key={i} className="ape-entry">
              <div className="ape-order">
                <button type="button" onClick={() => moveEntry(i, -1)} disabled={i === 0} aria-label="Move entry up"><i className="bi bi-chevron-up"></i></button>
                <button type="button" onClick={() => moveEntry(i, 1)} disabled={i === content.timeline.length - 1} aria-label="Move entry down"><i className="bi bi-chevron-down"></i></button>
              </div>
              <input className="ape-year keep-case" type="text" inputMode="numeric" maxLength={20} placeholder="Year" value={t.year} onChange={(e) => setEntry(i, 'year', e.target.value)} aria-label="Year" />
              <div className="ape-entry-main">
                <input type="text" className="keep-case" maxLength={120} placeholder="Title" value={t.title} onChange={(e) => setEntry(i, 'title', e.target.value)} aria-label="Title" />
                <textarea className="keep-case" rows={2} maxLength={600} placeholder="What happened" value={t.description} onChange={(e) => setEntry(i, 'description', e.target.value)} aria-label="Description" />
              </div>
              <button type="button" className="ape-action is-danger" onClick={() => removeEntry(i)} aria-label="Remove entry" title="Remove entry"><i className="bi bi-trash3"></i></button>
            </div>
          ))}
        </div>
      </section>

      {/* ---- Add / edit a member ---- */}
      {form && createPortal(
        <div className="ape-overlay" onClick={() => !savingOfficial && setForm(null)}>
          <form className="ape-modal" onClick={(e) => e.stopPropagation()} onSubmit={saveOfficial}>
            <div className="ape-modal-head">
              <h4>{form.id ? 'Edit council member' : 'Add council member'}</h4>
              <button type="button" className="ape-close" onClick={() => setForm(null)} aria-label="Close"><i className="bi bi-x-lg"></i></button>
            </div>

            <div className="ape-photo">
              <div className="ape-avatar is-large">
                {previewUrl ? <img src={previewUrl} alt="" /> : <span>{initialsOf(form.full_name) || '?'}</span>}
              </div>
              <div>
                <label className="ann-btn-secondary ape-file">
                  <i className="bi bi-camera"></i> {previewUrl ? 'Change photo' : 'Add photo'}
                  <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => { pickPhoto(e.target.files?.[0]); e.target.value = ''; }} />
                </label>
                {previewUrl && (
                  <button type="button" className="ape-link" onClick={() => { setPhoto(null); setRemovePhoto(!!form.photo_path); }}>Remove photo</button>
                )}
                <small>Portrait photo, JPEG/PNG/WEBP, up to 5 MB. Without one, initials are shown.</small>
              </div>
            </div>

            <label>Full name
              <input type="text" required maxLength={150} value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="e.g. Juan D. Dela Cruz (without HON.)" />
            </label>
            <label>Role
              <select value={form.role_key} onChange={(e) => {
                const role = e.target.value;
                const auto = { punong_barangay: 'Punong Barangay', sk_chair: 'SK Chairperson', secretary: 'Barangay Secretary', treasurer: 'Barangay Treasurer' }[role];
                setForm({ ...form, role_key: role, position: auto && !form.position ? auto : form.position });
              }}>
                {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label>Position or committee
              <input type="text" required maxLength={150} value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} placeholder={form.role_key === 'kagawad' ? 'e.g. Committee on Health' : 'e.g. Punong Barangay'} />
            </label>
            {form.role_key === 'punong_barangay' && <small className="ape-hint">Signs "Approved by" on certificates and appears on the Barangay ID.</small>}
            {form.role_key === 'secretary' && <small className="ape-hint">Signs "Prepared by" on certificates.</small>}

            <fieldset className="ape-checks">
              <legend>Show on</legend>
              <label><input type="checkbox" checked={!!Number(form.show_on_about)} onChange={(e) => setForm({ ...form, show_on_about: e.target.checked ? 1 : 0 })} /> Public About page</label>
              <label><input type="checkbox" checked={!!Number(form.show_on_print)} onChange={(e) => setForm({ ...form, show_on_print: e.target.checked ? 1 : 0 })} /> Printed certificates</label>
            </fieldset>

            <div className="ape-modal-foot">
              <button type="button" className="ann-btn-secondary" onClick={() => setForm(null)} disabled={savingOfficial}>Cancel</button>
              <button type="submit" className="ann-btn-primary" disabled={savingOfficial}>{savingOfficial ? 'Saving…' : 'Save'}</button>
            </div>
          </form>
        </div>,
        document.body
      )}
    </div>
  );
};

export default AboutPageEditor;
