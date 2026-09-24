import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import '../styles/camera.css';

// Live in-page camera (getUserMedia). The <input capture> attribute is ignored
// by desktop browsers — they just open a file picker — so "Take Photo" and the
// ID scanner use this instead to actually open the camera on every device.
//
// mode="face": front camera, oval guide, saved as a centered square (avatar).
// mode="id":   back camera, card-shaped guide, saved cropped to the card area
//              (ID-card proportions, which is what the OCR quality check expects).
//
// Needs a secure context: works on http://localhost and on HTTPS, not on plain
// HTTP. When the camera can't be used, the dialog offers a file upload instead.

const ID_CARD_RATIO = 85.6 / 53.98; // ISO/IEC 7810 ID-1 (PhilID, driver's license, UMID...)

const getGuideRect = (mode, w, h) => {
  if (mode === 'face') {
    const size = Math.min(w, h);
    return { x: (w - size) / 2, y: (h - size) / 2, w: size, h: size };
  }
  let gw = w * 0.86;
  let gh = gw / ID_CARD_RATIO;
  if (gh > h * 0.86) {
    gh = h * 0.86;
    gw = gh * ID_CARD_RATIO;
  }
  return { x: (w - gw) / 2, y: (h - gh) / 2, w: gw, h: gh };
};

const describeError = (err) => {
  if (!window.isSecureContext) {
    return 'The camera can only be used on a secure (HTTPS) connection. Please upload a photo instead.';
  }
  switch (err?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Camera access was blocked. Allow camera permission in your browser settings, or upload a photo instead.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'No camera was found on this device. Please upload a photo instead.';
    case 'NotReadableError':
      return 'Your camera is being used by another app. Close it and try again, or upload a photo instead.';
    default:
      return 'Unable to start the camera. Please try again or upload a photo instead.';
  }
};

