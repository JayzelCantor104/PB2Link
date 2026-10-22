import React from 'react';
import '../styles/service-questions.css';

const API_BASE = '/api_backend';

// Uploaded files sit under backend/api/uploads/ (served through /api_backend).
const defaultUrl = (path) => `${API_BASE}/${String(path || '').replace(/^(\.\.\/)+/, '').replace(/^\/+/, '')}`;

/**
 * Answers to the extra questions on a built-in form (extra_answers: a JSON
 * copy of the questions with the answers, migration 031). Renders nothing when
 * the request has none.
 */
const ExtraAnswers = ({ value, fileUrl = defaultUrl, title = 'Additional Questions' }) => {
  let list = value;
  if (typeof value === 'string') {
    try { list = JSON.parse(value); } catch { list = []; }
  }
  if (!Array.isArray(list) || list.length === 0) return null;
  return (
    <div className="sq-answers">
      <h4><i className="bi bi-list-check" aria-hidden="true"></i> {title}</h4>
      <dl>
        {list.map((a) => (
          <React.Fragment key={a.name}>
            <dt>{a.label}</dt>
            <dd>
              {a.type === 'file'
                ? (a.value ? <a href={fileUrl(a.value)} target="_blank" rel="noopener noreferrer"><i className="bi bi-paperclip"></i> Open file</a> : '—')
                : (a.value || '—')}
            </dd>
          </React.Fragment>
        ))}
      </dl>
    </div>
  );
};

export default ExtraAnswers;
