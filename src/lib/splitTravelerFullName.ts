/** Split one full-name field into the first/last metadata existing profiles already store. */
export function splitTravelerFullName(raw: string): {
  firstName: string;
  lastName: string;
  displayName: string;
} {
  const displayName = raw.trim().replace(/\s+/g, ' ');
  if (!displayName) return { firstName: '', lastName: '', displayName: '' };
  const [firstName, ...rest] = displayName.split(' ');
  return { firstName, lastName: rest.join(' '), displayName };
}
