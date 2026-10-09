import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { api } from './api';

export async function registrarDispositivoPush() {
  if (!Device.isDevice) return null;
  let status = (await Notifications.getPermissionsAsync()).status;
  if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return null;
  if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('atendimentos',{name:'Atendimentos',importance:Notifications.AndroidImportance.HIGH,vibrationPattern:[0,200,150,200]});
  const projectId = Constants.expoConfig?.extra?.eas?.projectId || Constants.easConfig?.projectId;
  if (!projectId) return null;
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  await api.chamadaAutenticada('/dispositivos/push','POST',{token,plataforma:Platform.OS});
  return token;
}
