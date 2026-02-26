"use client";

import { useState, useEffect } from "react";
import { Plus, Pencil, Loader2, Check } from "lucide-react";
import { SlideOver } from "@/components/ui/SlideOver";

type User = {
  id: string;
  fullName?: string;
  full_name?: string;
  email?: string;
  isActive?: boolean;
  is_active?: boolean;
  roles?: string[];
};

const VALID_ROLES = ["admin", "manager", "receptionist", "provider", "accountant"] as const;

export function UsersSection() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [slideOpen, setSlideOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    role: "receptionist" as string,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadUsers = () => {
    fetch("/api/users", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        const raw = Array.isArray(d) ? d : d?.users ?? d ?? [];
        setUsers(Array.isArray(raw) ? raw : []);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const openAdd = () => {
    setEditingUser(null);
    setForm({ full_name: "", email: "", role: "receptionist" });
    setError(null);
    setSlideOpen(true);
  };

  const openEdit = (u: User) => {
    setEditingUser(u);
    setForm({
      full_name: u.fullName ?? u.full_name ?? "",
      email: u.email ?? "",
      role: u.roles?.[0] ?? "receptionist",
    });
    setError(null);
    setSlideOpen(true);
  };

  const closeSlide = () => {
    setSlideOpen(false);
    setEditingUser(null);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.full_name.trim() || !form.email.trim()) return;

    setSubmitting(true);

    if (editingUser) {
      const res = await fetch(`/api/users/${editingUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          is_active: editingUser.isActive ?? editingUser.is_active ?? true,
          roles: [form.role],
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setUsers((s) =>
          s.map((x) =>
            x.id === editingUser.id ? { ...x, ...data, roles: data.roles ?? [form.role] } : x
          )
        );
        closeSlide();
      } else {
        setError(data?.error ?? "Failed to update");
      }
    } else {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          full_name: form.full_name.trim(),
          email: form.email.trim().toLowerCase(),
          role: form.role,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setUsers((s) => [...s, data]);
        closeSlide();
      } else {
        setError(data?.error ?? "Failed to create user");
      }
    }
    setSubmitting(false);
  };

  const toggleActive = async (id: string, currentActive: boolean) => {
    const res = await fetch(`/api/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ is_active: !currentActive }),
    });
    if (res.ok) {
      const d = await res.json();
      setUsers((s) =>
        s.map((x) =>
          x.id === id ? { ...x, isActive: d.isActive, is_active: d.is_active } : x
        )
      );
    }
  };

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">Users</h2>
            <p className="text-xs text-muted-foreground">Manage organization users and roles</p>
          </div>
          <button
            onClick={openAdd}
            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 flex items-center gap-1.5"
          >
            <Plus className="size-3.5" /> Invite User
          </button>
        </div>

        {loading ? (
          <div className="p-8 text-center text-muted-foreground text-sm animate-pulse">
            Loading...
          </div>
        ) : users.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            No users yet. Invite your first team member.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-5 py-3 text-start font-medium text-muted-foreground">Name</th>
                <th className="px-5 py-3 text-start font-medium text-muted-foreground">Email</th>
                <th className="px-5 py-3 text-start font-medium text-muted-foreground">Roles</th>
                <th className="px-5 py-3 text-center font-medium text-muted-foreground">Status</th>
                <th className="px-5 py-3 w-16" />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const name = u.fullName ?? u.full_name ?? "—";
                const active = u.isActive ?? u.is_active ?? true;
                const roles = u.roles ?? [];
                return (
                  <tr
                    key={u.id}
                    className={`border-b hover:bg-muted/30 transition-colors ${!active ? "opacity-50" : ""}`}
                  >
                    <td className="px-5 py-3 font-medium">{name}</td>
                    <td className="px-5 py-3 text-muted-foreground">{u.email ?? "—"}</td>
                    <td className="px-5 py-3">
                      <span className="rounded-full px-2 py-0.5 text-xs bg-muted">
                        {roles.join(", ") || "—"}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-center">
                      <button
                        onClick={() => toggleActive(u.id, active)}
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                          active
                            ? "bg-green-100 text-green-700 hover:bg-red-100 hover:text-red-700"
                            : "bg-gray-100 text-gray-500 hover:bg-green-100 hover:text-green-700"
                        }`}
                      >
                        {active ? "Active" : "Inactive"}
                      </button>
                    </td>
                    <td className="px-5 py-3">
                      <button
                        onClick={() => openEdit(u)}
                        className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                        aria-label="Edit"
                      >
                        <Pencil className="size-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <SlideOver
        open={slideOpen}
        onClose={closeSlide}
        title={editingUser ? "Edit User" : "Invite User"}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              Full Name *
            </label>
            <input
              type="text"
              placeholder="e.g. John Doe"
              value={form.full_name}
              onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
              className="w-full rounded-lg border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
              required
              disabled={!!editingUser}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Email *</label>
            <input
              type="email"
              placeholder="e.g. john@clinic.com"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              className="w-full rounded-lg border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
              required
              disabled={!!editingUser}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Role</label>
            <select
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
              className="w-full rounded-lg border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              {VALID_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r.charAt(0).toUpperCase() + r.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={closeSlide}
              className="rounded-lg border px-4 py-1.5 text-sm hover:bg-muted"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !form.full_name.trim() || !form.email.trim()}
              className="rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5"
            >
              {submitting ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
              {editingUser ? "Save" : "Invite"}
            </button>
          </div>
        </form>
      </SlideOver>
    </div>
  );
}
