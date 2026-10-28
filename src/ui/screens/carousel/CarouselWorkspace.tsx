import { CarouselReview, type WorkspaceProps } from "./CarouselReview";
import { CarouselEdit } from "./CarouselEdit";

export function CarouselWorkspace(props: WorkspaceProps) {
  return props.carousel.stage === "review" ? <CarouselReview {...props} /> : <CarouselEdit {...props} />;
}
