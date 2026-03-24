const PREFS_KEY = 'traverion_supplier_notif_prefs';
const DISMISSED_KEY = 'traverion_supplier_notif_dismissed';

export type SupplierNotifPrefs = {
  newBookings: boolean;
  reviewsNeedReply: boolean;
  bookingUrgency: 'all' | 'high_only';
  reviewUrgency: 'all' | 'high_only';
  channelInApp: boolean;
  channelEmail: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
};

const defaultPrefs: SupplierNotifPrefs = {
  newBookings: true,
  reviewsNeedReply: true,
  bookingUrgency: 'all',
  reviewUrgency: 'all',
  channelInApp: true,
  channelEmail: false,
  quietHoursEnabled: false,
  quietHoursStart: '22:00',
  quietHoursEnd: '07:00',
};

export function loadSupplierNotifPrefs(): SupplierNotifPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return { ...defaultPrefs };
    const p = JSON.parse(raw) as Partial<SupplierNotifPrefs>;
    return {
      newBookings: p.newBookings !== false,
      reviewsNeedReply: p.reviewsNeedReply !== false,
      bookingUrgency: p.bookingUrgency === 'high_only' ? 'high_only' : 'all',
      reviewUrgency: p.reviewUrgency === 'high_only' ? 'high_only' : 'all',
      channelInApp: p.channelInApp !== false,
      channelEmail: p.channelEmail === true,
      quietHoursEnabled: p.quietHoursEnabled === true,
      quietHoursStart:
        typeof p.quietHoursStart === 'string' && p.quietHoursStart ? p.quietHoursStart : '22:00',
      quietHoursEnd:
        typeof p.quietHoursEnd === 'string' && p.quietHoursEnd ? p.quietHoursEnd : '07:00',
    };
  } catch {
    return { ...defaultPrefs };
  }
}

function parseTimeToMinutes(value: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

/** True if current local time is inside configured quiet hours window. */
export function isWithinQuietHours(prefs: SupplierNotifPrefs, now = new Date()): boolean {
  if (!prefs.quietHoursEnabled) return false;
  const start = parseTimeToMinutes(prefs.quietHoursStart);
  const end = parseTimeToMinutes(prefs.quietHoursEnd);
  if (start == null || end == null || start === end) return false;
  const current = now.getHours() * 60 + now.getMinutes();
  if (start < end) {
    return current >= start && current < end;
  }
  // Overnight window, e.g. 22:00 -> 07:00
  return current >= start || current < end;
}

export function saveSupplierNotifPrefs(prefs: SupplierNotifPrefs): void {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  window.dispatchEvent(new CustomEvent('traverion-supplier-notif-prefs'));
}

export function loadDismissedNotificationKeys(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    const arr = raw ? (JSON.parse(raw) as string[]) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

export function dismissNotificationKey(key: string): void {
  const set = loadDismissedNotificationKeys();
  set.add(key);
  localStorage.setItem(DISMISSED_KEY, JSON.stringify([...set]));
  window.dispatchEvent(new CustomEvent('traverion-supplier-notif-dismiss'));
}

export function clearDismissedNotifications(): void {
  localStorage.removeItem(DISMISSED_KEY);
  window.dispatchEvent(new CustomEvent('traverion-supplier-notif-dismiss'));
}
