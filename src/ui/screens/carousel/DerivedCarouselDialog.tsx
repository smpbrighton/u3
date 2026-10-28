import type { Carousel } from "../../../core/carousel";
import { NewCarouselDialog } from "./NewCarouselDialog";

/** 영상 목록·스튜디오의 기존 prop 경로를 유지한다. */
export function DerivedCarouselDialog(props: { open: boolean; projectId: string; onClose: () => void; onCreated: (carousel: Carousel) => void; onError: (message: string) => void }) {
  return <NewCarouselDialog open={props.open} initialProjectId={props.projectId} onClose={props.onClose} onCreated={props.onCreated} onError={props.onError} />;
}
