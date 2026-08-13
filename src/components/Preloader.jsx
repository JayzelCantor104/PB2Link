import { useEffect, useState } from 'react';
import logo from '../assets/img/PB2_logo.png';

const Preloader = () => {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 1500);
    return () => clearTimeout(timer);
  }, []);

  if (!isLoading) return null;

  return (
    <>
      {/* 1. Custom CSS defined directly inside the JSX */}
      <style>
        {`
          @keyframes zoomPulse {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.15); }
          }
          .custom-zoom-pulse {
            animation: zoomPulse 1.5s ease-in-out infinite;
          }
          @keyframes progressBar {
            0% { width: 0%; }
            50% { width: 70%; }
            100% { width: 100%; }
          }
          .progress-bar-anim {
            animation: progressBar 1.5s ease-in-out forwards;
          }
        `}
      </style>

      {/* 2. Your Preloader HTML with Loading Bar */}
      <div id="preloader" className="fixed inset-0 bg-white z-[9999] flex flex-col items-center justify-center">
        <div className="text-center mb-8">
          <img 
            src={logo} 
            alt="Pasong Buaya 2 Logo" 
            className="w-[400px] h-auto drop-shadow-xl mx-auto custom-zoom-pulse"
            onError={(e) => {
              e.target.style.display = 'none';
            }}
          />
        </div>
        
        {/* Loading Bar */}
        <div className="w-[300px] h-2 bg-gray-300 rounded-full overflow-hidden shadow-md">
          <div className="h-full bg-gradient-to-r from-blue-500 via-blue-600 to-blue-700 progress-bar-anim"></div>
        </div>
      </div>
    </>
  );
};

export default Preloader;