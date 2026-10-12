/* Creates the private receipts bucket in Supabase Storage. Run once: `npm run storage:setup`. */
import "dotenv/config";

async function main() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? "receipts";
  if (!url || !key) throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.");
  const res = await fetch(`${url}/storage/v1/bucket`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify({
      id: bucket,
      name: bucket,
      public: false, // receipts are only reachable through the app's access-checked signed URLs
      file_size_limit: 10 * 1024 * 1024,
      allowed_mime_types: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
    }),
  });
  const body = await res.text();
  if (res.ok) console.log(`Created private bucket "${bucket}".`);
  else if (/already exists|Duplicate/i.test(body)) console.log(`Bucket "${bucket}" already exists.`);
  else throw new Error(`Supabase responded ${res.status}: ${body}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
