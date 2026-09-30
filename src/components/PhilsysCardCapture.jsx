import React, { useEffect, useMemo, useRef, useState } from 'react';
import CameraCapture from './CameraCapture';
import { scanPhilsysFront, philsysNameCheck } from '../lib/philsysScan';
import '../styles/philsys-capture.css';

const SLOTS = [
  { key: 'front', label: 'PhilSys Card — Front', hint: 'Number and name are read from this side' },
  { key: 'back', label: 'PhilSys Card — Back', hint: 'Kept on file for verification' },
];
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Front/back photos of a PhilSys (National ID) card — Upload or Use Camera —
 * with the front scanned automatically (src/lib/philsysScan.js).
 *
 * props:
 *   photos         { front: File|null, back: File|null }
 *   onPhotosChange (nextPhotos)
 *   expectedName   { fName, mName, lName } — the name the card must show
 *   onScan(result) { status: 'scanning' | 'matched' | 'mismatch' | 'failed',
 *                    number, scanToken, missing: [...], message }
 *   scan           the last result (drives the status line)
 *   notify(title, message, type)
 */
const PhilsysCardCapture = ({ photos, onPhotosChange, expectedName, onScan, scan, notify }) => {
  const [cameraSlot, setCameraSlot] = useState(null);
  const scanSeq = useRef(0);

  // Object URLs for the thumbnails, released when the photos change.
  const previews = useMemo(() => {
    const next = {};
    SLOTS.forEach(s => { if (photos?.[s.key]) next[s.key] = URL.createObjectURL(photos[s.key]); });
    return next;
  }, [photos]);
  useEffect(() => () => Object.values(previews).forEach(u => URL.revokeObjectURL(u)), [previews]);

  const runScan = async (file) => {
    const seq = ++scanSeq.current;
    onScan({ status: 'scanning', number: '', scanToken: null, missing: [], message: '' });
    const r = await scanPhilsysFront(file);
    if (seq !== scanSeq.current) return; // a newer photo replaced this one
    if (!r.ok) {
      onScan({ status: 'failed', number: '', scanToken: null, missing: [], message: r.message });
      return;
    }
    const name = philsysNameCheck(r.text, expectedName || {});
    onScan({
      status: name.match ? 'matched' : 'mismatch',
      number: r.number,
      scanToken: r.scanToken,
      missing: name.missing,
      message: name.match ? '' : `The name on this card doesn't match your profile (${name.missing.join(', ')}).`,
    });
  };

  const setPhoto = (slot, file) => {
    if (!file) return;
    if (!PHOTO_TYPES.includes(file.type)) {
      notify?.('Unsupported File', 'Please use a JPEG, PNG, or WebP photo of your PhilSys card.', 'error');
      return;
    }
    if (file.size > MAX_BYTES) {
      notify?.('File Too Large', 'Each photo must be 10MB or smaller.', 'error');
      return;
    }
    onPhotosChange({ ...photos, [slot]: file });
    if (slot === 'front') runScan(file);
  };

  const status = scan?.status;

  return (
    <div className="psc-wrap">
      <div className="psc-grid">
        {SLOTS.map(slot => (
          <div key={slot.key} className={`psc-tile ${photos?.[slot.key] ? 'has-file' : ''}`}>
            <div className="psc-preview">
              {previews[slot.key] ? <img src={previews[slot.key]} alt={slot.label} /> : <i className="bi bi-person-vcard"></i>}
            </div>
            <strong>{slot.label} *</strong>
            <small>{slot.hint}</small>
            <div className="psc-actions">
              <label className="psc-btn">
                <i className="bi bi-upload"></i> Upload
                <input type="file" accept={PHOTO_TYPES.join(',')} hidden
                  onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; setPhoto(slot.key, f); }} />
              </label>
              <button type="button" className="psc-btn" onClick={() => setCameraSlot(slot.key)}>
                <i className="bi bi-camera"></i> Use Camera
              </button>
            </div>
          </div>
        ))}
      </div>

      {status === 'scanning' && (
        <p className="psc-status is-info"><i className="bi bi-hourglass-split"></i> Reading your PhilSys card…</p>
      )}
      {status === 'matched' && (
        <p className="psc-status is-ok"><i className="bi bi-patch-check-fill"></i> PhilSys number read from your card, and the name matches your profile.</p>
      )}
      {status === 'mismatch' && (
        <p className="psc-status is-bad"><i className="bi bi-x-octagon-fill"></i> {scan.message}</p>
      )}
      {status === 'failed' && (
        <p className="psc-status is-warn"><i className="bi bi-exclamation-triangle-fill"></i> {scan.message}</p>
      )}

      <CameraCapture
        open={cameraSlot !== null}
        mode="id"
        title={cameraSlot === 'back' ? 'Capture Back of PhilSys Card' : 'Capture Front of PhilSys Card'}
        hint="Place your PhilSys (National ID) card flat inside the frame, in bright light without glare. The number must be readable."
        onCapture={(file) => setPhoto(cameraSlot, file)}
        onClose={() => setCameraSlot(null)}
      />
    </div>
  );
};

export default PhilsysCardCapture;
