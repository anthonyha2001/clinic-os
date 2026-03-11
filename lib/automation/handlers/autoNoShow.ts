import { pgClient } from "@/db/index";
import { notifyNoShow } from "@/lib/notifications/notifyNoShow";

export async function autoMarkNoShows(orgId?: string) {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const appointments = await pgClient`
    SELECT
      a.id,
      a.status,
      a.start_time,
      a.end_time,
      a.patient_id,
      a.provider_id,
      a.organization_id,
      p.first_name,
      p.last_name,
      u_provider.id        AS provider_user_id,
      u_provider.full_name AS provider_name,
      s.name_en            AS service_name,
      org.name             AS clinic_name,
      org.slug             AS clinic_slug
    FROM appointments a
    JOIN patients          p          ON p.id  = a.patient_id
    JOIN provider_profiles pp         ON pp.id = a.provider_id
    JOIN users             u_provider ON u_provider.id = pp.user_id
    LEFT JOIN appointment_lines al    ON al.appointment_id = a.id
    LEFT JOIN services      s         ON s.id = al.service_id
    JOIN organizations      org       ON org.id = a.organization_id
    WHERE a.status IN ('scheduled', 'confirmed')
      AND a.end_time <= ${twentyFourHoursAgo.toISOString()}
      AND a.deleted_at IS NULL
      AND p.deleted_at IS NULL
      ${orgId ? pgClient` AND a.organization_id = ${orgId}` : pgClient``}
    ORDER BY a.end_time ASC
  `;

  let marked = 0;
  let failed = 0;

  for (const appt of appointments) {
    try {
      // 1. Mark as no_show
      await pgClient`
        UPDATE appointments
        SET status     = 'no_show',
            updated_at = now()
        WHERE id = ${appt.id}
      `;

      // 2. Insert status history entry
      await pgClient`
        INSERT INTO appointment_status_history
          (appointment_id, organization_id, previous_status, new_status, changed_by, note)
        VALUES
          (${appt.id}, ${appt.organization_id},
           ${(appt.status as string) ?? "scheduled"}, 'no_show',
           NULL, 'Auto-marked by system after 24h no-show')
      `;

      // 3. Recalculate patient risk score (60% all-time + 40% last 90 days)
      const [risk] = await pgClient`
        SELECT
          COUNT(*) FILTER (WHERE status = 'no_show')::float /
            NULLIF(COUNT(*) FILTER (WHERE status NOT IN ('canceled')), 0)
            AS overall_ratio,
          COUNT(*) FILTER (
            WHERE status = 'no_show'
              AND start_time >= now() - INTERVAL '90 days'
          )::float /
            NULLIF(COUNT(*) FILTER (
              WHERE status NOT IN ('canceled')
                AND start_time >= now() - INTERVAL '90 days'
            ), 0)
            AS recent_ratio
        FROM appointments
        WHERE patient_id        = ${appt.patient_id}
          AND organization_id   = ${appt.organization_id}
          AND deleted_at IS NULL
      `;

      const overall = Number(risk?.overall_ratio ?? 0);
      const recent  = Number(risk?.recent_ratio  ?? 0);
      const score   = Math.round((overall * 0.6 + recent * 0.4) * 100);

      await pgClient`
        INSERT INTO risk_scores (patient_id, organization_id, score, calculated_at)
        VALUES (${appt.patient_id}, ${appt.organization_id}, ${score}, now())
        ON CONFLICT (patient_id, organization_id)
        DO UPDATE SET score = ${score}, calculated_at = now()
      `;

      // 4. Build display strings
      const apptDate    = new Date(appt.start_time as string);
      const patientName = `${appt.first_name} ${appt.last_name}`.trim();
      const dateStr     = apptDate.toLocaleDateString("en", {
        weekday: "long", year: "numeric", month: "long", day: "numeric",
      });
      const timeStr = apptDate.toLocaleTimeString("en", {
        hour: "2-digit", minute: "2-digit",
      });

      // 5. Send in-app notifications + emails via unified notify helper
      await notifyNoShow({
        organizationId:  appt.organization_id as string,
        appointmentId:   appt.id as string,
        patientName,
        providerName:    appt.provider_name as string,
        providerUserId:  appt.provider_user_id as string,
        dateStr,
        timeStr,
        clinicName:      appt.clinic_name as string,
        patientId:       appt.patient_id as string,
      });

      // 6. Log the automation event
      await pgClient`
        INSERT INTO automation_events (
          organization_id, event_type, entity_type, entity_id,
          patient_id, payload, status, scheduled_for
        ) VALUES (
          ${appt.organization_id},
          'auto_no_show',
          'appointment',
          ${appt.id},
          ${appt.patient_id},
          ${JSON.stringify({
            marked_at: new Date().toISOString(),
            patient:   patientName,
            provider:  appt.provider_name,
          })},
          'completed',
          ${new Date().toISOString()}
        )
      `;

      marked++;
    } catch (err) {
      console.error(`[autoNoShow] Failed for appointment ${appt.id}:`, err);
      failed++;
    }
  }

  return { marked, failed, total: appointments.length };
}