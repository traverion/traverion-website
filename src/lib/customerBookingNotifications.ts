const EVENT_NAME = 'traverion:booking-notification-changed';

function unreadKey(userId: string): string {
  return `traverion_booking_unread_${userId}`;
}

function seenAtKey(userId: string): string {
  return `traverion_booking_seen_at_${userId}`;
}

function emit(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(EVENT_NAME));
}

export function getBookingNotificationEventName(): string {
  return EVENT_NAME;
}

export function markBookingsUnread(userId: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(unreadKey(userId), '1');
  emit();
}

export function clearBookingsUnread(userId: string): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(unreadKey(userId));
  localStorage.setItem(seenAtKey(userId), new Date().toISOString());
  emit();
}

export function hasBookingsUnread(userId: string): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(unreadKey(userId)) === '1';
}

export function getBookingsSeenAt(userId: string): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(seenAtKey(userId));
}
