import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { pgClient } from "@/db/index";
import { randomUUID } from "crypto";

// ─── GET /api/providers ───────────────────────────────────────────────────────
export const GET = withAuth(
  { roles: ["admin", "manager"] },
  async (request: NextRequest, { user }: { user: { organizationId: string } }) => {
    try {
      const compact = new URL(request.url).searchParams.get("compact") === "1";
      const rows = await pgClient`
        SELECT
          pp.id,
          pp.specialty_en,
          pp.bio_en,
          pp.color_hex,
          pp.is_accepting_appointments,
          u.full_name AS name,
          u.email
        FROM provider_profiles pp
        JOIN users u ON u.id = pp.user_id
        WHERE pp.organization_id = ${user.organizationId}
          AND u.is_active = true
        ORDER BY u.full_name ASC
      `;

      const providers = (rows as unknown as Record<string, unknown>[]).map((r) => ({
        id: r.id,
        name: r.name,
        email: r.email,
        specialtyEn: r.specialty_en,
        specialty_en: r.specialty_en,
        bioEn: r.bio_en,
        bio_en: r.bio_en,
        user: { full_name: r.name },
        color_hex: (r.color_hex as string) ?? "#3B82F6",
        colorHex: (r.color_hex as string) ?? "#3B82F6",
        isAcceptingAppointments: Boolean(r.is_accepting_appointments),
      }));

      if (compact) {
        return NextResponse.json(
          providers.map((p) => ({
            id: p.id,
            name: p.name,
            user: p.user,
            color_hex: p.color_hex,
            colorHex: p.colorHex,
            isAcceptingAppointments: p.isAcceptingAppointments,
          })),
          { headers: { "Cache-Control": "private, max-age=300, stale-while-revalidate=600" } }
        );
      }

      return NextResponse.json(providers, {
        headers: { "Cache-Control": "private, max-age=300, stale-while-revalidate=600" },
      });
    } catch (e) {
      console.error("GET /api/providers error:", e);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  }
);

// ─── POST /api/providers ──────────────────────────────────────────────────────
// Creates user account + assigns provider role + creates provider_profile
export const POST = withAuth(
  { roles: ["admin"] },
  async (request: NextRequest, { user }: { user: { organizationId: string; id: string } }) => {
    try {
      const body = await request.json();

      const email      = String(body?.email ?? "").trim().toLowerCase();
      const fullName   = String(body?.full_name ?? "").trim();
      const specialtyEn = String(body?.specialty_en ?? "").trim() || null;
      const bioEn      = String(body?.bio_en ?? "").trim() || null;
      const colorHex   = /^#[0-9A-Fa-f]{6}$/.test(body?.color_hex ?? "")
        ? body.color_hex
        : "#3B82F6";
      const isAccepting = body?.is_accepting_appointments !== false;

      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return NextResponse.json({ error: "Valid email is required" }, { status: 422 });
      }
      if (!fullName) {
        return NextResponse.json({ error: "Full name is required" }, { status: 422 });
      }

      // Check for duplicate email within org
      const [existing] = await pgClient`
        SELECT id FROM users
        WHERE organization_id = ${user.organizationId} AND email = ${email}
      `;
      if (existing) {
        return NextResponse.json(
          { error: "A user with this email already exists" },
          { status: 409 }
        );
      }

      // Get provider role for this org
      const [role] = await pgClient`
        SELECT id FROM roles
        WHERE organization_id = ${user.organizationId} AND name = 'provider'
      `;
      if (!role) {
        return NextResponse.json({ error: "Provider role not found in organization" }, { status: 404 });
      }

      const userId     = randomUUID();
      const profileId  = randomUUID();

      // 1. Create user
      await pgClient`
        INSERT INTO users (id, organization_id, email, full_name, is_active)
        VALUES (${userId}, ${user.organizationId}, ${email}, ${fullName}, true)
      `;

      // 2. Assign provider role
      await pgClient`
        INSERT INTO user_roles (user_id, role_id, assigned_by)
        VALUES (${userId}, ${role.id}, ${user.id})
      `;

      // 3. Create provider profile
      await pgClient`
        INSERT INTO provider_profiles (
          id, organization_id, user_id,
          specialty_en, bio_en, color_hex, is_accepting_appointments
        )
        VALUES (
          ${profileId}, ${user.organizationId}, ${userId},
          ${specialtyEn}, ${bioEn}, ${colorHex}, ${isAccepting}
        )
      `;

      return NextResponse.json(
        {
          id: profileId,
          name: fullName,
          email,
          specialtyEn,
          specialty_en: specialtyEn,
          bioEn,
          bio_en: bioEn,
          color_hex: colorHex,
          colorHex,
          isAcceptingAppointments: isAccepting,
          user: { full_name: fullName },
        },
        { status: 201 }
      );
    } catch (e) {
      console.error("POST /api/providers error:", e);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  }
);