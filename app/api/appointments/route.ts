import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAppointmentSchema } from "@/lib/validations/appointment";
import { createAppointment } from "@/lib/services/appointments/create";
import { listAppointments } from "@/lib/services/appointments/list";
import { withAuth } from "@/lib/auth";

const listQuerySchema = z.object({
  start_date: z.string(),
  end_date: z.string(),
});

export const GET = withAuth(async (request: NextRequest, { user }) => {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = listQuerySchema.safeParse({
      start_date: searchParams.get("start_date"),
      end_date: searchParams.get("end_date"),
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: "start_date and end_date required" },
        { status: 422 }
      );
    }

    const start = new Date(parsed.data.start_date);
    const end = new Date(parsed.data.end_date);
    if (end.getTime() <= start.getTime()) {
      return NextResponse.json(
        { error: "end_date must be after start_date" },
        { status: 422 }
      );
    }

    const appointments = await listAppointments({
      orgId: user.organizationId,
      startDate: parsed.data.start_date,
      endDate: parsed.data.end_date,
    });

    return NextResponse.json(appointments);
  } catch (e) {
    console.error("GET /api/appointments error:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
});

export const POST = withAuth(async (request: NextRequest, { user }) => {
  try {
    const body = await request.json();
    const parsed = createAppointmentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.issues },
        { status: 422 }
      );
    }
    const appointment = await createAppointment(
      parsed.data,
      user.id,
      user.organizationId
    );
    return NextResponse.json(appointment, { status: 201 });
  } catch (e: unknown) {
    const err = e as Error & { statusCode?: number };
    const statusCode = err.statusCode ?? 500;
    if (statusCode === 404) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    if (statusCode === 409) {
      return NextResponse.json({ error: err.message, conflict: true }, { status: 409 });
    }
    if (statusCode === 422) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    console.error("POST /api/appointments error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
});
