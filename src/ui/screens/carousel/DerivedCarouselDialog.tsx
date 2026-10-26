import { useEffect, useState } from "react";
import type { Carousel } from "../../../core/carousel";
import { ActionButton } from "../../../../seed-design/ui/action-button";
import { DialogRoot, DialogContent, DialogBody, DialogFooter } from "../../../../seed-design/ui/dialog";
import { api } from "../../api";

type Aspect = "4:5" | "1:1" | "9:16" | "16:9";

export function DerivedCarouselDialog(props: { open: boolean; projectId: string; onClose: () => void; onCreated: (carousel: Carousel) => void; onError: (message: string) => void }) {
  const [count, setCount] = useState(5);
  const [aspect, setAspect] = useState<Aspect>("4:5");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!props.open) return;
    setCount(5);
    void api<{ aspect: Aspect }>("GET", "/api/system/image-options").then(options => setAspect(options.aspect)).catch(error => props.onError(message(error)));
  }, [props.open]);
  async function create() {
    setBusy(true);
    try {
      const result = await api<{ carousel: Carousel }>("POST", `/api/projects/${encodeURIComponent(props.projectId)}/carousel`, { count, aspect });
      props.onClose();
      props.onCreated(result.carousel);
    } catch (error) { props.onError(message(error)); }
    finally { setBusy(false); }
  }
  return <DialogRoot open={props.open} onOpenChange={open => { if (!open) props.onClose(); }}><DialogContent title="캐러셀 만들기" description="장 수와 비율을 정해 주세요." showCloseButton>
    <DialogBody><div className="carousel-create-fields">
      <label className="carousel-count">장 수 <select aria-label="장 수" value={count} onChange={event => setCount(Number(event.target.value))}>{Array.from({ length: 9 }, (_, index) => index + 2).map(value => <option key={value} value={value}>{value}장</option>)}</select></label>
      <label className="carousel-count">비율 <select aria-label="비율" value={aspect} onChange={event => setAspect(event.target.value as Aspect)}><option value="4:5">4:5</option><option value="1:1">1:1</option><option value="9:16">9:16</option><option value="16:9">16:9</option></select></label>
    </div></DialogBody><DialogFooter><ActionButton variant="neutralWeak" onClick={props.onClose}>취소</ActionButton><ActionButton variant="brandSolid" disabled={busy} loading={busy} onClick={() => void create()}>만들기</ActionButton></DialogFooter>
  </DialogContent></DialogRoot>;
}
function message(error: unknown) { return error instanceof Error ? error.message : String(error); }
