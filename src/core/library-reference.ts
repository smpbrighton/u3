export const LIBRARY_REFERENCE_PREFIX = "u3-library:";

function normalizedRelativePath(value: string): string | null {
  const normalized = value.replaceAll("\\", "/").replace(/^\/+/, "");
  if (!normalized || normalized.includes("\0") || normalized.split("/").some(part => !part || part === "." || part === "..")) return null;
  return normalized;
}

export function createLibraryReference(relativePath: string): string {
  const normalized = normalizedRelativePath(relativePath);
  if (!normalized) throw new RangeError("라이브러리 경로가 올바르지 않습니다");
  return `${LIBRARY_REFERENCE_PREFIX}${normalized}`;
}

export function libraryReferencePath(value: string): string | null {
  if (!value.startsWith(LIBRARY_REFERENCE_PREFIX)) return null;
  return normalizedRelativePath(value.slice(LIBRARY_REFERENCE_PREFIX.length));
}

export function migrateLibraryReference(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(url.hostname)) return null;
  const prefix = "/api/media/library/";
  if (!url.pathname.startsWith(prefix)) return null;
  let relative: string;
  try {
    relative = url.pathname.slice(prefix.length).split("/").map(segment => decodeURIComponent(segment)).join("/");
  } catch {
    return null;
  }
  try {
    return createLibraryReference(relative);
  } catch {
    return null;
  }
}
