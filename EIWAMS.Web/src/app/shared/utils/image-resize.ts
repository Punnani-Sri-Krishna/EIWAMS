/** Client-side photo processing for employee photos (contract §5.5). No camera, no upload storage. */

export const PHOTO_MAX_DIMENSION = 600;
export const PHOTO_MAX_BYTES = 1_048_576;
export const PHOTO_JPEG_QUALITY = 0.85;
/** Source files larger than this are rejected before decoding (keeps the browser responsive). */
export const PHOTO_SOURCE_MAX_BYTES = 15 * 1_048_576;
export const PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp';

export interface ProcessedPhoto {
  photoContentType: 'image/jpeg';
  /** Raw base64 without the `data:` prefix (as the API expects). */
  photoBase64: string;
  /** `data:image/jpeg;base64,...` for previews. */
  dataUrl: string;
  sizeBytes: number;
  width: number;
  height: number;
}

export interface SquareCrop {
  sx: number;
  sy: number;
  size: number;
  target: number;
}

/** Returns an error message when the selected file cannot be used, else null. */
export function validatePhotoFile(file: Pick<File, 'type' | 'size'> | null | undefined): string | null {
  if (!file) return 'Choose a photo.';
  if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) return 'Use a JPEG, PNG or WebP image.';
  if (file.size <= 0) return 'The selected file is empty.';
  if (file.size > PHOTO_SOURCE_MAX_BYTES) return 'The selected image is too large (max 15 MB before resizing).';
  return null;
}

/** Centred square crop of a `width` x `height` image, scaled down (never up) to at most `max` pixels. */
export function computeSquareCrop(width: number, height: number, max = PHOTO_MAX_DIMENSION): SquareCrop {
  if (!(width > 0) || !(height > 0)) throw new Error('Invalid image dimensions.');
  const size = Math.min(width, height);
  return {
    sx: Math.floor((width - size) / 2),
    sy: Math.floor((height - size) / 2),
    size,
    target: Math.min(size, max),
  };
}

/** Decoded byte length of a base64 string (ignores an optional data-URL prefix). */
export function base64ByteLength(base64: string): number {
  const raw = stripDataUrl(base64).replace(/\s/g, '');
  if (!raw) return 0;
  const padding = raw.endsWith('==') ? 2 : raw.endsWith('=') ? 1 : 0;
  return Math.floor((raw.length * 3) / 4) - padding;
}

export function stripDataUrl(value: string): string {
  const comma = value.indexOf(',');
  return value.startsWith('data:') && comma > 0 ? value.slice(comma + 1) : value;
}

export function toDataUrl(contentType: string | null | undefined, base64: string | null | undefined): string | null {
  return base64 ? `data:${contentType || 'image/jpeg'};base64,${stripDataUrl(base64)}` : null;
}

/** Crops to a centred square, resizes to <= 600x600 and encodes as JPEG (quality 0.85). Rejects if > 1 MB. */
export async function processPhoto(file: File): Promise<ProcessedPhoto> {
  const invalid = validatePhotoFile(file);
  if (invalid) throw new Error(invalid);
  const image = await loadImage(file);
  const crop = computeSquareCrop(image.naturalWidth || image.width, image.naturalHeight || image.height);
  const canvas = document.createElement('canvas');
  canvas.width = crop.target;
  canvas.height = crop.target;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Image processing is not supported by this browser.');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, crop.target, crop.target);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, crop.sx, crop.sy, crop.size, crop.size, 0, 0, crop.target, crop.target);
  const dataUrl = canvas.toDataURL('image/jpeg', PHOTO_JPEG_QUALITY);
  const photoBase64 = stripDataUrl(dataUrl);
  const sizeBytes = base64ByteLength(photoBase64);
  if (sizeBytes > PHOTO_MAX_BYTES) throw new Error('The processed photo is larger than 1 MB. Try a simpler image.');
  return { photoContentType: 'image/jpeg', photoBase64, dataUrl, sizeBytes, width: crop.target, height: crop.target };
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('The selected file could not be read as an image.'));
    };
    img.src = url;
  });
}
