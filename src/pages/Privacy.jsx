import { Link } from 'react-router-dom';
import Header from '../components/Header';
import Footer from '../components/Footer';
import '../styles/preparedness.css';

// /privacy: how PB2Link handles residents' personal information, written in
// plain language and kept in step with what the system actually stores and
// sends. Have the barangay (and its Data Protection Officer) review it, and
// update REVIEWED when the wording changes.
const REVIEWED = '11 November 2026';

const SECTIONS = [
  { id: 'who', title: '1. Who we are' },
  { id: 'collect', title: '2. What we collect' },
  { id: 'why', title: '3. Why we use it' },
  { id: 'see', title: '4. Who can see it' },
  { id: 'outside', title: '5. Services we use' },
  { id: 'keep', title: '6. How long we keep it' },
  { id: 'protect', title: '7. How we protect it' },
  { id: 'device', title: '8. Cookies and your device' },
  { id: 'rights', title: '9. Your rights' },
  { id: 'minors', title: '10. Children' },
  { id: 'changes', title: '11. Changes to this policy' },
  { id: 'contact', title: '12. Contact and complaints' },
];

const Card = ({ id, icon, title, children }) => (
  <section className="prep-card" id={`privacy-${id}`} aria-labelledby={`privacy-${id}-h`}>
    <h2 id={`privacy-${id}-h`}><i className={`bi ${icon}`} aria-hidden="true"></i> {title}</h2>
    {children}
  </section>
);

