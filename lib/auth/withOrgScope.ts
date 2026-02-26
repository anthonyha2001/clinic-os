import type { AuthUser } from "./getCurrentUser";

/**
 * Returns the organization_id for the current user.
 * Use this in EVERY database query to scope results to the user's org.
 *
 * This is the "belt" layer of multi-tenancy:
 * - Belt: withOrgScope() adds WHERE organization_id = ? to every query
 * - Suspenders: RLS policies (K-13/K-14) enforce the same at DB level
 *
 * Usage:
 *   const orgId = getOrgId(user);
 *   const patients = await pgClient`
 *     SELECT * FROM patients WHERE organization_id = ${orgId}
 *   `;
 */
export function getOrgId(user: AuthUser): string {
  return user.organizationId;
}

/**
 * Validates that a record belongs to the user's organization.
 * Use this when loading a specific record by ID to verify org ownership.
 *
 * Usage:
 *   const [patient] = await pgClient`SELECT * FROM patients WHERE id = ${id}`;
 *   if (!assertOrgOwnership(user, patient?.organization_id)) {
 *     return NextResponse.json({ error: "Not found" }, { status: 404 });
 *   }
 */
export function assertOrgOwnership(
  user: AuthUser,
  recordOrgId: string | null | undefined
): boolean {
  if (!recordOrgId) return false;
  return user.organizationId === recordOrgId;
}
