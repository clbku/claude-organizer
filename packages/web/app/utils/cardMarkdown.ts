import { Marked } from "marked";

// One Marked instance per key prefix, memoized. Each instance has an inline
// extension that turns card keys (e.g. CO-40) into internal links. marked never
// runs inline tokenizers inside code spans/blocks, so keys in `code` stay
// literal — satisfying the "don't link inside code" requirement for free.
const cache = new Map<string, Marked>();

function build(keyPrefix: string | null): Marked {
  const m = new Marked({ breaks: true, gfm: true });
  if (keyPrefix) {
    const startRe = new RegExp(`${keyPrefix}-\\d`);
    const tokenRe = new RegExp(`^${keyPrefix}-\\d+\\b`);
    m.use({
      extensions: [
        {
          name: "cardKey",
          level: "inline",
          start(src: string) {
            const i = src.search(startRe);
            return i < 0 ? undefined : i;
          },
          tokenizer(src: string) {
            const match = tokenRe.exec(src);
            if (!match) return undefined;
            return { type: "cardKey", raw: match[0], text: match[0] };
          },
          renderer(token) {
            const key = (token as unknown as { text: string }).text;
            return `<a href="/cards/${key}" class="text-primary font-medium hover:underline">${key}</a>`;
          },
        },
      ],
    });
  }
  return m;
}

// Inline auto-link for plain-text fields (title/summary): escape HTML and turn
// card keys into links, WITHOUT interpreting markdown.
export function linkifyKeys(text: string, keyPrefix: string | null): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  if (!keyPrefix) return escaped;
  const re = new RegExp(`\\b(${keyPrefix}-\\d+)\\b`, "g");
  return escaped.replace(
    re,
    '<a href="/cards/$1" class="text-primary font-medium hover:underline">$1</a>',
  );
}

export function renderCardMarkdown(
  value: string,
  keyPrefix: string | null,
): string {
  const cacheKey = keyPrefix ?? "";
  let m = cache.get(cacheKey);
  if (!m) {
    m = build(keyPrefix);
    cache.set(cacheKey, m);
  }
  return m.parse(value, { async: false }) as string;
}
