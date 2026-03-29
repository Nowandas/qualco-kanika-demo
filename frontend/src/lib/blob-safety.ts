const SAFE_INLINE_MIME = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

const BLOCKED_MIME = new Set([
  "text/html",
  "application/xhtml+xml",
  "application/javascript",
  "text/javascript",
  "application/ecmascript",
  "text/ecmascript",
  "image/svg+xml",
]);

export type BlobOpenResult = "opened" | "downloaded" | "blocked";

function normalizedMime(contentType: string | null | undefined): string {
  return String(contentType ?? "")
    .split(";")[0]
    .trim()
    .toLowerCase();
}

export function openBlobSafely(blob: Blob, downloadName: string): BlobOpenResult {
  const mime = normalizedMime(blob.type);
  if (BLOCKED_MIME.has(mime)) {
    return "blocked";
  }

  const url = window.URL.createObjectURL(blob);

  if (SAFE_INLINE_MIME.has(mime)) {
    window.open(url, "_blank", "noopener,noreferrer");
    window.setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
    return "opened";
  }

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = downloadName;
  anchor.rel = "noopener noreferrer";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => window.URL.revokeObjectURL(url), 1_000);
  return "downloaded";
}
