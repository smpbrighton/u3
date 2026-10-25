import { describe, expect, it, vi } from "vitest";
import { MEME_PAGE_SIZE, canMemePreviewPlay, memePreviewPreload, memePreviewSource, mergeMemePages, pageMemes, shouldLoadMemePage } from "../../src/ui/studio/library-window";
import { debounceSearch, createLatestRequestGuard } from "../../src/ui/studio/library-request";

describe("studio library loading", () => {
  it("creates only one bounded page at a time and advances without skipping items", () => {
    const items = Array.from({ length: 2195 }, (_, index) => index);
    const first = pageMemes(items, 1);
    const second = pageMemes(items, 2);

    expect(MEME_PAGE_SIZE).toBeGreaterThan(0);
    expect(first).toHaveLength(MEME_PAGE_SIZE);
    expect(second).toHaveLength(MEME_PAGE_SIZE);
    expect(first.length).toBeLessThan(2195);
    expect(first.at(-1)! + 1).toBe(second[0]);
  });

  it("assigns a meme video source only while its cell is visible", () => {
    expect(memePreviewSource("/meme.mp4", false)).toBeUndefined();
    expect(memePreviewSource("/meme.mp4", true)).toBe("/meme.mp4");
    expect(memePreviewPreload(true)).toBe("metadata");
    expect(memePreviewPreload(false)).toBe("none");
    expect(canMemePreviewPlay("a", "a", true)).toBe(true);
    expect(canMemePreviewPlay("a", null, true)).toBe(false);
    expect(canMemePreviewPlay("a", "b", true)).toBe(false);
    expect(canMemePreviewPlay("a", "a", false)).toBe(false);
  });

  it("페이지를 다시 받아도 짤 id를 중복 병합하지 않고 이미 받은 페이지는 건너뛴다", () => {
    const first = mergeMemePages([], [{ id: "a" }, { id: "b" }], 1);
    const second = mergeMemePages(first, [{ id: "c" }], 2);

    expect(mergeMemePages(second, [{ id: "c" }], 2).map((item) => item.id)).toEqual(["a", "b", "c"]);
    expect(shouldLoadMemePage([1, 2], 2)).toBe(false);
    expect(shouldLoadMemePage([1, 2], 3)).toBe(true);
  });

  it("검색 입력은 debounce 뒤 한 번만 실행한다", () => {
    vi.useFakeTimers();
    const search = vi.fn();
    const schedule = debounceSearch(search, 250);

    schedule("웃");
    vi.advanceTimersByTime(150);
    schedule("웃음");
    vi.advanceTimersByTime(249);
    expect(search).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(search).toHaveBeenCalledOnce();
    expect(search).toHaveBeenCalledWith("웃음");
    vi.useRealTimers();
  });

  it("이전 요청 응답은 최신 요청으로 인정하지 않는다", () => {
    const requests = createLatestRequestGuard();
    const previous = requests.next();
    const current = requests.next();

    expect(requests.isCurrent(previous)).toBe(false);
    expect(requests.isCurrent(current)).toBe(true);
  });
});
