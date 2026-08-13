import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

// 1. IMPORT YOUR EXISTING NAV & FOOTER
// (Adjust these relative paths if your components folder sits somewhere else)
import Header from '../components/Header'; 
import Footer from '../components/Footer';

const AboutUs = () => {
  const navigate = useNavigate();
  
  const ambientCanvasRef = useRef(null);
  const timeProgressRef = useRef(null);
  const timelineSecRef = useRef(null);
  const cursorDotRef = useRef(null);
  const cursorOutlineRef = useRef(null);

  useEffect(() => {
    // --- AMBIENT PARTICLES (EMERALD) ---
    const canvas = ambientCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animationFrameId;
    let particles = [];

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    class Particle {
      constructor() {
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * canvas.height;
        this.size = Math.random() * 2;
        this.speedX = Math.random() * 0.5 - 0.25;
        this.speedY = Math.random() * 0.5 - 0.25;
        this.opacity = Math.random() * 0.5 + 0.1;
      }
      update() {
        this.x += this.speedX;
        this.y += this.speedY;
        if (this.x > canvas.width) this.x = 0;
        if (this.x < 0) this.x = canvas.width;
        if (this.y > canvas.height) this.y = 0;
        if (this.y < 0) this.y = canvas.height;
      }
      draw() {
        ctx.fillStyle = `rgba(52, 211, 153, ${this.opacity})`;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    for (let i = 0; i < 40; i++) {
      particles.push(new Particle());
    }

    const animateParticles = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach((p) => {
        p.update();
        p.draw();
      });
      animationFrameId = requestAnimationFrame(animateParticles);
    };
    animateParticles();

    // --- SPOTLIGHT MOUSE TRACKING & CUSTOM CURSOR ---
    const handleMouseMove = (e) => {
      if (cursorDotRef.current && cursorOutlineRef.current) {
        const posX = e.clientX;
        const posY = e.clientY;
        cursorDotRef.current.style.left = `${posX}px`;
        cursorDotRef.current.style.top = `${posY}px`;

        cursorOutlineRef.current.animate(
          { left: `${posX}px`, top: `${posY}px` },
          { duration: 400, fill: 'forwards' }
        );
      }

      const cards = document.querySelectorAll('.spotlight-card');
      cards.forEach((card) => {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        card.style.setProperty('--mouse-x', `${x}px`);
        card.style.setProperty('--mouse-y', `${y}px`);
      });
    };

    document.addEventListener('mousemove', handleMouseMove);

    const addHoverClass = () => document.body.classList.add('hovering');
    const removeHoverClass = () => document.body.classList.remove('hovering');
    
    const interactives = document.querySelectorAll('button, .spotlight-card, .leader-card');
    interactives.forEach((el) => {
      el.addEventListener('mouseenter', addHoverClass);
      el.addEventListener('mouseleave', removeHoverClass);
    });

    // --- SCROLL TIMELINE PROGRESS FILL ---
    const handleScroll = () => {
      const timelineSec = timelineSecRef.current;
      const progressBar = timeProgressRef.current;
      if (!timelineSec || !progressBar) return;

      const sectionTop = timelineSec.offsetTop;
      const sectionHeight = timelineSec.offsetHeight;
      const scrollY = window.scrollY;
      const windowHeight = window.innerHeight;

      let percentage = ((scrollY + windowHeight / 2 - sectionTop) / sectionHeight) * 100;
      percentage = Math.max(0, Math.min(100, percentage));
      progressBar.style.height = `${percentage}%`;
    };

    window.addEventListener('scroll', handleScroll);

    // --- INTERSECTION OBSERVER FOR ROW REVEAL ---
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
          }
        });
      },
      { threshold: 0.15 }
    );

    const rows = document.querySelectorAll('.timeline-row');
    rows.forEach((row) => observer.observe(row));

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      window.removeEventListener('scroll', handleScroll);
      document.removeEventListener('mousemove', handleMouseMove);
      cancelAnimationFrame(animationFrameId);
      rows.forEach((row) => observer.unobserve(row));
      interactives.forEach((el) => {
        el.removeEventListener('mouseenter', addHoverClass);
        el.removeEventListener('mouseleave', removeHoverClass);
      });
      document.body.classList.remove('hovering');
    };
  }, []);

  return (
    <div className="story-page-body">
      <style>{`
        .story-page-body {
          /* Swapping the hard midnight black background for your project's clean mint look */
          background: linear-gradient(to bottom right, #d1fae5, #f0fdf4);
          color: #1f2937;
          font-family: 'Segoe UI', 'Poppins', sans-serif;
          overflow-x: hidden;
          margin: 0;
          position: relative;
        }

        .grain-overlay {
          position: fixed; top: 0; left: 0; width: 100%; height: 100%;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.03'/%3E%3C/svg%3E");
          z-index: 2; pointer-events: none;
        }

        .cursor-dot, .cursor-outline {
          position: fixed;
          top: 0; left: 0;
          transform: translate(-50%, -50%);
          border-radius: 50%;
          z-index: 9999;
          pointer-events: none;
        }
        .cursor-dot { width: 8px; height: 8px; background-color: #34d399; }
        .cursor-outline { 
          width: 40px; height: 40px; border: 1px solid #34d399; 
          transition: width 0.2s, height 0.2s, background-color 0.2s; 
        }
        body.hovering .cursor-outline {
          width: 60px; height: 60px;
          background-color: rgba(52, 211, 153, 0.1);
          border-color: transparent;
        }

        #ambientCanvas { position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: 1; pointer-events: none; opacity: 0.5; }
        .story-content-wrapper { position: relative; z-index: 3; }

        .story-hero {
          height: 80vh; 
          display: flex; 
          align-items: center;
          justify-content: center; 
          text-align: center; 
          padding: 0 20px;
          position: relative;
          /* Add the background image directly here with absolute pathing */
          background: linear-gradient(to bottom, rgba(2, 6, 23, 0.4), #020617), 
                      url('/assets/img/brgHall-bg.jpg') no-repeat center center;
          background-size: cover;
          z-index: 3;
        }
        .hero-badge {
          display: inline-flex; align-items: center; gap: 8px; padding: 8px 24px;
          border: 1px solid rgba(52, 211, 153, 0.1); border-radius: 100px;
          text-transform: uppercase; font-size: 0.75rem; letter-spacing: 3px;
          background: rgba(2, 44, 34, 0.8); color: #34d399; margin-bottom: 1.5rem;
        }
        .story-hero h1 {
          font-family: 'Cinzel', serif; font-size: 4.5rem; font-weight: 700;
          margin: 0 0 20px; line-height: 1.1;
          background: linear-gradient(to bottom right, #ffffff 40%, #34d399 100%);
          -webkit-background-clip: text; -webkit-text-fill-color: transparent;
        }
        .story-hero p { font-size: 1.15rem; color: #94a3b8; max-width: 650px; margin: 0 auto; line-height: 1.7; }

        /* --- MISSION / VISION GRID (MATCHED TO ORIGINAL PALETTE) --- */
        .vm-section {
          padding: 60px 20px;
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
          gap: 30px;
          max-width: 1200px;
          margin: 0 auto;
        }

        .spotlight-card {
          /* Using your signature light-mint gradient and emerald borders */
          background: linear-gradient(to bottom right, #ffffff, #ecfdf5);
          border: 1px solid #bbf7d0;
          border-radius: 24px;
          padding: 50px 40px;
          position: relative;
          overflow: hidden;
          box-shadow: 0 4px 15px rgba(0, 0, 0, 0.05);
          transition: transform 0.4s var(--ease-smooth), box-shadow 0.4s var(--ease-smooth);
        }

        /* Elite mouse-following glowing spotlight adjusted for a light background */
        .spotlight-card::after {
          content: "";
          position: absolute;
          height: 100%;
          width: 100%;
          top: 0;
          left: 0;
          background: radial-gradient(400px circle at var(--mouse-x) var(--mouse-y), rgba(4, 120, 87, 0.08), transparent 60%);
          z-index: 1;
          pointer-events: none;
        }

        .spotlight-card:hover {
          transform: translateY(-8px);
          border-color: #047857;
          box-shadow: 0 12px 24px rgba(4, 120, 87, 0.12);
        }

        /* Icon matching your original primary green headers */
        .vm-icon {
          font-size: 2.5rem;
          color: #047857;
          margin-bottom: 20px;
          display: inline-block;
        }

        /* Deep forest green typography for readability */
        .spotlight-card h3 {
          font-size: 1.8rem;
          margin: 0 0 15px;
          font-weight: 700;
          color: #064e3b;
        }

        .spotlight-card p {
          font-size: 1rem;
          color: #1f2937; /* Dark charcoal text to fulfill contrast rules on light cards */
          line-height: 1.6;
          margin: 0;
          position: relative;
          z-index: 2;
        }

        .timeline-section { padding: 100px 20px; position: relative; background: #01040f; }
        .section-header { text-align: center; margin-bottom: 80px; }
        .section-header span { color: #34d399; font-weight: 700; text-transform: uppercase; letter-spacing: 3px; font-size: 0.8rem; display: block; margin-bottom: 10px; }
        .section-header h2 { font-family: 'Cinzel', serif; font-size: 3rem; color: #fff; margin: 0; }
        
        .timeline-container { max-width: 900px; margin: 0 auto; position: relative; }
        .timeline-line { position: absolute; left: 50%; top: 0; bottom: 0; width: 2px; background: rgba(255,255,255,0.05); transform: translateX(-50%); }
        .timeline-progress { position: absolute; left: 50%; top: 0; width: 2px; background: #34d399; transform: translateX(-50%); height: 0%; box-shadow: 0 0 15px #34d399; z-index: 2; }
        
        .timeline-row { display: flex; justify-content: center; padding-bottom: 60px; position: relative; opacity: 0; transform: translateY(40px); transition: all 0.8s ease; }
        .timeline-row.visible { opacity: 1; transform: translateY(0); }
        
        .timeline-time {
          position: absolute; left: 50%; top: 0; transform: translateX(-50%);
          background: #020617; border: 1px solid #34d399; color: #34d399;
          padding: 4px 14px; border-radius: 20px; font-weight: 700; font-size: 0.85rem; z-index: 3;
        }
        .timeline-box { width: 44%; padding: 30px; background: rgba(2, 44, 34, 0.25); border: 1px solid rgba(255,255,255,0.03); border-radius: 20px; backdrop-filter: blur(5px); transition: 0.3s; }
        .timeline-box:hover { border-color: #059669; background: rgba(2, 44, 34, 0.5); }
        .timeline-row:nth-child(odd) .timeline-box { margin-right: auto; text-align: right; }
        .timeline-row:nth-child(even) .timeline-box { margin-left: auto; text-align: left; }
        .t-title { font-size: 1.4rem; color: #fff; margin: 0 0 10px; font-family: 'Cinzel', serif; }
        .t-desc { color: #94a3b8; line-height: 1.6; font-size: 0.9rem; margin: 0; }

        .leadership-section { padding: 100px 40px; background: #020617; }
        .leaders-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 40px; max-width: 1200px; margin: 0 auto; }
        .leader-card { background: rgba(2, 44, 34, 0.4); border-radius: 24px; padding: 12px; border: 1px solid rgba(255,255,255,0.04); transition: transform 0.4s ease; position: relative; }
        .leader-card:hover { transform: translateY(-10px); border-color: #34d399; }
        .leader-img-box { height: 320px; width: 100%; border-radius: 16px; overflow: hidden; position: relative; }
        .leader-img-box img { width: 100%; height: 100%; object-fit: cover; transition: transform 0.5s ease; filter: grayscale(30%) contrast(1.05); }
        .leader-card:hover img { transform: scale(1.06); filter: grayscale(0%); }
        
        .leader-details {
          position: absolute; bottom: 22px; left: 22px; right: 22px;
          background: rgba(2, 6, 23, 0.9); backdrop-filter: blur(10px);
          padding: 15px; border-radius: 14px; border: 1px solid rgba(255,255,255,0.08); text-align: center;
        }
        .l-name { font-size: 1.15rem; font-weight: 700; color: #fff; margin: 0; }
        .l-role { color: #34d399; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 1px; margin-top: 4px; font-weight: 600; }

        @media (max-width: 768px) {
          .story-hero h1 { font-size: 2.8rem; }
          .timeline-line, .timeline-progress { left: 20px; transform: none; }
          .timeline-time { left: 20px; transform: translateX(-50%); font-size: 0.75rem; }
          .timeline-row { flex-direction: column; width: 100%; padding-left: 45px; }
          .timeline-row:nth-child(odd) .timeline-box, .timeline-row:nth-child(even) .timeline-box { width: 100%; text-align: left; }
          .cursor-dot, .cursor-outline { display: none; }
        }
      `}</style>

      {/* 2. RENDER THE GLOBAL IMPORTED HEADER */}
      <Header />

      <div className="cursor-dot" ref={cursorDotRef}></div>
      <div className="cursor-outline" ref={cursorOutlineRef}></div>

      <canvas id="ambientCanvas" ref={ambientCanvasRef}></canvas>
      <div className="grain-overlay"></div>

      <div className="story-content-wrapper">
        <header className="story-hero">
          <div>
            <div className="hero-badge">
              <i className="bi bi-geo-fill" style={{ marginRight: '5px' }}></i> Cavite, Philippines
            </div>
            <h1>The Heritage of<br />Pasong Buaya II</h1>
            <p>A story of resilience carved from the earth, rising into a modern beacon of digital governance and community unity.</p>
          </div>
        </header>

        <section className="vm-section">
          <div className="spotlight-card">
            <div className="vm-icon"><i className="bi bi-compass"></i></div>
            <h3>Our Mission</h3>
            <p>To orchestrate a seamless bridge between tradition and technology. We pledge to deliver transparent public service, foster sustainable growth, and ensure the safety of every home within our jurisdiction.</p>
          </div>

          <div className="spotlight-card">
            <div className="vm-icon"><i className="bi bi-lightbulb"></i></div>
            <h3>Our Vision</h3>
            <p>We envision a self-sustaining, smart community where every resident thrives. A barangay that sets the gold standard for innovation, peace, and progressive leadership in the province of Cavite.</p>
          </div>
        </section>

        <section className="timeline-section" ref={timelineSecRef}>
          <div className="section-header">
            <span>Evolution</span>
            <h2>The Timeline</h2>
          </div>
          <div className="timeline-container">
            <div className="timeline-line"></div>
            <div className="timeline-progress" ref={timeProgressRef}></div>

            <div className="timeline-row">
              <div className="timeline-time">1990</div>
              <div className="timeline-box">
                <h3 className="t-title">Genesis</h3>
                <p className="t-desc">Pasong Buaya II is officially constituted, separating from its mother barangay to focus on the unique needs of its growing agricultural population.</p>
              </div>
            </div>

            <div className="timeline-row">
              <div className="timeline-time">2005</div>
              <div className="timeline-box">
                <h3 className="t-title">Infrastructure</h3>
                <p className="t-desc">The cementing of the main arterial roads connects the barangay to the heart of Imus, sparking a wave of residential and commercial development.</p>
              </div>
            </div>

            <div className="timeline-row">
              <div className="timeline-time">2018</div>
              <div className="timeline-box">
                <h3 className="t-title">Modernization</h3>
                <p className="t-desc">Under new leadership, the barangay adopts its first computerized systems and establishes a dedicated disaster command center.</p>
              </div>
            </div>

            <div className="timeline-row">
              <div className="timeline-time">2026</div>
              <div className="timeline-box">
                <h3 className="t-title">The Digital Era</h3>
                <p className="t-desc">Launch of the PB2 Digital Portal. Residents can now access services, book amenities, and connect with officials instantly online.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="leadership-section">
          <div className="section-header">
            <span>Servants of the People</span>
            <h2>Barangay Council</h2>
          </div>
          <div className="leaders-grid">
            {[
              { name: "Hon. Carlito Tagle", role: "Punong Barangay", fallback: "Kapitan+Name", img: "/assets/p1.jpg" },
              { name: "Hon. Digna Cabrera", role: "Committee on Health", fallback: "Digna+Cabrera", img: "/assets/p2.jpg" },
              { name: "Hon. John Marcos", role: "Committee on Education", fallback: "John+Marcos", img: "/assets/p3.jpg" },
              { name: "Hon. Jacinto Marcos", role: "Committee on Infrastructure", fallback: "Jacinto+Marcos", img: "/assets/p4.jpg" },
              { name: "Hon. Mark David", role: "Committee on Security", fallback: "Mark+David", img: "/assets/p5.jpg" },
              { name: "Hon. David John", role: "Committee on Finance", fallback: "David+John", img: "/assets/p3.jpg" },
            ].map((leader, index) => (
              <div className="leader-card" key={index}>
                <div className="leader-img-box">
                  <img 
                    src={leader.img} 
                    alt={leader.name} 
                    onError={(e) => {
                      e.target.onerror = null; 
                      e.target.src = `https://ui-avatars.com/api/?name=${leader.fallback}&background=022c22&color=34d399&size=500`;
                    }}
                  />
                </div>
                <div className="leader-details">
                  <h3 className="l-name">{leader.name}</h3>
                  <p className="l-role">{leader.role}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* 3. RENDER THE GLOBAL IMPORTED FOOTER */}
      <Footer />
    </div>
  );
};

export default AboutUs;