import React from 'react';
import html2pdf from 'html2pdf.js';

// =======================================================
//   HIGH-END SHARED CERTIFICATE STATIONERY COMPONENTS
// =======================================================

export const DocumentPrintSidebar = () => (
  <div className="brgy-print-sidebar">
    <div className="brgy-print-sidebar-logo-img">
      <img src="/assets/PB2_logo.png" alt="Barangay Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
    </div>
    <div className="officials-header-container">
      <div className="officials-header">SANGGUNIANG<br />BARANGAY<br />OFFICIALS</div>
    </div>
    
    <div className="officials-roster-stack">
      <div className="official-box primary-captain">
        <span className="official-name">HON. CARLITO C. TAGLE</span>
        <div className="official-divider"></div>
        <span className="official-title">Punong Barangay</span>
      </div>
      
      <div className="official-box">
        <span className="official-name">HON. Antonio A. Villalon</span>
        <div className="official-divider"></div>
        <span className="official-title">Committee on Peace & Order</span>
      </div>
      
      <div className="official-box">
        <span className="official-name">HON. Edwin Capellan</span>
        <div className="official-divider"></div>
        <span className="official-title">Committee on Infrastructure</span>
      </div>
      
      <div className="official-box">
        <span className="official-name">HON. Florence Camerino</span>
        <div className="official-divider"></div>
        <span className="official-title">Committee on Education</span>
      </div>
      
      <div className="official-box">
        <span className="official-name">HON. Ryan Nato</span>
        <div className="official-divider"></div>
        <span className="official-title">Committee on Health</span>
      </div>
      
      <div className="official-box">
        <span className="official-name">HON. Edwin Capellan</span>
        <div className="official-divider"></div>
        <span className="official-title">Committee on Budget</span>
      </div>
      
      <div className="official-box">
        <span className="official-name">HON. John Matthew Camerino</span>
        <div className="official-divider"></div>
        <span className="official-title">Committee on Environment</span>
      </div>
      
      <div className="official-box">
        <span className="official-name">HON. Leonor Mateo</span>
        <div className="official-divider"></div>
        <span className="official-title">Committee on Ways & Means</span>
      </div>
      
      <div className="official-box meta-official">
        <span className="official-name">HON. SK CHAIRPERSON</span>
        <div className="official-divider"></div>
        <span className="official-title">SK Chairperson</span>
      </div>
      
      <div className="official-box meta-official">
        <span className="official-name">DIGNA E. CABRERA</span>
        <div className="official-divider"></div>
        <span className="official-title">Barangay Secretary</span>
      </div>
      
      <div className="official-box meta-official">
        <span className="official-name">SEC. Florence Camerino</span>
        <div className="official-divider"></div>
        <span className="official-title">Barangay Treasurer</span>
      </div>
    </div>
  </div>
);

export const PrintHeaderAndTitle = () => (
  <div className="brgy-print-content-header">
    {/* Swapped out empty placeholder circles for your real triple header seals */}
    <div className="brgy-print-triple-logos-wrapper">
      <img src="/assets/logo2.png" className="brgy-print-header-seal-img" alt="Seal 1" />
      <img src="/assets/logo3.png" className="brgy-print-header-seal-img primary-seal" alt="Seal 2" />
      <img src="/assets/logo4.png" className="brgy-print-header-seal-img" alt="Seal 3" />
    </div>

    <div className="brgy-print-header-text-block">
      <h4>Republic of the Philippines</h4>
      <h4>Province of Cavite</h4>
      <h4>City of Imus</h4>
      <h2>BARANGAY PASONG BUAYA II</h2>
      <h5 className="office-sub-tag">OFFICE OF THE PUNONG BARANGAY</h5>
    </div>
  </div>
);