const Privacy = () => (
  <>
    <Header />
    <main className="prep-page">
      <div className="prep-container">
        <section className="prep-hero" aria-labelledby="privacy-title">
          <span className="prep-eyebrow"><i className="bi bi-fingerprint" aria-hidden="true"></i> Your information</span>
          <h1 id="privacy-title">Privacy Policy</h1>
          <p>
            Barangay Pasong Buaya II respects your privacy. This policy explains what personal information PB2Link collects,
            why, who can see it, and your rights under the Data Privacy Act of 2012 (Republic Act No. 10173).
          </p>
        </section>

        <nav className="prep-card" aria-labelledby="privacy-contents">
          <h2 id="privacy-contents"><i className="bi bi-list-ul" aria-hidden="true"></i> Contents</h2>
          <ul className="acc-list terms-toc">
            {SECTIONS.map((s) => <li key={s.id}><a href={`#privacy-${s.id}`}>{s.title}</a></li>)}
          </ul>
        </nav>

        <Card id="who" icon="bi-building" title="1. Who we are">
          <p>
            PB2Link is the online portal of <strong>Barangay Pasong Buaya II, City of Imus, Cavite</strong>. The barangay is
            responsible for the personal information you give through it, the same as for forms you fill out at the Barangay Hall.
          </p>
        </Card>

        <Card id="collect" icon="bi-collection" title="2. What we collect">
          <ul className="acc-list">
            <li><strong>Your profile:</strong> name, birth date, sex, civil status, address, the month you moved in, whether you own, rent or share your home, email, mobile number, and an emergency contact.</li>
            <li><strong>Proof of identity:</strong> photos of the front and back of your valid ID, a selfie holding it, and, if you give it, your PhilSys number and card photos. We also keep the text read from your ID by the scanner, to check it against what you typed.</li>
            <li><strong>Proofs you upload:</strong> proof of address or residency, and documents for sectors such as PWD, Solo Parent, 4Ps or Indigent.</li>
            <li><strong>Your requests and reports:</strong> document requests, facility bookings, incident reports and Community Issue Map posts, with their attachments and photos.</li>
            <li><strong>Payments:</strong> the reference number, amount and date you enter, and the receipt screenshot you upload.</li>
            <li><strong>Sign-in records:</strong> failed sign-in attempts with the internet address they came from, used only to stop password guessing and deleted after a day.</li>
            <li><strong>Alerts on your device:</strong> if you turn on advisory notifications, the address your browser gives us for sending them.</li>
          </ul>
          <p>
            Your location is used only in your browser when you ask for your nearest evacuation center, and is never sent to us.
            When you pin a problem on the Issue Map, only the pin's location is saved.
          </p>
        </Card>

        <Card id="why" icon="bi-bullseye" title="3. Why we use it">
          <ul className="acc-list">
            <li>To confirm that you are who you say you are and that you live in Pasong Buaya II.</li>
            <li>To process your document requests, bookings, payments and reports, and to prepare your certificates.</li>
            <li>To send you verification codes and updates by email and text, and disaster advisories in an emergency.</li>
            <li>To plan disaster response: barangay officials keep a list of senior citizens and persons with disabilities by street, so they can be checked on first.</li>
            <li>To keep the barangay's records and to follow the law.</li>
          </ul>
          <p>We do not sell your information, and we do not use it for advertising.</p>
        </Card>

        <Card id="see" icon="bi-eye" title="4. Who can see it">
          <ul className="acc-list">
            <li><strong>Authorized barangay staff only</strong>, and only the parts they need for their work. Each staff account has its own access, and staff actions on your record are logged.</li>
            <li><strong>Other residents</strong> never see your profile. On the Community Issue Map they see your comments and photos <strong>without your name</strong>.</li>
            <li><strong>Government offices or courts</strong>, only when the law requires it.</li>
          </ul>
        </Card>

        <Card id="outside" icon="bi-diagram-3" title="5. Services we use">
          <p>Some tasks are done by outside services, which receive only what that task needs:</p>
          <ul className="acc-list">
            <li><strong>Google Cloud Vision</strong> reads the text on your ID photo and checks that your selfie shows a face and your ID.</li>
            <li><strong>PhilSMS</strong> sends text messages: it receives your mobile number and the message.</li>
            <li><strong>Our email service</strong> sends emails: it receives your email address and the message.</li>
            <li><strong>Our web host</strong> stores the website, the database and uploaded files.</li>
            <li><strong>Maps and weather</strong> (OpenStreetMap, Open-Meteo, RainViewer, Project NOAH) are loaded by your browser and don't receive your personal information. Google Maps opens only when you tap for directions.</li>
          </ul>
        </Card>

        <Card id="keep" icon="bi-archive" title="6. How long we keep it">
          <ul className="acc-list">
            <li>Your account and requests are kept as barangay records for as long as they are needed and as the law on government records requires.</li>
            <li>A closed (archived) account is kept, not deleted, so its records remain complete. It can no longer sign in.</li>
            <li>Short-lived information is deleted automatically: verification codes expire in 10 minutes, ID and selfie scan results are deleted after a day, and failed sign-in records are deleted after a day.</li>
          </ul>
        </Card>

        <Card id="protect" icon="bi-shield-lock" title="7. How we protect it">
          <ul className="acc-list">
            <li>Passwords and verification codes are stored scrambled, so not even staff can read them.</li>
            <li>Payment receipts are kept in a private folder that can't be opened from the internet, only by authorized staff and by you.</li>
            <li>Signing in is paused after repeated wrong passwords.</li>
            <li>Staff accounts each have their own access, and changes they make are recorded in a log that can't be edited.</li>
            <li>No system is perfectly safe. If a breach affects your information, the barangay will tell you and the National Privacy Commission as the law requires.</li>
          </ul>
        </Card>

        <Card id="device" icon="bi-phone" title="8. Cookies and your device">
          <ul className="acc-list">
            <li>We use <strong>one cookie</strong>, to keep you signed in. It ends when you sign out or close your browser.</li>
            <li>Your browser also remembers some choices on your device only: text size and contrast, your Home page layout, which tours and tips you've seen, and unfinished request forms (for up to 12 hours, cleared when you sign out).</li>
            <li>We don't use advertising or tracking cookies, and no analytics service follows you on this site.</li>
          </ul>
        </Card>

        <Card id="rights" icon="bi-person-check" title="9. Your rights">
          <p>Under the Data Privacy Act, you have the right to:</p>
          <ul className="acc-list">
            <li><strong>Be informed</strong> about how your information is used (this page).</li>
            <li><strong>See</strong> the information we hold about you, and <strong>get a copy</strong> of it.</li>
            <li><strong>Correct</strong> wrong or outdated information. Most details can be changed in Edit Profile; some need a proof and staff approval.</li>
            <li><strong>Object</strong> to its use, or ask for it to be <strong>blocked or removed</strong>, when it is no longer needed or was used wrongly, subject to the barangay's records duties.</li>
            <li><strong>Complain</strong> to the National Privacy Commission, and be compensated for damage caused by misuse.</li>
          </ul>
        </Card>

        <Card id="minors" icon="bi-people" title="10. Children">
          <p>
            Only residents 18 or older can have an account. When a parent or guardian requests a document for a child, the
            child's information is used only for that request.
          </p>
        </Card>

        <Card id="changes" icon="bi-arrow-repeat" title="11. Changes to this policy">
          <p>We may update this policy when our services or the law change. The date below shows the latest version.</p>
        </Card>

        <Card id="contact" icon="bi-chat-dots" title="12. Contact and complaints">
          <p>
            For questions, or to use any of your rights, ask for the barangay's <strong>Data Protection Officer</strong> at the
            Barangay Pasong Buaya II Hall, Monday to Friday, 8:00 AM to 5:00 PM.
          </p>
          <p>
            If you are not satisfied, you may complain to the <strong>National Privacy Commission</strong> at{' '}
            <a href="https://privacy.gov.ph" target="_blank" rel="noopener noreferrer">privacy.gov.ph</a>.
            See also our <Link to="/terms">Terms of Service</Link>.
          </p>
          <p className="prep-source">Last updated on {REVIEWED}.</p>
        </Card>
      </div>
    </main>
    <Footer />
  </>
);

export default Privacy;
