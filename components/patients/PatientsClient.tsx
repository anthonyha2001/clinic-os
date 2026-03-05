"use client";

import { useMemo, useState, useEffect } from "react";
import { useRouter } from "@/i18n/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { RiskBadge } from "./RiskBadge";
import { NewPatientDrawer } from "./NewPatientDrawer";
import { SearchInput } from "@/components/ui/SearchInput";
import { useFetch } from "@/hooks/useFetch";

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
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [patients, setPatients] = useState<PatientRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [showNewPatient, setShowNewPatient] = useState(false);
  const PAGE_SIZE = 20;

  useEffect(() => {
    setPage(1);
  }, [search]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const patientsUrl = useMemo(() => {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(PAGE_SIZE),
    });
    if (debouncedSearch) params.set("search", debouncedSearch);
    return `/api/patients?${params.toString()}`;
  }, [page, debouncedSearch]);

  const { data: patientsData, loading } = useFetch<{
    patients?: PatientRow[];
    total?: number;
  }>(patientsUrl, { ttl: 30_000, initialData: { patients: [], total: 0 } });

  useEffect(() => {
    setPatients(patientsData?.patients ?? []);
    setTotal(patientsData?.total ?? 0);
  }, [patientsData]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="list-page-header">
        <div>
          <h1 className="list-page-title">Patients</h1>
          <p className="list-page-subtitle">
            {total} total patients
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowNewPatient(true)}
          className="app-btn-primary px-4 py-2 text-sm font-medium transition-colors"
        >
          + New Patient
        </button>
      </div>

      {/* Search */}
      <SearchInput
        value={search}
        onChange={setSearch}
        placeholder="Search by name or phone number..."
      />

      {/* Table */}
      <div className="app-table-wrap">
        <table className="app-table text-sm">
          <thead>
            <tr>
              <th className="px-5 py-3 text-start">
                Name
              </th>
              <th className="px-5 py-3 text-start">
                Phone
              </th>
              <th className="px-5 py-3 text-start">
                Last Visit
              </th>
              <th className="px-5 py-3 text-start">
                Risk
              </th>
              <th className="px-5 py-3 text-start">
                Tags
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              [...Array(8)].map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td className="px-5 py-3.5">
                    <div className="h-4 w-32 rounded bg-muted" />
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="h-4 w-24 rounded bg-muted" />
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="h-4 w-20 rounded bg-muted" />
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="h-4 w-16 rounded bg-muted" />
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="h-4 w-20 rounded bg-muted" />
                  </td>
                </tr>
              ))
            ) : patients.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-5 py-12 text-center text-muted-foreground"
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
                  className="cursor-pointer transition-colors"
                >
                  <td className="px-5 py-3.5 font-medium">
                    {patient.firstName} {patient.lastName}
                  </td>
                  <td className="px-5 py-3.5 text-muted-foreground">
                    {patient.phone}
                  </td>
                  <td className="px-5 py-3.5 text-muted-foreground">
                    {patient.lastVisitAt
                      ? new Date(patient.lastVisitAt).toLocaleDateString(locale)
                      : "—"}
                  </td>
                  <td className="px-5 py-3.5">
                    <RiskBadge
                      riskScore={patient.riskScore ?? 0}
                      threshold={3}
                    />
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex flex-wrap gap-1.5">
                      {(patient.tags ?? []).slice(0, 3).map((tag) => (
                        <span
                          key={tag.id}
                          className="app-badge"
                          style={{
                            backgroundColor: `${tag.color_hex ?? "#6B7280"}22`,
                            color: tag.color_hex ?? "#475569",
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
          <div className="flex items-center justify-between border-t px-5 py-3">
            <p className="text-sm text-muted-foreground">
              Showing {(page - 1) * PAGE_SIZE + 1}–
              {Math.min(page * PAGE_SIZE, total)} of {total}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="app-btn-secondary flex items-center gap-1 px-3 py-1.5 text-sm transition-colors hover:bg-muted disabled:opacity-40"
              >
                <ChevronLeft className="size-4 inline-block" />
                Prev
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => p + 1)}
                disabled={page * PAGE_SIZE >= total}
                className="app-btn-secondary flex items-center gap-1 px-3 py-1.5 text-sm transition-colors hover:bg-muted disabled:opacity-40"
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
