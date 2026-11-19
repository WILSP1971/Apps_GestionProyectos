import { apiFetch } from '@/lib/api';

/** Notificaciones push del navegador / celular (Web Push con claves VAPID del servidor). */
export type EstadoPush = 'no-soportado' | 'no-configurado' | 'sin-service-worker' | 'bloqueado' | 'inactivo' | 'activo';

export const soportaPush = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

const registro = () => navigator.serviceWorker.getRegistration();

export async function estadoPush(clavePublica: string | null): Promise<EstadoPush> {
  if (!soportaPush()) return 'no-soportado';
  if (!clavePublica) return 'no-configurado';
  const reg = await registro();
  if (!reg) return 'sin-service-worker';
  if (Notification.permission === 'denied') return 'bloqueado';
  return (await reg.pushManager.getSubscription()) ? 'activo' : 'inactivo';
}

/** Pide permiso, suscribe este navegador y registra la suscripción en el servidor. */
export async function activarPush(clavePublica: string): Promise<void> {
  const permiso = await Notification.requestPermission();
  if (permiso !== 'granted') throw new Error('El navegador no dio permiso para mostrar notificaciones');
  const reg = await registro();
  if (!reg) throw new Error('El Service Worker no está activo en esta página (recarga e intenta de nuevo)');
  // applicationServerKey acepta la clave pública VAPID en base64url tal como la entrega el servidor
  const suscripcion = (await reg.pushManager.getSubscription())
    ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: clavePublica }));
  await apiFetch('/notificaciones/push/suscripciones', { method: 'POST', body: suscripcion.toJSON() });
}

export async function desactivarPush(): Promise<void> {
  const reg = await registro();
  const suscripcion = await reg?.pushManager.getSubscription();
  if (!suscripcion) return;
  await apiFetch('/notificaciones/push/suscripciones', { method: 'DELETE', body: { endpoint: suscripcion.endpoint } }).catch(() => undefined);
  await suscripcion.unsubscribe();
}