export const PrintFooterSignatures = () => {
  const currentDateString = new Date().toISOString().split('T')[0];
  return (
    <div className="brgy-print-footer-anchor-wrapper">
      <div className="brgy-print-signatures-row">
        <div className="brgy-print-signature-box">
          <p>Prepared by:</p>
          <div className="brgy-print-signature-underline">DIGNA E. CABRERA</div>
          <p className="signature-caption-title">Barangay Secretary</p>
        </div>
        <div className="brgy-print-signature-box">
          <p>Approved by:</p>
          <div className="brgy-print-signature-underline">HON. CARLITO C. TAGLE</div>
          <p className="signature-caption-title">Punong Barangay</p>
        </div>
      </div>

      <div className="brgy-print-thumbmark-area">
        <div className="brgy-print-applicant-signature-box">
          <div className="brgy-print-signature-underline" style={{ marginTop: '35px' }}></div>
          <p className="signature-caption-title">Signature of Applicant</p>
        </div>
        <div className="brgy-thumb-box-flex-wrapper">
          <div className="brgy-print-thumbmark-square-box">
            Right Thumbmark
          </div>
        </div>
      </div>

      <div className="brgy-print-receipt-metadata-footer">
        <div><b>O.R. No.:</b> _________________</div>
        <div><b>Date Issued:</b> {currentDateString}</div>
        <div><b>Amount Paid:</b> _________________</div>
      </div>
      <p className="brgy-print-seal-text-warning">Not valid without official Barangay Seal</p>
    </div>
  );
};

// =======================================================
//   EXACT CERTIFICATE BODY TEXT LAYOUT COPIES
// =======================================================

export const PrintCertificateIndigency = ({ fullname, age, civilStatus, address, request, dateIssued }) => {
  const income = request.monthly_income ? parseFloat(request.monthly_income).toLocaleString(undefined, { minimumFractionDigits: 2 }) : "0.00";
  const purpose = (request.purpose || 'General Purpose').toUpperCase();
  return (
    <div className="brgy-legal-body-text">
      <p className="salutation">TO WHOM IT MAY CONCERN:</p>
      <p>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<b>THIS IS TO CERTIFY</b> that <span className="highlight">{fullname}</span>, <b>{age}</b> years old, <span className="highlight">{civilStatus}</span>, is a resident of <span className="highlight">{address}</span>, Barangay Pasong Buaya II, City of Imus, Cavite.</p>
      <p style={{ marginTop: '12px' }}>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<b>THIS IS TO CERTIFY FURTHER</b> that the above-named person belongs to an Indigent Family in this Barangay with a monthly income of approximately <b>PHP {income}</b>.</p>
      <p style={{ marginTop: '12px' }}>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;This certification is issued upon request for the purpose of:</p>
      <div className="purpose-container"><span className="purpose-text">"{purpose}"</span></div>
      <p>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<b>ISSUED</b> this <b>{dateIssued}</b> at Barangay Pasong Buaya II, City of Imus, Cavite.</p>
    </div>
  );
};

export const PrintCertificateResidency = ({ fullname, age, civilStatus, address, request, dateIssued }) => {
  const years = request.years_in_PB2 || 'several';
  const purpose = (request.purpose || 'General Purpose').toUpperCase();
  return (
    <div className="brgy-legal-body-text">
      <p className="salutation">TO WHOM IT MAY CONCERN:</p>
      <p>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<b>THIS IS TO CERTIFY</b> that <span className="highlight">{fullname}</span>, <b>{age}</b> years old, <span className="highlight">{civilStatus}</span>, Filipino Citizen, is a verified permanent resident of <span className="highlight">{address}</span>, Barangay Pasong Buaya II, City of Imus, Cavite.</p>
      <p style={{ marginTop: '12px' }}>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<b>THIS IS TO CERTIFY FURTHER</b> that he/she has been residing in this Barangay for <b>{years}</b> years.</p>
      <p style={{ marginTop: '12px' }}>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;This certification is issued upon request for the purpose of:</p>
      <div className="purpose-container"><span className="purpose-text">"{purpose}"</span></div>
      <p>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<b>ISSUED</b> this <b>{dateIssued}</b> at Barangay Pasong Buaya II, City of Imus, Cavite.</p>
    </div>
  );
};