const CameraCapture = ({ open, mode = 'face', title, hint, onCapture, onClose }) => {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const fileInputRef = useRef(null);

  const [status, setStatus] = useState('idle'); // idle | starting | live | captured | error
  const [error, setError] = useState('');
  const [videoSize, setVideoSize] = useState({ w: 0, h: 0 });
  const [shot, setShot] = useState(null); // { blob, url }
  const [devices, setDevices] = useState([]);
  const [deviceIndex, setDeviceIndex] = useState(-1); // -1 = let facingMode pick
  const [facing, setFacing] = useState(''); // reported by the active track, when the browser knows it

  const isFace = mode === 'face';

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, []);

  const startStream = useCallback(async (index) => {
    stopStream();
    setStatus('starting');
    setError('');

    if (!navigator.mediaDevices?.getUserMedia) {
      setError(describeError({ name: window.isSecureContext ? 'NotFoundError' : 'SecurityError' }));
      setStatus('error');
      return;
    }

    const video = index >= 0 && devices[index]
      ? { deviceId: { exact: devices[index].deviceId } }
      : { facingMode: { ideal: isFace ? 'user' : 'environment' } };

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { ...video, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false
      });
      streamRef.current = stream;
      setFacing(stream.getVideoTracks()[0]?.getSettings?.().facingMode || '');
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      // Labels/ids are only available after permission is granted.
      const all = await navigator.mediaDevices.enumerateDevices();
      setDevices(all.filter(d => d.kind === 'videoinput'));
      setStatus('live');
    } catch (err) {
      console.error('Camera error:', err);
      setError(describeError(err));
      setStatus('error');
    }
  }, [devices, isFace, stopStream]);

  // Open/close lifecycle. startStream is intentionally not a dependency: it
  // changes whenever the device list does, which must not restart the camera.
  useEffect(() => {
    if (!open) return undefined;
    setShot(null);
    setDeviceIndex(-1);
    startStream(-1);
    return () => {
      stopStream();
      // Reset so the next open starts on a fresh live view, not the last shot.
      setShot(null);
      setStatus('idle');
      setVideoSize({ w: 0, h: 0 });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => () => { if (shot?.url) URL.revokeObjectURL(shot.url); }, [shot]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Callback ref: whenever the <video> (re)mounts — e.g. after Retake swaps the
  // still preview back out — hand it the current stream.
  const attachVideo = useCallback((el) => {
    videoRef.current = el;
    if (el && streamRef.current && el.srcObject !== streamRef.current) {
      el.srcObject = streamRef.current;
      el.play().catch(() => {});
    }
  }, []);

  const handleTakePhoto = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const rect = getGuideRect(mode, video.videoWidth, video.videoHeight);

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(rect.w);
    canvas.height = Math.round(rect.h);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, rect.x, rect.y, rect.w, rect.h, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((blob) => {
      if (!blob) return;
      setShot({ blob, url: URL.createObjectURL(blob) });
      setStatus('captured');
      stopStream(); // no need to keep the camera light on while reviewing
    }, 'image/jpeg', 0.92);
  };

  const handleRetake = () => {
    setShot(null);
    startStream(deviceIndex);
  };

  const handleUsePhoto = () => {
    if (!shot) return;
    const file = new File([shot.blob], `${isFace ? 'profile' : 'id'}-camera-${Date.now()}.jpg`, { type: 'image/jpeg' });
    onCapture(file);
    onClose();
  };

  const handleSwitchCamera = () => {
    if (devices.length < 2) return;
    const next = (deviceIndex + 1) % devices.length;
    setDeviceIndex(next);
    startStream(next);
  };

  const handleFileFallback = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    onCapture(file);
    onClose();
  };

  if (!open) return null;

  const guide = videoSize.w ? getGuideRect(mode, videoSize.w, videoSize.h) : null;
  // The front camera preview is mirrored (what people expect from a selfie
  // view); the saved photo is not.
  // Laptop webcams usually report no facingMode; treat those as front-facing.
  const mirrored = facing ? facing === 'user' : isFace;

  return createPortal(
    <div className="cam-overlay" role="presentation">
      <div className="cam-card" role="dialog" aria-modal="true" aria-labelledby="cam-title">
        <div className="cam-header">
          <div className="cam-header-icon"><i className={`bi ${isFace ? 'bi-person-bounding-box' : 'bi-person-vcard'}`} aria-hidden="true"></i></div>
          <div>
            <h3 id="cam-title">{title || (isFace ? 'Take Profile Photo' : 'Capture Your ID')}</h3>
            <p>{hint || (isFace
              ? 'Face the camera in good light and keep your whole face inside the oval.'
              : 'Place the card flat, fill the frame, and avoid glare and shadows.')}</p>
          </div>
          <button type="button" className="cam-close" onClick={onClose} aria-label="Close camera">
            <i className="bi bi-x-lg"></i>
          </button>
        </div>

        <div className={`cam-stage ${isFace ? 'cam-stage--face' : 'cam-stage--id'}`}>
          {status === 'captured' && shot ? (
            <img className="cam-shot" src={shot.url} alt="Captured preview" />
          ) : (
            <>
              <video
                ref={attachVideo}
                className={`cam-video ${mirrored ? 'is-mirrored' : ''}`}
                playsInline
                muted
                autoPlay
                onLoadedMetadata={(e) => setVideoSize({ w: e.target.videoWidth, h: e.target.videoHeight })}
              />
              {status === 'live' && guide && (
                <svg className="cam-guide" viewBox={`0 0 ${videoSize.w} ${videoSize.h}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
                  <defs>
                    <mask id="cam-guide-mask">
                      <rect width="100%" height="100%" fill="white" />
                      {isFace
                        ? <ellipse cx={videoSize.w / 2} cy={videoSize.h / 2} rx={guide.w * 0.34} ry={guide.h * 0.44} fill="black" />
                        : <rect x={guide.x} y={guide.y} width={guide.w} height={guide.h} rx={guide.w * 0.04} fill="black" />}
                    </mask>
                  </defs>
                  <rect width="100%" height="100%" fill="rgba(15, 23, 42, 0.45)" mask="url(#cam-guide-mask)" />
                  {isFace
                    ? <ellipse className="cam-guide-line" cx={videoSize.w / 2} cy={videoSize.h / 2} rx={guide.w * 0.34} ry={guide.h * 0.44} />
                    : <rect className="cam-guide-line" x={guide.x} y={guide.y} width={guide.w} height={guide.h} rx={guide.w * 0.04} />}
                </svg>
              )}
              {status === 'starting' && (
                <div className="cam-state"><span className="cam-spinner" aria-hidden="true"></span>Starting camera...</div>
              )}
              {status === 'error' && (
                <div className="cam-state cam-state--error">
                  <i className="bi bi-camera-video-off" aria-hidden="true"></i>
                  <span>{error}</span>
                </div>
              )}
            </>
          )}
        </div>

        <div className="cam-actions">
          {status === 'captured' ? (
            <>
              <button type="button" className="cam-btn cam-btn--ghost" onClick={handleRetake}>
                <i className="bi bi-arrow-counterclockwise"></i> Retake
              </button>
              <button type="button" className="cam-btn cam-btn--primary" onClick={handleUsePhoto}>
                <i className="bi bi-check2-circle"></i> Use This Photo
              </button>
            </>
          ) : (
            <>
              <button type="button" className="cam-btn cam-btn--ghost" onClick={() => fileInputRef.current?.click()}>
                <i className="bi bi-upload"></i> Upload Instead
              </button>
              {devices.length > 1 && status === 'live' && (
                <button type="button" className="cam-btn cam-btn--ghost" onClick={handleSwitchCamera} aria-label="Switch camera">
                  <i className="bi bi-arrow-repeat"></i> Switch
                </button>
              )}
              {status === 'error' ? (
                <button type="button" className="cam-btn cam-btn--primary" onClick={() => startStream(deviceIndex)}>
                  <i className="bi bi-arrow-clockwise"></i> Try Again
                </button>
              ) : (
                <button type="button" className="cam-btn cam-btn--primary cam-btn--shutter" onClick={handleTakePhoto} disabled={status !== 'live'}>
                  <i className="bi bi-camera-fill"></i> Take Photo
                </button>
              )}
            </>
          )}
          <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFileFallback} hidden />
        </div>
      </div>
    </div>,
    document.body
  );
};

export default CameraCapture;
