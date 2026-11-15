import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { peso } from '../lib/payment';
import './WalkInRequest.css';

const API_BASE = '/api_backend';

// Documents staff can encode for a walk-in (backend/api/admin_walkin_request.php).
const TYPES = [
  { value: 'clearance', label: 'Barangay Clearance' },
  { value: 'residency', label: 'Certificate of Residency' },
  { value: 'indigency', label: 'Certificate of Indigency' },
  { value: 'barangay_id', label: 'Barangay ID' },
  { value: 'business_clearance', label: 'Business Clearance' },
  { value: 'volunteer', label: 'Volunteer Registration' },
];
// Same choices as src/pages/VolunteerRegistration.jsx.
const VOLUNTEER_AREAS = [['Disaster Response', 'Disaster Response & Relief'], ['Health Programs', 'Community Health & Cleanups'],
  ['Youth & Education', 'Youth Tutoring & Education Support'], ['Administrative', 'Barangay Event Administration']];
const AVAILABILITY = [['Weekends', 'Weekends Only'], ['Weekdays', 'Weekdays Only'], ['On-Call', 'Flexible / Emergency On-Call']];
// Same choices as the online forms.
const INDIGENCY_PURPOSES = [
  ['Scholarship', 'Scholarship Application'], ['Medical Assistance', 'Medical Assistance / Hospitalization'],
  ['Financial Assistance', 'Social Welfare / Financial Aid'], ['Legal Aid', 'Public Attorney Office (PAO) Legal Aid'],
  ['School Requirement', 'Educational / School Enrollment'], ['Other', 'Other Reasons'],
];
const EMPLOYMENT = [['Unemployed', 'Unemployed'], ['Self-Employed', 'Self-Employed'], ['Contractual', 'Contractual / Project-based']];
const BUSINESS_TYPES = ['Single Proprietorship', 'Partnership', 'Corporation', 'Cooperative'];
const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

const EMPTY_PERSON = { fName: '', mName: '', lName: '', suffix: '', birth_date: '', gender: '', civil_status: '', address: '' };
const EMPTY_FIELDS = {
  purpose: '', purpose_details: '', precinct_no: '', years_in_PB2: '', residency_status: '', spouse_name: '',
  monthly_income: '', employment_status: '',
  birth_place: '', height: '', weight: '', blood_type: '', tin_no: '', contact_num: '',
  contact_person: '', contactp_num: '', contactp_relationship: '', emergency_address: '',
  business_name: '', business_type: '', nature_business: '', business_address: '', business_contact_num: '', home_based: false,
  program_area: '', availability: '', occupation: '', skills: '', email: '',
  notes: '',
};

const Field = ({ id, label, children, wide }) => (
  <div className={`wir-field${wide ? ' is-wide' : ''}`}>
    <label htmlFor={id}>{label}</label>
    {children}
  </div>
);

/**
 * "New walk-in request" on the Documents page (migration 049): staff encode a
 * document request for someone at the counter, a registered resident (their
 * record and ID on file are used) or someone not registered, take the fee
 * (O.R. number), and the request is saved as Processing, ready to print.
 */
