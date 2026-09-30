/*
 * Allowed upload file types. These MIRROR THE BACKEND — keep them in sync with
 * `_ALLOWED_VIDEO_EXTS` in apps/movies/views.py and apps/marketplace/views.py,
 * and the copyright-document types accepted by the resubmit endpoint.
 * `accept` attributes are only a hint; always check with hasAllowedExtension().
 */

export const ALLOWED_VIDEO_EXTENSIONS: readonly string[] = ['.mp4', '.mov', '.avi', '.mkv'];
export const VIDEO_ACCEPT = '.mp4,.mov,.avi,.mkv,video/mp4,video/quicktime,video/x-msvideo,video/x-matroska';

export const ALLOWED_DOCUMENT_EXTENSIONS: readonly string[] = ['.pdf', '.jpg', '.jpeg', '.png'];
export const DOCUMENT_ACCEPT = '.pdf,.jpg,.jpeg,.png';

/** Case-insensitive extension check on the file name (the MIME type isn't reliable). */
export function hasAllowedExtension(fileName: string, allowed: readonly string[]): boolean {
  const dot = fileName.lastIndexOf('.');
  if (dot < 0) return false;
  return allowed.includes(fileName.slice(dot).toLowerCase());
}

/** ".mp4, .mov, .avi, .mkv" — for translated "allowed types" messages. */
export function extensionList(allowed: readonly string[]): string {
  return allowed.join(', ');
}
