import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Header from "../components/Header";
import Footer from "../components/Footer";
import Preloader from "../components/Preloader";
import '../styles/auth.css';

const API_BASE = '/api_backend';

const ResetPassword = () => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [token, setToken] = useState('');
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Password Strength State Tracker
  const [strength, setStrength] = useState({
    score: 0,
    label: 'Weak',
    color: '#e53e3e',
    requirements: {
      length: false,
      hasUpper: false,
      hasNumber: false,
      hasSpecial: false,
    }
  });

  const errorRef = useRef(null);
  const successRef = useRef(null);

  useEffect(() => {
    const timer = setTimeout(() => setPageLoading(false), 600);
    const tokenParam = searchParams.get('token');
    
    if (!tokenParam) {
      setError('System Access Error: Invalid or expired password reset link. No security token provided.');
      errorRef.current?.focus();
    } else {
      setToken(tokenParam);
    }

    return () => clearTimeout(timer);
  }, [searchParams]);

  // Real-time Strength Evaluator
  useEffect(() => {
    if (!password) {
      setStrength({
        score: 0, label: 'Empty', color: '#cbd5e1',
        requirements: { length: false, hasUpper: false, hasNumber: false, hasSpecial: false }
      });
      return;
    }

    const reqs = {
      length: password.length >= 8,
      hasUpper: /[A-Z]/.test(password),
      hasNumber: /[0-9]/.test(password),
      hasSpecial: /[^A-Za-z0-9]/.test(password),
    };

    const passedCount = Object.values(reqs).filter(Boolean).length;
    
    let label = 'Weak';
    let color = '#e53e3e'; // Premium Crimson Red

    if (passedCount === 2) {
      label = 'Fair';
      color = '#dd6b20'; // Warm Amber/Orange
    } else if (passedCount === 3) {
      label = 'Good';
      color = '#3182ce'; // Royal Slate Blue
    } else if (passedCount === 4) {
      label = 'Strong & Secure';
      color = '#00966c'; // Signature Emerald
    }

    setStrength({ score: passedCount, label, color, requirements: reqs });
  }, [password]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (strength.score < 3) {
      setError('Security Requirement: Please fulfill more safety criteria to establish a resilient password.');
      errorRef.current?.focus();
      return;
    }

    if (password !== confirmPassword) {
      setError('Validation Error: Passwords do not match. Please verify your entries.');
      errorRef.current?.focus();
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${API_BASE}/reset_password.php`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify({ token, password }),
      });

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();

      if (data.success) {
        setSuccess('Credentials updated successfully! Securely redirecting to login portal...');
        successRef.current?.focus();
        setTimeout(() => navigate('/login'), 2500);
      } else {
        setError(data.message || 'Authentication Error: Unable to re-validate token.');
        errorRef.current?.focus();
      }
    } catch (err) {
      setError('Network Integrity Error: Secure connection failed. Please try again.');
      errorRef.current?.focus();
    } finally {
      setLoading(false);
    }
  };

  if (pageLoading) return <Preloader />;

  return (
    <div className="portal-layout-wrapper">
      <Header />
      
      <main className="portal-main-content">
        <div className="portal-auth-card-premium">
          <div className="portal-premium-glow"></div>
          
          <h1 className="portal-card-title-premium">Reset Password</h1>
          <p className="portal-card-subtitle-premium">Securely establish your new digital access credentials.</p>

          {error && (
            <div className="portal-alert portal-alert-error" role="alert" ref={errorRef} tabIndex="-1">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="portal-alert portal-alert-success" role="status" ref={successRef} tabIndex="-1">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
              <span>{success}</span>
            </div>
          )}

          {!error && token && (
            <form onSubmit={handleSubmit} noValidate className="portal-form-flow">
              
              <div className="portal-input-group-premium">
                <label htmlFor="password">New Password</label>
                <input
                  type="password"
                  id="password"
                  name="password"
                  required
                  placeholder="Enter complex password string"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />

                {/* Micro-engineered Password Strength Visualizer */}
                {password && (
                  <div className="password-strength-meter-container" aria-live="polite">
                    <div className="strength-meta-row">
                      <span className="strength-indicator-label">Password Integrity: <strong style={{ color: strength.color }}>{strength.label}</strong></span>
                    </div>
                    <div className="strength-track-bar">
                      <div 
                        className="strength-progress-fill" 
                        style={{ 
                          width: `${(strength.score / 4) * 100}%`, 
                          backgroundColor: strength.color 
                        }}
                      ></div>
                    </div>
                    
                    {/* Matrix Checklist Elements */}
                    <ul className="strength-requirements-grid">
                      <li className={strength.requirements.length ? 'met' : ''}>Min. 8 characters</li>
                      <li className={strength.requirements.hasUpper ? 'met' : ''}>Uppercase letter</li>
                      <li className={strength.requirements.hasNumber ? 'met' : ''}>Contains number</li>
                      <li className={strength.requirements.hasSpecial ? 'met' : ''}>Special symbol</li>
                    </ul>
                  </div>
                )}
              </div>

              <div className="portal-input-group-premium">
                <label htmlFor="confirmPassword">Confirm New Password</label>
                <input
                  type="password"
                  id="confirmPassword"
                  name="password"
                  required
                  placeholder="Re-enter password to match"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>

              <button type="submit" className="portal-btn-submit-premium" disabled={loading}>
                {loading ? (
                  <div className="premium-btn-loader">Updating Core Credentials...</div>
                ) : 'Reset Password'}
              </button>
            </form>
          )}

          <div className="portal-card-footer-premium">
            <p>Remember your credentials? <a href="/login" className="portal-footer-link-premium">Log In</a></p>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default ResetPassword;