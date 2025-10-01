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

  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null;

    if (isRunning) {
      intervalId = setInterval(() => {
        setProgress(prev => {
          let newProgress = prev + Math.floor(Math.random() * 1) + 1;
          if (newProgress > 100) newProgress = 0;
          return newProgress;
        });

        setMetrics({
          heat: parseFloat((15 + Math.random() * 5).toFixed(1)),
          ph: parseFloat((4.5 + Math.random()).toFixed(1)),
          rpm: Math.floor(50 + Math.random() * 20)
        });
      }, 2000);
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