export const PrintBusinessClearance = ({ fullname, address, request, dateIssued }) => {
  const bizName = (request.business_name || 'N/A').toUpperCase();
  const bizAddress = (request.business_address || address).toUpperCase();
  return (
    <div className="brgy-legal-body-text">
      <p className="salutation">TO WHOM IT MAY CONCERN:</p>
      <p>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<b>THIS IS TO CERTIFY</b> that the business establishment known as:</p>
      <div style={{ textAlign: 'center', margin: '20px 0' }}><h2 style={{ textDecoration: 'underline', fontWeight: '800', fontSize: '15pt' }}>{bizName}</h2></div>
      <p>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Owned and operated by <span className="highlight">{fullname}</span> and located at <span className="highlight">{bizAddress}</span>, has been granted this Barangay Business Clearance.</p>
      <p style={{ marginTop: '12px' }}>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;This clearance is issued in accordance with the provisions of the Local Government Code, subject to the strict compliance with all existing laws and ordinances.</p>
      <p>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<b>ISSUED</b> this <b>{dateIssued}</b> at Barangay Pasong Buaya II, City of Imus, Cavite.</p>
    </div>
  );
};

export const PrintBarangayClearance = ({ fullname, age, civilStatus, address, request, dateIssued }) => {
  const purpose = (request.purpose || 'General Purpose').toUpperCase();
  return (
    <div className="brgy-legal-body-text">
      <p className="salutation">TO WHOM IT MAY CONCERN:</p>
      <p>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<b>THIS IS TO CERTIFY</b> that <span className="highlight">{fullname}</span>, <b>{age}</b> years old, <span className="highlight">{civilStatus}</span>, Filipino Citizen, is a permanent resident of <span className="highlight">{address}</span>, Barangay Pasong Buaya II, City of Imus, Cavite.</p>
      <p style={{ marginTop: '12px' }}>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<b>THIS IS TO CERTIFY FURTHER</b> that the above-named person has no derogatory record on file in this office as of this date. He/She is known to be of good moral character and a law-abiding citizen in the community.</p>
      <p style={{ marginTop: '12px' }}>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;This certification is issued upon the request of the interested party for the purpose of:</p>
      <div className="purpose-container"><span className="purpose-text">"{purpose}"</span></div>
      <p>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<b>ISSUED</b> this <b>{dateIssued}</b> at Barangay Pasong Buaya II, City of Imus, Cavite.</p>
    </div>
  );
};

export const PrintVolunteerRegistration = ({ fullname, age, civilStatus, address, request, dateIssued }) => {
  const program = (request.program_area || 'N/A').toUpperCase();
  const availability = request.availability || 'N/A';
  const occupation = request.occupation || 'N/A';
  const skills = request.skills || 'N/A';
  return (
    <div className="brgy-legal-body-text">
      <p className="salutation">TO WHOM IT MAY CONCERN:</p>
      <p>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<b>THIS IS TO CERTIFY</b> that <span className="highlight">{fullname}</span>, <b>{age}</b> years old, <span className="highlight">{civilStatus}</span>, Filipino Citizen, residing at <span className="highlight">{address}</span>, is a duly registered <b>COMMUNITY VOLUNTEER</b> of Barangay Pasong Buaya II.</p>
      <p style={{ marginTop: '10px' }}>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;The above-named individual has expressed their commitment to assist in barangay programs and activities. Below are the registration details:</p>
      
      <table className="print-details-table">
        <tbody>
          <tr>
            <td className="print-details-label">Assigned Program Area:</td>
            <td className="print-details-val">{program}</td>
          </tr>
          <tr>
            <td className="print-details-label">Volunteer Occupation:</td>
            <td className="print-details-val">{occupation}</td>
          </tr>
          <tr>
            <td className="print-details-label">Listed Skills:</td>
            <td className="print-details-val">{skills}</td>
          </tr>
          <tr>
            <td className="print-details-label">Declared Availability:</td>
            <td className="print-details-val">{availability}</td>
          </tr>
        </tbody>
      </table>

      <p style={{ marginTop: '10px' }}>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;This certification is issued for whatever legal intent and purpose it may serve.</p>
      <p style={{ marginTop: '12px' }}>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<b>ISSUED</b> this <b>{dateIssued}</b> at Barangay Pasong Buaya II, City of Imus, Cavite.</p>
    </div>
  );
};

