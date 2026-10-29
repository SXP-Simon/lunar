/** `<scheme>://add-catalog?url=<https index URL>`, the link a catalog publisher hands out. */
const ADD_CATALOG = /^(?:[a-z][a-z0-9+.-]*:\/\/)?\/?add-catalog\/?(?:\?(.*))?$/i;

/** Routes catalog links to the catalog list, which asks before adding anything. */
export function redirectCatalogLink({ path }: { path: string }): string | undefined {
  const match = ADD_CATALOG.exec(path);
  if (!match) return undefined;
  const url = readQueryParameter(match[1] ?? '', 'url');
  return url ? `/plugins/catalogs?add=${encodeURIComponent(url)}` : '/plugins/catalogs';
}

function readQueryParameter(query: string, name: string): string | undefined {
  for (const part of query.split('&')) {
    const separator = part.indexOf('=');
    const key = separator < 0 ? part : part.slice(0, separator);
    if (key !== name) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).replace(/\+/g, ' '));
    } catch {
      return undefined;
    }
  }
  return undefined;
}
