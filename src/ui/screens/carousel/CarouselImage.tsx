import { useEffect, useState } from "react";
import { carouselFileUrl } from "../../api";

export function useCarouselFile(carouselId: string, file: string | undefined) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let live = true; setUrl("");
    if (file) void carouselFileUrl(carouselId, file).then(value => { if (live) setUrl(value); }).catch(() => undefined);
    return () => { live = false; };
  }, [carouselId, file]);
  return url;
}
export function CarouselImage({ carouselId, file }: { carouselId: string; file: string }) {
  const url = useCarouselFile(carouselId, file);
  return url ? <img src={url} alt="" className="h-full w-full object-cover" /> : null;
}
