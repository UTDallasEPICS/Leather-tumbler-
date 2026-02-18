'use client';
import Image from 'next/image'
import styles from './page.module.css'
import { LocalNotifications } from '@capacitor/local-notifications';
import MetricsDashboard from './metrics_dash/page';


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
  return (
    <div>
      <MetricsDashboard/>
      <main className={styles.main}>
      
    <button onClick={scheduleNotification}>hello im a button </button>
    
    <button> im another button</button>
    
    </main>
    </div>
    
  )
}
