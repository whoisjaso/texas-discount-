/** A signing sheet must contain its real content, including every image. */
export function isSigningSheetReady(sheet: HTMLElement | null): boolean {
  if (!sheet?.firstElementChild) return false;
  const markers = sheet.querySelectorAll<HTMLElement>("[data-sign-ready]");
  if (Array.from(markers).some((marker) => marker.dataset.signReady !== "true")) return false;
  return Array.from(sheet.querySelectorAll("img")).every((image) => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0);
}
