import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import '../styles/auth.css';

const API_BASE = '/api_backend';

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  // Reset by email link, or by an SMS code to the mobile number on file (migration 015).
  const [channel, setChannel] = useState('email');
  const [stage, setStage] = useState('request'); // 'request' | 'code'
  const [code, setCode] = useState('');
  const [resendIn, setResendIn] = useState(0);
  const navigate = useNavigate();
  const canvasRef = useRef(null);

  useEffect(() => {
    if (resendIn <= 0) return undefined;
    const t = setTimeout(() => setResendIn(resendIn - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    let particles = [];
    class Particle {
      constructor() {
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * canvas.height;
        this.size = Math.random() * 2 + 1;
        this.speedX = Math.random() * 1 - 0.5;
        this.speedY = Math.random() * 1 - 0.5;
      }
      update() {
        this.x += this.speedX;
        this.y += this.speedY;
        if (this.x > canvas.width || this.x < 0) this.speedX *= -1;
        if (this.y > canvas.height || this.y < 0) this.speedY *= -1;
      }
      draw() {
        ctx.fillStyle = 'rgba(5, 150, 105, 0.25)';
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function init() {
      particles = [];
      for (let i = 0; i < 60; i++) particles.push(new Particle());
    }

    function animate() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < particles.length; i++) {
        particles[i].update();
        particles[i].draw();
        for (let j = i; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 120) {
            ctx.beginPath();
            ctx.strokeStyle = `rgba(5, 150, 105, ${0.2 - dist / 120})`;
            ctx.lineWidth = 0.5;
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }
      requestAnimationFrame(animate);
    }

    init();
    animate();

    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      init();
    };
    window.addEventListener('resize', handleResize);

    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError('Please enter a valid email address');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/forgot_password.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), channel }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (data.success && channel === 'sms') {
        setSuccess(data.message);
        setStage('code');
        setCode('');
        setResendIn(data.resend_in || 60);
      } else if (data.success) {
        setSuccess('Password reset link has been sent to your email.');
        setEmail(''); // Clear the form
      } else {
        if (data.resend_in) setResendIn(data.resend_in);
        setError(data.message || 'An error occurred');
      }
    } catch (err) {
      console.error('Forgot password error:', err);
      setError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  // SMS code -> a short-lived reset token -> the normal Reset Password page.
  const handleVerifyCode = async (e) => {
    e.preventDefault();
    setError('');
    if (code.length !== 6) {
      setError('Please enter the 6-digit code from the text message.');
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/forgot_password.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), action: 'verify_sms', otp: code }),
      });
      const data = await response.json();
      if (data.success && data.reset_token) {
        navigate(`/reset-password?token=${encodeURIComponent(data.reset_token)}`);
      } else {
        setCode('');
        setError(data.message || 'Incorrect code. Please try again.');
      }
    } catch {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const backToRequest = () => {
    setStage('request');
    setChannel('email');
    setCode('');
    setError('');
    setSuccess('');
  };

  return (
    <>
      <canvas id="bgCanvas" ref={canvasRef}></canvas>
      <main>
        <div className="auth-card">
          <div className="auth-icon">🔑</div>
          <h2>Forgot Password</h2>
          <p>
            {stage === 'code'
              ? 'Enter the 6-digit code we texted to the mobile number on your account.'
              : 'Enter your email address, then choose how to receive your reset: a link by email, or a code by SMS.'}
          </p>

          {error && (
            <div className="error-banner">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg>
              {error}
            </div>
          )}

          {success && (
            <div style={{ background: '#d1fae5', color: '#065f46', padding: '12px', borderRadius: '10px', marginBottom: '20px', textAlign: 'center' }}>
              {success}
            </div>
          )}

          {stage === 'request' ? (
            <form onSubmit={handleSubmit}>
              <div className="input-group">
                <input
                  type="email"
                  name="email"
                  id="email"
                  required
                  placeholder=" "
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <label htmlFor="email">Email Address</label>
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

              <button type="submit" className="btn-login" disabled={loading}>
                {loading ? 'Sending...' : channel === 'sms' ? 'Send Code by SMS' : 'Send Reset Link'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyCode}>
              <div className="input-group">
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  id="sms-code"
                  required
                  placeholder=" "
                  autoFocus
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                />
                <label htmlFor="sms-code">6-Digit Code</label>
              </div>

              <button type="submit" className="btn-login" disabled={loading}>
                {loading ? 'Checking...' : 'Verify Code'}
              </button>

              <div className="auth-channel-links">
                <button type="button" className="auth-link-btn" onClick={handleSubmit} disabled={loading || resendIn > 0}>
                  {resendIn > 0 ? `Resend code in ${resendIn}s` : 'Resend code'}
                </button>
                <button type="button" className="auth-link-btn" onClick={backToRequest} disabled={loading}>
                  Use email instead
                </button>
              </div>
            </form>
          )}

          <div className="auth-footer">
            <p>Remember your password? <Link to="/login">Back to Login</Link></p>
          </div>
        </div>
      </main>
    </>
  );
};

export default ForgotPassword;