const WalkInRequest = ({ onClose, onCreated, notify }) => {
  const [who, setWho] = useState('registered'); // 'registered' | 'unregistered'
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [resident, setResident] = useState(null);
  const [person, setPerson] = useState(EMPTY_PERSON);
  const [type, setType] = useState('clearance');
  const [fields, setFields] = useState(EMPTY_FIELDS);
  const [fees, setFees] = useState({});
  const [pay, setPay] = useState({ mode: 'paid', or_number: '', amount_paid: '', waive_reason: '' });
  const [files, setFiles] = useState({ id_picture: null, signature: null, photo: null });
  const [busy, setBusy] = useState(false);

  // Open custom services with their questions (type 'service:<id>'), and the
  // answers to the chosen one's questions (files kept apart).
  const [services, setServices] = useState([]);
  const [answers, setAnswers] = useState({});
  const [answerFiles, setAnswerFiles] = useState({});

  useEffect(() => {
    axios.get(`${API_BASE}/admin_walkin_request.php`, { params: { action: 'fees' } })
      .then(({ data }) => { if (data.success) setFees(data.fees || {}); })
      .catch(() => {});
    axios.get(`${API_BASE}/admin_walkin_request.php`, { params: { action: 'services' } })
      .then(({ data }) => { if (data.success) setServices(data.services || []); })
      .catch(() => {});
  }, []);

  // Search registered residents as staff type.
  useEffect(() => {
    if (who !== 'registered' || resident || query.trim().length < 2) return undefined;
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const { data } = await axios.get(`${API_BASE}/admin_walkin_request.php`, { params: { action: 'search', q: query.trim() } });
        setResults(data.success ? data.residents || [] : []);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query, who, resident]);

  const pick = (r) => {
    setResident(r);
    setResults([]);
    // Fill in what the record already has; staff can still change these.
    setFields((f) => ({
      ...f,
      years_in_PB2: r.years_in_PB2 ?? '',
      residency_status: r.residency_status || '',
      birth_place: r.birth_place || '',
      height: r.height || '',
      blood_type: r.blood_type || '',
      contact_num: r.contact_num || '',
      contact_person: r.contact_person || '',
      contactp_num: r.contactp_num || '',
      contactp_relationship: r.contactp_relationship || '',
    }));
  };

  const set = (k) => (e) => setFields((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const setP = (k) => (e) => setPerson((p) => ({ ...p, [k]: e.target.value }));
  const service = type.startsWith('service:') ? services.find((s) => `service:${s.service_id}` === type) : null;
  const fee = service ? service.fee : (fees[type]?.amount ?? 0);
  // What each document prints, for someone not registered (their record has it otherwise).
  const needsBirth = ['clearance', 'residency', 'barangay_id', 'volunteer'].includes(type) || !!service;
  const needsCivil = ['clearance', 'residency', 'volunteer'].includes(type) || !!service;
  const chooseType = (value) => { setType(value); setAnswers({}); setAnswerFiles({}); };
  const married = ['Married', 'Separated'].includes(person.civil_status);

  const submit = async (e) => {
    e.preventDefault();
    if (who === 'registered' && !resident) { notify('Choose the resident', 'Search for the resident, or choose "Not registered".', 'error'); return; }
    setBusy(true);
    try {
      const body = new FormData();
      body.append('action', 'create');
      if (service) {
        body.append('type', 'service');
        body.append('service_id', String(service.service_id));
        body.append('dynamic_fields', JSON.stringify(answers));
        Object.entries(answerFiles).forEach(([name, file]) => { if (file) body.append(`dyn_${name}`, file); });
      } else {
        body.append('type', type);
      }
      if (who === 'registered') body.append('resident_id', String(resident.resident_id));
      else Object.entries(person).forEach(([k, v]) => body.append(k, v));
      Object.entries(fields).forEach(([k, v]) => body.append(k, typeof v === 'boolean' ? (v ? '1' : '0') : v));
      body.append('pay_mode', fee > 0 ? pay.mode : 'unpaid');
      body.append('or_number', pay.or_number);
      body.append('amount_paid', pay.amount_paid);
      body.append('waive_reason', pay.waive_reason);
      if (type === 'barangay_id') {
        if (files.id_picture) body.append('id_picture', files.id_picture);
        if (files.signature) body.append('signature', files.signature);
      }
      if (type === 'residency' && who === 'unregistered' && files.photo) body.append('photo', files.photo);
      const { data } = await axios.post(`${API_BASE}/admin_walkin_request.php`, body);
      if (data.success) {
        notify('Walk-in request saved', data.message, 'success');
        onCreated(data);
      } else {
        notify('Not saved', data.message || 'The request could not be saved.', 'error');
      }
    } catch {
      notify('Not saved', 'Could not reach the server. Please try again.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="wir-overlay">
      <form className="wir-card" onSubmit={submit} noValidate>
        <div className="wir-head">
          <div>
            <h2><i className="bi bi-person-walking" aria-hidden="true"></i> New Walk-in Request</h2>
            <p>For someone at the counter. Check their valid ID in person. The request is saved as Processing, ready to print.</p>
          </div>
          <button type="button" className="wir-x" onClick={onClose} aria-label="Close"><i className="bi bi-x-lg" aria-hidden="true"></i></button>
        </div>

        <div className="wir-body">
          {/* 1. Who */}
          <section className="wir-section" aria-labelledby="wir-who">
            <h3 id="wir-who">1. Who is it for?</h3>
            <div className="wir-switch" role="group" aria-label="Who is it for">
              <button type="button" aria-pressed={who === 'registered'} className={who === 'registered' ? 'is-on' : ''} onClick={() => setWho('registered')}>
                <i className="bi bi-person-check" aria-hidden="true"></i> Registered resident
              </button>
              <button type="button" aria-pressed={who === 'unregistered'} className={who === 'unregistered' ? 'is-on' : ''} onClick={() => setWho('unregistered')}>
                <i className="bi bi-person-dash" aria-hidden="true"></i> Not registered
              </button>
            </div>

            {who === 'registered' ? (
              resident ? (
                <div className="wir-picked">
                  {resident.photo
                    ? <img src={`${API_BASE}/${resident.photo}`} alt="" />
                    : <span className="wir-avatar" aria-hidden="true"><i className="bi bi-person"></i></span>}
                  <div>
                    <strong>{resident.name}</strong>
                    <small>{resident.control_num} · {resident.address || 'No address'}</small>
                    {!resident.has_id && <small className="wir-warn">No ID on file: check their ID at the counter.</small>}
                  </div>
                  <button type="button" className="wir-link" onClick={() => { setResident(null); setQuery(''); }}>Change</button>
                </div>
              ) : (
                <div className="wir-search">
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search name, control no. or mobile number"
                    aria-label="Search registered residents"
                    autoFocus
                  />
                  {searching && <p className="wir-muted">Searching…</p>}
                  {results.length > 0 && (
                    <ul className="wir-results">
                      {results.map((r) => (
                        <li key={r.resident_id}>
                          <button type="button" onClick={() => pick(r)}>
                            <strong>{r.name}</strong>
                            <small>{r.control_num} · {r.birth_date || ''} · {r.address}</small>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {!searching && query.trim().length >= 2 && results.length === 0 && (
                    <p className="wir-muted">No active resident found. Choose "Not registered", or register them first from Residents.</p>
                  )}
                </div>
              )
            ) : (
              <div className="wir-grid">
                <Field id="wir-fName" label="First name *"><input id="wir-fName" className="caps-case" value={person.fName} onChange={setP('fName')} /></Field>
                <Field id="wir-mName" label="Middle name"><input id="wir-mName" className="caps-case" value={person.mName} onChange={setP('mName')} /></Field>
                <Field id="wir-lName" label="Last name *"><input id="wir-lName" className="caps-case" value={person.lName} onChange={setP('lName')} /></Field>
                <Field id="wir-suffix" label="Suffix">
                  <select id="wir-suffix" value={person.suffix} onChange={setP('suffix')}>
                    <option value="">None</option>{['Jr.', 'Sr.', 'II', 'III', 'IV'].map((s) => <option key={s}>{s}</option>)}
                  </select>
                </Field>
                <Field id="wir-sex" label="Sex *">
                  <select id="wir-sex" value={person.gender} onChange={setP('gender')}>
                    <option value="">Choose</option><option>Male</option><option>Female</option>
                  </select>
                </Field>
                <Field id="wir-bd" label={`Birth date${needsBirth ? ' *' : ''}`}><input id="wir-bd" type="date" value={person.birth_date} onChange={setP('birth_date')} /></Field>
                <Field id="wir-cs" label={`Civil status${needsCivil ? ' *' : ''}`}>
                  <select id="wir-cs" value={person.civil_status} onChange={setP('civil_status')}>
                    <option value="">Choose</option>{['Single', 'Married', 'Widowed', 'Separated'].map((s) => <option key={s}>{s}</option>)}
                  </select>
                </Field>
                <Field id="wir-addr" label="Address in Pasong Buaya II *" wide>
                  <input id="wir-addr" className="caps-case" value={person.address} onChange={setP('address')} placeholder="Block & lot, street, subdivision" />
                </Field>
              </div>
            )}
          </section>

          {/* 2. Document */}
          <section className="wir-section" aria-labelledby="wir-doc">
            <h3 id="wir-doc">2. Document or service</h3>
            <div className="wir-types" role="group" aria-label="Document">
              {TYPES.map((t) => (
                <button key={t.value} type="button" aria-pressed={type === t.value} className={type === t.value ? 'is-on' : ''} onClick={() => chooseType(t.value)}>
                  <span>{t.label}</span>
                  <small>{t.value === 'volunteer' ? 'Free' : fees[t.value] ? (fees[t.value].amount > 0 ? peso(fees[t.value].amount) : 'Free') : ''}</small>
                </button>
              ))}
              {services.map((s) => {
                const v = `service:${s.service_id}`;
                return (
                  <button key={v} type="button" aria-pressed={type === v} className={`is-service${type === v ? ' is-on' : ''}`} onClick={() => chooseType(v)}>
                    <span>{s.title}</span>
                    <small>Custom service · {s.fee > 0 ? peso(s.fee) : 'Free'}</small>
                  </button>
                );
              })}
            </div>

            <div className="wir-grid">
              {type === 'clearance' && (<>
                <Field id="wir-purpose" label="Purpose *" wide><input id="wir-purpose" className="caps-case" value={fields.purpose} onChange={set('purpose')} placeholder="e.g. Local employment" /></Field>
                <Field id="wir-years" label="Years in Pasong Buaya II"><input id="wir-years" type="number" min="0" value={fields.years_in_PB2} onChange={set('years_in_PB2')} /></Field>
                <Field id="wir-precinct" label="Precinct no."><input id="wir-precinct" className="caps-case" value={fields.precinct_no} onChange={set('precinct_no')} /></Field>
              </>)}
              {type === 'residency' && (<>
                <Field id="wir-purpose" label="Purpose *" wide><input id="wir-purpose" className="caps-case" value={fields.purpose} onChange={set('purpose')} placeholder="e.g. Employment requirement" /></Field>
                <Field id="wir-rs" label="Residency status *">
                  <select id="wir-rs" value={fields.residency_status} onChange={set('residency_status')}>
                    <option value="">Choose</option>{['Homeowner', 'Tenant', 'Sharer'].map((s) => <option key={s}>{s}</option>)}
                  </select>
                </Field>
                <Field id="wir-years" label="Years in Pasong Buaya II *"><input id="wir-years" type="number" min="0" value={fields.years_in_PB2} onChange={set('years_in_PB2')} /></Field>
                {/* Printed on the certificate. A resident's come from their record. */}
                {who === 'unregistered' && married && (
                  <Field id="wir-spouse" label="Spouse's name *" wide><input id="wir-spouse" className="caps-case" value={fields.spouse_name} onChange={set('spouse_name')} /></Field>
                )}
                {who === 'unregistered' && (
                  <Field id="wir-rphoto" label="Photo for the certificate" wide>
                    <input id="wir-rphoto" type="file" accept="image/jpeg,image/png,image/webp" capture="user" onChange={(e) => setFiles((f) => ({ ...f, photo: e.target.files?.[0] || null }))} />
                  </Field>
                )}
              </>)}
              {type === 'indigency' && (<>
                <Field id="wir-purpose" label="Purpose *">
                  <select id="wir-purpose" value={fields.purpose} onChange={set('purpose')}>
                    <option value="">Choose</option>{INDIGENCY_PURPOSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </Field>
                <Field id="wir-pd" label="Details"><input id="wir-pd" className="caps-case" value={fields.purpose_details} onChange={set('purpose_details')} /></Field>
                <Field id="wir-income" label="Monthly income (₱)"><input id="wir-income" type="number" min="0" step="0.01" value={fields.monthly_income} onChange={set('monthly_income')} /></Field>
                <Field id="wir-emp" label="Employment">
                  <select id="wir-emp" value={fields.employment_status} onChange={set('employment_status')}>
                    <option value="">Choose</option>{EMPLOYMENT.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </Field>
              </>)}
              {type === 'barangay_id' && (<>
                <Field id="wir-bp" label="Birth place *"><input id="wir-bp" className="caps-case" value={fields.birth_place} onChange={set('birth_place')} /></Field>
                <Field id="wir-h" label="Height (cm) *"><input id="wir-h" inputMode="numeric" value={fields.height} onChange={set('height')} /></Field>
                <Field id="wir-w" label="Weight (kg) *"><input id="wir-w" inputMode="numeric" value={fields.weight} onChange={set('weight')} /></Field>
                <Field id="wir-bt" label="Blood type">
                  <select id="wir-bt" value={fields.blood_type} onChange={set('blood_type')}><option value="">Unknown</option>{BLOOD_TYPES.map((b) => <option key={b}>{b}</option>)}</select>
                </Field>
                <Field id="wir-tin" label="TIN"><input id="wir-tin" inputMode="numeric" value={fields.tin_no} onChange={set('tin_no')} /></Field>
                <Field id="wir-mobile" label="Mobile number"><input id="wir-mobile" inputMode="numeric" maxLength={11} value={fields.contact_num} onChange={set('contact_num')} /></Field>
                <Field id="wir-cp" label="Emergency contact person *"><input id="wir-cp" className="caps-case" value={fields.contact_person} onChange={set('contact_person')} /></Field>
                <Field id="wir-cpn" label="Their mobile number *"><input id="wir-cpn" inputMode="numeric" maxLength={11} value={fields.contactp_num} onChange={set('contactp_num')} /></Field>
                <Field id="wir-cpr" label="Relationship *"><input id="wir-cpr" className="caps-case" value={fields.contactp_relationship} onChange={set('contactp_relationship')} /></Field>
                <Field id="wir-ea" label="Their address *" wide><input id="wir-ea" className="caps-case" value={fields.emergency_address} onChange={set('emergency_address')} /></Field>
                <Field id="wir-photo" label="ID photo (1x1) *">
                  <input id="wir-photo" type="file" accept="image/jpeg,image/png,image/webp" capture="user" onChange={(e) => setFiles((f) => ({ ...f, id_picture: e.target.files?.[0] || null }))} />
                </Field>
                <Field id="wir-sig" label="Signature *">
                  <input id="wir-sig" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setFiles((f) => ({ ...f, signature: e.target.files?.[0] || null }))} />
                </Field>
              </>)}
              {type === 'business_clearance' && (<>
                <Field id="wir-bn" label="Business name *" wide><input id="wir-bn" className="caps-case" value={fields.business_name} onChange={set('business_name')} /></Field>
                <Field id="wir-btype" label="Business type *">
                  <select id="wir-btype" value={fields.business_type} onChange={set('business_type')}><option value="">Choose</option>{BUSINESS_TYPES.map((b) => <option key={b}>{b}</option>)}</select>
                </Field>
                <Field id="wir-nb" label="Nature of business *"><input id="wir-nb" className="caps-case" value={fields.nature_business} onChange={set('nature_business')} /></Field>
                <Field id="wir-ba" label="Business address *" wide><input id="wir-ba" className="caps-case" value={fields.business_address} onChange={set('business_address')} /></Field>
                <Field id="wir-bc" label="Business contact no. *"><input id="wir-bc" inputMode="numeric" value={fields.business_contact_num} onChange={set('business_contact_num')} /></Field>
                <Field id="wir-bcp" label="Contact person"><input id="wir-bcp" className="caps-case" value={fields.contact_person} onChange={set('contact_person')} placeholder="The owner if empty" /></Field>
                <label className="wir-check is-wide"><input type="checkbox" checked={fields.home_based} onChange={set('home_based')} /> Home-based business</label>
              </>)}
              {type === 'volunteer' && (<>
                <Field id="wir-area" label="Volunteer area *">
                  <select id="wir-area" value={fields.program_area} onChange={set('program_area')}>
                    <option value="">Choose</option>{VOLUNTEER_AREAS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </Field>
                <Field id="wir-avail" label="Available *">
                  <select id="wir-avail" value={fields.availability} onChange={set('availability')}>
                    <option value="">Choose</option>{AVAILABILITY.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </Field>
                <Field id="wir-occ" label="Occupation *"><input id="wir-occ" className="caps-case" value={fields.occupation} onChange={set('occupation')} /></Field>
                <Field id="wir-skills" label="Skills *" wide><textarea id="wir-skills" className="caps-case" rows={2} value={fields.skills} onChange={set('skills')} placeholder="e.g. First aid, driving, cooking" /></Field>
                {who === 'unregistered' && (<>
                  <Field id="wir-vmobile" label="Mobile number"><input id="wir-vmobile" inputMode="numeric" maxLength={11} value={fields.contact_num} onChange={set('contact_num')} /></Field>
                  <Field id="wir-vemail" label="Email"><input id="wir-vemail" type="email" value={fields.email} onChange={set('email')} /></Field>
                </>)}
              </>)}
              {service && (<>
                {service.description && <p className="wir-muted is-wide">{service.description}</p>}
                {service.fields.length === 0 && <p className="wir-muted is-wide">This service has no extra questions.</p>}
                {service.fields.map((q) => {
                  const id = `wir-q-${q.name}`;
                  const label = `${q.label}${q.required ? ' *' : ''}`;
                  const val = answers[q.name] ?? (q.type === 'checkbox' ? [] : '');
                  const put = (v) => setAnswers((a) => ({ ...a, [q.name]: v }));
                  let input;
                  if (q.type === 'textarea') input = <textarea id={id} className="caps-case" rows={3} value={val} onChange={(e) => put(e.target.value)} />;
                  else if (q.type === 'select') input = (
                    <select id={id} value={val} onChange={(e) => put(e.target.value)}>
                      <option value="">Choose</option>{q.options.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  );
                  else if (q.type === 'radio' || (q.type === 'checkbox' && q.options.length > 0)) {
                    const multi = q.type === 'checkbox';
                    return (
                      <fieldset key={q.name} className="wir-field is-wide wir-choices">
                        <legend>{label}</legend>
                        {q.options.map((o) => (
                          <label key={o} className="wir-check">
                            <input
                              type={multi ? 'checkbox' : 'radio'}
                              name={id}
                              checked={multi ? val.includes(o) : val === o}
                              onChange={(e) => put(multi ? (e.target.checked ? [...val, o] : val.filter((x) => x !== o)) : o)}
                            /> {o}
                          </label>
                        ))}
                        {q.help && <small className="wir-muted">{q.help}</small>}
                      </fieldset>
                    );
                  } else if (q.type === 'checkbox') {
                    return (
                      <label key={q.name} className="wir-check is-wide">
                        <input type="checkbox" checked={val.includes('Yes')} onChange={(e) => put(e.target.checked ? ['Yes'] : [])} /> {label}
                      </label>
                    );
                  } else if (q.type === 'file') input = (
                    <input id={id} type="file" accept="image/jpeg,image/png,image/webp,application/pdf"
                      onChange={(e) => setAnswerFiles((f) => ({ ...f, [q.name]: e.target.files?.[0] || null }))} />
                  );
                  else input = (
                    <input id={id} type={['number', 'date', 'time'].includes(q.type) ? q.type : 'text'}
                      className={q.type === 'text' ? 'caps-case' : undefined} value={val} onChange={(e) => put(e.target.value)} />
                  );
                  return (
                    <Field key={q.name} id={id} label={label} wide={q.type === 'textarea'}>
                      {input}
                      {q.help && <small className="wir-muted">{q.help}</small>}
                    </Field>
                  );
                })}
                {who === 'unregistered' && (
                  <Field id="wir-smobile" label="Mobile number"><input id="wir-smobile" inputMode="numeric" maxLength={11} value={fields.contact_num} onChange={set('contact_num')} /></Field>
                )}
              </>)}
              {type !== 'indigency' && (
                <Field id="wir-notes" label="Staff notes (optional)" wide><input id="wir-notes" value={fields.notes} onChange={set('notes')} /></Field>
              )}
            </div>
          </section>

          {/* 3. Fee */}
          <section className="wir-section" aria-labelledby="wir-fee">
            <h3 id="wir-fee">3. Fee {fee > 0 ? `· ${peso(fee)}` : '· Free'}</h3>
            {fee > 0 ? (
              <>
                <div className="wir-switch is-three" role="group" aria-label="Fee">
                  {[['paid', 'Paid now', 'bi-cash-coin'], ['waived', 'Waived', 'bi-gift'], ['unpaid', 'Pay later', 'bi-hourglass']].map(([v, l, i]) => (
                    <button key={v} type="button" aria-pressed={pay.mode === v} className={pay.mode === v ? 'is-on' : ''} onClick={() => setPay((p) => ({ ...p, mode: v }))}>
                      <i className={`bi ${i}`} aria-hidden="true"></i> {l}
                    </button>
                  ))}
                </div>
                <div className="wir-grid">
                  {pay.mode === 'paid' && (<>
                    <Field id="wir-or" label="O.R. number *"><input id="wir-or" value={pay.or_number} onChange={(e) => setPay((p) => ({ ...p, or_number: e.target.value }))} /></Field>
                    <Field id="wir-amt" label="Amount paid (₱)"><input id="wir-amt" type="number" min="0" step="0.01" value={pay.amount_paid} placeholder={String(fee)} onChange={(e) => setPay((p) => ({ ...p, amount_paid: e.target.value }))} /></Field>
                  </>)}
                  {pay.mode === 'waived' && (
                    <Field id="wir-wr" label="Reason *" wide><input id="wir-wr" value={pay.waive_reason} placeholder="e.g. Senior citizen, indigent, first-time jobseeker (oath on file)" onChange={(e) => setPay((p) => ({ ...p, waive_reason: e.target.value }))} /></Field>
                  )}
                  {pay.mode === 'unpaid' && <p className="wir-muted is-wide">The request can be processed, but it can't be marked Claimed until the fee is paid.</p>}
                </div>
              </>
            ) : <p className="wir-muted">This document has no fee.</p>}
          </section>
        </div>

        <div className="wir-foot">
          <button type="button" className="wir-btn is-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="wir-btn" disabled={busy}>{busy ? 'Saving…' : 'Save Walk-in Request'}</button>
        </div>
      </form>
    </div>
  );
};

export default WalkInRequest;
