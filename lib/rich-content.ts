import { parseFragment } from "parse5";

type RichNode = { nodeName: string; tagName?: string; value?: string; attrs?: Array<{ name: string; value: string }>; childNodes?: RichNode[] };
const ALLOWED_RICH_TAGS = new Set(["p","div","span","h1","h2","h3","h4","br","hr","strong","b","em","i","u","s","strike","mark","font","blockquote","pre","code","ul","ol","li","sup","sub","figure","figcaption","a","img","table","thead","tbody","tfoot","tr","th","td","video","source"]);
const RICH_FORBIDDEN_SUBTREES = new Set(["script","style","iframe","object","embed","svg","math","template","form","input","button","select","textarea","noscript","meta","link","base","audio","canvas"]);
const RICH_VOID_TAGS = new Set(["br","hr","img","source"]);
const SAFE_RICH_CLASSES = new Set(["dtsc-publication-video","dtsc-publication-video-card","dtsc-rich-table","dtsc-hashtag-link","dtsc-external-link"]);
const SAFE_RICH_FONTS = new Set(["inter","arial","georgia","verdana","sans-serif"]);
const SAFE_RICH_COLORS = /^(?:#[0-9a-f]{3,8}|rgba?\([\d.,\s%]+\))$/i;

function richSafeUrl(raw: string, kind: "link" | "media") {
  const value = raw.trim();
  if (!value || /[\\\u0000-\u001f\u007f]/.test(value) || value.startsWith("//")) return null;
  if (value.startsWith("/") || (kind === "link" && (value.startsWith("#") || value.startsWith("?")))) return value;
  try {
    const url = new URL(value);
    if (url.protocol === "http:" || url.protocol === "https:") return value;
    if (kind === "link" && url.protocol === "mailto:") return value;
  } catch { /* Invalid and relative executable schemes fail closed. */ }
  return null;
}

function richSafeStyle(raw: string) {
  const parts: string[] = [];
  for (const item of raw.split(";")) {
    const i = item.indexOf(":");
    if (i < 0) continue;
    const property = item.slice(0, i).trim().toLowerCase();
    const value = item.slice(i + 1).trim().toLowerCase();
    if (
      (property === "line-height" && /^(?:1(?:\.\d{1,2})?|2(?:\.\d{1,2})?)$/.test(value) && Number(value) >= 1 && Number(value) <= 2.5) ||
      (property === "margin-bottom" && /^(?:[0-9]|[12][0-9]|3[0-2])px$/.test(value)) ||
      (property === "padding-left" && /^(?:[0-9]|[1-5][0-9]|60)px$/.test(value)) ||
      (property === "text-align" && /^(?:left|center|right|justify)$/.test(value)) ||
      (property === "list-style-type" && /^(?:disc|circle|square|decimal|lower-alpha|none)$/.test(value)) ||
      ((property === "color" || property === "background-color") && SAFE_RICH_COLORS.test(value)) ||
      (property === "font-family" && SAFE_RICH_FONTS.has(value.replace(/["']/g, "").trim())) ||
      (property === "font-size" && /^(?:1[2-9]|2[0-9]|30)px$/.test(value)) ||
      (property === "font-weight" && /^(?:normal|bold|400|500|600|700|800|900)$/.test(value)) ||
      (property === "font-style" && /^(?:normal|italic)$/.test(value)) ||
      (property === "text-decoration" && /^(?:none|underline|line-through)$/.test(value))
    ) parts.push(property + ":" + value);
  }
  return parts.join(";");
}

function renderSafeRichNode(node: RichNode): string {
  if (node.nodeName === "#text") return escapeHtml(node.value || "");
  if (node.nodeName === "#comment" || node.nodeName === "#documentType") return "";
  const tag = node.tagName?.toLowerCase();
  if (tag && RICH_FORBIDDEN_SUBTREES.has(tag)) return "";
  const children = (node.childNodes || []).map(renderSafeRichNode).join("");
  if (!tag || !ALLOWED_RICH_TAGS.has(tag)) return children;
  const attrs = new Map((node.attrs || []).map((attr) => [attr.name.toLowerCase(), attr.value]));
  const result: string[] = [];
  const add = (name: string, value?: string | null) => {
    if (value) result.push(name + '="' + escapeHtml(value) + '"');
  };

  if (tag === "a") {
    const href = richSafeUrl(attrs.get("href") || "", "link");
    if (!href) return children;
    add("href", href);
    add("title", attrs.get("title")?.slice(0, 200));
    if (/^https?:\/\//i.test(href)) {
      add("target", "_blank");
      add("rel", "noopener noreferrer nofollow");
    }
  }
  if (tag === "img" || tag === "video" || tag === "source") {
    const src = richSafeUrl(attrs.get("src") || "", "media");
    if (!src) return "";
    add("src", src);
    if (tag === "img") {
      add("alt", attrs.get("alt")?.slice(0, 300));
      add("loading", "lazy");
    }
    if (tag === "video") {
      add("controls", "controls");
      add("preload", "metadata");
    }
    if (tag === "source") {
      const type = attrs.get("type") || "";
      if (/^(?:video\/(?:mp4|webm|ogg)|image\/(?:jpeg|png|webp))$/i.test(type)) add("type", type);
    }
  }
  if (tag === "font") {
    const family = attrs.get("face") || "";
    if (SAFE_RICH_FONTS.has(family.toLowerCase())) add("face", family);
    const size = attrs.get("size") || "";
    if (/^[1-7]$/.test(size)) add("size", size);
    const color = attrs.get("color") || "";
    if (SAFE_RICH_COLORS.test(color)) add("color", color);
  }
  if (tag === "th" || tag === "td") {
    for (const key of ["rowspan","colspan"]) {
      const value = attrs.get(key) || "";
      if (/^(?:[1-9]|1[0-2])$/.test(value)) add(key, value);
    }
  }
  const safeClasses = (attrs.get("class") || "").split(/\s+/).filter((name) => SAFE_RICH_CLASSES.has(name));
  if (safeClasses.length) add("class", [...new Set(safeClasses)].join(" "));
  add("style", richSafeStyle(attrs.get("style") || ""));
  const opening = "<" + tag + (result.length ? " " + result.join(" ") : "") + ">";
  return RICH_VOID_TAGS.has(tag) ? opening : opening + children + "</" + tag + ">";
}

const AUTO_LINK_PATTERN = /(^|[\s([{>"'’])((?:https?:\/\/|www\.)[^\s<]+|(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}(?:\/[^\s<]*)?|#[\p{L}\p{N}_-]{2,80})/giu;
const TRAILING_PUNCTUATION_PATTERN = /[.,;:!?…)}\]]+$/u;

/** HTML5 parser-backed strict allowlist for rich text in public and private surfaces. */
export function sanitizeRichHtml(html: string) {
  const fragment = parseFragment(html) as unknown as RichNode;
  return (fragment.childNodes || []).map(renderSafeRichNode).join("").trim();
}

export function hasHtmlMarkup(content: string) {
  return /<\/?[a-z][\s\S]*>/i.test(content);
}

export function enhanceRichContentHtml(content: string) {
  const source = hasHtmlMarkup(content)
    ? sanitizeRichHtml(content)
    : escapeHtml(content).replace(/\r?\n/g, "<br>");
  const parts = source.split(/(<[^>]+>)/g);
  let blockedDepth = 0;

  return parts.map((part) => {
    if (!part.startsWith("<")) {
      return blockedDepth > 0 ? part : linkifyTextFragment(part);
    }

    const tag = part.match(/^<\s*(\/)?\s*([a-z0-9-]+)/i);
    if (!tag) return part;
    const closing = Boolean(tag[1]);
    const tagName = tag[2].toLowerCase();
    const blocked = tagName === "a" || tagName === "code" || tagName === "pre";
    if (blocked && closing) blockedDepth = Math.max(0, blockedDepth - 1);
    const normalized = tagName === "a" && !closing ? normalizeAnchorTag(part) : part;
    if (blocked && !closing && !part.endsWith("/>")) blockedDepth += 1;
    return normalized;
  }).join("");
}

function linkifyTextFragment(text: string) {
  return text.replace(AUTO_LINK_PATTERN, (full, prefix: string, token: string, offset: number, source: string) => {
    const start = offset + prefix.length;
    if (source[start - 1] === "@") return full;
    if (token.startsWith("#")) {
      const tag = token;
      return `${prefix}<a href="?hashtag=${encodeURIComponent(tag)}" data-dtsc-hashtag="${escapeAttribute(tag)}" class="dtsc-hashtag-link" aria-label="Filtrer les annonces avec ${escapeAttribute(tag)}">${tag}</a>`;
    }

    const trailing = token.match(TRAILING_PUNCTUATION_PATTERN)?.[0] || "";
    const cleanToken = trailing ? token.slice(0, -trailing.length) : token;
    const href = normalizeExternalUrl(cleanToken);
    if (!href) return full;
    return `${prefix}<a href="${escapeAttribute(href)}" target="_blank" rel="noopener noreferrer nofollow" class="dtsc-external-link">${cleanToken}</a>${trailing}`;
  });
}

function normalizeAnchorTag(tag: string) {
  if (/\btarget\s*=/i.test(tag)) return tag;
  return tag.replace(/>$/, ' target="_blank" rel="noopener noreferrer nofollow">');
}

function normalizeExternalUrl(value: string) {
  const candidate = /^(?:https?:\/\/)/i.test(value) ? value : `https://${value}`;
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value: string) {
  return escapeHtml(value);
}
