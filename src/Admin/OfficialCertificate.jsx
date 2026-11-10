import React from 'react';
import { officialName, usePrintOfficials } from '../lib/officials';
import './OfficialCertificate.css';
import { CERT_CONTACTS } from '../lib/certificates';
import { RenderPrintDocumentContent } from './PrintTemplates';

// The barangay's own Certificate of Residency and Certificate of Indigency,
// laid out like the printed forms the Barangay Hall issues (header banner with
// the four logos, council column, footer skyline with the contact lines).
// The banner, skyline and rules are drawn here as vector graphics so they print
// sharp. Used for every printed certificate; Residency and Indigency follow
// the samples word for word, the others keep their own wording. Logos: the barangay seal is /assets/PB2_logo.png; the City of Imus
// seal, IMUS wordmark and Bagong Pilipinas logo are read from
// /assets/certificate/ (replace those three files with the official artwork,
// same names, for the sharpest print).

const API_BASE = '/api_backend';

const MONTHS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
const ordinalSuffix = (d) => {
  if (d % 100 >= 11 && d % 100 <= 13) return 'TH';
  return { 1: 'ST', 2: 'ND', 3: 'RD' }[d % 10] || 'TH';
};
// "1990-11-23" -> "11-23-1990", as the forms write it.
const formDate = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? `${m[2]}-${m[3]}-${m[1]}` : '';
};
const upper = (s) => String(s || '').trim().toUpperCase();
const withBarangay = (address) => {
  const a = upper(address);
  if (!a) return '';
  return /PASONG\s+BUAYA/.test(a) ? a : `${a} PASONG BUAYA II CITY of IMUS`;
};

/** A filled blank: the value in bold capitals on an underline. */
const Blank = ({ children, w, grow, align = 'center' }) => (
  <span className={`ofc-blank${grow ? ' ofc-grow' : ''}`} style={{ minWidth: w, textAlign: align }}>{children || ' '}</span>
);

// ------------------------------------------------------------ header and footer artwork
const HeaderBanner = () => (
  <div className="ofc-header">
    <svg className="ofc-header-art" viewBox="0 0 1000 150" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="ofcWave" x1="0" y1="0" x2="1" y2="0.3">
          <stop offset="0" stopColor="#1f8a43" />
          <stop offset="0.22" stopColor="#3aa54d" />
          <stop offset="0.42" stopColor="#8fcd6a" />
          <stop offset="0.7" stopColor="#cfeaa8" />
          <stop offset="1" stopColor="#eaf6da" />
        </linearGradient>
        <linearGradient id="ofcLime" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#d7efb5" />
          <stop offset="1" stopColor="#f3fae8" />
        </linearGradient>
        <linearGradient id="ofcStrip" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#cde46a" stopOpacity="0" />
          <stop offset="0.25" stopColor="#5fb55a" />
          <stop offset="0.7" stopColor="#167a55" />
          <stop offset="1" stopColor="#0d5b4c" />
        </linearGradient>
      </defs>
      {/* light green under the wave, fading to white */}
      <path d="M0 0 H760 C600 14 470 46 360 90 C250 132 130 150 0 150 Z" fill="url(#ofcLime)" />
      {/* the main green wave from the top-left corner */}
      <path d="M0 0 H690 C560 8 430 34 320 74 C210 114 110 138 0 142 Z" fill="url(#ofcWave)" />
      {/* white swoosh along its edge */}
      <path d="M0 147 C120 142 235 112 340 76 C450 38 580 10 735 3" fill="none" stroke="#ffffff" strokeWidth="3.5" strokeLinecap="round" />
      {/* dark green strip along the top right */}
      <path d="M520 0 H1000 V13 C860 18 700 14 520 0 Z" fill="url(#ofcStrip)" />
    </svg>
    <img className="ofc-seal" src="/assets/PB2_logo.png" alt="Barangay Pasong Buaya II seal" />
    <div className="ofc-header-text">
      <div className="ofc-brgy-name">BARANGAY PASONG BUAYA II</div>
      <div className="ofc-brgy-sub">CITY OF IMUS, PROVINCE OF CAVITE</div>
    </div>
    <div className="ofc-logos">
      <img src="/assets/certificate/city-seal.png" alt="Lungsod ng Imus seal" className="ofc-logo-seal" />
      <img src="/assets/certificate/imus.png" alt="Imus" className="ofc-logo-imus" />
      <img src="/assets/certificate/bagong-pilipinas.png" alt="Bagong Pilipinas" className="ofc-logo-bp" />
    </div>
    <div className="ofc-header-rule" />
  </div>
);

