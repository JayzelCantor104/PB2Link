import { Link } from 'react-router-dom';
import Header from '../components/Header';
import Footer from '../components/Footer';
import { POSTING_RULES } from '../components/issueMapConfig';
import '../styles/preparedness.css';

// /terms: the rules for using PB2Link, written in plain language and kept in
// step with how the system actually works (accounts, requests, fees, the
// Issue Map, notices). Have the barangay review it, and update REVIEWED when
// the wording changes.
const REVIEWED = '11 November 2026';

const SECTIONS = [
  { id: 'about', icon: 'bi-info-circle', title: '1. About these terms' },
  { id: 'account', icon: 'bi-person-badge', title: '2. Who can have an account' },
  { id: 'security', icon: 'bi-shield-lock', title: '3. Keeping your account safe' },
  { id: 'truth', icon: 'bi-patch-check', title: '4. True information only' },
  { id: 'requests', icon: 'bi-file-earmark-text', title: '5. Requests, fees and payments' },
  { id: 'issues', icon: 'bi-flag', title: '6. The Community Issue Map' },
  { id: 'notices', icon: 'bi-bell', title: '7. Emails, texts and alerts' },
  { id: 'use', icon: 'bi-slash-circle', title: '8. Things you must not do' },
  { id: 'privacy', icon: 'bi-fingerprint', title: '9. Your personal information' },
  { id: 'service', icon: 'bi-cloud-check', title: '10. Availability and emergency information' },
  { id: 'changes', icon: 'bi-arrow-repeat', title: '11. Changes to these terms' },
  { id: 'contact', icon: 'bi-chat-dots', title: '12. Questions' },
];