export const PrintDefaultFallback = ({ fullname, age, civilStatus, address, request, dateIssued }) => (
  <div className="brgy-legal-body-text">
    <p className="salutation">TO WHOM IT MAY CONCERN:</p>
    <p>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<b>THIS IS TO CERTIFY</b> that <span className="highlight">{fullname}</span>, whose files are stored with tracking code <b>{request.tracking_code}</b>, is explicitly registered inside Barangay Pasong Buaya II.</p>
    <p style={{ marginTop: '12px' }}>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<b>ISSUED</b> this <b>{dateIssued}</b> at Barangay Pasong Buaya II, City of Imus, Cavite.</p>
  </div>
);

// =======================================================
//   BARANGAY ID CARD COMPONENT (Strict 85.6mm x 54mm)
// =======================================================

export const PrintBarangayIDCard = ({ request, buildFullName, getPublicUrl }) => {
  const fullname = (buildFullName(request) || '').toUpperCase();
  const address = (request.address || '').toUpperCase();
  const idNo = String(request.request_id || '0').padStart(6, '0');
  const tin = request.tin_no || 'N/A';
  
  const formattedDob = request.birth_date 
    ? new Date(request.birth_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : 'N/A';
    
  const formattedIssued = new Date().toLocaleDateString('en-US');

  return (
    <div className="brgy-id-card-print-container">
      {/* FRONT SIDE */}
      <div className="id-card id-front">
        <div className="id-header">
          {/* FIXED: Re-added the official absolute logo link right inside the header banner container box */}
          <img src="/assets/PB2_logo.png" className="id-logo" alt="Barangay Logo" />
          <div className="id-header-text">
            <h3>REPUBLIC OF THE PHILIPPINES</h3>
            <h2>CITY OF IMUS, CAVITE</h2>
            <h1>BARANGAY PASONG BUAYA II</h1>
          </div>
        </div>
        <div className="id-body">
          <div className="photo-box">
            <img src={getPublicUrl(request.id_front) || 'https://placehold.co/150'} alt="Profile" />
          </div>
          <div className="info-box">
            <div className="field-label">Name</div>
            <div className="field-value text-primary-dark">{fullname}</div>

            <div className="field-label">Address</div>
            <div className="field-address">{address}</div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>
              <div>
                <div className="field-label">Birth Date</div>
                <div className="field-value">{formattedDob}</div>
              </div>
              <div style={{ marginRight: '5mm' }}>
                <div className="field-label">Gender</div>
                <div className="field-value">{(request.gender || 'N/A').toUpperCase()}</div>
              </div>
            </div>
            
            <div style={{ marginTop: '2px' }}>
              <div className="field-label">TIN No.</div>
              <div className="field-value">{tin}</div>
            </div>
          </div>
        </div>
        
        <div className="id-signature-overlay-box">
          {request.id_holding && <img src={getPublicUrl(request.id_holding)} alt="Signature" />}
          <div className="id-sig-underline"></div>
          <div className="id-sig-label">SIGNATURE</div>
        </div>

        <div className="id-footer">
          <span className="id-no">ID NO: {idNo}</span>
          <span className="id-no">ISSUED: {formattedIssued}</span>
        </div>
      </div>

      {/* BACK SIDE */}
      <div className="id-card id-back">
        <div className="back-header">
          <h3>In Case of Emergency</h3>
        </div>
        
        <div className="emergency-box">
          <div className="emergency-label">CONTACT PERSON</div>
          <div className="emergency-val">{(request.contact_person || 'N/A').toUpperCase()}</div>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1px' }}>
            <div style={{ flex: 1 }}>
              <div className="emergency-label">RELATIONSHIP</div>
              <div className="emergency-val">{(request.contactp_relationship || 'N/A').toUpperCase()}</div>
            </div>
            <div style={{ flex: 1 }}>
              <div className="emergency-label">CONTACT NO.</div>
              <div className="emergency-val">{request.contactp_num || 'N/A'}</div>
            </div>
          </div>
        </div>

        <div className="officials-list">
          <strong>HON. CARLITO C. TAGLE</strong><br />
          <span style={{ fontSize: '3.5pt' }}>Punong Barangay</span>
        </div>

        <div className="signature-area">
          <div className="sig-line"></div>
          <div className="sig-label">PUNONG BARANGAY</div>
        </div>

        <div className="disclaimer">
          This card is non-transferable. If found, please return to <br />Barangay Hall, Pasong Buaya II, Imus City, Cavite.
        </div>
      </div>
    </div>
  );
};



// =======================================================
//   ROUTING DISPATCHER COMPONENT FOR CERTIFICATES
// =======================================================
export const RenderPrintDocumentContent = ({ request, buildFullName }) => {
  const type = request.type || 'Barangay Clearance';
  
  const fullname = (buildFullName(request) || '').toUpperCase();
  const address = ucWords(request.address || '');
  const dateIssued = getOrdinalDate(new Date());
  
  let age = "N/A";
  if (request.birth_date) {
    const dob = new Date(request.birth_date);
    const today = new Date();
    age = today.getFullYear() - dob.getFullYear();
    const m = today.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
      age--;
    }
  }

  const civilStatus = request.civil_status ? request.civil_status.charAt(0).toUpperCase() + request.civil_status.slice(1).toLowerCase() : 'Single';
  const sharedProps = { fullname, age, civilStatus, address, request, dateIssued };

  switch (type) {
    case 'Certificate of Indigency':
      return <PrintCertificateIndigency {...sharedProps} />;
    case 'Certificate of Residency':
      return <PrintCertificateResidency {...sharedProps} />;
    case 'Business Clearance':
      return <PrintBusinessClearance {...sharedProps} />;
    case 'Volunteer Registration':
      return <PrintVolunteerRegistration {...sharedProps} />;
    default:
      return <PrintBarangayClearance {...sharedProps} />;
  }
};

