import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const POST = withAuth(async (request, { user }) => {
  const formData = await request.formData();
  const file = formData.get("file") as File;
  const patientId = formData.get("patient_id") as string;

  if (!file || !patientId) {
    return NextResponse.json({ error: "file and patient_id required" }, { status: 422 });
  }

  const ext = file.name.split(".").pop();
  const path = `${user.organizationId}/${patientId}/${Date.now()}.${ext}`;

  const { data, error } = await supabase.storage
    .from("xrays")
    .upload(path, file, { contentType: file.type, upsert: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: { publicUrl } } = supabase.storage.from("xrays").getPublicUrl(path);

  return NextResponse.json({ url: publicUrl, path, name: file.name });
});