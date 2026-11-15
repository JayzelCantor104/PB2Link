import { Link } from 'react-router-dom';
import Register from '../pages/Register';
import '../styles/register.css';
import './Profiling.css';

/**
 * Register a resident at the Barangay Hall (/admin/register-resident,
 * migration 049). The same form residents use online, in staff mode: the ID is
 * checked in person, so there is no password and no codes, the email and
 * mobile number are optional, and the account is active once saved
 * (residents.approval_method = 'hall', audit-logged). For residents with no
 * email or mobile number, or who can't register online.
 */
const HallRegistration = () => (
  <div className="hall-reg">
    <div className="hall-reg-head">
      <div>
        <h2><i className="bi bi-person-plus-fill" aria-hidden="true"></i> Register a Resident at the Hall</h2>
        <p>
          For residents who come in person, including those with no email or mobile number. Check their valid ID first,
          scan or photograph it below, and confirm they agree to the Data Privacy Statement.
        </p>
      </div>
      <Link to="/admin/profiling" className="pf-btn pf-btn-ghost"><i className="bi bi-arrow-left" aria-hidden="true"></i> Back to Residents</Link>
    </div>
    <Register staffMode />
  </div>
);

export default HallRegistration;
