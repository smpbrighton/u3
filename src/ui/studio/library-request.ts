export interface DebouncedSearch {
  (query: string): void;
  cancel: () => void;
}

export function debounceSearch(callback: (query: string) => void, delayMs: number): DebouncedSearch {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const schedule = ((query: string) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => callback(query), delayMs);
  }) as DebouncedSearch;
  schedule.cancel = () => {
    if (timeout) clearTimeout(timeout);
  };
  return schedule;
}

export function createLatestRequestGuard() {
  let latest = 0;
  return {
    next: () => ++latest,
    isCurrent: (request: number) => request === latest,
  };
}

export function createAbortableRequestGuard() {
  let latest = 0;
  let controller: AbortController | undefined;
  return {
    begin() {
      controller?.abort();
      controller = new AbortController();
      const request = ++latest;
      return {
        signal: controller.signal,
        isCurrent: () => request === latest && !controller?.signal.aborted,
      };
    },
  };
}
