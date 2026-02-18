'use client';

import React, { useState, useEffect } from 'react';
import styles from './MetricsDashboard.module.css';

interface MetricsData {
  heat: number;
  ph: number;
  rpm: number;
}

const MetricsDashboard: React.FC = () => {
  const [progress, setProgress] = useState<number>(0);
  const [metrics, setMetrics] = useState<MetricsData>({
    heat: 16.0,
    ph: 5.0,
    rpm: 55
  });
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [connectionStatus, setConnectionStatus] = useState<string>('disconnected');

  // Fetch real-time data from Python backend
  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null;

    const fetchReadings = async () => {
      try {
        const response = await fetch('http://localhost:8000/api/readings');
        if (!response.ok) throw new Error('Failed to fetch');
        
        const data = await response.json();
        setConnectionStatus('connected');

        if (data.readings && data.readings.length > 0) {
          // Get latest readings
          const latestReadings = data.readings.slice(-2); // Get last 2 readings
          
          let newMetrics = { ...metrics };
          let progressIncrement = 0;

          latestReadings.forEach((reading: any) => {
            if (reading.type === 'heat') {
              newMetrics.heat = reading.value;
            } else if (reading.type === 'ph') {
              newMetrics.ph = reading.value;
            }
          });

          setMetrics(newMetrics);
          
          // Update progress bar
          setProgress(prev => {
            let newProgress = prev + 1;
            if (newProgress > 100) newProgress = 0;
            return newProgress;
          });
        }
      } catch (error) {
        setConnectionStatus('error');
        console.error('Error fetching readings:', error);
      }
    };

    if (isRunning) {
      // Fetch immediately
      fetchReadings();
      // Then fetch every 5 seconds
      intervalId = setInterval(fetchReadings, 5000);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [isRunning]);

  const startProcess = () => {
    setIsRunning(true);
  };

  const stopProcess = () => {
    setIsRunning(false);
    setProgress(56);
    setMetrics({
      heat: 16.0,
      ph: 5.0,
      rpm: 55
    });
  };

  const circumference = 2 * Math.PI * 70;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <div className={styles.dashboardContainer}>
      <div className={styles.header}>
        <h1>Metrics</h1>
        <div style={{ fontSize: '12px', marginTop: '8px' }}>
          Backend: <span style={{ color: connectionStatus === 'connected' ? '#4ade80' : connectionStatus === 'error' ? '#ef4444' : '#94a3b8' }}>
            {connectionStatus === 'connected' ? '🟢 Connected' : connectionStatus === 'error' ? '🔴 Error' : '⚪ Disconnected'}
          </span>
        </div>
      </div>

      <div className={styles.progressContainer}>
        <div className={styles.progressCircle}>
          <svg viewBox="0 0 180 180">
            <circle 
              className={styles.progressBackground} 
              cx="90" 
              cy="90" 
              r="70"
            />
            <circle 
              className={styles.progressBar} 
              cx="90" 
              cy="90" 
              r="70"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
            />
          </svg>
          <div className={styles.progressText}>{progress}%</div>
        </div>
      </div>

      <div className={styles.metrics}>
        <div className={styles.metricRow}>
          <span className={styles.metricLabel}>Heat:</span>
          <span className={`${styles.metricValue} ${styles.heat}`}>
            {metrics.heat}° C
          </span>
        </div>
        <div className={styles.metricRow}>
          <span className={styles.metricLabel}>pH:</span>
          <span className={`${styles.metricValue} ${styles.ph}`}>
            {metrics.ph}
          </span>
        </div>
        <div className={styles.metricRow}>
          <span className={styles.metricLabel}>RPM:</span>
          <span className={`${styles.metricValue} ${styles.rpm}`}>
            {metrics.rpm}
          </span>
        </div>
      </div>

      <div className={styles.controls}>
        <button 
          className={`${styles.controlButton} ${styles.startButton}`}
          onClick={startProcess}
          disabled={isRunning}
        >
          <PowerIcon />
        </button>
        <button 
          className={`${styles.controlButton} ${styles.stopButton}`}
          onClick={stopProcess}
          disabled={!isRunning}
        >
          <PowerIcon />
        </button>
      </div>
    </div>
  );
};

const PowerIcon: React.FC = () => (
  <svg className="w-8 h-8 fill-white" viewBox="0 0 24 24">
    <path d="M13 3h-2v10h2V3zm4.83 2.17l-1.42 1.42C17.99 7.86 19 9.81 19 12c0 3.87-3.13 7-7 7s-7-3.13-7-7c0-2.19 1.01-4.14 2.58-5.42L6.17 5.17C4.23 6.82 3 9.26 3 12c0 4.97 4.03 9 9 9s9-4.03 9-9c0-2.74-1.23-5.18-3.17-6.83z"/>
  </svg>
);

export default MetricsDashboard;