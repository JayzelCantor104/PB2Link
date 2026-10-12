import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import '../styles/auth1.css';

const API_BASE = '/api_backend';

// Reset by an email link, or by an SMS code to the admin's verified mobile
// number (migration 015). A correct SMS code returns a short-lived reset
// token for the normal /admin/reset-password page.
const AdminForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [channel, setChannel] = useState('email');
  const [stage, setStage] = useState('request'); // 'request' | 'code'
  const [code, setCode] = useState('');
  const [resendIn, setResendIn] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    if (resendIn <= 0) return undefined;
    const t = setTimeout(() => setResendIn(resendIn - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const handleSubmit = async (e) => {
    e?.preventDefault();
    setError('');
    setMessage('');
    setIsLoading(true);

    try {
      const response = await fetch(`${API_BASE}/admin_forgot_password.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, channel }),
      });
      const data = await response.json();

      if (data.success) {
        setMessage(data.message);
        if (channel === 'sms') {
          setStage('code');
          setCode('');
          setResendIn(data.resend_in || 60);
        }
      } else {
        if (data.resend_in) setResendIn(data.resend_in);
        setError(data.message);
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyCode = async (e) => {
    e.preventDefault();
    setError('');
    if (code.length !== 6) {
      setError('Please enter the 6-digit code from the text message.');
      return;
    }
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE}/admin_forgot_password.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, action: 'verify_sms', otp: code }),
      });
      const data = await response.json();
      if (data.success && data.reset_token) {
        navigate(`/admin/reset-password?token=${encodeURIComponent(data.reset_token)}`);
      } else {
        setCode('');
        setError(data.message || 'Incorrect code. Please try again.');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const backToRequest = () => {
    setStage('request');
    setChannel('email');
    setCode('');
    setError('');
    setMessage('');
  };

  return (
    <main>
      <div className="auth-card">
        <div className="auth-icon">🔒</div>
        <h2>Admin Recovery</h2>
        <p>
          {stage === 'code'
            ? 'Enter the 6-digit code we texted to your verified mobile number.'
            : 'Enter your administrator email, then choose a reset link by email or a code by SMS.'}
        </p>

        {error && <div className="error-banner">{error}</div>}
        {message && <div style={{ padding: '12px', background: '#ecfdf5', color: '#059669', borderRadius: '4px', marginBottom: '20px', fontWeight: 'bold' }}>{message}</div>}

        {stage === 'request' ? (
          <form onSubmit={handleSubmit}>
            <div className="input-group">
              <input type="email" required placeholder=" " value={email} onChange={(e) => setEmail(e.target.value)} />
              <label>Admin Email Address</label>
            </div>
            <div className="auth-channel" role="radiogroup" aria-label="How to receive your reset">
              <label className={`auth-channel-opt ${channel === 'email' ? 'is-active' : ''}`}>
                <input type="radio" name="channel" value="email" checked={channel === 'email'} onChange={() => setChannel('email')} />
                <span>Email me a link</span>
              </label>
              <label className={`auth-channel-opt ${channel === 'sms' ? 'is-active' : ''}`}>
                <input type="radio" name="channel" value="sms" checked={channel === 'sms'} onChange={() => setChannel('sms')} />
                <span>Text me a code</span>
              </label>
            </div>
            <button type="submit" className="btn-login" disabled={isLoading}>
              {isLoading ? 'Sending...' : channel === 'sms' ? 'Send Code by SMS' : 'Send Reset Link'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyCode}>
            <div className="input-group">
              <input type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required placeholder=" " autoFocus
                value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
              <label>6-Digit Code</label>
            </div>
            <button type="submit" className="btn-login" disabled={isLoading}>
              {isLoading ? 'Checking...' : 'Verify Code'}
            </button>
            <div className="auth-channel-links">
              <button type="button" className="auth-link-btn" onClick={() => handleSubmit()} disabled={isLoading || resendIn > 0}>
                {resendIn > 0 ? `Resend code in ${resendIn}s` : 'Resend code'}
              </button>
              <button type="button" className="auth-link-btn" onClick={backToRequest} disabled={isLoading}>
                Use email instead
              </button>
            </div>
          </form>
        )}

        <div className="auth-footer">
          <p><Link to="/admin">Back to Admin Login</Link></p>
        </div>
      </div>
    </main>
  );
};

export default AdminForgotPassword;
