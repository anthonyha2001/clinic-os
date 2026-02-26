import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { pgClient } from "@/db/index";

export const GET = withAuth(
  { roles: ["admin", "manager"] },
  async (_request, { user }) => {
    try {
      const [row] = await pgClient`
        SELECT
          no_show_risk_threshold,
          deposit_required_above_risk,
          inactivity_days_warning,
          inactivity_days_critical,
          large_discount_threshold_percent
        FROM policy_settings
        WHERE organization_id = ${user.organizationId}
      `;

      if (!row) {
        return NextResponse.json({
          noShowRiskThreshold: 3,
          depositRequiredAboveRisk: true,
          inactivityDaysWarning: 60,
          inactivityDaysCritical: 90,
          largeDiscountThresholdPercent: 20,
        });
      }

      return NextResponse.json({
        noShowRiskThreshold: Number((row as Record<string, unknown>).no_show_risk_threshold) ?? 3,
        depositRequiredAboveRisk: Boolean((row as Record<string, unknown>).deposit_required_above_risk),
        inactivityDaysWarning: Number((row as Record<string, unknown>).inactivity_days_warning) ?? 60,
        inactivityDaysCritical: Number((row as Record<string, unknown>).inactivity_days_critical) ?? 90,
        largeDiscountThresholdPercent:
          Number((row as Record<string, unknown>).large_discount_threshold_percent) ?? 20,
      });
    } catch (e) {
      console.error("GET /api/settings/policy error:", e);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }
  }
);

export const PATCH = withAuth(
  { roles: ["admin", "manager"] },
  async (request, { user }) => {
    try {
      const body = await request.json();

      const noShowRiskThreshold =
        body.no_show_risk_threshold !== undefined
          ? parseInt(String(body.no_show_risk_threshold), 10)
          : undefined;
      const depositRequiredAboveRisk =
        typeof body.deposit_required_above_risk === "boolean"
          ? body.deposit_required_above_risk
          : undefined;
      const inactivityDaysWarning =
        body.inactivity_days_warning !== undefined
          ? parseInt(String(body.inactivity_days_warning), 10)
          : undefined;
      const inactivityDaysCritical =
        body.inactivity_days_critical !== undefined
          ? parseInt(String(body.inactivity_days_critical), 10)
          : undefined;
      const largeDiscountThresholdPercent =
        body.large_discount_threshold_percent !== undefined
          ? parseInt(String(body.large_discount_threshold_percent), 10)
          : undefined;

      if (
        inactivityDaysCritical !== undefined &&
        inactivityDaysWarning !== undefined &&
        inactivityDaysCritical <= inactivityDaysWarning
      ) {
        return NextResponse.json(
          { error: "Critical days must be greater than warning days" },
          { status: 422 }
        );
      }

      const [upserted] = await pgClient`
        INSERT INTO policy_settings (
          organization_id,
          no_show_risk_threshold,
          deposit_required_above_risk,
          inactivity_days_warning,
          inactivity_days_critical,
          large_discount_threshold_percent,
          updated_by
        )
        VALUES (
          ${user.organizationId},
          ${noShowRiskThreshold ?? 3},
          ${depositRequiredAboveRisk ?? true},
          ${inactivityDaysWarning ?? 60},
          ${inactivityDaysCritical ?? 90},
          ${largeDiscountThresholdPercent ?? 20},
          ${user.id}
        )
        ON CONFLICT (organization_id) DO UPDATE SET
          no_show_risk_threshold = COALESCE(${noShowRiskThreshold ?? null}, policy_settings.no_show_risk_threshold),
          deposit_required_above_risk = COALESCE(${depositRequiredAboveRisk ?? null}, policy_settings.deposit_required_above_risk),
          inactivity_days_warning = COALESCE(${inactivityDaysWarning ?? null}, policy_settings.inactivity_days_warning),
          inactivity_days_critical = COALESCE(${inactivityDaysCritical ?? null}, policy_settings.inactivity_days_critical),
          large_discount_threshold_percent = COALESCE(${largeDiscountThresholdPercent ?? null}, policy_settings.large_discount_threshold_percent),
          updated_at = now(),
          updated_by = ${user.id}
        RETURNING
          no_show_risk_threshold,
          deposit_required_above_risk,
          inactivity_days_warning,
          inactivity_days_critical,
          large_discount_threshold_percent
      `;

      const r = upserted as Record<string, unknown>;
      return NextResponse.json({
        noShowRiskThreshold: Number(r.no_show_risk_threshold),
        depositRequiredAboveRisk: Boolean(r.deposit_required_above_risk),
        inactivityDaysWarning: Number(r.inactivity_days_warning),
        inactivityDaysCritical: Number(r.inactivity_days_critical),
        largeDiscountThresholdPercent: Number(r.large_discount_threshold_percent),
      });
    } catch (e) {
      console.error("PATCH /api/settings/policy error:", e);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }
  }
);
