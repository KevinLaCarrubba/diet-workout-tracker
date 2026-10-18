export const MAX_PHOTO_EDGE = 1600;
export const PHOTO_JPEG_QUALITY = 0.82;

/** Scales (width, height) down so the longer edge is at most `max`; never upscales. */
export function fitWithin(width: number, height: number, max = MAX_PHOTO_EDGE) {
  if (width <= 0 || height <= 0) throw new Error('Image has no size');
  const scale = Math.min(1, max / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

async function decode(file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { source: bitmap, width: bitmap.width, height: bitmap.height };
    } catch {
      // Fall through to <img>, which some browsers decode more formats with.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Re-encodes a photo as JPEG with the long edge capped at 1600px. Re-encoding
 * through a canvas also drops EXIF metadata such as GPS location.
 */
export async function resizeImage(
  file: Blob,
  max = MAX_PHOTO_EDGE,
  quality = PHOTO_JPEG_QUALITY,
): Promise<Blob> {
  let decoded;
  try {
    decoded = await decode(file);
  } catch {
    throw new Error("This photo format can't be read here. Try a JPEG or PNG.");
  }
  const size = fitWithin(decoded.width, decoded.height, max);
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not prepare the photo');
  ctx.drawImage(decoded.source, 0, 0, size.width, size.height);
  if ('close' in decoded.source && typeof decoded.source.close === 'function') decoded.source.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not prepare the photo'))),
      'image/jpeg',
      quality,
    ),
  );
}
