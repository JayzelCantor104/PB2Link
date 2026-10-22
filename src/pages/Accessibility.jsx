import { Link } from 'react-router-dom';
import Header from '../components/Header';
import Footer from '../components/Footer';
import '../styles/preparedness.css';

// /accessibility: what the site supports, its known limits, and how to get
// help. Contact for help is the Barangay Hall until an official accessibility
// contact (phone / email) is set; add it in the "Get help" section.
const REVIEWED = '23 October 2026';

const Accessibility = () => (
  <>
    <Header />
    <main className="prep-page">
      <div className="prep-container">
        <section className="prep-hero" aria-labelledby="acc-title">
          <span className="prep-eyebrow"><i className="bi bi-universal-access" aria-hidden="true"></i> For everyone</span>
          <h1 id="acc-title">Accessibility</h1>
          <p>
            PB2Link is built so that every resident, including persons with disabilities and senior citizens, can use the
            barangay's online services. We aim to meet the Web Content Accessibility Guidelines (WCAG) 2.2 at Level AA.
          </p>
        </section>

        <div className="prep-grid-top">
          <section className="prep-card" aria-labelledby="acc-use">
            <h2 id="acc-use"><i className="bi bi-person-check" aria-hidden="true"></i> What you can do</h2>
            <ul className="acc-list">
              <li><strong>Use a keyboard only.</strong> Press Tab to move, Enter or Space to choose, and Esc to close a window. The first Tab press offers <em>Skip to main content</em>.</li>
              <li><strong>Use a screen reader</strong>, such as NVDA or Narrator on Windows, TalkBack on Android, or VoiceOver on iPhone. Pages, buttons, form fields and errors are named.</li>
              <li><strong>Make text bigger</strong> with the Accessibility button at the bottom left of every page, or zoom with your browser (Ctrl and +, or pinch) up to 400%: pages rearrange to fit.</li>
              <li><strong>Turn on high contrast, easier reading or underlined links</strong> from the same button. Your choices are saved on your device.</li>
              <li><strong>Stop animations.</strong> The site follows your phone or computer's "reduce motion" setting, or choose it in the Accessibility menu.</li>
            </ul>
          </section>

          <section className="prep-card" aria-labelledby="acc-around">
            <h2 id="acc-around"><i className="bi bi-signpost-split" aria-hidden="true"></i> Other ways to do things</h2>
            <ul className="acc-list">
              <li><strong>Maps</strong> need a mouse or touch. Every map has a list version: evacuation centers on the Disaster Risk page and the <a href="/emergency">Emergency Info</a> page, problems on the Issue Map's list (and <em>Use my current location</em> to report one), and each garbage route written out in its schedule.</li>
              <li><strong>The ID scanner</strong> can use a photo you upload instead of the camera, and you can type your details yourself if the scan doesn't work.</li>
              <li><strong>Verification codes</strong> last 10 minutes, and you can ask for a new one after a minute. In Edit Profile you can choose to get them by email or by text.</li>
              <li><strong>Emergency information</strong> opens on a light page that works with weak signal and without a connection once visited: <a href="/emergency">Emergency Info</a>.</li>
            </ul>
          </section>
        </div>

        <section className="prep-card" aria-labelledby="acc-limits">
          <h2 id="acc-limits"><i className="bi bi-exclamation-circle" aria-hidden="true"></i> Known limits</h2>
          <ul className="acc-list">
            <li>The maps themselves can't be used with a keyboard or screen reader; use their list versions above.</li>
            <li>Photos in announcements and documents people upload may not have a full text description.</li>
            <li>Printed certificates and IDs are made for paper and aren't designed to be read by screen readers.</li>
            <li>Links to other services (Google Maps directions, map pictures from OpenStreetMap, weather and hazard sources) follow those services' own accessibility.</li>
            <li>The site has been checked with automated tests (axe-core) and by keyboard, but not yet with every screen reader. Tell us if something doesn't work for you.</li>
          </ul>
        </section>

        <section className="prep-card" aria-labelledby="acc-help">
          <h2 id="acc-help"><i className="bi bi-chat-heart" aria-hidden="true"></i> Get help or report a problem</h2>
          <p>
            If any part of PB2Link is hard to use, or you'd rather do it in person, visit the <strong>Barangay Pasong Buaya II Hall</strong>,
            Monday to Friday, 8:00 AM to 5:00 PM. Barangay staff can help you with any request, and they'd like to know which page
            gave you trouble and what happened, so it can be fixed.
          </p>
          <p>
            In an emergency, call <a href="tel:911">911</a> or see the <Link to="/preparedness#prep-hotlines">emergency hotlines</Link>.
          </p>
          <p className="prep-source">This statement was last reviewed on {REVIEWED}.</p>
        </section>
      </div>
    </main>
    <Footer />
  </>
);

export default Accessibility;
