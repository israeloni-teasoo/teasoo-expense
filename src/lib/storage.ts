import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { DomainError } from "./errors";

/**
 * Receipts are kept out of the database. The database stores metadata and a storage key;
 * the bytes live in object storage. The local driver writes to a private directory that is
 * never served statically — files are only reachable through the authenticated
 * /api/documents/[id] route, which checks access on every request.
 *
 * To move to S3 / Cloudflare R2 / Supabase Storage, implement StorageDriver and select it
 * with STORAGE_DRIVER.
 */
export interface StorageDriver {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  exists(key: string): Promise<boolean>;
  /** A short-lived URL the browser can fetch directly, or null to stream through the app. */
  signedUrl?(key: string, opts: { expiresIn: number; downloadName?: string }): Promise<string | null>;
}

class LocalDriver implements StorageDriver {
  constructor(private root: string) {}
  private resolve(key: string) {
    const full = path.resolve(this.root, key);
    if (!full.startsWith(path.resolve(this.root) + path.sep)) throw new Error("Invalid storage key");
    return full;
  }
  async put(key: string, data: Buffer) {
    const full = this.resolve(key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, data, { mode: 0o600 });
  }
  async get(key: string) {
    return readFile(this.resolve(key));
  }
  async exists(key: string) {
    try {
      await stat(this.resolve(key));
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Supabase Storage (private bucket) via its REST API, authenticated with the service-role key,
 * which must only ever live on the server. https://supabase.com/docs/reference/api/storage
 */
class SupabaseDriver implements StorageDriver {
  constructor(
    private url: string,
    private key: string,
    private bucket: string,
  ) {}
  private headers(extra: Record<string, string> = {}) {
    return { Authorization: `Bearer ${this.key}`, apikey: this.key, ...extra };
  }
  private objectPath(key: string) {
    return `${this.url}/storage/v1/object/${this.bucket}/${key.split("/").map(encodeURIComponent).join("/")}`;
  }
  async put(key: string, data: Buffer, contentType: string) {
    const res = await fetch(this.objectPath(key), {
      method: "POST",
      headers: this.headers({ "Content-Type": contentType, "x-upsert": "false", "cache-control": "max-age=3600" }),
      body: new Uint8Array(data),
    });
    if (!res.ok) throw new Error(`Supabase upload failed (${res.status}): ${await res.text()}`);
  }
  async get(key: string) {
    const res = await fetch(this.objectPath(key).replace("/object/", "/object/authenticated/"), { headers: this.headers() });
    if (!res.ok) throw new Error(`Supabase download failed (${res.status})`);
    return Buffer.from(await res.arrayBuffer());
  }
  async exists(key: string) {
    const res = await fetch(this.objectPath(key).replace("/object/", "/object/info/"), { headers: this.headers() });
    return res.ok;
  }
  async signedUrl(key: string, opts: { expiresIn: number; downloadName?: string }) {
    const res = await fetch(this.objectPath(key).replace("/object/", "/object/sign/"), {
      method: "POST",
      headers: this.headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({ expiresIn: opts.expiresIn }),
    });
    if (!res.ok) throw new Error(`Supabase sign failed (${res.status})`);
    const { signedURL } = (await res.json()) as { signedURL: string };
    const url = new URL(`${this.url}/storage/v1${signedURL}`);
    if (opts.downloadName) url.searchParams.set("download", opts.downloadName);
    return url.toString();
  }
}

/** Supabase when its keys are present (e.g. via the Vercel integration), local folder otherwise. */
export function storageDriverName() {
  return process.env.STORAGE_DRIVER || (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY ? "supabase" : "local");
}

let driver: StorageDriver | null = null;
export function storage(): StorageDriver {
  if (driver) return driver;
  const kind = storageDriverName();
  if (kind === "supabase") {
    const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("STORAGE_DRIVER=supabase requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
    driver = new SupabaseDriver(url, key, process.env.SUPABASE_STORAGE_BUCKET ?? "receipts");
  } else if (kind === "local") {
    driver = new LocalDriver(path.resolve(process.env.STORAGE_DIR ?? "./storage/uploads"));
  } else {
    throw new Error(`Unsupported STORAGE_DRIVER "${kind}"`);
  }
  return driver;
}

export const ALLOWED_TYPES: Record<string, { ext: string[]; label: string }> = {
  "image/jpeg": { ext: ["jpg", "jpeg"], label: "JPG" },
  "image/png": { ext: ["png"], label: "PNG" },
  "image/webp": { ext: ["webp"], label: "WebP" },
  "application/pdf": { ext: ["pdf"], label: "PDF" },
};
export const ACCEPT_ATTR = ".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf";

/** Detect the real file type from its leading bytes rather than trusting the browser. */
export function sniffType(buf: Buffer): string | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.length >= 12 && buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  if (buf.length >= 5 && buf.subarray(0, 5).toString("ascii") === "%PDF-") return "application/pdf";
  return null;
}

export type StoredFile = { fileName: string; fileType: string; fileSize: number; storageKey: string };

export function cleanFileName(name: string) {
  const base = path.basename(name).replace(/[^\w.\- ()]+/g, "_").slice(-120);
  return base || "file";
}

/** Validate and store an uploaded file. Throws a DomainError on invalid input. */
export async function storeUpload(file: File, maxMb: number): Promise<StoredFile> {
  if (!file || file.size === 0) throw new DomainError("The selected file is empty.", "VALIDATION");
  if (file.size > maxMb * 1024 * 1024) throw new DomainError(`"${file.name}" is larger than ${maxMb} MB.`, "VALIDATION");
  const buf = Buffer.from(await file.arrayBuffer());
  const type = sniffType(buf);
  if (!type || !ALLOWED_TYPES[type]) {
    throw new DomainError(`"${file.name}" is not a supported file. Upload a JPG, PNG, WebP or PDF.`, "VALIDATION");
  }
  const ext = ALLOWED_TYPES[type].ext[0];
  const now = new Date();
  const key = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${randomUUID()}.${ext}`;
  await storage().put(key, buf, type);
  return { fileName: cleanFileName(file.name), fileType: type, fileSize: buf.length, storageKey: key };
}

export function filesFrom(formData: FormData, field: string): File[] {
  return formData
    .getAll(field)
    .filter((v): v is File => typeof v === "object" && v !== null && "arrayBuffer" in v && (v as File).size > 0);
}