const Terms = () => (
  <>
    <Header />
    <main className="prep-page">
      <div className="prep-container">
        <section className="prep-hero" aria-labelledby="terms-title">
          <span className="prep-eyebrow"><i className="bi bi-journal-text" aria-hidden="true"></i> Rules of use</span>
          <h1 id="terms-title">Terms of Service</h1>
          <p>
            These terms explain how you may use PB2Link, the online services of Barangay Pasong Buaya II, City of Imus, Cavite.
            By creating an account or using the website, you agree to them.
          </p>
        </section>

        <nav className="prep-card" aria-labelledby="terms-contents">
          <h2 id="terms-contents"><i className="bi bi-list-ul" aria-hidden="true"></i> Contents</h2>
          <ul className="acc-list terms-toc">
            {SECTIONS.map((s) => <li key={s.id}><a href={`#terms-${s.id}`}>{s.title}</a></li>)}
          </ul>
        </nav>

        <section className="prep-card" id="terms-about" aria-labelledby="terms-about-h">
          <h2 id="terms-about-h"><i className="bi bi-info-circle" aria-hidden="true"></i> 1. About these terms</h2>
          <ul className="acc-list">
            <li>PB2Link lets residents request barangay documents, book facilities, report incidents and community problems, and get advisories and announcements.</li>
            <li>These terms work alongside barangay ordinances and national laws. If they ever conflict, the law and the ordinances apply.</li>
            <li>You can still do everything in person at the Barangay Hall. Using the website is a choice, not a requirement.</li>
          </ul>
        </section>

        <section className="prep-card" id="terms-account" aria-labelledby="terms-account-h">
          <h2 id="terms-account-h"><i className="bi bi-person-badge" aria-hidden="true"></i> 2. Who can have an account</h2>
          <ul className="acc-list">
            <li><strong>Residents of Barangay Pasong Buaya II who are 18 or older.</strong> Children and teenagers are served through a parent's or guardian's account, using <em>Someone else</em> on the request forms.</li>
            <li><strong>One account per person.</strong> If you registered twice, barangay staff may keep the newest registration and close the older one.</li>
            <li><strong>Every account is checked.</strong> It is approved right away when your ID, selfie and address pass the automatic checks; otherwise barangay staff review it. Staff may ask you to fix something online or to visit the Barangay Hall.</li>
            <li>Staff may archive an account that breaks these terms. Archived records are kept, not deleted.</li>
          </ul>
        </section>

        <section className="prep-card" id="terms-security" aria-labelledby="terms-security-h">
          <h2 id="terms-security-h"><i className="bi bi-shield-lock" aria-hidden="true"></i> 3. Keeping your account safe</h2>
          <ul className="acc-list">
            <li>Keep your password and verification codes to yourself. <strong>Barangay staff will never ask for them</strong>, by phone, text, chat or in person.</li>
            <li>You are responsible for what is done with your account. Sign out when you use a shared or public computer.</li>
            <li>After several wrong passwords, signing in is paused for 15 minutes to protect your account. You can reset your password by email or text at any time.</li>
            <li>If you think someone used your account, change your password and tell the Barangay Hall.</li>
          </ul>
        </section>

        <section className="prep-card" id="terms-truth" aria-labelledby="terms-truth-h">
          <h2 id="terms-truth-h"><i className="bi bi-patch-check" aria-hidden="true"></i> 4. True information only</h2>
          <ul className="acc-list">
            <li>Give your real name, birth date, address and contact details, and keep them up to date in Edit Profile.</li>
            <li>Upload <strong>your own</strong> valid ID and a real selfie holding it. Proofs (of address, residency or sector, such as PWD or Solo Parent) must be genuine and yours.</li>
            <li>When you request for someone else, you must have their permission and upload their ID and an authorization letter.</li>
            <li>False information, fake or altered documents, or someone else's ID can lead to the request being rejected, the account being archived, and the matter being referred to the proper authorities.</li>
          </ul>
        </section>

        <section className="prep-card" id="terms-requests" aria-labelledby="terms-requests-h">
          <h2 id="terms-requests-h"><i className="bi bi-file-earmark-text" aria-hidden="true"></i> 5. Requests, fees and payments</h2>
          <ul className="acc-list">
            <li>Sending a request is an application. Barangay staff check it and may approve, ask for more, or reject it with a reason. Processing times shown on the site are estimates.</li>
            <li>Fees follow the barangay's revenue ordinance and are shown before you submit. The amount on your request doesn't change if the fee changes later.</li>
            <li>If you pay online, your screenshot is only <strong>proof that you sent the money</strong>. Staff match it with the barangay's records, and the Treasurer issues the <strong>Official Receipt</strong>. Each receipt and reference number can be used for one request only.</li>
            <li>A document is released only after its payment is confirmed or waived. Exemptions (First-Time Jobseeker, indigent, senior citizen, PWD) need the proof the form asks for; the First-Time Jobseeker exemption can be used once.</li>
            <li>Facility bookings must follow each facility's hours and limits. Please cancel a booking you no longer need so others can use it.</li>
          </ul>
        </section>

        <section className="prep-card" id="terms-issues" aria-labelledby="terms-issues-h">
          <h2 id="terms-issues-h"><i className="bi bi-flag" aria-hidden="true"></i> 6. The Community Issue Map</h2>
          <p>Every report on the <Link to="/issue-map">Issue Map</Link> must follow the posting rules you agree to before posting:</p>
          <ul className="acc-list">
            {POSTING_RULES.map((r) => <li key={r}>{r}</li>)}
          </ul>
          <ul className="acc-list">
            <li>Other residents see your comments and photos <strong>without your name</strong>. Barangay staff can see who posted.</li>
            <li>Posts with phone numbers, emails or offensive words are refused, and posts that may name a person wait for a staff check before they appear.</li>
            <li>Staff may remove a post that breaks the rules and pause your posting for 7 days, 30 days or until they lift it. You will be emailed the reason. You can still view the map while paused.</li>
            <li>For private complaints or disputes between neighbours, use <Link to="/incident-report">Report Incident</Link> instead. Those go only to barangay staff.</li>
          </ul>
        </section>

        <section className="prep-card" id="terms-notices" aria-labelledby="terms-notices-h">
          <h2 id="terms-notices-h"><i className="bi bi-bell" aria-hidden="true"></i> 7. Emails, texts and alerts</h2>
          <ul className="acc-list">
            <li>We send verification codes and updates about your account and requests by email and text message. Document request updates go by both; for other updates you choose in Edit Profile.</li>
            <li>During an emergency, the barangay may text disaster advisories to every resident, whatever your update preference.</li>
            <li>Keep your email and mobile number current. Changing them needs a code sent to the new address or number.</li>
          </ul>
        </section>

        <section className="prep-card" id="terms-use" aria-labelledby="terms-use-h">
          <h2 id="terms-use-h"><i className="bi bi-slash-circle" aria-hidden="true"></i> 8. Things you must not do</h2>
          <ul className="acc-list">
            <li>Use another person's account, ID or contact details, or pretend to be barangay staff.</li>
            <li>Try to get into parts of the system you are not allowed to use, or to see other residents' information.</li>
            <li>Upload viruses or harmful files, or send many automated requests that slow the site down.</li>
            <li>Harass, threaten or shame anyone, or post false reports.</li>
            <li>Copy residents' information from the site for any other use.</li>
          </ul>
        </section>

        <section className="prep-card" id="terms-privacy" aria-labelledby="terms-privacy-h">
          <h2 id="terms-privacy-h"><i className="bi bi-fingerprint" aria-hidden="true"></i> 9. Your personal information</h2>
          <ul className="acc-list">
            <li>The barangay collects only what it needs to provide these services, and handles it under the <strong>Data Privacy Act of 2012 (Republic Act No. 10173)</strong>.</li>
            <li>Your IDs, selfie, proofs and receipts are seen only by authorized barangay staff. Staff actions on your record are logged.</li>
            <li>Your information is not sold or shared for advertising. It may be shared when the law requires it.</li>
            <li>You may ask to see or correct your information. Most details can be updated in Edit Profile; for anything else, ask at the Barangay Hall.</li>
          </ul>
        </section>

        <section className="prep-card" id="terms-service" aria-labelledby="terms-service-h">
          <h2 id="terms-service-h"><i className="bi bi-cloud-check" aria-hidden="true"></i> 10. Availability and emergency information</h2>
          <ul className="acc-list">
            <li>We try to keep PB2Link working at all times, but it may be unavailable for maintenance or because of problems outside our control. The Barangay Hall remains open during office hours.</li>
            <li>Weather, flood and earthquake information comes from PAGASA, PHIVOLCS, Project NOAH and other sources and is shown for awareness. Always follow official instructions from the barangay and the authorities.</li>
            <li><strong>In an emergency, call <a href="tel:911">911</a></strong> or see the <Link to="/preparedness#prep-hotlines">emergency hotlines</Link>. Don't wait for a reply on the website.</li>
          </ul>
        </section>

        <section className="prep-card" id="terms-changes" aria-labelledby="terms-changes-h">
          <h2 id="terms-changes-h"><i className="bi bi-arrow-repeat" aria-hidden="true"></i> 11. Changes to these terms</h2>
          <p>
            The barangay may update these terms when its services or the law change. The date below shows the latest version.
            Continuing to use PB2Link after a change means you accept the updated terms.
          </p>
        </section>

        <section className="prep-card" id="terms-contact" aria-labelledby="terms-contact-h">
          <h2 id="terms-contact-h"><i className="bi bi-chat-dots" aria-hidden="true"></i> 12. Questions</h2>
          <p>
            Ask at the <strong>Barangay Pasong Buaya II Hall</strong>, Monday to Friday, 8:00 AM to 5:00 PM.
            See also our <Link to="/accessibility">Accessibility</Link> statement.
          </p>
          <p className="prep-source">Last updated on {REVIEWED}.</p>
        </section>
      </div>
    </main>
    <Footer />
  </>
);

export default Terms;
