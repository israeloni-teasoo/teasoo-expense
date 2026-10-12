"use client";

/**
 * Receipt OCR with Tesseract.js, entirely in the browser: the photo never leaves the device
 * for scanning, and there is no API key or per-scan cost. The library, its WebAssembly core and
 * the English language model (a few MB, cached by the browser) load on first use only.
 */
import type { Worker } from "tesseract.js";

let workerPromise: Promise<Worker> | null = null;
let progressListener: ((p: number) => void) | null = null;

async function getWorker() {
  if (!workerPromise) {
    workerPromise = import("tesseract.js").then(({ createWorker }) =>
      createWorker("eng", 1, {
        logger: (m: { status: string; progress: number }) => {
          if (m.status === "recognizing text") progressListener?.(m.progress);
        },
      }),
    );
    workerPromise.catch(() => {
      workerPromise = null;
    });
  }
  return workerPromise;
}

/** Downscale/grey the photo a little — faster and usually more accurate than the raw camera image. */
async function prepare(file: File): Promise<HTMLCanvasElement | File> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.filter = "grayscale(1) contrast(1.2)";
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return canvas;
  } catch {
    return file;
  }
}

export async function readReceipt(file: File, onProgress?: (p: number) => void): Promise<string> {
  progressListener = onProgress ?? null;
  try {
    const worker = await getWorker();
    const { data } = await worker.recognize(await prepare(file));
    return data.text ?? "";
  } finally {
    progressListener = null;
  }
}

export function canScan(file: File) {
  return /^image\/(jpeg|png|webp)$/.test(file.type);
}
