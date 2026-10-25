export const MEME_PAGE_SIZE = 48;

export function pageMemes<T>(items: readonly T[], page: number, pageSize = MEME_PAGE_SIZE): T[] {
  const start = Math.max(0, Math.floor(page - 1)) * pageSize;
  return items.slice(start, start + pageSize);
}