// Pink city skyline on the left, green swoosh rising to the right.
const BUILDINGS = [
  [0, 70, 22], [20, 52, 30], [48, 80, 26], [72, 60, 34], [104, 88, 30], [132, 48, 26], [156, 70, 40], [194, 96, 24],
  [216, 64, 36], [250, 108, 30], [278, 58, 28], [304, 84, 34], [336, 70, 24], [358, 100, 32], [388, 62, 30],
  [416, 78, 36], [450, 54, 28], [476, 88, 30], [504, 60, 34], [536, 46, 30],
];
const FooterArt = () => (
  <div className="ofc-footer">
    <svg className="ofc-footer-art" viewBox="0 0 1000 120" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="ofcSwoosh" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#bfead3" />
          <stop offset="0.45" stopColor="#3bb36c" />
          <stop offset="1" stopColor="#14805f" />
        </linearGradient>
        <linearGradient id="ofcSwoosh2" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#e8f7ef" stopOpacity="0" />
          <stop offset="1" stopColor="#7fd3c0" />
        </linearGradient>
      </defs>
      {BUILDINGS.map(([x, h, w], i) => (
        <g key={i}>
          <rect x={x} y={120 - h} width={w} height={h} fill={['#e66f95', '#d9587f', '#f190b0'][i % 3]} />
          {Array.from({ length: Math.floor(h / 14) }, (_, k) => (
            <rect key={k} x={x + 4} y={120 - h + 6 + k * 14} width={w - 8} height={3} fill="#ffffff" opacity="0.35" />
          ))}
        </g>
      ))}
      <path d="M420 120 C600 104 800 58 1000 0 V120 Z" fill="url(#ofcSwoosh)" />
      <path d="M470 120 C650 100 830 52 1000 6" fill="none" stroke="#ffffff" strokeWidth="4" opacity="0.9" />
      <path d="M560 120 C720 96 880 58 1000 26 V120 Z" fill="url(#ofcSwoosh2)" opacity="0.6" />
    </svg>
    <div className="ofc-contacts">
      <div className="ofc-contact-col">
        <div><span className="ofc-ic">f</span>{CERT_CONTACTS.facebook}</div>
        {CERT_CONTACTS.col1.map(([k, v]) => <div key={k}><span className="ofc-ic">&#9742;</span>{k}&nbsp;&nbsp;{v}</div>)}
      </div>
      <div className="ofc-contact-col">
        {CERT_CONTACTS.col2.map(([k, v]) => <div key={k}><span className="ofc-ic">&#9742;</span>{k}&nbsp;&nbsp;{v}</div>)}
      </div>
      <div className="ofc-contact-col">
        {CERT_CONTACTS.col3.map(([k, v]) => <div key={k}><span className="ofc-ic">&#9742;</span>{k}&nbsp;&nbsp;{v}</div>)}
      </div>
    </div>
  </div>
);

// ------------------------------------------------------------ council column
const ROLE_ORDER = { punong_barangay: 0, kagawad: 1, sk_chair: 2, secretary: 3, treasurer: 4, other: 5 };
const CouncilColumn = ({ captainTitle }) => {
  const { roster } = usePrintOfficials();
  const list = [...roster].sort((a, b) => (ROLE_ORDER[a.role_key] ?? 9) - (ROLE_ORDER[b.role_key] ?? 9));
  return (
    <aside className="ofc-council">
      {list.map((o) => {
        const name = upper(o.full_name);
        if (o.role_key === 'punong_barangay') {
          return (
            <div key={o.id} className="ofc-member ofc-captain">
              <div className="ofc-member-name">{name}</div>
              <div className="ofc-captain-title">{captainTitle}</div>
            </div>
          );
        }
        if (o.role_key === 'kagawad' || o.role_key === 'sk_chair') {
          return (
            <div key={o.id} className={`ofc-member${o.role_key === 'sk_chair' ? ' ofc-gap' : ''}`}>
              <div className="ofc-member-name">{name}</div>
              <div className="ofc-member-role">{o.role_key === 'sk_chair' ? 'SK CHAIRPERSON' : 'CHAIRPERSON'}</div>
              <div className="ofc-member-committee">{o.position}</div>
            </div>
          );
        }
        return (
          <div key={o.id} className={`ofc-member${o.role_key === 'secretary' ? ' ofc-gap-sm' : ''}`}>
            <div className="ofc-member-name">{name}</div>
            <div className="ofc-member-post">{o.position}</div>
          </div>
        );
      })}
    </aside>
  );
};

const CaptainSignature = () => {
  const { captain } = usePrintOfficials();
  return (
    <div className="ofc-captain-sign">
      <div className="ofc-captain-sign-name">{upper(officialName(captain))}</div>
      <div>Barangay Chairman</div>
    </div>
  );
};

// ------------------------------------------------------------ the two certificates
const ResidencyBody = ({ request, fullname, issued }) => {
  const self = request.print_self || {};
  const status = String(request.civil_status || '').toLowerCase();
  const box = (s) => (status === s ? 'X' : '  ');
  const sinceYear = self.since_year
    || (Number(request.years_in_PB2) > 0 ? String(new Date().getFullYear() - Number(request.years_in_PB2)) : '');
  return (
    <div className="ofc-body">
      <h1 className="ofc-title ofc-title-residency">CERTIFICATE OF RESIDENCY</h1>
      <p className="ofc-p ofc-salute">To Whom It May Concern:</p>
      <p className="ofc-p ofc-row">This is to certify that Mr./Ms./Mrs.&nbsp;<Blank grow>{fullname}</Blank></p>
      <p className="ofc-p">
        ( {box('single')} ) Single&nbsp; ( {box('separated')} ) Separated&nbsp; ( {box('widowed')} ) Widow/Widower&nbsp; ( {box('married')} ) Married to
      </p>
      <p className="ofc-p ofc-row">
        <Blank grow>{status === 'married' || status === 'separated' ? upper(self.spouse) : ''}</Blank>&nbsp; Born on <Blank w="34mm">{formDate(request.birth_date)}</Blank>
      </p>
      <p className="ofc-p ofc-row">Filipino and a bonafide resident of this Barangay since<Blank w="21mm">{sinceYear}</Blank>&nbsp;with postal</p>
      <p className="ofc-p">address at</p>
      <p className="ofc-p ofc-row"><Blank grow>{withBarangay(request.address)}</Blank></p>
      <p className="ofc-p ofc-para">
        He/she is personally known to me to be a law-abiding citizen and has a good moral character. Records of this Barangay has known
        that he/she has not committed nor being involved in any kind of unlawful activities in this Barangay.
      </p>
      <p className="ofc-p ofc-row ofc-gap-top">This certificate is issued upon request for&nbsp;<Blank grow>{upper(request.purpose)}</Blank>.</p>
      <p className="ofc-p">Issued this <Blank w="9%">{issued.day}<sup>{issued.suffix}</sup></Blank> day of <Blank w="20%">{issued.month}</Blank>, {issued.year}</p>

      <div className="ofc-residency-sign">
        <div className="ofc-specimen">
          <div className="ofc-specimen-label">Specimen Signature</div>
          <div className="ofc-photo">
            {self.photo && <img src={`${API_BASE}/${self.photo}`} alt="Resident" crossOrigin="anonymous" />}
          </div>
        </div>
        <CaptainSignature />
      </div>
    </div>
  );
};

const IndigencyBody = ({ request, fullname, issued }) => (
  <div className="ofc-body">
    <h1 className="ofc-title ofc-title-indigency">CERTIFICATE OF INDIGENCY</h1>
    <p className="ofc-p ofc-salute ofc-gap-top-lg">To Whom It May Concern:</p>
    <p className="ofc-p ofc-row">This is to certify that&nbsp;<Blank grow align="left">{fullname}</Blank>,</p>
    <p className="ofc-p ofc-row">Is a bonafide resident of&nbsp;<Blank grow align="left">{withBarangay(request.address)}</Blank>,</p>
    <p className="ofc-p">Is known to me personally of being good citizen of this Barangay.</p>
    <p className="ofc-p ofc-gap-top">
      That his/her family belongs to the low-income earner in view of his/her parents has no sources of livelihood.
    </p>
    <p className="ofc-p ofc-gap-top">
      Further, that this certification is being issued to prove that his/her family is an INDIGENT member of this community.
    </p>
    <p className="ofc-p ofc-gap-top">Issued this <Blank w="11%">{issued.day}<sup>{issued.suffix}</sup></Blank> day of <Blank w="20%">{issued.month}</Blank>, {issued.year}.</p>

    <p className="ofc-p ofc-gap-top-lg">Received by:</p>
    <div className="ofc-indigency-sign">
      <div className="ofc-applicant-sign">
        <div className="ofc-applicant-line" />
        <div>Signature of Applicant</div>
      </div>
      <CaptainSignature />
    </div>
  </div>
);

// Every other document (Barangay Clearance, Business Clearance, Volunteer
// Registration, custom services): the same official frame around the
// document's own wording (PrintTemplates.jsx), with the signature area a
// clearance needs.
const GenericBody = ({ request, buildFullName }) => {
  const title = upper(request.type || 'Certification');
  return (
    <div className="ofc-body">
      <h1 className={`ofc-title ofc-title-generic${title.length > 26 ? ' ofc-title-long' : ''}`}>{title}</h1>
      <div className="ofc-legacy">
        <RenderPrintDocumentContent request={request} buildFullName={buildFullName} />
      </div>
      <div className="ofc-generic-sign">
        <div className="ofc-applicant-block">
          <div className="ofc-applicant-sign">
            <div className="ofc-applicant-line" />
            <div>Signature of Applicant</div>
          </div>
          <div className="ofc-thumbmark">Right Thumbmark</div>
        </div>
        <CaptainSignature />
      </div>
    </div>
  );
};

/** Full A4 page for any printed certificate (all but the Barangay ID card). */
export const OfficialCertificate = ({ request, buildFullName }) => {
  const isResidency = request.type === 'Certificate of Residency';
  const isIndigency = request.type === 'Certificate of Indigency';
  const now = new Date();
  const issued = { day: String(now.getDate()), suffix: ordinalSuffix(now.getDate()), month: MONTHS[now.getMonth()], year: now.getFullYear() };
  const fullname = upper(buildFullName(request));
  return (
    <div className="ofc-page">
      <HeaderBanner />
      <div className="ofc-main">
        <CouncilColumn captainTitle={isIndigency ? 'Punong Barangay' : 'Barangay Chairman'} />
        {isResidency && <ResidencyBody request={request} fullname={fullname} issued={issued} />}
        {isIndigency && <IndigencyBody request={request} fullname={fullname} issued={issued} />}
        {!isResidency && !isIndigency && <GenericBody request={request} buildFullName={buildFullName} />}
      </div>
      <FooterArt />
    </div>
  );
};


export default OfficialCertificate;
