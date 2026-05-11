/**
 * Convert a string to a URL-safe slug.
 * Lowercases, replaces spaces and special characters with hyphens,
 * collapses multiple hyphens, trims leading/trailing hyphens.
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .replace(/[^a-z0-9\s-]/g, '') // remove non-alphanumeric (except spaces & hyphens)
    .trim()
    .replace(/[\s]+/g, '-') // spaces → hyphens
    .replace(/-+/g, '-') // collapse multiple hyphens
    .replace(/^-+|-+$/g, ''); // trim leading/trailing hyphens
}

export function artistToSlug(name: string): string {
  return slugify(name);
}

export function albumToSlug(title: string): string {
  return slugify(title);
}
