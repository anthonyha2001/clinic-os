"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "@/i18n/navigation";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import { RiskBadge } from "./RiskBadge";
import { NewPatientDrawer } from "./NewPatientDrawer";

interface PatientTag {
  id: string;
  name_en: string;
  color_hex: string;
}

interface PatientRow {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  lastVisitAt: string | null;
  riskScore: number;
  tags: PatientTag[];
}

export function PatientsClient({ locale }: { locale: string }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [patients, setPatients] = useState<PatientRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [showNewPatient, setShowNewPatient] = useState(false);
  const PAGE_SIZE = 20;

  const fetchPatients = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_SIZE),
      });
      if (search) params.set("search", search);
      const res = await fetch(`/api/patients?${params}`, {
        credentials: "include",
      });
      const data = await res.json();
      setPatients(data.patients ?? data ?? []);
      setTotal(data.total ?? 0);
    } catch {
      setPatients([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [search, page]);

  useEffect(() => {
    const timer = setTimeout(fetchPatients, 300);
    return () => clearTimeout(timer);
  }, [fetchPatients]);

  useEffect(() => {
    setPage(1);
  }, [search]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Patients</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {total} total patients
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowNewPatient(true)}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          + New Patient
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <input
          type="text"
          placeholder="Search by name or phone number..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border bg-background px-4 py-2.5 ps-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
        <span className="absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground">
          <Search className="size-4" />
        </span>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-4 py-3 text-start font-medium text-muted-foreground">
                Name
              </th>
              <th className="px-4 py-3 text-start font-medium text-muted-foreground">
                Phone
              </th>
              <th className="px-4 py-3 text-start font-medium text-muted-foreground">
                Last Visit
              </th>
              <th className="px-4 py-3 text-start font-medium text-muted-foreground">
                Risk
              </th>
              <th className="px-4 py-3 text-start font-medium text-muted-foreground">
                Tags
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              [...Array(8)].map((_, i) => (
                <tr key={i} className="animate-pulse border-b">
                  <td className="px-4 py-3">
                    <div className="h-4 w-32 rounded bg-muted" />
                  </td>
                  <td className="px-4 py-3">
                    <div className="h-4 w-24 rounded bg-muted" />
                  </td>
                  <td className="px-4 py-3">
                    <div className="h-4 w-20 rounded bg-muted" />
                  </td>
                  <td className="px-4 py-3">
                    <div className="h-4 w-16 rounded bg-muted" />
                  </td>
                  <td className="px-4 py-3">
                    <div className="h-4 w-20 rounded bg-muted" />
                  </td>
                </tr>
              ))
            ) : patients.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-12 text-center text-muted-foreground"
                >
                  {search
                    ? "No patients found matching your search."
                    : "No patients yet. Add your first patient."}
                </td>
              </tr>
            ) : (
              patients.map((patient) => (
                <tr
                  key={patient.id}
                  onClick={() => router.push(`/patients/${patient.id}`)}
                  className="cursor-pointer border-b transition-colors hover:bg-muted/50"
                >
                  <td className="px-4 py-3 font-medium">
                    {patient.firstName} {patient.lastName}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {patient.phone}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {patient.lastVisitAt
                      ? new Date(patient.lastVisitAt).toLocaleDateString(locale)
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <RiskBadge
                      riskScore={patient.riskScore ?? 0}
                      threshold={3}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(patient.tags ?? []).slice(0, 3).map((tag) => (
                        <span
                          key={tag.id}
                          className="rounded-full px-2 py-0.5 text-xs font-medium text-white"
                          style={{
                            backgroundColor: tag.color_hex ?? "#6B7280",
                          }}
                        >
                          {tag.name_en}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between border-t px-4 py-3">
            <p className="text-sm text-muted-foreground">
              Showing {(page - 1) * PAGE_SIZE + 1}–
              {Math.min(page * PAGE_SIZE, total)} of {total}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="rounded-lg border px-3 py-1.5 text-sm transition-colors hover:bg-muted disabled:opacity-40 flex items-center gap-1"
              >
                <ChevronLeft className="size-4 inline-block" />
                Prev
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => p + 1)}
                disabled={page * PAGE_SIZE >= total}
                className="rounded-lg border px-3 py-1.5 text-sm transition-colors hover:bg-muted disabled:opacity-40 flex items-center gap-1"
              >
                Next
                <ChevronRight className="size-4 inline-block" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* New Patient Drawer */}
      {showNewPatient && (
        <NewPatientDrawer
          onClose={() => setShowNewPatient(false)}
          onSuccess={(newPatient) => {
            setShowNewPatient(false);
            router.push(`/patients/${newPatient.id}`);
          }}
        />
      )}
    </div>
  );
}
