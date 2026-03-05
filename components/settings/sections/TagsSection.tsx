"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus } from "lucide-react";

type TagItem = {
  id: string;
  nameEn?: string;
  name_en?: string;
  colorHex?: string;
  color_hex?: string;
};

export function TagsSection() {
  const [tags, setTags] = useState<TagItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name_en: "",
    color_hex: "#6B7280",
  });

  useEffect(() => {
    fetch("/api/tags", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        const raw = Array.isArray(d) ? d : d?.tags ?? [];
        setTags(Array.isArray(raw) ? raw : []);
      })
      .catch(() => setTags([]))
      .finally(() => setLoading(false));
  }, []);

  async function createTag() {
    const name = form.name_en.trim();
    if (!name) return;
    setSubmitting(true);
    setError(null);

    const res = await fetch("/api/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        name_en: name,
        color_hex: form.color_hex,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError((data?.error as string) ?? "Failed to create tag");
      setSubmitting(false);
      return;
    }

    const nextTag: TagItem = {
      id: data.id as string,
      nameEn: (data.nameEn ?? data.name_en) as string,
      colorHex: (data.colorHex ?? data.color_hex) as string,
    };
    setTags((prev) =>
      [...prev, nextTag].sort((a, b) =>
        String(a.nameEn ?? a.name_en ?? "").localeCompare(
          String(b.nameEn ?? b.name_en ?? "")
        )
      )
    );
    setForm({ name_en: "", color_hex: form.color_hex });
    setSubmitting(false);
  }

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="rounded-xl border bg-card p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold">Patient Tags</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Add tags that can be assigned to patients.
          </p>
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2">
          <input
            type="text"
            value={form.name_en}
            onChange={(e) => setForm((f) => ({ ...f, name_en: e.target.value }))}
            placeholder="Tag name (e.g. VIP)"
            className="rounded-lg border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <input
            type="color"
            value={form.color_hex}
            onChange={(e) =>
              setForm((f) => ({ ...f, color_hex: e.target.value }))
            }
            className="h-10 w-16 rounded border cursor-pointer"
            aria-label="Tag color"
          />
          <button
            type="button"
            onClick={createTag}
            disabled={submitting || !form.name_en.trim()}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            {submitting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
            Add Tag
          </button>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-5">
        <h3 className="text-sm font-semibold mb-3">Existing Tags</h3>
        {loading ? (
          <p className="text-sm text-muted-foreground animate-pulse">Loading...</p>
        ) : tags.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tags yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => {
              const name = tag.nameEn ?? tag.name_en ?? "—";
              const color = tag.colorHex ?? tag.color_hex ?? "#6B7280";
              return (
                <span
                  key={tag.id}
                  className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium text-white"
                  style={{ backgroundColor: color }}
                >
                  {name}
                </span>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
