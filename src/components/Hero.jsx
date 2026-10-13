import { useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Hero = () => {
  const canvasRef = useRef(null);
  const navigate = useNavigate();
  // Same rule as the Header: an admin account signed in on the citizen side
  // isn't treated as a resident.
  const { user: authUser } = useAuth();
  const isAccountAdmin = authUser && (authUser.isAdmin === true || authUser.isAdmin === 'true' || Number(authUser.isAdmin) === 1);
  const resident = authUser && !isAccountAdmin ? authUser : null;

  // The "Your barangay today" snapshot (HomeSnapshot) sits right below the hero.
  // Lands just below the floating site header, whatever its height on this screen.
  const showToday = () => {
    const target = document.getElementById('today');
    if (!target) return;
    const header = document.querySelector('header');
    const offset = header && getComputedStyle(header).position !== 'static' ? header.getBoundingClientRect().bottom + 8 : 0;
    window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - offset, behavior: 'smooth' });
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resizeCanvas();

    let particles = [];
    const mouse = { x: null, y: null };

    window.addEventListener('mousemove', (e) => {
      mouse.x = e.x;
      mouse.y = e.y;
    });

    class Particle {
      constructor() {
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * canvas.height;
        this.size = Math.random() * 2.5;
        this.speedX = (Math.random() * 1.5) - 0.75;
        this.speedY = (Math.random() * 1.5) - 0.75;
      }
      update() {
        this.x += this.speedX;
        this.y += this.speedY;

        if (this.x > canvas.width || this.x < 0) this.speedX *= -1;
        if (this.y > canvas.height || this.y < 0) this.speedY *= -1;

        let dx = mouse.x - this.x;
        let dy = mouse.y - this.y;
        let distance = Math.sqrt(dx*dx + dy*dy);
        if (distance < 120) {
          this.x -= dx/20;
          this.y -= dy/20;
        }
      }
      draw() {
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function initParticles() {
      particles = [];
      for (let i = 0; i < 90; i++) particles.push(new Particle());
    }

    function animate() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < particles.length; i++) {
        particles[i].update();
        particles[i].draw();

        for (let j = i; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx*dx + dy*dy);

          if (dist < 120) {
            ctx.beginPath();
            ctx.strokeStyle = `rgba(255, 255, 255, ${0.8 - dist/120})`;
            ctx.lineWidth = 0.8;
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }
      requestAnimationFrame(animate);
    }

    initParticles();
    animate();

    // Magnetic buttons logic
    const btns = document.querySelectorAll('.btn-magnetic');
    btns.forEach(btn => {
      btn.addEventListener('mousemove', function(e) {
        const pos = btn.getBoundingClientRect();
        const x = e.clientX - pos.left - pos.width / 2;
        const y = e.clientY - pos.top - pos.height / 2;
        
        btn.style.transform = `translate(${x * 0.3}px, ${y * 0.3}px)`;
      });
      
      btn.addEventListener('mouseleave', function() {
        btn.style.transform = 'translate(0px, 0px)';
      });
    });

    window.addEventListener('resize', resizeCanvas);
    return () => {
      window.removeEventListener('resize', resizeCanvas);
      btns.forEach(btn => {
        btn.removeEventListener('mousemove', null);
        btn.removeEventListener('mouseleave', null);
      });
    };
  }, []);

  return (
    <>
      <main className="hero-section">
        <canvas ref={canvasRef} id="heroCanvas" />
        
        <div className="hero-content">
          <div className="hero-label">
            <i className="bi bi-patch-check-fill"></i> Official Government Portal
          </div>
          <h2>Governance at <br className="responsive-br" />Your Fingertips.</h2>
          <p>Experience a new standard of public service. Fast, transparent, and completely digital.</p>
          
          <div className="hero-buttons">
            {resident ? (
              <button type="button" className="btn-magnetic primary" onClick={() => navigate('/services')}>
                <i className="bi bi-file-earmark-text"></i>Request a Document
              </button>
            ) : (
              <button type="button" className="btn-magnetic primary" onClick={() => navigate('/register')}>
                <i className="bi bi-person-plus-fill"></i>Create an Account
              </button>
            )}
            <button type="button" className="btn-magnetic outline" onClick={showToday}>
              <i className="bi bi-arrow-down-circle"></i>See Today's Updates
            </button>
          </div>
          {!resident && (
            <p className="hero-login-note">
              Already registered? <Link to="/login">Log in</Link>
            </p>
          )}
        </div>
      </main>

      {/* Embedded CSS rules for precise mobile centering */}
      <style>{`
        /* Mobile-First Reset and Centering Overrides */
        .hero-section {
          display: flex !important;
          justify-content: center !important;
          align-items: center !important;
          padding-left: 0 !important;
          padding-right: 0 !important;
          margin: 0 !important;
          width: 100% !important;
          box-sizing: border-box;
          overflow: hidden;
        }

        .hero-content {
          text-align: center !important;
          width: 100% !important;
          max-width: 100% !important;
          margin-left: 0 !important;
          margin-right: 0 !important;
          padding-left: 20px !important;
          padding-right: 20px !important;
          left: 0 !important;
          right: 0 !important;
          z-index: 2;
          box-sizing: border-box;
        }

        .hero-login-note {
          margin: 18px 0 0 !important;
          font-size: 0.9rem;
          opacity: 0.85;
        }
        .hero-login-note a {
          color: #6ee7b7;
          font-weight: 700;
        }
        .hero-label {
          margin-left: auto !important;
          margin-right: auto !important;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }

        .hero-content p {
          max-width: 480px;
          margin: 0 auto 30px auto !important;
          font-size: 0.95rem;
          line-height: 1.6;
          opacity: 0.9;
        }

        /* Fixed Mobile Buttons Layout */
        .hero-buttons {
          display: flex !important;
          flex-direction: column !important; /* Stack them vertically */
          width: 100% !important;
          max-width: 100% !important;
          margin-left: 0 !important;
          margin-right: 0 !important;
          padding: 0 !important;
          align-items: center !important;
          justify-content: center !important;
        }

        /* Target the buttons inside the stacked layout directly */
        .hero-buttons .btn-magnetic {
          width: 100% !important;
          max-width: 280px !important;
          box-sizing: border-box;
          margin-left: 0 !important;
          margin-right: 0 !important;
          margin-top: 0 !important;
          margin-bottom: 15px !important; /* Forces a crisp 15px vertical space below each button */
        }

        /* Remove margin from the last button so container alignment stays clean */
        .hero-buttons .btn-magnetic:last-child {
          margin-bottom: 0 !important;
        }

        @media (max-width: 575px) {
          .responsive-br {
            display: none;
          }
          .hero-content h2 {
            font-size: 2rem !important;
            line-height: 1.4 !important;
            letter-spacing: -0.5px;
            margin-bottom: 15px;
            margin-left: 0 !important;
            margin-right: 0 !important;
          }
        }

        /* Desktop Restoration Breakpoint */
        @media (min-width: 576px) {
          .hero-buttons {
            flex-direction: row !important; /* Turn back to horizontal on PC */
            justify-content: center !important;
          }

          .hero-buttons .btn-magnetic {
            width: auto !important;
            max-width: none !important;
            margin-bottom: 0 !important; /* Clear out vertical stack space */
            margin-left: 10px !important; /* Provide side-by-side spacing instead */
            margin-right: 10px !important;
          }
        }
      `}</style>
    </>
  );
};

export default Hero;