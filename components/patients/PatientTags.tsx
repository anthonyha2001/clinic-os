"use client";

import { useState, useEffect } from "react";
import { Check } from "lucide-react";

type Tag = { id: string; name_en: string; color_hex?: string };

export function PatientTags({
  patientId,
  tags,
  onTagsChange,
}: {
  patientId: string;
  tags: Tag[];
  onTagsChange: (tags: Tag[]) => void;
}) {
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (showPicker && allTags.length === 0) {
      fetch("/api/tags")
        .then((r) => r.json())
        .then((d) => {
          const list = d.tags ?? d ?? [];
          setAllTags(
            Array.isArray(list)
              ? list.map((t: Record<string, unknown>) => ({
                  id: t.id as string,
                  name_en: (t.name_en ?? t.nameEn) as string,
                  color_hex: (t.color_hex ?? t.colorHex) as string | undefined,
                }))
              : []
          );
        });
    }
  }, [showPicker, allTags.length]);

  async function addTag(tag: Tag) {
    if (tags.some((t) => t.id === tag.id)) return;
    setLoading(true);
    await fetch(`/api/patients/${patientId}/tags`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tag_id: tag.id }),
    });
    onTagsChange([...tags, tag]);
    setLoading(false);
  }

  async function removeTag(tagId: string) {
    setLoading(true);
    await fetch(`/api/patients/${patientId}/tags/${tagId}`, {
      method: "DELETE",
    });
    onTagsChange(tags.filter((t) => t.id !== tagId));
    setLoading(false);
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap relative">
      {tags.map((tag) => (
        <span
          key={tag.id}
          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-white"
          style={{ backgroundColor: tag.color_hex ?? "#6B7280" }}
        >
          {tag.name_en}
          <button
            onClick={() => removeTag(tag.id)}
            className="opacity-70 hover:opacity-100 leading-none"
          >
            ×
          </button>
        </span>
      ))}

      <button
        onClick={() => setShowPicker((s) => !s)}
        className="rounded-full border border-dashed px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground hover:border-foreground transition-colors"
      >
        + Tag
      </button>

      {showPicker && (
        <>
          <div
            className="fixed inset-0 z-30"
            onClick={() => setShowPicker(false)}
          />
          <div className="absolute top-7 start-0 z-40 rounded-xl border bg-card shadow-lg p-3 w-56">
            <p className="text-xs font-medium text-muted-foreground mb-2">
              Add tags
            </p>
            {allTags.length === 0 ? (
              <p className="text-xs text-muted-foreground">Loading...</p>
            ) : (
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {allTags.map((tag) => {
                  const isAdded = tags.some((t) => t.id === tag.id);
                  return (
                    <button
                      key={tag.id}
                      onClick={() => {
                        addTag(tag);
                        setShowPicker(false);
                      }}
                      disabled={isAdded || loading}
                      className={`w-full flex items-center gap-2 text-start rounded-lg px-2 py-1.5 text-xs transition-colors ${
                        isAdded ? "opacity-40 cursor-default" : "hover:bg-muted"
                      }`}
                    >
                      <span
                        className="h-3 w-3 rounded-full shrink-0"
                        style={{
                          backgroundColor: tag.color_hex ?? "#6B7280",
                        }}
                      />
                      {tag.name_en}
                      {isAdded && (
                        <Check className="size-4 inline-block ms-auto text-muted-foreground" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
