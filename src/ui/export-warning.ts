export function exportOverwriteWarning(outputPath: string | null, fileExists: boolean | null, complete: boolean): string | null {
  if (!outputPath || !fileExists || complete) return null;
  return "같은 이름의 파일이 있어요. 내보내면 덮어써요.";
}
