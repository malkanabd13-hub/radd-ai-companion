export function normalizePhone(raw: string) {
  return raw.replace(/\D/g, "").replace(/^00/, "");
}

export function phoneToEmail(raw: string) {
  return `${normalizePhone(raw)}@radd.app`;
}
