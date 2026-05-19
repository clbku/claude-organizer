export function derivePrefixFromSlug(slug: string): string {
  const cleaned = slug.toLowerCase();
  const words = cleaned.split(/[-_\s]+/).filter(Boolean);
  let prefix = "";
  if (words.length === 0) {
    prefix = cleaned.replace(/[^a-z0-9]/g, "").slice(0, 4);
  } else if (words.length === 1) {
    prefix = (words[0] ?? "").replace(/[^a-z0-9]/g, "").slice(0, 4);
  } else {
    prefix = words
      .slice(0, 4)
      .map((w) => w.replace(/[^a-z0-9]/g, "").charAt(0))
      .filter(Boolean)
      .join("");
  }
  prefix = prefix.toUpperCase();
  if (!prefix) return "PROJ";
  return prefix;
}

export function isValidKeyPrefix(prefix: string): boolean {
  return /^[A-Z][A-Z0-9]{0,9}$/.test(prefix);
}
