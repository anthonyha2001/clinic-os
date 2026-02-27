import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";
import { pgClient } from "@/db/index";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const ALLOWED_EXT = ["jpg", "jpeg", "png", "webp", "gif"];

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const POST = withAuth(async (request, { user }) => {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const patientId = (formData.get("patient_id") as string)?.trim();

    if (!file || !patientId) {
      return NextResponse.json({ error: "file and patient_id required" }, { status: 422 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "File size must be under 10MB" }, { status: 422 });
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: "File must be JPEG, PNG, WebP, or GIF" }, { status: 422 });
    }
    const ext = (file.name.split(".").pop() ?? "").toLowerCase();
    if (!ALLOWED_EXT.includes(ext)) {
      return NextResponse.json({ error: "Invalid file extension" }, { status: 422 });
    }

    const [patient] = await pgClient`
      SELECT id FROM patients
      WHERE id = ${patientId} AND organization_id = ${user.organizationId}
      LIMIT 1
    `;
    if (!patient) {
      return NextResponse.json({ error: "Patient not found" }, { status: 404 });
    }

    const path = `${user.organizationId}/${patientId}/${Date.now()}.${ext}`;

    const { error } = await supabase.storage
      .from("xrays")
      .upload(path, file, { contentType: file.type, upsert: false });

    if (error) {
      return NextResponse.json({ error: "Upload failed" }, { status: 500 });
    }

    const { data: { publicUrl } } = supabase.storage.from("xrays").getPublicUrl(path);
    return NextResponse.json({ url: publicUrl, path, name: file.name });
  } catch {
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
});