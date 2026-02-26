"use client";

import { useState } from "react";
import { X } from "lucide-react";

type Patient = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  phone_secondary?: string;
  email?: string;
  date_of_birth?: string;
  gender?: string;
  address?: string;
  preferred_locale?: string;
};

export function PatientEditDrawer({
  patient,
  onClose,
  onSuccess,
}: {
  patient: Patient;
  onClose: () => void;
  onSuccess: (updated: Patient) => void;
}) {
  const [form, setForm] = useState({
    first_name: patient.first_name ?? "",
    last_name: patient.last_name ?? "",
    phone: patient.phone ?? "",
    phone_secondary: patient.phone_secondary ?? "",
    email: patient.email ?? "",
    date_of_birth: patient.date_of_birth
      ? patient.date_of_birth.split("T")[0]
      : "",
    gender: patient.gender ?? "",
    address: patient.address ?? "",
    preferred_locale: patient.preferred_locale ?? "en",
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function Field({
    label,
    name,
    type = "text",
    options,
  }: {
    label: string;
    name: keyof typeof form;
    type?: string;
    options?: { value: string; label: string }[];
  }) {
    return (
      <div>
        <label className="block text-xs font-medium mb-1 text-muted-foreground">
          {label}
        </label>
        {options ? (
          <select
            value={form[name]}
            onChange={(e) =>
              setForm((f) => ({ ...f, [name]: e.target.value }))
            }
            className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 bg-background"
          >
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        ) : (
          <input
            type={type}
            value={form[name]}
            onChange={(e) =>
              setForm((f) => ({ ...f, [name]: e.target.value }))
            }
            className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 bg-background"
          />
        )}
      </div>
    );
  }

  async function handleSubmit() {
    if (!form.first_name.trim() || !form.last_name.trim()) {
      setError("Name is required");
      return;
    }
    if (!form.phone.trim()) {
      setError("Phone is required");
      return;
    }

    setLoading(true);
    setError(null);

    const body = {
      firstName: form.first_name,
      lastName: form.last_name,
      phone: form.phone,
      phoneSecondary: form.phone_secondary || null,
      email: form.email || null,
      dateOfBirth: form.date_of_birth || null,
      gender: form.gender || null,
      address: form.address || null,
      preferredLocale: form.preferred_locale || "en",
    };

    const res = await fetch(`/api/patients/${patient.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? data.message ?? "Failed to update patient.");
      setLoading(false);
      return;
    }

    const data = await res.json();
    const updated = data.patient ?? data;
    onSuccess({
      ...patient,
      first_name: updated.firstName ?? updated.first_name ?? form.first_name,
      last_name: updated.lastName ?? updated.last_name ?? form.last_name,
      phone: updated.phone ?? form.phone,
      phone_secondary: (updated.phoneSecondary ?? updated.phone_secondary ?? form.phone_secondary) || undefined,
      email: updated.email ?? form.email,
      date_of_birth: (updated.dateOfBirth ?? updated.date_of_birth ?? form.date_of_birth) || undefined,
      gender: (updated.gender ?? form.gender) || undefined,
      address: (updated.address ?? form.address) || undefined,
      preferred_locale: (updated.preferredLocale ?? updated.preferred_locale ?? form.preferred_locale) || "en",
    });
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/40"
        onClick={onClose}
        aria-hidden
      />
      <div className="fixed inset-y-0 end-0 z-50 w-full max-w-md bg-card shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold">Edit Patient</h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground p-1"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="First Name *" name="first_name" />
            <Field label="Last Name *" name="last_name" />
          </div>
          <Field label="Phone *" name="phone" type="tel" />
          <Field label="Secondary Phone" name="phone_secondary" type="tel" />
          <Field label="Email" name="email" type="email" />
          <Field label="Date of Birth" name="date_of_birth" type="date" />
          <Field label="Gender" name="gender" options={[
            { value: "", label: "Select..." },
            { value: "male", label: "Male" },
            { value: "female", label: "Female" },
            { value: "other", label: "Other" },
          ]} />
          <Field label="Preferred Language" name="preferred_locale" options={[
            { value: "en", label: "English" },
            { value: "fr", label: "French" },
            { value: "ar", label: "Arabic" },
          ]} />
          <Field label="Address" name="address" />
        </div>

        <div className="border-t px-6 py-4 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            {loading ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </>
  );
}
