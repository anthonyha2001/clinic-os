"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { RiskBadge } from "./RiskBadge";

type PatientDetail = {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
  gender: string | null;
  email: string | null;
  phone: string;
  phoneSecondary: string | null;
  address: string | null;
  preferredLocale: string | null;
};

type PatientTag = {
  id: string;
  tagId: string;
  nameEn: string;
  nameFr: string;
  nameAr: string;
  colorHex: string;
};

type TagItem = {
  id: string;
  nameEn: string;
  nameFr: string;
  nameAr: string;
  colorHex: string;
};

const EDITABLE_KEYS = [
  "firstName",
  "lastName",
  "phone",
  "phoneSecondary",
  "email",
  "dateOfBirth",
  "gender",
  "preferredLocale",
  "address",
] as const;

type EditableKey = (typeof EDITABLE_KEYS)[number];

interface PatientOverviewProps {
  patient: PatientDetail;
  tags: PatientTag[];
  allTags: TagItem[];
  riskScore: number;
  onUpdate: () => void | Promise<void>;
}

export function PatientOverview({
  patient,
  tags,
  allTags,
  riskScore,
  onUpdate,
}: PatientOverviewProps) {
  const t = useTranslations("patients");
  const tActions = useTranslations("patients.actions");
  const tCommon = useTranslations("common");

  const [editing, setEditing] = useState<EditableKey | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [addingTag, setAddingTag] = useState(false);

  const getDisplayValue = (key: EditableKey): string => {
    const v = patient[key as keyof PatientDetail];
    if (v === null || v === undefined) return "";
    return String(v);
  };

  const getTagName = (tag: PatientTag | TagItem) => {
    const locale = typeof window !== "undefined" ? document.documentElement.lang : "en";
    if (locale === "fr") return tag.nameFr;
    if (locale === "ar") return tag.nameAr;
    return tag.nameEn;
  };

  const handleStartEdit = (key: EditableKey) => {
    setEditing(key);
    setEditValue(getDisplayValue(key));
  };

  const handleCancelEdit = () => {
    setEditing(null);
    setEditValue("");
  };

  const handleSave = useCallback(async () => {
    if (editing === null) return;
    setSaving(true);
    try {
      const value = editValue.trim() || null;
      const payload: Record<string, string | null> = {};
      payload[editing] = value;
      if (editing === "dateOfBirth" && value === "") payload.dateOfBirth = null;
      if (editing === "gender" && value === "") payload.gender = null;

      const res = await fetch(`/api/patients/${patient.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to save");
      setEditing(null);
      setEditValue("");
      await onUpdate();
    } finally {
      setSaving(false);
    }
  }, [editing, editValue, onUpdate, patient.id]);

  const handleAddTag = useCallback(
    async (tagId: string) => {
      setAddingTag(true);
      try {
        const res = await fetch(`/api/patients/${patient.id}/tags`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tag_id: tagId }),
          credentials: "include",
        });
        if (res.ok) onUpdate();
      } finally {
        setAddingTag(false);
      }
    },
    [patient.id, onUpdate]
  );

  const handleRemoveTag = useCallback(
    async (tagId: string) => {
      await fetch(`/api/patients/${patient.id}/tags/${tagId}`, {
        method: "DELETE",
        credentials: "include",
      });
      onUpdate();
    },
    [patient.id, onUpdate]
  );

  const availableTags = allTags.filter((tag) => !tags.some((pt) => pt.tagId === tag.id));

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-xl font-semibold">
            {patient.firstName} {patient.lastName}
          </h2>
          <RiskBadge riskScore={riskScore} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/scheduling?patient_id=${patient.id}`}
            className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            {tActions("bookAppointment")}
          </Link>
          <Link
            href={`/patients/${patient.id}/plans/new`}
            className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            {tActions("createPlan")}
          </Link>
          <Link
            href={`/billing/new?patient_id=${patient.id}`}
            className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            {tActions("createInvoice")}
          </Link>
        </div>
      </div>

      <div className="mb-4">
        <div className="mb-2 text-sm font-medium text-muted-foreground">{t("personalInfo")}</div>
        <div className="grid gap-3 sm:grid-cols-2">
          {EDITABLE_KEYS.map((key) => {
            const isEditing = editing === key;
            const label = t(key as "firstName");
            return (
              <div key={key}>
                <label className="text-xs text-muted-foreground">{label}</label>
                {isEditing ? (
                  <div className="mt-1 flex gap-2">
                    {key === "gender" ? (
                      <select
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="flex-1 rounded border border-border bg-background px-2 py-1.5 text-sm"
                      >
                        <option value="">—</option>
                        <option value="male">{t("male")}</option>
                        <option value="female">{t("female")}</option>
                        <option value="other">{t("other")}</option>
                      </select>
                    ) : (
                      <input
                        type={key === "dateOfBirth" ? "date" : "text"}
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="flex-1 rounded border border-border bg-background px-2 py-1.5 text-sm"
                      />
                    )}
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:opacity-90 disabled:opacity-50"
                    >
                      {tCommon("save")}
                    </button>
                    <button
                      onClick={handleCancelEdit}
                      className="rounded border border-border px-3 py-1.5 text-sm hover:bg-muted"
                    >
                      {tCommon("cancel")}
                    </button>
                  </div>
                ) : (
                  <div
                    onClick={() => handleStartEdit(key)}
                    className="mt-1 cursor-pointer rounded px-2 py-1.5 text-sm hover:bg-muted"
                  >
                    {getDisplayValue(key) || t("noData")}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <div className="mb-2 text-sm font-medium text-muted-foreground">Tags</div>
        <div className="flex flex-wrap items-center gap-2">
          {tags.map((tag) => (
            <span
              key={tag.tagId}
              className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium"
              style={{
                backgroundColor: `${tag.colorHex}20`,
                color: tag.colorHex,
              }}
            >
              {getTagName(tag)}
              <button
                type="button"
                onClick={() => handleRemoveTag(tag.tagId)}
                className="hover:opacity-80"
                aria-label="Remove tag"
              >
                ×
              </button>
            </span>
          ))}
          {availableTags.length > 0 && (
            <div className="relative">
              <select
                value=""
                onChange={(e) => {
                  const v = e.target.value;
                  if (v) handleAddTag(v);
                  e.target.value = "";
                }}
                disabled={addingTag}
                className="rounded-full border border-dashed border-border bg-transparent px-3 py-1 text-xs"
              >
                <option value="">+ Add tag</option>
                {availableTags.map((tag) => (
                  <option key={tag.id} value={tag.id}>
                    {getTagName(tag)}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
