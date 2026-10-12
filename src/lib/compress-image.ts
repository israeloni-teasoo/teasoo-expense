/**
 * Browser-side downscaling of photo receipts before upload. Phone photos are often 3–8 MB;
 * re-encoding to a ≤2000px JPEG keeps them legible at a few hundred KB, well under the
 * 4.5 MB request limit on Vercel and the storage free tier.
 */
const MAX_DIMENSION = 2000;
const COMPRESS_ABOVE_BYTES = 900 * 1024;

export async function compressImage(file: File): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size <= COMPRESS_ABOVE_BYTES) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.fillStyle = "#fff"; // PNG transparency → white, like paper
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
    if (!blob || blob.size >= file.size) return file;
    const name = file.name.replace(/\.(png|webp|jpe?g)$/i, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg", lastModified: file.lastModified });
  } catch {
    return file;
  }
}

/** Replace every image File in a FormData with a compressed copy. */
export async function compressFormData(fd: FormData): Promise<FormData> {
  const out = new FormData();
  for (const [key, value] of fd.entries()) {
    if (typeof value === "object" && value instanceof File && value.size > 0) out.append(key, await compressImage(value));
    else out.append(key, value);
  }
  return out;
}
