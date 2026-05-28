'use client';

import { useEffect, useState } from 'react';

export default function RealtimeStatus() {
  const [status, setStatus] = useState('Connecting...');

  useEffect(() => {
    const interval = setInterval(() => {
      setStatus(`Live updates active • ${new Date().toLocaleTimeString()}`);
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div
      style={{
        background: '#ecfeff',
        border: '1px solid #a5f3fc',
        padding: '12px 16px',
        borderRadius: '10px',
        marginBottom: '20px'
      }}
    >
      {status}
    </div>
  );
}