// =======================================================
//   STRING HELPER UTILITIES
// =======================================================
function ucWords(str) {
  return (str + '').toLowerCase().replace(/^.|\s\S/g, function(a) { return a.toUpperCase(); });
}

function getOrdinalDate(date) {
  const day = date.getDate();
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const month = months[date.getMonth()];
  const year = date.getFullYear();
  
  let suffix = "th";
  if (day === 1 || day === 21 || day === 31) suffix = "st";
  else if (day === 2 || day === 22) suffix = "nd";
  else if (day === 3 || day === 23) suffix = "rd";

  return `${day}${suffix} day of ${month} ${year}`;
}

// =======================================================
//   NATIVE HTML2PDF.JS DOWNLOAD PIPELINE HANDLER
// =======================================================
export const executePDFDownload = (printRequest) => {
  if (!printRequest) return;

  const targetElement = printRequest.type === 'Barangay ID'
    ? document.querySelector('.brgy-id-card-print-container')
    : document.getElementById('pb2-printable-sheet-element');

  if (!targetElement) {
    console.error("Print canvas target element not found in DOM.");
    return;
  }

  const cleanDocName = (printRequest.type || 'Document').replace(/\s+/g, '_');
  const cleanResidentName = (printRequest.name || 'Resident').replace(/\s+/g, '_');
  const safeFilename = `${cleanDocName}_${cleanResidentName}.pdf`;

  const configurationOptions = {
    margin: 0,
    filename: safeFilename,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { 
      scale: 2.5,
      useCORS: true,
      letterRendering: true 
    },
    jsPDF: { 
      unit: 'mm', 
      format: 'a4', 
      orientation: 'portrait' 
    }
  };

  try {
    html2pdf().set(configurationOptions).from(targetElement).save();
  } catch (err) {
    console.error("PDF generation runtime error:", err);
  }
};