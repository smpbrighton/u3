import { describe, expect, it, vi } from "vitest";
import { Carousel, newSlide } from "../../src/core/carousel";
import { api } from "../../src/ui/api";
import { useCarouselDraft } from "../../src/ui/screens/carousel/useCarouselDraft";

vi.mock("react", () => ({ useState: (value: unknown) => [value, vi.fn()], useRef: (value: unknown) => ({ current: value }), useEffect: () => undefined }));
vi.mock("../../src/ui/api", () => ({ api: vi.fn() }));
vi.mock("../../src/ui/update-save", () => ({ useBeforeUpdateRestart: () => undefined }));
function fixture() {
  return Carousel.parse({ id: "draft", name: "저장", topic: "주제", aspect: "4:5", source: { kind: "topic" }, stage: "images", slides: [newSlide({ kind: "topic" }, "4:5")], createdAt: "2026-10-28T00:00:00Z", savedAt: "2026-10-28T00:00:00Z" });
}
describe("캐러셀 미저장 입력", () => {
  it("앞선 저장 응답을 기다리는 동안 바뀐 글도 다음 PATCH에 저장한다", async () => {
    vi.mocked(api).mockReset();
    const value = fixture();
    let finish: (value: Carousel) => void = () => undefined;
    vi.mocked(api).mockImplementationOnce(() => new Promise(resolve => { finish = resolve as typeof finish; })).mockResolvedValue(value);
    const editor = useCarouselDraft(value, vi.fn());
    editor.changeSlide("slide-1", { imagePrompt: "첫 입력" });
    const first = editor.saveSlide("slide-1");
    await vi.waitFor(() => expect(api).toHaveBeenCalledTimes(1));
    editor.changeSlide("slide-1", { imagePrompt: "다음 입력" });
    const flush = editor.flush();
    finish(value); await first; await flush;
    expect(vi.mocked(api).mock.calls).toEqual([
      ["PATCH", "/api/carousels/draft/slides/slide-1", { imagePrompt: "첫 입력" }],
      ["PATCH", "/api/carousels/draft/slides/slide-1", { imagePrompt: "다음 입력" }],
    ]);
  });

  it("저장이 실패하면 입력을 보존하고 다음 저장 때 다시 보낸다", async () => {
    vi.mocked(api).mockReset();
    vi.mocked(api).mockRejectedValueOnce(new Error("연결 실패")).mockResolvedValue(fixture());
    const editor = useCarouselDraft(fixture(), vi.fn());
    editor.changeFields({ caption: "새 캡션" });
    await expect(editor.flush()).rejects.toThrow("연결 실패");
    await editor.flush();
    expect(api).toHaveBeenCalledTimes(2);
    expect(api).toHaveBeenLastCalledWith("PATCH", "/api/carousels/draft", { caption: "새 캡션" });
  });
});
