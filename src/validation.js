export const VIETNAM_PHONE_PATTERN = String.raw`^(?:0[35789][0-9]{8}|\+84[35789][0-9]{8})$`;
export const VIETNAM_PHONE_REGEX = /^(?:0[35789][0-9]{8}|\+84[35789][0-9]{8})$/;

export function sanitizePhoneValue(value) {
  const raw = String(value || '').trim();
  if (raw.startsWith('+')) {
    const digits = raw.slice(1).replace(/\D/g, '').slice(0, 11);
    return `+${digits}`;
  }
  return raw.replace(/\D/g, '').slice(0, 10);
}

export function isValidVietnamPhone(value) {
  return VIETNAM_PHONE_REGEX.test(String(value || '').trim());
}
