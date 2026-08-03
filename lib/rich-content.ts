const AUTO_LINK_PATTERN = /(^|[\s([{>"'’])((?:https?:\/\/|www\.)[^\s<]+|(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}(?:\/[^\s<]*)?|#[\p{L}\p{N}_-]{2,80})/giu;
const TRAILING_PUNCTUATION_PATTERN = /[.,;:!?…)}\]]+$/u;

export function sanitizeRichHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "")
    .replace(/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, "")
    .replace(/<object[\s\S]*?>[\s\S]*?<\/object>/gi, "")
    .replace(/<embed[\s\S]*?>/gi, "")
    .replace(/\s(?:srcdoc|formaction)=("[^"]*"|'[^']*')/gi, "")
    .replace(/\son\w+="[^"]*"/gi, "")
    .replace(/\son\w+='[^']*'/gi, "")
    .replace(/javascript:/gi, "")
    .replace(/data:text\/html/gi, "")
    .trim();
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
