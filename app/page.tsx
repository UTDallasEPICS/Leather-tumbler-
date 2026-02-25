'use client';
import Image from 'next/image'
import styles from './page.module.css'
import { LocalNotifications } from '@capacitor/local-notifications';
import MetricsDashboard from './metrics_dash/page';
import { useEffect, useState } from 'react';

// Define structure for sensor readings
interface Reading {
  type: string
  name: string
  value: number
  unit: string
  timestamp: string
}

const checkPermissions = async () => {
  const result = await LocalNotifications.checkPermissions();
  console.log('Permission status:', result.display);
  return result.display;
};

// Request permissions if not granted
const requestPermissions = async () => {
  if (await checkPermissions() !== 'granted') {
    const result = await LocalNotifications.requestPermissions();
    return result.display === 'granted';
  }
  return true;
};

// Schedule notification only after permissions are granted
const scheduleNotification = async () => {
  const hasPermission = await requestPermissions();
  
  if (hasPermission) {
    await LocalNotifications.schedule({
      notifications: [{
        title: "Time to check your tumbler!",
        body: "Your leather tumbler needs attention.",
        id: 1,
        schedule: { at: new Date(Date.now() + 5000 ) }, // 5 seconds from now
        sound: "beep.wav",
      }]
    });
  } else {
    console.log('Notification permissions denied');
  }
};


export default function Home() {

  const [sensorData, setSensorData] = useState<Reading[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Fetch sensor data from backend API 
  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch('http://localhost:8000/api/readings');
        const data = await response.json();
        setSensorData(data.readings);
        setError(null);
      } catch (err) {
        setError('Disconnected from server');
        console.error('Error fetching data:', err);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 5000);
    
    return () => clearInterval(interval);
  }, []);

  return (
    <div>
      <MetricsDashboard sensorData={sensorData} />
      <main className={styles.main}>
        {error && <div style={{color: 'red'}}>{error}</div>}
    <button onClick={scheduleNotification}>hello im a button </button>
    
    <button> im another button</button>
    
    </main>
    </div>
    
  )
}
