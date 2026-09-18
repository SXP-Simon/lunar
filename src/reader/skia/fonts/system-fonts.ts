import { Skia, type SkFontMgr } from '@shopify/react-native-skia';

let cachedFamilies: readonly string[] | undefined;
let cachedFamilySet: ReadonlySet<string> = new Set();

/**
 * System font families the platform exposes to Skia. Enumerating crosses the
 * JSI boundary once per family, so the result is cached for the process.
 */
export function listSystemReaderFontFamilies(): readonly string[] {
  if (cachedFamilies) {
    return cachedFamilies;
  }
  const families = new Set<string>();
  const fontMgr = createSystemFontMgr();
  if (fontMgr) {
    try {
      const count = fontMgr.countFamilies();
      for (let index = 0; index < count; index += 1) {
        const name = fontMgr.getFamilyName(index);
        // Dot-prefixed families are platform bookkeeping, not user choices.
        if (typeof name === 'string' && name.length > 0 && !name.startsWith('.')) {
          families.add(name);
        }
      }
    } catch {
      // A platform without an enumerable font manager simply offers none.
    } finally {
      fontMgr.dispose();
    }
  }
  cachedFamilies = [...families].sort((left, right) => left.localeCompare(right));
  cachedFamilySet = families;
  return cachedFamilies;
}

/** Guards `matchFamilyStyle`, which yields an unusable face for unknown names. */
export function hasSystemReaderFontFamily(family: string): boolean {
  listSystemReaderFontFamilies();
  return cachedFamilySet.has(family);
}

export function createSystemFontMgr(): SkFontMgr | undefined {
  try {
    return Skia.FontMgr.System();
  } catch {
    return undefined;
  }
}
