const MAX_EDGE = 1280;
const JPEG_QUALITY = 0.82;

export interface PreparedPhoto {
  /** base64 payload without the data-URL prefix, for the API */
  base64: string;
  mediaType: "image/jpeg";
  /** full data URL for on-screen display */
  dataUrl: string;
}

/** Downscale and re-encode a photo so the upload stays small. */
export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable in this browser.");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  return {
    base64: dataUrl.slice(dataUrl.indexOf(",") + 1),
    mediaType: "image/jpeg",
    dataUrl,
  };
}
