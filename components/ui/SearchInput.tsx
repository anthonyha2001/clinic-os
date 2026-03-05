"use client";

import { Search } from "lucide-react";

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function SearchInput({
  value,
  onChange,
  placeholder = "Search...",
  className = "",
}: SearchInputProps) {
  return (
    <div className={`app-search relative ${className}`}>
      <span className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-[#64748B]">
        <Search className="size-4" strokeWidth={2} />
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-[var(--radiusInput)] border border-border bg-[var(--bgMuted)] py-2.5 ps-10 pe-3 text-sm text-[var(--text)] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/15"
      />
    </div>
  );
}
