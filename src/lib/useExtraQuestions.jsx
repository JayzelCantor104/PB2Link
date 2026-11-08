import React, { useCallback, useMemo, useState } from 'react';
import { useBuiltinService } from './builtinServices';
import '../styles/service-questions.css';

// Extra questions staff added to the end of a built-in form (Services
// Management, migration 031). The server checks every answer again
// (service_fields_common.php); this only guides the resident.
//
//   const extra = useExtraQuestions(requestMode);
//   {extra.section}                         on the form's last step
//   const problem = extra.check();          before submitting (null = fine)
//   extra.append(formData);                 adds extra_answers + extra_<name> files

const FILE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_FILE = 10 * 1024 * 1024;

const parseOptions = (raw) => {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const p = JSON.parse(raw);
    return Array.isArray(p) ? p : [];
  } catch {
    return String(raw).split(',').map((s) => s.trim()).filter(Boolean);
  }
};

const visibleFor = (f, mode) => {
  const t = f.show_for_target || 'all';
  if (t === 'myself_only') return mode !== 'Others';
  if (t === 'someone_else_only') return mode === 'Others';
  return true;
};

export default function useExtraQuestions(mode = 'Self') {
  const { fields } = useBuiltinService();
  const [answers, setAnswers] = useState({});
  const [files, setFiles] = useState({});
  const [errors, setErrors] = useState([]);
  const [fileError, setFileError] = useState('');

  const visible = useMemo(() => (fields || []).filter((f) => visibleFor(f, mode)), [fields, mode]);

  const setAnswer = (name, value) => {
    setAnswers((a) => ({ ...a, [name]: value }));
    setErrors((e) => e.filter((x) => x !== name));
  };
  const toggle = (name, opt) => {
    setAnswers((a) => {
      const cur = Array.isArray(a[name]) ? a[name] : [];
      return { ...a, [name]: cur.includes(opt) ? cur.filter((o) => o !== opt) : [...cur, opt] };
    });
    setErrors((e) => e.filter((x) => x !== name));
  };
  const pickFile = (name, file) => {
    if (!file) return;
    if (!FILE_TYPES.includes(file.type)) { setFileError('Please upload a JPEG, PNG, WebP image, or a PDF.'); return; }
    if (file.size > MAX_FILE) { setFileError('Each file must be 10MB or smaller.'); return; }
    setFileError('');
    setFiles((f) => ({ ...f, [name]: file }));
    setErrors((e) => e.filter((x) => x !== name));
  };

  const isEmpty = useCallback((f) => {
    if (f.field_type === 'file') return !files[f.field_name];
    const v = answers[f.field_name];
    return Array.isArray(v) ? v.length === 0 : !v || String(v).trim() === '';
  }, [answers, files]);

  /** A message for the first unanswered required question, or null. */
  const check = useCallback(() => {
    const missing = visible.filter((f) => Number(f.is_required) === 1 && isEmpty(f));
    setErrors(missing.map((f) => f.field_name));
    if (!missing.length) return null;
    const el = document.getElementById(`sq-${missing[0].field_name}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return `Please answer: ${missing[0].field_label}.`;
  }, [visible, isEmpty]);

  const append = useCallback((fd) => {
    if (!visible.length) return;
    const out = {};
    visible.forEach((f) => {
      if (f.field_type === 'file') {
        if (files[f.field_name]) fd.append(`extra_${f.field_name}`, files[f.field_name]);
      } else if (answers[f.field_name] !== undefined) {
        out[f.field_name] = answers[f.field_name];
      }
    });
    fd.append('extra_answers', JSON.stringify(out));
  }, [visible, answers, files]);

  const control = (f) => {
    const name = f.field_name;
    const id = `sq-${name}`;
    const opts = parseOptions(f.field_options);
    const value = answers[name] ?? (f.field_type === 'checkbox' ? [] : '');
    const bad = errors.includes(name) ? ' is-invalid' : '';
    switch (f.field_type) {
      case 'textarea':
        return <textarea id={id} rows="3" className={`sq-input${bad}`} value={value} onChange={(e) => setAnswer(name, e.target.value)} />;
      case 'select':
        return (
          <select id={id} className={`sq-input${bad}`} value={value} onChange={(e) => setAnswer(name, e.target.value)}>
            <option value="">Select an option</option>
            {opts.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        );
      case 'radio':
        return (
          <div id={id} className={`sq-choices${bad}`} role="radiogroup" aria-labelledby={`${id}-label`}>
            {opts.map((o) => (
              <label key={o} className={`sq-choice${value === o ? ' is-checked' : ''}`}>
                <input type="radio" name={id} checked={value === o} onChange={() => setAnswer(name, o)} /> <span>{o}</span>
              </label>
            ))}
          </div>
        );
      case 'checkbox':
        return (
          <div id={id} className={`sq-choices${bad}`}>
            {(opts.length ? opts : ['Yes']).map((o) => (
              <label key={o} className={`sq-choice${value.includes(o) ? ' is-checked' : ''}`}>
                <input type="checkbox" checked={value.includes(o)} onChange={() => toggle(name, o)} /> <span>{o}</span>
              </label>
            ))}
          </div>
        );
      case 'file': {
        const file = files[name];
        return (
          <label id={id} className={`sq-file${file ? ' has-file' : ''}${bad}`}>
            <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => { pickFile(name, e.target.files?.[0]); e.target.value = ''; }} />
            <i className={`bi ${file ? 'bi-check-circle-fill' : 'bi-cloud-arrow-up'}`} aria-hidden="true"></i>
            <span>{file ? file.name : 'Choose a file (JPEG, PNG, WebP or PDF, up to 10MB)'}</span>
          </label>
        );
      }
      default: {
        const type = ['number', 'date', 'time'].includes(f.field_type) ? f.field_type : 'text';
        return <input id={id} type={type} className={`sq-input${bad}`} value={value} onChange={(e) => setAnswer(name, e.target.value)} />;
      }
    }
  };

  const section = visible.length ? (
    <div className="sq-section">
      <h4 className="sq-title"><i className="bi bi-list-check" aria-hidden="true"></i> Additional Questions</h4>
      {fileError && <p className="sq-error" role="alert">{fileError}</p>}
      <div className="sq-grid">
        {visible.map((f) => (
          <div key={f.field_id} className={`sq-field${['textarea', 'radio', 'checkbox', 'file'].includes(f.field_type) ? ' is-wide' : ''}`}>
            <label id={`sq-${f.field_name}-label`} htmlFor={`sq-${f.field_name}`} className="sq-label">
              {f.field_label}{Number(f.is_required) === 1 && <span className="sq-req"> *</span>}
            </label>
            {control(f)}
            {f.help_text && <small className="sq-hint">{f.help_text}</small>}
          </div>
        ))}
      </div>
    </div>
  ) : null;

  // answers / restoreAnswers: for the form draft (src/lib/useFormDraft.jsx). Files are not kept.
  return { fields: visible, section, check, append, answers, restoreAnswers: setAnswers };
}
