export const MEME_PAGE_SIZE = 24;

export function memePreviewSource(url: string, visible: boolean): string | undefined {
  return visible ? url : undefined;
}

export function memePreviewPreload(visible: boolean): "metadata" | "none" {
  return visible ? "metadata" : "none";
}

export function canMemePreviewPlay(id: string, hoveredId: string | null, visible: boolean): boolean {
  return visible && hoveredId === id;
}

export function releaseMemePreview(video: Pick<HTMLMediaElement, "removeAttribute" | "load">): void {
  video.removeAttribute("src");
  video.load();
}

export function mergeMemePages<T extends { id: string }>(current: readonly T[], incoming: readonly T[], page: number): T[] {
  const items = page <= 1 ? [] : [...current];
  const ids = new Set(items.map((item) => item.id));
  for (const item of incoming) {
    if (ids.has(item.id)) continue;
    ids.add(item.id);
    items.push(item);
  }
  return items;
}

export function shouldLoadMemePage(loadedPages: readonly number[], page: number): boolean {
  return !loadedPages.includes(page);
}

export function memePageHasMore(pageSize: number, expectedSize = MEME_PAGE_SIZE): boolean {
  return pageSize >= expectedSize;
}

export function shouldRequestMemePage(state: { reachedEnd: boolean; loading: boolean; hasMore: boolean }): boolean {
  return state.reachedEnd && !state.loading && state.hasMore;
}

export function pageMemes<T>(items: readonly T[], page: number, pageSize = MEME_PAGE_SIZE): T[] {
  const start = Math.max(0, Math.floor(page - 1)) * pageSize;
  return items.slice(start, start + pageSize);
}
