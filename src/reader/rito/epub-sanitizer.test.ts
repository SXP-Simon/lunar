import { describe, expect, it } from 'vitest';
import { sanitizeCssText, sanitizeHtmlText } from './epub-sanitizer';

describe('epub-sanitizer', () => {
  it('sanitizes fit-content and fill-available in CSS', () => {
    const css = `
      .msg {
        width: fit-content;
        max-width: fit-content;
        min-width: fit-content;
        height: -webkit-fit-content;
        max-height: fill-available !important;
      }
    `;
    const result = sanitizeCssText(css);
    expect(result).toContain('width: auto;');
    expect(result).toContain('max-width: none;');
    expect(result).toContain('min-width: auto;');
    expect(result).toContain('height: auto;');
    expect(result).toContain('max-height: none !important;');
  });

  it('sanitizes style attributes and style tags in HTML', () => {
    const html = `
      <div style="width: fit-content; max-width: fit-content;">
        <style>
          p { width: -moz-fit-content; max-width: max-content; }
        </style>
        <p>Hello world</p>
      </div>
    `;
    const result = sanitizeHtmlText(html);
    expect(result).toContain('style="width: auto; max-width: none;"');
    expect(result).toContain('width: auto;');
    expect(result).toContain('max-width: none;');
  });
});
