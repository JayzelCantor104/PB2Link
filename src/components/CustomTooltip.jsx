import React, { useState, useRef } from 'react';

const CustomTooltip = ({ title, children }) => {
  const [show, setShow] = useState(false);
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const timer = useRef(null);

  const onMouseEnter = (e) => {
    // Start 3-second countdown
    timer.current = setTimeout(() => {
      setShow(true);
    }, 3000);
  };

  const onMouseLeave = () => {
    clearTimeout(timer.current);
    setShow(false);
  };

  const onMouseMove = (e) => {
    // Offset by 15px so it doesn't cover the cursor
    setCoords({ x: e.clientX + 15, y: e.clientY + 15 });
  };

  return (
    <div 
      className="tooltip-container"
      onMouseEnter={onMouseEnter} 
      onMouseLeave={onMouseLeave}
      onMouseMove={onMouseMove}
      style={{ display: 'inline-block', width: '100%' }}
    >
      {children}
      
      {show && (
        <div style={{
          position: 'fixed',
          left: coords.x,
          top: coords.y,
          background: '#064e3b',
          color: 'white',
          padding: '5px 10px',
          borderRadius: '5px',
          fontSize: '0.75rem',
          zIndex: 9999,
          pointerEvents: 'none',
          whiteSpace: 'nowrap'
        }}>
          {title}
        </div>
      )}
    </div>
  );
};

export default CustomTooltip;