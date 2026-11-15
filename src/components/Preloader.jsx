import { useEffect, useState } from 'react';
import logo from '../assets/img/PB2_logo.png';

// Short loading screen shown when a page opens. Styles are in
// src/styles/index.css (#preloader, .pb2-preloader-*): the pulsing logo scales
// with the screen, and the pulse stops when reduced motion is on.
const Preloader = () => {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 1500);
    return () => clearTimeout(timer);
  }, []);

  if (!isLoading) return null;

  return (
    <div id="preloader" className="pb2-preloader" role="status" aria-label="Loading">
      <img
        src={logo}
        alt=""
        className="pb2-preloader-logo"
        onError={(e) => { e.target.style.display = 'none'; }}
      />
    </div>
  );
};

export default Preloader;
