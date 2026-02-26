/**
 * Create the xrays storage bucket in Supabase (public bucket for X-ray images).
 * Run: npx tsx scripts/create-xrays-bucket.ts
 * Requires: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });
config(); // fallback to .env

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Add them to .env.local"
  );
  process.exit(1);
}

const supabase = createClient(url, serviceKey);

async function main() {
  const { data, error } = await supabase.storage.createBucket("xrays", {
    public: true,
    fileSizeLimit: "10MB",
    allowedMimeTypes: [
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
      "image/dicom",
    ],
  });

  if (error) {
    if (error.message?.includes("already exists") || error.message?.includes("duplicate")) {
      console.log("Bucket 'xrays' already exists.");
      return;
    }
    console.error("Failed to create bucket:", error.message);
    process.exit(1);
  }

  console.log("Bucket 'xrays' created successfully:", data);
}

main();
