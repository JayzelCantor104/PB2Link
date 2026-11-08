import { useEffect, useRef } from 'react';
import { PB2_BOUNDARY } from './pasongBuaya2Boundary';
import { OPEN_STATUSES } from './issueMapConfig';
import { prefersReducedMotion } from '../lib/a11yPrefs';

// The Home hero's barangay map: the official PSA outline of Pasong Buaya II
// traces itself in, then real evacuation centers (blue) and open community
// issues (pulsing) appear. Amber while an advisory is active. Decorative: the
// same information is in the status chips and the dashboard below, so the
// canvas is hidden from screen readers. Reduced motion draws it once, still;
// the animation pauses when scrolled away or when the tab is hidden.
const inside = ([la, ln]) => {
  let c = false;
  for (let i = 0, j = PB2_BOUNDARY.length - 1; i < PB2_BOUNDARY.length; j = i++) {
    const [yi, xi] = PB2_BOUNDARY[i];
    const [yj, xj] = PB2_BOUNDARY[j];
    if ((yi > la) !== (yj > la) && ln < ((xj - xi) * (la - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};

const TRACE_MS = 2200;

const HeroLiveMap = ({ centers, issues, advisory }) => {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  // Latest pins / colours for the drawing loop, without restarting the trace.
  const live = useRef({ pins: [], advisory: false });

  useEffect(() => {
    const centerPins = (centers || [])
      .filter((c) => c.latitude != null && c.longitude != null)
      .map((c) => ({ p: [Number(c.latitude), Number(c.longitude)], kind: 'center' }));
    const issuePins = (issues || [])
      .filter((i) => OPEN_STATUSES.includes(i.status))
      .map((i) => ({ p: [Number(i.lat), Number(i.lng)], kind: 'issue' }));
    live.current = { pins: [...centerPins, ...issuePins].filter((x) => Number.isFinite(x.p[0]) && inside(x.p)), advisory: !!advisory };
  }, [centers, issues, advisory]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return undefined;
    const ctx = canvas.getContext('2d');
    const still = prefersReducedMotion();
    let W = 0;
    let H = 0;
    let start = 0;
    let frame = 0;
    let onScreen = true;

    const lats = PB2_BOUNDARY.map((p) => p[0]);
    const lngs = PB2_BOUNDARY.map((p) => p[1]);
    const minLa = Math.min(...lats); const maxLa = Math.max(...lats);
    const minLn = Math.min(...lngs); const maxLn = Math.max(...lngs);

    const resize = () => {
      const r = wrap.getBoundingClientRect();
      const d = window.devicePixelRatio || 1;
      W = r.width; H = r.height;
      canvas.width = Math.max(1, W * d); canvas.height = Math.max(1, H * d);
      ctx.setTransform(d, 0, 0, d, 0, 0);
    };
    const project = () => {
      const pad = 10;
      const k = Math.min((W - pad * 2) / (maxLn - minLn), (H - pad * 2) / (maxLa - minLa));
      const offX = (W - (maxLn - minLn) * k) / 2;
      const offY = (H - (maxLa - minLa) * k) / 2;
      return ([la, ln]) => [offX + (ln - minLn) * k, offY + (maxLa - la) * k];
    };

    const draw = (t) => {
      const { pins, advisory: alert } = live.current;
      const pr = project();
      const pts = PB2_BOUNDARY.map(pr);
      ctx.clearRect(0, 0, W, H);
      const trace = still ? 1 : Math.min(1, (t - start) / TRACE_MS);

      // Faint fill and diagonal hatching inside the outline.
      ctx.save();
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
      ctx.closePath();
      ctx.fillStyle = `rgba(16,185,129,${0.12 * trace})`;
      ctx.fill();
      ctx.clip();
      ctx.strokeStyle = `rgba(167,243,208,${0.12 * trace})`;
      ctx.lineWidth = 1;
      for (let x = -H; x < W; x += 18) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + H * 0.6, H); ctx.stroke(); }
      ctx.restore();

      // The outline, traced in.
      let total = 0;
      const seg = [];
      for (let i = 1; i < pts.length; i++) {
        const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
        seg.push(d); total += d;
      }
      let left = total * trace;
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length && left > 0; i++) {
        const d = seg[i - 1];
        if (left >= d) ctx.lineTo(pts[i][0], pts[i][1]);
        else {
          const f = left / d;
          ctx.lineTo(pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f);
        }
        left -= d;
      }
      ctx.strokeStyle = alert ? 'rgba(252,211,77,.95)' : 'rgba(110,231,183,.95)';
      ctx.lineWidth = 2.2;
      ctx.shadowColor = alert ? 'rgba(251,191,36,.8)' : 'rgba(52,211,153,.8)';
      ctx.shadowBlur = 12;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Pins, after the outline.
      if (trace >= 1) {
        const since = still ? Infinity : t - start - TRACE_MS;
        pins.forEach((pin, i) => {
          const a = Math.min(1, Math.max(0, (since - i * 90) / 400));
          if (a <= 0) return;
          const [x, y] = pr(pin.p);
          const center = pin.kind === 'center';
          const col = center ? '96,165,250' : alert ? '251,191,36' : '52,211,153';
          if (!still) {
            const ph = ((t / 1600) + i * 0.17) % 1;
            ctx.beginPath();
            ctx.arc(x, y, 4 + ph * 14, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(${col},${(1 - ph) * 0.6 * a})`;
            ctx.lineWidth = 1.5;
            ctx.stroke();
          }
          ctx.beginPath();
          ctx.arc(x, y, center ? 4.5 : 3.5, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${col},${a})`;
          ctx.fill();
          if (center) { ctx.strokeStyle = `rgba(255,255,255,${a})`; ctx.lineWidth = 1.5; ctx.stroke(); }
        });
      }
    };

    const loop = (t) => {
      if (!start) start = t;
      draw(t);
      if (onScreen && !document.hidden) frame = requestAnimationFrame(loop);
    };
    const resume = () => {
      cancelAnimationFrame(frame);
      if (still) { draw(Infinity); return; }
      if (onScreen && !document.hidden) frame = requestAnimationFrame(loop);
    };

    resize();
    if (still) draw(Infinity);
    else { start = performance.now(); draw(start); frame = requestAnimationFrame(loop); }

    const ro = new ResizeObserver(() => { resize(); draw(still ? Infinity : performance.now()); });
    ro.observe(wrap);
    const io = new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; resume(); });
    io.observe(wrap);
    document.addEventListener('visibilitychange', resume);
    // Pins arriving later (or an advisory starting) redraw a still map too.
    const repaint = setInterval(() => { if (still) draw(Infinity); }, 2000);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener('visibilitychange', resume);
      clearInterval(repaint);
    };
  }, []);

  return (
    <div className="hm-map">
      <div className="hm-map-canvas" ref={wrapRef}>
        <canvas ref={canvasRef} aria-hidden="true" />
      </div>
      <div className="hm-map-legend" aria-hidden="true">
        <span><i style={{ background: '#60a5fa' }}></i>Evacuation center</span>
        <span><i style={{ background: advisory ? '#fbbf24' : '#34d399' }}></i>Open issue</span>
      </div>
    </div>
  );
};

export default HeroLiveMap;
