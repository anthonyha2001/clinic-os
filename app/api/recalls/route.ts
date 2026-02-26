import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { getRecallList } from "@/lib/automation/handlers/recallEngine";
import { pgClient } from "@/db/index";

export const GET = withAuth(async (request, { user }) => {
  const recalls = await getRecallList(user.organizationId);
  return NextResponse.json(recalls);
});

export const PATCH = withAuth(async (request, { user }) => {
  const { id, status } = await request.json();
  const [updated] = await pgClient`
    UPDATE patient_recalls
    SET status = ${status}, updated_at = now()
    WHERE id = ${id} AND organization_id = ${user.organizationId}
    RETURNING *
  `;
  return NextResponse.json(updated);
});