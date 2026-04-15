"use client";

import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';

export async function requestPushPermission() {
  if (Capacitor.getPlatform() === 'web') {
    console.warn('Push notifications not supported on web via Capacitor');
    return null;
  }

  let permStatus = await PushNotifications.checkPermissions();

  if (permStatus.receive === 'prompt') {
    permStatus = await PushNotifications.requestPermissions();
  }

  if (permStatus.receive !== 'granted') {
    throw new Error('User denied permissions!');
  }

  await PushNotifications.register();
}

export async function addPushListeners(
  onToken: (token: string) => void,
  onNotificationReceived: (notification: any) => void,
  onNotificationActionPerformed: (action: any) => void
) {
  if (Capacitor.getPlatform() === 'web') return;

  await PushNotifications.addListener('registration', (token) => {
    console.log('Push registration success, token: ' + token.value);
    onToken(token.value);
  });

  await PushNotifications.addListener('registrationError', (error: any) => {
    console.error('Error on registration: ' + JSON.stringify(error));
  });

  await PushNotifications.addListener('pushNotificationReceived', (notification) => {
    console.log('Push received: ' + JSON.stringify(notification));
    onNotificationReceived(notification);
  });

  await PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
    console.log('Push action performed: ' + JSON.stringify(notification));
    onNotificationActionPerformed(notification);
  });
}

export async function removePushListeners() {
  if (Capacitor.getPlatform() === 'web') return;
  await PushNotifications.removeAllListeners();
}
