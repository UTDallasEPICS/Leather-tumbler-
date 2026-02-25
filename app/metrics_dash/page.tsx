'use client';

import React, { useState, useEffect } from 'react';
import styles from './MetricsDashboard.module.css';

interface MetricsData {
  heat: number;
  ph: number;
  rpm: number;
}

// Define structure for sensor readings
interface Reading {
  type: string;
  name: string;
  value: number;
  unit: string;
  timestamp: string;
}

interface MetricsDashboardProps {
  sensorData?: Reading[];
}

const MetricsDashboard: React.FC<MetricsDashboardProps> = ({ sensorData = [] }) => {
  const [progress, setProgress] = useState<number>(0);
  const [metrics, setMetrics] = useState<MetricsData>({
    heat: 16.0,
    ph: 5.0,
    rpm: 55
  });
  const [isRunning, setIsRunning] = useState<boolean>(false);

  // Sidebar state and page navigation
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState<'metrics' | 'logs'>('metrics');

  // Logs state
  const [logs, setLogs] = useState<Reading[]>([]);

  // Update metrics from sensorData
  useEffect(() => {
  if (!isRunning) return; 

  if (sensorData.length > 0) {
    const heatReadings = sensorData.filter(r => r.type === 'heat');
    const phReadings = sensorData.filter(r => r.type === 'ph');

    const latestHeat = heatReadings[heatReadings.length - 1];
    const latestPh = phReadings[phReadings.length - 1];

    if (latestHeat && metrics.heat !== latestHeat.value) {
      setMetrics(prev => ({ ...prev, heat: latestHeat.value }));
      setLogs(prevLogs => [latestHeat, ...prevLogs]);
    }

    if (latestPh && metrics.ph !== latestPh.value) {
      setMetrics(prev => ({ ...prev, ph: latestPh.value }));
    }
  }
}, [sensorData, isRunning]);

  const intervalRef = React.useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    
    if (!isRunning) return;

    const startTime = Date.now();
    const totalDuration = 30 * 60 * 1000; 

    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      let newProgress = (elapsed / totalDuration) * 100;
      if (newProgress > 100) newProgress = 100;
      setProgress(parseFloat(newProgress.toFixed(2)));

      setMetrics(prev => ({
        ...prev,
        rpm: Math.floor(50 + Math.random() * 20)
      }));

      if (newProgress >= 100) {
        clearInterval(intervalRef.current!);
        setIsRunning(false);
        setProgress(0);
      }
    }, 1000); // update every second

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isRunning]);

  const startProcess = () => {
    setIsRunning(true);
  };

  const stopProcess = () => {
    setIsRunning(false);
    setProgress(0);
    if (intervalRef.current) clearInterval(intervalRef.current);
  };

  const circumference = 2 * Math.PI * 70;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
  <div className={styles.dashboardContainer}>

    <button
      className={styles.menuButton}
      onClick={() => setIsSidebarOpen(true)}
    >
      ☰
    </button> 

    {/* Metrics Page */}
    {currentPage === 'metrics' && (
      <>
        <div className={styles.header}>
          <h1>Metrics</h1>
        </div>

        <div className={styles.progressBarContainer}>
          <div
            className={styles.progressBarFill}
            style={{ width: `${progress}%` }}
          />
          <span className={styles.progressText}>
            {progress}%
          </span>
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
        
        <div className={styles.metricRow}>
              <span className={styles.metricLabel}>Status:</span>
              <span
                className={`${styles.metricValue} ${
                  isRunning ? styles.forward : styles.disconnected
                }`}
              >
                {isRunning ? 'Forward' : 'Disconnected'}
              </span>
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
      </>
    )}

    {currentPage === 'logs' && (
        <div className={styles.logsContainer}>
            <h1>Temperature Logs</h1>
            <div className={styles.clearButtonWrapper}>
            <button className={styles.clearLogsButton} onClick={() => setLogs([])}>
              Clear Logs
            </button>
          </div>

          <div className={styles.logsList}>
            {logs.length === 0 && <p>No readings yet.</p>}
            {logs.map((log, index) => {
              if (log.type !== 'heat') return null;

              const time = new Date(log.timestamp).toLocaleTimeString('en-US', {
                hour12: false,
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
              });

              return (
                <div key={index} className={styles.logItem}>
                  <span>{log.value}° C</span>
                  <span className={styles.timestamp}>{time}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

    {isSidebarOpen && (
      <>
        <div
          className={styles.overlay}
          onClick={() => setIsSidebarOpen(false)}
        />

        <div className={styles.sidebar}>
          <button
            className={`${styles.sidebarItem} ${
              currentPage === 'metrics' ? styles.active : ''
            }`}
            onClick={() => {
              setCurrentPage('metrics');
              setIsSidebarOpen(false);
            }}
          >
            Metrics
          </button>

          <div className={styles.divider} />

          <button
            className={`${styles.sidebarItem} ${
              currentPage === 'logs' ? styles.active : ''
            }`}
            onClick={() => {
              setCurrentPage('logs');
              setIsSidebarOpen(false);
            }}
          >
            Logs
          </button>
        </div>
      </>
    )}

  </div>
);
};

const PowerIcon: React.FC = () => (
  <svg className="w-8 h-8 fill-white" viewBox="0 0 24 24">
    <path d="M13 3h-2v10h2V3zm4.83 2.17l-1.42 1.42C17.99 7.86 19 9.81 19 12c0 3.87-3.13 7-7 7s-7-3.13-7-7c0-2.19 1.01-4.14 2.58-5.42L6.17 5.17C4.23 6.82 3 9.26 3 12c0 4.97 4.03 9 9 9s9-4.03 9-9c0-2.74-1.23-5.18-3.17-6.83z"/>
  </svg>
);

export default MetricsDashboard;