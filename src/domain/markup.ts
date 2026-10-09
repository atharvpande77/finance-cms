/**
 * Article body markup (04.2), parsed into typed blocks and rendered as elements, never as
 * injected HTML (06.4a).
 *
 *   blank line      new paragraph          ## Heading       heading
 *   - item          bullet list            **bold**         bold
 *   [text](url)     link (rules below)     {{calc:slug}}    calculator, on its own line
 */
export type Inline =
  | { type: "text"; text: string }
  | { type: "bold"; children: Inline[] }
  | { type: "link"; href: string; children: Inline[] };

export type Block =
  | { type: "paragraph"; children: Inline[] }
  | { type: "heading"; children: Inline[] }
  | { type: "list"; items: Inline[][] }
  | { type: "calculator"; slug: string };

const CALC_LINE = /^\{\{calc:([a-z0-9-]+)\}\}$/;

export function parseBody(source: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length)
      blocks.push({ type: "paragraph", children: parseInline(paragraph.join(" ")) });
    paragraph = [];
  };
  const flushList = () => {
    if (list.length) blocks.push({ type: "list", items: list.map((item) => parseInline(item)) });
    list = [];
  };

  for (const raw of source.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    if (line === "") {
      flushParagraph();
      flushList();
      continue;
    }
    const calc = line.match(CALC_LINE);
    if (calc) {
      flushParagraph();
      flushList();
      blocks.push({ type: "calculator", slug: calc[1]! });
    } else if (line.startsWith("## ")) {
      flushParagraph();
      flushList();
      blocks.push({ type: "heading", children: parseInline(line.slice(3).trim()) });
    } else if (line.startsWith("- ")) {
      flushParagraph();
      list.push(line.slice(2).trim());
    } else {
      flushList();
      paragraph.push(line);
    }
  }
  flushParagraph();
  flushList();
  return blocks;
}

export function parseInline(text: string, allowBold = true): Inline[] {
  const out: Inline[] = [];
  let buffer = "";
  const flush = () => {
    if (buffer) out.push({ type: "text", text: buffer });
    buffer = "";
  };
  let i = 0;
  while (i < text.length) {
    if (allowBold && text.startsWith("**", i)) {
      const close = text.indexOf("**", i + 2);
      if (close > i + 2) {
        flush();
        out.push({ type: "bold", children: parseInline(text.slice(i + 2, close), false) });
        i = close + 2;
        continue;
      }
    }
    if (text[i] === "[") {
      const mid = text.indexOf("](", i + 1);
      const close = mid >= 0 ? text.indexOf(")", mid + 2) : -1;
      if (mid > i + 1 && close > mid + 2) {
        flush();
        out.push({
          type: "link",
          href: text.slice(mid + 2, close).trim(),
          children: [{ type: "text", text: text.slice(i + 1, mid) }],
        });
        i = close + 1;
        continue;
      }
    }
    buffer += text[i];
    i++;
  }
  flush();
  return out;
}

export type LinkKind = "internal" | "external" | "unsafe";

/**
 * Only http(s) and site-relative links work (04.11). Anything that could run code or leave the
 * site unexpectedly (javascript:, data:, //host, /\host, mailto:) is unsafe and shown as text.
 * An absolute URL on the paper's own finance host counts as internal.
 */
export function classifyLink(href: string, siteHosts: readonly string[] = []): LinkKind {
  const h = href.trim();
  if (!h || /[\s\u0000-\u001f]/.test(h)) return "unsafe";
  if (h.startsWith("/")) return h.startsWith("//") || h.startsWith("/\\") ? "unsafe" : "internal";
  let url: URL;
  try {
    url = new URL(h);
  } catch {
    return "unsafe";
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return "unsafe";
  return siteHosts.includes(url.hostname.toLowerCase()) ? "internal" : "external";
}

export type ArticleKind = "institution" | "abcfinance" | "independent";

/** Attributes for a link. Outbound links in institution articles are sponsored (09.3 #16). */
export function linkAttributes(
  kind: Exclude<LinkKind, "unsafe">,
  articleType: ArticleKind,
): { rel?: string; target?: "_blank" } {
  if (kind === "internal") return {};
  return {
    rel: articleType === "institution" ? "sponsored noopener noreferrer" : "noopener noreferrer",
    target: "_blank",
  };
}

/** Calculator shortcodes that name no known calculator (used by the automated checks, M3). */
export function unknownCalculators(blocks: Block[], known: readonly string[]): string[] {
  return blocks.flatMap((b) =>
    b.type === "calculator" && !known.includes(b.slug) ? [b.slug] : [],
  );
}

/** Plain text of inline nodes (for descriptions and checks). */
export function inlineText(nodes: Inline[]): string {
  return nodes.map((n) => (n.type === "text" ? n.text : inlineText(n.children))).join("");
}
