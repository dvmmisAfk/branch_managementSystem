/** Legacy seed SFH placeholders — exclude from assignment UIs and supervisor aggregates. */
export const LEGACY_PLACEHOLDER_SF_EMAILS = [
  "sfh.placeholder6@company.com",
  "sfh.placeholder7@company.com",
] as const;

export function isPlaceholderSfhUser(email: string, name: string): boolean {
  const e = email.toLowerCase().trim();
  if ((LEGACY_PLACEHOLDER_SF_EMAILS as readonly string[]).includes(e)) return true;
  return name.trim().toLowerCase().startsWith("sfh placeholder");
}
