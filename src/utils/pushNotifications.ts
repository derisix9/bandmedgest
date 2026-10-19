/**
 * Notificações push / do sistema (passo 5).
 *
 * O que funciona SEM servidor: pedir permissão e mostrar uma notificação do sistema
 * (através do service worker) quando chega uma notificação nova e a aplicação está aberta
 * em segundo plano (separador oculto ou PWA instalada).
 *
 * O que precisa de servidor: push com a aplicação FECHADA. Isso exige um par de chaves
 * VAPID e um emissor (biblioteca web-push) que ainda não está neste projeto. A parte do
 * cliente (subscrição) já está pronta em subscribeToPush(); o emissor é um passo à parte.
 */

export type PushSupport = 'unsupported' | 'denied' | 'default' | 'granted';

export function pushSupport(env: { Notification?: any; serviceWorker?: boolean } = {
  Notification: typeof Notification !== 'undefined' ? Notification : undefined,
  serviceWorker: typeof navigator !== 'undefined' && 'serviceWorker' in navigator
}): PushSupport {
  if (!env.Notification || !env.serviceWorker) return 'unsupported';
  return env.Notification.permission as PushSupport;
}

export async function requestPushPermission(): Promise<PushSupport> {
  if (pushSupport() === 'unsupported') return 'unsupported';
  const result = await Notification.requestPermission();
  return result as PushSupport;
}

/** Abre só caminhos internos (nunca URLs externas vindas de dados). */
/** Chave pública VAPID: base64url, em regra com 87 caracteres (ponto EC P-256 não comprimido). */
export function isLikelyVapidKey(key: string): boolean {
  return /^[A-Za-z0-9_-]{80,100}$/.test((key || '').trim());
}

export function safeInternalPath(path?: string): string {
  if (!path || !path.startsWith('/') || path.startsWith('//')) return '/';
  return path;
}

export interface SystemNotificationInput {
  id: string;
  title: string;
  message: string;
  priority?: string;
}

/** Corta o texto para o ecrã de bloqueio e devolve as opções para showNotification. */
export function toNotificationOptions(n: SystemNotificationInput): { title: string; options: NotificationOptions } {
  const body = n.message.length > 140 ? `${n.message.slice(0, 137)}…` : n.message;
  return {
    title: n.title.slice(0, 80),
    options: {
      body,
      tag: `bandgest-${n.id}`,
      icon: '/icon-192.png',
      badge: '/favicon-32.png',
      requireInteraction: n.priority === 'urgente',
      data: { url: '/' }
    }
  };
}

/** Notificações que ainda não foram mostradas no sistema (memória por sessão do separador). */
export function selectFresh<T extends { id: string; read: boolean }>(items: T[], alreadyShown: Set<string>): T[] {
  return items.filter((i) => !i.read && !alreadyShown.has(i.id));
}

export async function showSystemNotification(n: SystemNotificationInput): Promise<boolean> {
  if (pushSupport() !== 'granted') return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    const { title, options } = toNotificationOptions(n);
    await reg.showNotification(title, options);
    return true;
  } catch {
    return false;
  }
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

/** Subscrição Web Push (precisa da chave pública VAPID do servidor). Devolve o JSON a guardar. */
export async function subscribeToPush(vapidPublicKey: string): Promise<PushSubscriptionJSON | null> {
  if (pushSupport() !== 'granted' || !vapidPublicKey) return null;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as unknown as BufferSource
    });
    return sub.toJSON();
  } catch {
    return null;
  }
}
