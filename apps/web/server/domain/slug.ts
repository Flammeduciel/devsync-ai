/** Lowercase ASCII slug, 2–48 chars, compatible with slugSchema. */
export function slugify(input: string): string {
  const slug = input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/g, '');
  return slug.length >= 2 ? slug : `${slug || 'x'}-${Math.random().toString(36).slice(2, 6)}`;
}
