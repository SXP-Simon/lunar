import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

const UNSUPPORTED_CSS_KEYWORD_REGEX =
  /(?:-(?:webkit|moz|ms|o)-)?(?:fit-content(?:\([^)]*\))?|max-content|min-content|fill-available|available|stretch)/i;

const CSS_DECLARATION_REGEX =
  /\b(max-width|max-height|min-width|min-height|width|height)\s*:\s*([^;!}]+)(!\s*important)?/gi;

/**
 * Sanitizes CSS text by replacing sizing values that crash or terminate the native
 * Rito/Rust layout engine (e.g. `fit-content`, `max-content`, `fill-available`).
 */
export function sanitizeCssText(css: string): string {
  if (!UNSUPPORTED_CSS_KEYWORD_REGEX.test(css)) {
    return css;
  }

  return css.replace(CSS_DECLARATION_REGEX, (match, property: string, value: string, important?: string) => {
    if (!UNSUPPORTED_CSS_KEYWORD_REGEX.test(value)) {
      return match;
    }
    const propLower = property.toLowerCase();
    const suffix = important ? ` ${important.trim()}` : '';
    if (propLower.startsWith('max-')) {
      return `${property}: none${suffix}`;
    }
    return `${property}: auto${suffix}`;
  });
}

/**
 * Sanitizes HTML/XHTML/SVG content by replacing unsupported CSS in both `<style>` tags,
 * inline `style="..."` attributes, and general CSS declarations.
 */
export function sanitizeHtmlText(html: string): string {
  if (!UNSUPPORTED_CSS_KEYWORD_REGEX.test(html)) {
    return html;
  }

  // Sanitize <style> tags
  let result = html.replace(
    /(<style\b[^>]*>)([\s\S]*?)(<\/style\s*>)/gi,
    (_match, openTag: string, content: string, closeTag: string) => {
      return `${openTag}${sanitizeCssText(content)}${closeTag}`;
    },
  );

  // Sanitize style="..." attributes
  result = result.replace(/\bstyle=(["'])([\s\S]*?)\1/gi, (_match, quote: string, content: string) => {
    return `style=${quote}${sanitizeCssText(content)}${quote}`;
  });

  // Fallback: sanitize any remaining bare CSS declarations
  return sanitizeCssText(result);
}

const TEXT_ASSET_EXTENSIONS = /\.(?:xhtml|html|htm|xml|svg|css)$/i;

/**
 * Sanitizes an in-memory EPUB archive buffer so that the native Rito engine
 * will not panic on unsupported CSS properties like `fit-content`.
 * If no offending CSS is found, returns the original bytes directly without re-zipping.
 */
export function sanitizeEpubBytes(data: ArrayBuffer | Uint8Array): Uint8Array {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (bytes.byteLength === 0) return bytes;

  const entries = unzipSync(bytes);
  let modified = false;

  for (const [entryPath, entryBytes] of Object.entries(entries)) {
    if (!TEXT_ASSET_EXTENSIONS.test(entryPath)) continue;

    const rawText = strFromU8(entryBytes);
    if (!UNSUPPORTED_CSS_KEYWORD_REGEX.test(rawText)) continue;

    const sanitized = entryPath.toLowerCase().endsWith('.css') ? sanitizeCssText(rawText) : sanitizeHtmlText(rawText);

    if (sanitized !== rawText) {
      entries[entryPath] = strToU8(sanitized);
      modified = true;
    }
  }

  if (!modified) {
    return bytes;
  }

  // Preserve STORE compression (level 0) for maximum read performance in native Rito
  return zipSync(entries, { level: 0 });
}
