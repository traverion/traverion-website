const SLA_KEY = 'traverion_supplier_review_sla_hours';

export function loadSupplierReviewSlaHours(): number {
  const raw = localStorage.getItem(SLA_KEY);
  const n = Number(raw);
  if (Number.isFinite(n) && n >= 1 && n <= 168) return n;
  return 48;
}

export function saveSupplierReviewSlaHours(hours: number): void {
  const safe = Math.max(1, Math.min(168, Math.round(hours)));
  localStorage.setItem(SLA_KEY, String(safe));
  window.dispatchEvent(new CustomEvent('traverion-supplier-review-sla'));
}

