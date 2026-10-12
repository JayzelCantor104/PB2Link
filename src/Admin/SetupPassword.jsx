import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import '../styles/auth1.css'; // Inherits your existing crisp canvas/login form theme

const API_BASE = '/api_backend';

// Account activation (migration 015): verify the email with a code, then the
// mobile number with an SMS code, then choose a password.
// Codes: admin_contact_verify.php; activation: admin_setup_password.php.
const SetupPassword = () => {
    const [searchParams] = useSearchParams();
    const token = searchParams.get('token');
    const navigate = useNavigate();

    const [status, setStatus] = useState(null); // { email, mobile, email_verified, mobile_verified }
    const [code, setCode] = useState('');
    const [mobile, setMobile] = useState('');
    const [codeSent, setCodeSent] = useState({ email: false, sms: false });
    const [resendIn, setResendIn] = useState(0);
    const [passwords, setPasswords] = useState({ password: '', confirmPassword: '' });
    const [message, setMessage] = useState({ type: '', text: '' });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [linkInvalid, setLinkInvalid] = useState(!token);

    const step = !status ? 0 : !status.email_verified ? 1 : !status.mobile_verified ? 2 : 3;
    const channel = step === 1 ? 'email' : 'sms';

    const callVerify = useCallback(async (payload) => {
        const response = await fetch(`${API_BASE}/admin_contact_verify.php`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, ...payload })
        });
        const data = await response.json();
        if (data.invalid_link) setLinkInvalid(true);
        if (data.status) setStatus(data.status);
        return data;
    }, [token]);

    useEffect(() => {
        if (!token) {
            setMessage({ type: 'error', text: 'This setup link is missing its security token.' });
            return;
        }
        callVerify({ action: 'status' })
            .then((data) => { if (!data.success) setMessage({ type: 'error', text: data.message }); })
            .catch(() => setMessage({ type: 'error', text: 'Network connection error.' }));
    }, [token, callVerify]);

    useEffect(() => {
        if (resendIn <= 0) return undefined;
        const t = setTimeout(() => setResendIn(resendIn - 1), 1000);
        return () => clearTimeout(t);
    }, [resendIn]);

    const sendCode = async () => {
        setMessage({ type: '', text: '' });
        if (channel === 'sms' && mobile && !/^09\d{9}$/.test(mobile)) {
            setMessage({ type: 'error', text: 'Mobile number must be 11 digits starting with 09.' });
            return;
        }
        setIsSubmitting(true);
        try {
            const data = await callVerify({ action: 'send', channel, mobile: channel === 'sms' ? mobile : undefined });
            if (data.resend_in) setResendIn(data.resend_in);
            if (data.success) {
                setCodeSent(prev => ({ ...prev, [channel]: true }));
                setCode('');
                setMessage({ type: 'success', text: data.message });
            } else {
                setMessage({ type: 'error', text: data.message });
            }
        } catch {
            setMessage({ type: 'error', text: 'Network connection error.' });
        } finally {
            setIsSubmitting(false);
        }
    };

    const verifyCode = async (e) => {
        e.preventDefault();
        if (code.length !== 6) {
            setMessage({ type: 'error', text: 'Please enter the 6-digit code.' });
            return;
        }
        setIsSubmitting(true);
        try {
            const data = await callVerify({ action: 'verify', channel, otp: code });
            setCode('');
            if (data.success) {
                setResendIn(0);
                setMessage({ type: 'success', text: channel === 'email'
                    ? 'Email verified. Next, verify your mobile number.'
                    : 'Mobile number verified. Now choose your password.' });
            } else {
                setMessage({ type: 'error', text: data.message });
            }
        } catch {
            setMessage({ type: 'error', text: 'Network connection error.' });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setMessage({ type: '', text: '' });

        if (passwords.password.length < 8) {
            setMessage({ type: 'error', text: 'Password must be at least 8 characters long.' });
            return;
        }

        if (passwords.password !== passwords.confirmPassword) {
            setMessage({ type: 'error', text: 'Passwords do not match.' });
            return;
        }

        setIsSubmitting(true);
        try {
            const response = await fetch(`${API_BASE}/admin_setup_password.php`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, password: passwords.password })
            });
            const data = await response.json();

            if (data.success) {
                setMessage({ type: 'success', text: 'Account activated! Redirecting to the admin login...' });
                setTimeout(() => navigate('/admin/login'), 3000);
            } else {
                if (data.needs) await callVerify({ action: 'status' });
                setMessage({ type: 'error', text: data.message || 'Verification link expired or invalid.' });
            }
        } catch {
            setMessage({ type: 'error', text: 'Network connection error.' });
        } finally {
            setIsSubmitting(false);
        }
    };

    const stepTitle = ['Account Activation', 'Step 1 of 3: Verify Your Email', 'Step 2 of 3: Verify Your Mobile Number', 'Step 3 of 3: Choose a Password'][step];
    const stepText = [
        'Checking your invitation link...',
        `We'll email a 6-digit code to ${status?.email || 'your email'} to confirm it is yours.`,
        status?.mobile
            ? `We'll text a 6-digit code to ${status.mobile}. Enter a different number below if this one is wrong.`
            : 'Enter your mobile number and we will text you a 6-digit code.',
        'Configure a strong password to complete your administrator account.'
    ][step];

    return (
        <main style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
            <div className="auth-card text-start">
                <div className="auth-icon">{step === 2 ? '📱' : step === 1 ? '✉️' : '🔑'}</div>
                <h2>{stepTitle}</h2>
                <p>{stepText}</p>
                {step > 0 && (
                    <div className="auth-steps" aria-hidden="true">
                        <span className={step > 1 ? 'is-done' : ''}></span>
                        <span className={step > 2 ? 'is-done' : ''}></span>
                        <span></span>
                    </div>
                )}

                {message.text && (
                    <div className={message.type === 'success' ? 'success-banner' : 'error-banner'} style={{ padding: '12px', borderRadius: '8px', marginBottom: '16px', fontSize: '0.9rem', background: message.type === 'success' ? '#ecfdf5' : '#fef2f2', color: message.type === 'success' ? '#047857' : '#b91c1c' }}>
                        {message.text}
                    </div>
                )}

                {!linkInvalid && (step === 1 || step === 2) && (
                    <form onSubmit={verifyCode}>
                        {step === 2 && (
                            <div className="input-group mb-3">
                                <input
                                    type="text" inputMode="numeric" maxLength={11} placeholder=" "
                                    value={mobile}
                                    onChange={e => setMobile(e.target.value.replace(/\D/g, ''))}
                                />
                                <label>{status?.mobile ? `Mobile Number (leave blank to use ${status.mobile})` : 'Mobile Number (09XXXXXXXXX)'}</label>
                            </div>
                        )}
                        {step === 2 && status && !status.sms_available && (
                            <div className="error-banner" style={{ padding: '12px', borderRadius: '8px', marginBottom: '16px' }}>
                                Text messages are not available right now. Please try again later.
                            </div>
                        )}
                        {codeSent[channel] && (
                            <div className="input-group mb-3">
                                <input
                                    type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder=" " autoFocus
                                    value={code}
                                    onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
                                />
                                <label>6-Digit {channel === 'email' ? 'Email' : 'SMS'} Code</label>
                            </div>
                        )}
                        {codeSent[channel] ? (
                            <button type="submit" className="btn-login" disabled={isSubmitting}>
                                {isSubmitting ? 'Checking...' : 'Verify Code'}
                            </button>
                        ) : (
                            <button type="button" className="btn-login" onClick={sendCode} disabled={isSubmitting || (step === 2 && status && !status.sms_available)}>
                                {isSubmitting ? 'Sending...' : channel === 'email' ? 'Email Me a Code' : 'Text Me a Code'}
                            </button>
                        )}
                        {codeSent[channel] && (
                            <div className="auth-channel-links">
                                <button type="button" className="auth-link-btn" onClick={sendCode} disabled={isSubmitting || resendIn > 0}>
                                    {resendIn > 0 ? `Resend code in ${resendIn}s` : 'Resend code'}
                                </button>
                            </div>
                        )}
                    </form>
                )}

                {!linkInvalid && step === 3 && (
                    <form onSubmit={handleSubmit}>
                        <div className="input-group mb-3">
                            <input
                                type="password"
                                required
                                placeholder=" "
                                value={passwords.password}
                                onChange={e => setPasswords({ ...passwords, password: e.target.value })}
                            />
                            <label>New Password</label>
                        </div>

                        <div className="input-group mb-4">
                            <input
                                type="password"
                                required
                                placeholder=" "
                                value={passwords.confirmPassword}
                                onChange={e => setPasswords({ ...passwords, confirmPassword: e.target.value })}
                            />
                            <label>Confirm Password</label>
                        </div>

                        <button type="submit" className="btn-login" disabled={isSubmitting || !token}>
                            {isSubmitting ? 'Configuring Access...' : 'Activate Admin Account'}
                        </button>
                    </form>
                )}
            </div>
        </main>
    );
};

export default SetupPassword;
