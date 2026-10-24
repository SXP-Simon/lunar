import type { InstalledPlugin } from '../domain/installed-plugin';

/** Exact locale, then its language, then the declared default, English, and finally any locale. */
export function pickMessages(plugin: InstalledPlugin, locale: string): Readonly<Record<string, string>> | undefined {
  const locales = plugin.locales;
  const language = locale.split('-')[0];
  return (
    locales[locale] ??
    Object.entries(locales).find(([key]) => key.split('-')[0] === language)?.[1] ??
    (plugin.manifest.defaultLocale ? locales[plugin.manifest.defaultLocale] : undefined) ??
    locales.en ??
    Object.values(locales)[0]
  );
}
