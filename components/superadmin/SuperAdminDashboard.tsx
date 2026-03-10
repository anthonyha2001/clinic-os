"use client";
import { useState, useEffect, useCallback } from "react";
import {
  Building2, Users, Calendar, DollarSign, Activity,
  Plus, RefreshCw, LogOut, Shield, Eye, EyeOff,
  CheckCircle, XCircle, TrendingUp, Database, Loader2,
  ChevronDown, ChevronUp, UserPlus, Settings
} from "lucide-react";

type Org = {
  id: string; name: string; slug: string; created_at: string;
  timezone: string; currency: string; user_count: number;
  patient_count: number; appts_today: number; appts_month: number;
  revenue_month: number; last_activity: string | null;
};

type Summary = {
  total_orgs: number; active_users: number; appts_today: number;
  appts_month: number; revenue_month: number; total_patients: number;
};

const TIMEZONES = ["Asia/Beirut", "UTC", "America/New_York", "Europe/London", "Asia/Dubai", "Asia/Riyadh"];
const CURRENCIES = ["USD", "EUR", "GBP", "LBP", "AED", "SAR"];

function isOnline(lastActivity: string | null) {
  if (!lastActivity) return false;
  return Date.now() - new Date(lastActivity).getTime() < 24 * 60 * 60 * 1000;
}

export function SuperAdminDashboard() {
  const [authenticated, setAuthenticated] = useState(false);
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");

  const [summary, setSummary] = useState<Summary | null>(null);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedOrg, setExpandedOrg] = useState<string | null>(null);
  const [orgUsers, setOrgUsers] = useState<Record<string, unknown[]>>({});

  // Create org form
  const [showCreateOrg, setShowCreateOrg] = useState(false);
  const [orgForm, setOrgForm] = useState({ name: "", slug: "", timezone: "Asia/Beirut", currency: "USD" });
  const [orgLoading, setOrgLoading] = useState(false);
  const [orgError, setOrgError] = useState("");

  // Create user form
  const [showCreateUser, setShowCreateUser] = useState<string | null>(null);
  const [userForm, setUserForm] = useState({ email: "", full_name: "", phone: "", password: "", role: "admin" as string });
  const [userLoading, setUserLoading] = useState(false);
  const [userError, setUserError] = useState("");
  const [userSuccess, setUserSuccess] = useState("");
  const [availableRoles, setAvailableRoles] = useState<{ id: string; name: string }[]>([]);

  const [editingUser, setEditingUser] = useState<Record<string, unknown> | null>(null);
  const [editUserForm, setEditUserForm] = useState({ full_name: "", phone: "", role: "", is_active: true });
  const [editUserLoading, setEditUserLoading] = useState(false);
  const [editUserError, setEditUserError] = useState("");
  const [deleteConfirmUser, setDeleteConfirmUser] = useState<Record<string, unknown> | null>(null);
  const [deleteUserLoading, setDeleteUserLoading] = useState(false);

  // Suspended orgs
  const [suspendedOrgs, setSuspendedOrgs] = useState<Set<string>>(new Set());

  async function handleLogin() {
    setAuthLoading(true);
    setAuthError("");
    const res = await fetch("/api/superadmin/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
    });
    if (res.ok) {
      setAuthenticated(true);
    } else {
      setAuthError("Invalid PIN. Access denied.");
    }
    setAuthLoading(false);
  }

  async function handleLogout() {
    await fetch("/api/superadmin/auth", { method: "DELETE" });
    setAuthenticated(false);
    setPin("");
  }

  const fetchData = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/superadmin/stats");
    if (res.ok) {
      const data = await res.json();
      setSummary(data.summary);
      setOrgs(data.organizations);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (authenticated) fetchData();
  }, [authenticated, fetchData]);

  async function fetchOrgUsers(orgId: string) {
    if (orgUsers[orgId]) return;
    const res = await fetch(`/api/superadmin/users?organization_id=${orgId}`);
    if (res.ok) {
      const data = await res.json();
      setOrgUsers(prev => ({ ...prev, [orgId]: data }));
    }
  }

  async function fetchOrgRoles(orgId: string) {
    const res = await fetch(`/api/superadmin/roles?organization_id=${orgId}`);
    if (res.ok) {
      const data = await res.json();
      setAvailableRoles(data);
      if (data.length > 0) {
        setUserForm((f) => ({ ...f, role: data[0].name }));
      }
    }
  }

  async function handleCreateOrg() {
    setOrgLoading(true);
    setOrgError("");
    const res = await fetch("/api/superadmin/organizations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(orgForm),
    });
    const data = await res.json();
    if (!res.ok) { setOrgError(data.error); setOrgLoading(false); return; }
    setShowCreateOrg(false);
    setOrgForm({ name: "", slug: "", timezone: "Asia/Beirut", currency: "USD" });
    fetchData();
    setOrgLoading(false);
  }

  async function handleCreateUser(orgId: string) {
    setUserLoading(true);
    setUserError("");
    setUserSuccess("");
    const res = await fetch("/api/superadmin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...userForm, organization_id: orgId }),
    });
    const data = await res.json();
    if (!res.ok) { setUserError(data.error); setUserLoading(false); return; }
    setUserSuccess(`User ${userForm.email} created successfully!`);
    setUserForm({
      email: "",
      full_name: "",
      phone: "",
      password: "",
      role: availableRoles.length > 0 ? availableRoles[0].name : "admin",
    });
    setOrgUsers(prev => ({ ...prev, [orgId]: [] })); // force refresh
    fetchOrgUsers(orgId);
    setUserLoading(false);
  }

  async function handleEditUser(userId: string, orgId: string) {
    setEditUserLoading(true);
    setEditUserError("");
    try {
      const res = await fetch(`/api/superadmin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editUserForm),
      });
      const data = await res.json();
      if (!res.ok) { setEditUserError(data.error); return; }
      setEditingUser(null);
      setOrgUsers(prev => ({ ...prev, [orgId]: [] }));
      fetchOrgUsers(orgId);
    } catch {
      setEditUserError("Network error");
    } finally {
      setEditUserLoading(false);
    }
  }

  async function handleDeleteUser(userId: string, orgId: string) {
    setDeleteUserLoading(true);
    try {
      const res = await fetch(`/api/superadmin/users/${userId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setDeleteConfirmUser(null);
        setOrgUsers(prev => ({ ...prev, [orgId]: [] }));
        fetchOrgUsers(orgId);
      }
    } finally {
      setDeleteUserLoading(false);
    }
  }

  async function handleSuspend(orgId: string) {
    const isSuspended = suspendedOrgs.has(orgId);
    await fetch(`/api/superadmin/organizations/${orgId}/suspend`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ suspended: !isSuspended }),
    });
    setSuspendedOrgs(prev => {
      const next = new Set(prev);
      if (isSuspended) next.delete(orgId); else next.add(orgId);
      return next;
    });
  }

  // LOGIN SCREEN
  if (!authenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-6">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(220,38,38,0.15),transparent)]" />
        <div className="relative w-full max-w-md">
          <div className="text-center mb-10">
            <div className="inline-flex items-center justify-center h-20 w-20 rounded-2xl bg-gradient-to-br from-red-600 to-red-700 shadow-lg shadow-red-500/25 mb-5 ring-2 ring-red-500/30">
              <Shield className="size-10 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-white tracking-tight">Superadmin</h1>
            <p className="text-slate-400 text-sm mt-2">Clinic OS Control Panel</p>
          </div>
          <div className="bg-slate-900/80 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-8 shadow-2xl shadow-black/20 space-y-5">
            {authError && (
              <div className="rounded-xl bg-red-950/50 border border-red-800/50 px-4 py-3 text-sm text-red-300 flex items-center gap-2">
                <XCircle className="size-4 shrink-0" />
                {authError}
              </div>
            )}
            <div>
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 block">Access PIN</label>
              <div className="relative">
                <input
                  type={showPin ? "text" : "password"}
                  value={pin}
                  onChange={e => setPin(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleLogin()}
                  placeholder="Enter superadmin PIN"
                  className="w-full bg-slate-800/80 border border-slate-600/60 rounded-xl px-4 py-3 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500/50 pr-12 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPin(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-700/50 transition-colors"
                >
                  {showPin ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>
            <button
              onClick={handleLogin}
              disabled={authLoading || !pin}
              className="w-full bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 disabled:opacity-50 disabled:hover:from-red-600 disabled:hover:to-red-700 text-white rounded-xl py-3 text-sm font-semibold transition-all flex items-center justify-center gap-2 shadow-lg shadow-red-900/30 hover:shadow-red-800/40"
            >
              {authLoading ? <Loader2 className="size-5 animate-spin" /> : <Shield className="size-5" />}
              {authLoading ? "Authenticating..." : "Access Control Panel"}
            </button>
          </div>
          <p className="text-center text-xs text-slate-500 mt-6">
            Set SUPERADMIN_PIN in .env.local
          </p>
        </div>
      </div>
    );
  }

  // DASHBOARD
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(220,38,38,0.08),transparent)] pointer-events-none" />
      {/* Top bar */}
      <div className="relative border-b border-slate-700/50 bg-slate-900/60 backdrop-blur-sm px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-red-600 to-red-700 flex items-center justify-center shadow-lg shadow-red-900/30 ring-2 ring-red-500/20">
            <Shield className="size-5 text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight">Clinic OS Superadmin</h1>
            <p className="text-xs text-slate-400">Full system control</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors px-4 py-2 rounded-xl hover:bg-slate-800/80 border border-transparent hover:border-slate-700"
          >
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button
            onClick={async () => {
              const res = await fetch("/api/superadmin/fix-metadata", { method: "POST" });
              const d = await res.json();
              alert(`Fixed ${d.fixed} users`);
            }}
            className="flex items-center gap-2 text-sm text-yellow-400 hover:text-yellow-300 
              px-4 py-2 rounded-xl hover:bg-yellow-950/30 border border-transparent 
              hover:border-yellow-900/50 transition-colors"
          >
            Fix Auth Metadata
          </button>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-sm text-red-400 hover:text-red-300 px-4 py-2 rounded-xl hover:bg-red-950/30 border border-transparent hover:border-red-900/50 transition-colors"
          >
            <LogOut className="size-4" />
            Logout
          </button>
        </div>
      </div>

      <div className="relative p-6 space-y-6 max-w-7xl mx-auto">
        {/* KPI Cards */}
        {summary && (
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
            {[
              { label: "Organizations", value: summary.total_orgs, icon: Building2, color: "text-blue-400" },
              { label: "Active Users", value: summary.active_users, icon: Users, color: "text-emerald-400" },
              { label: "Appts Today", value: summary.appts_today, icon: Calendar, color: "text-amber-400" },
              { label: "Appts This Month", value: summary.appts_month, icon: TrendingUp, color: "text-violet-400" },
              { label: "Revenue (Month)", value: `$${Number(summary.revenue_month).toLocaleString()}`, icon: DollarSign, color: "text-emerald-400" },
              { label: "Total Patients", value: summary.total_patients, icon: Activity, color: "text-pink-400" },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="bg-slate-900/60 backdrop-blur-sm rounded-2xl border border-slate-700/50 p-5 hover:border-slate-600/50 transition-colors shadow-lg shadow-black/10">
                <Icon className={`size-6 ${color} mb-3`} />
                <p className="text-2xl font-bold tracking-tight">{value}</p>
                <p className="text-xs text-slate-400 mt-1">{label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Organizations */}
        <div className="bg-slate-900/60 backdrop-blur-sm rounded-2xl border border-slate-700/50 overflow-hidden shadow-xl shadow-black/10">
          <div className="px-6 py-4 border-b border-slate-700/50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-slate-800/80 flex items-center justify-center">
                <Database className="size-5 text-blue-400" />
              </div>
              <div>
                <h2 className="font-semibold text-base">Organizations</h2>
                <span className="bg-slate-800 text-slate-400 text-xs rounded-full px-2.5 py-0.5">{orgs.length}</span>
              </div>
            </div>
            <button
              onClick={() => setShowCreateOrg(s => !s)}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors shadow-lg shadow-blue-900/30"
            >
              <Plus className="size-3.5" />
              New Organization
            </button>
          </div>

          {/* Create org form */}
          {showCreateOrg && (
            <div className="px-6 py-5 border-b border-slate-700/50 bg-slate-800/30">
              <h3 className="text-sm font-semibold mb-4">Create Organization</h3>
              {orgError && <div className="mb-4 text-sm text-red-300 bg-red-950/40 border border-red-900/50 rounded-xl px-4 py-3">{orgError}</div>}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="text-xs font-medium text-slate-400 mb-1.5 block">Clinic Name *</label>
                  <input value={orgForm.name} onChange={e => setOrgForm(f => ({ ...f, name: e.target.value, slug: e.target.value.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") }))}
                    placeholder="Dr. Smith Clinic" className="w-full bg-slate-800/80 border border-slate-600/60 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all" />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-400 mb-1.5 block">Slug *</label>
                  <input value={orgForm.slug} onChange={e => setOrgForm(f => ({ ...f, slug: e.target.value }))}
                    placeholder="dr-smith-clinic" className="w-full bg-slate-800/80 border border-slate-600/60 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all" />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-400 mb-1.5 block">Timezone</label>
                  <select value={orgForm.timezone} onChange={e => setOrgForm(f => ({ ...f, timezone: e.target.value }))}
                    className="w-full bg-slate-800/80 border border-slate-600/60 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30">
                    {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-400 mb-1.5 block">Currency</label>
                  <select value={orgForm.currency} onChange={e => setOrgForm(f => ({ ...f, currency: e.target.value }))}
                    className="w-full bg-slate-800/80 border border-slate-600/60 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30">
                    {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex gap-3 mt-4">
                <button onClick={() => setShowCreateOrg(false)} className="px-4 py-2 text-sm border border-slate-600 rounded-xl hover:bg-slate-700/50 transition-colors">Cancel</button>
                <button onClick={handleCreateOrg} disabled={orgLoading || !orgForm.name}
                  className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-xl text-white font-medium flex items-center gap-2 transition-colors">
                  {orgLoading ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
                  Create
                </button>
              </div>
            </div>
          )}

          {/* Orgs list */}
          {loading ? (
            <div className="p-12 text-center text-slate-500 text-sm animate-pulse">Loading organizations...</div>
          ) : orgs.length === 0 ? (
            <div className="p-12 text-center text-slate-500 text-sm">No organizations yet.</div>
          ) : (
            <div className="divide-y divide-slate-700/50">
              {orgs.map(org => {
                const online = isOnline(org.last_activity);
                const suspended = suspendedOrgs.has(org.id);
                const expanded = expandedOrg === org.id;

                return (
                  <div key={org.id}>
                    <div className="px-6 py-4 hover:bg-slate-800/30 transition-colors">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 min-w-0">
                          {/* Online indicator */}
                          <div className="relative shrink-0">
                            <div className={`h-10 w-10 rounded-xl flex items-center justify-center text-sm font-bold ${suspended ? "bg-slate-700 text-slate-400" : "bg-blue-900/50 text-blue-400"}`}>
                              {org.name.charAt(0).toUpperCase()}
                            </div>
                            <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-slate-900 ${online && !suspended ? "bg-green-400" : "bg-slate-600"}`} />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-semibold text-sm truncate">{org.name}</p>
                              {suspended && <span className="text-xs bg-red-900/30 text-red-400 border border-red-800 rounded-full px-1.5 py-0.5">Suspended</span>}
                              <span className="text-xs text-slate-500">/{org.slug}</span>
                            </div>
                            <p className="text-xs text-slate-400 mt-0.5">
                              {org.user_count} users · {org.patient_count} patients · {org.timezone} · {org.currency}
                            </p>
                          </div>
                        </div>

                        {/* Stats */}
                        <div className="hidden lg:flex items-center gap-6 text-center shrink-0">
                          <div>
                            <p className="text-sm font-semibold">{org.appts_today}</p>
                            <p className="text-xs text-slate-500">Today</p>
                          </div>
                          <div>
                            <p className="text-sm font-semibold">{org.appts_month}</p>
                            <p className="text-xs text-slate-500">This month</p>
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-emerald-400">${Number(org.revenue_month).toLocaleString()}</p>
                            <p className="text-xs text-slate-500">Revenue</p>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className={`h-2 w-2 rounded-full ${online && !suspended ? "bg-green-400" : "bg-slate-600"}`} />
                            <span className="text-xs text-slate-400">{online && !suspended ? "Active" : "Inactive"}</span>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => handleSuspend(org.id)}
                            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${suspended ? "border-green-700 text-green-400 hover:bg-green-900/20" : "border-red-800 text-red-400 hover:bg-red-900/20"}`}
                          >
                            {suspended ? "Activate" : "Suspend"}
                          </button>
                          <button
                            onClick={() => {
                              setExpandedOrg(expanded ? null : org.id);
                              if (!expanded) fetchOrgUsers(org.id);
                            }}
                            className="text-xs px-3 py-1.5 rounded-lg border border-slate-700 hover:bg-slate-800 transition-colors flex items-center gap-1"
                          >
                            {expanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
                            Manage
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Expanded panel */}
                    {expanded && (
                      <div className="border-t border-slate-800 bg-slate-800/20 px-5 py-4 space-y-4">
                        {/* Users list */}
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="text-sm font-semibold text-slate-300">Users in {org.name}</h3>
                          <button
                            onClick={() => {
                              if (showCreateUser === org.id) {
                                setShowCreateUser(null);
                              } else {
                                setShowCreateUser(org.id);
                                fetchOrgRoles(org.id);
                              }
                            }}
                            className="flex items-center gap-1.5 text-xs bg-green-700 hover:bg-green-600 text-white px-3 py-1.5 rounded-lg transition-colors"
                          >
                            <UserPlus className="size-3.5" />
                            Add User
                          </button>
                        </div>

                        {/* Create user form */}
                        {showCreateUser === org.id && (
                          <div className="rounded-xl border border-slate-700 bg-slate-900 p-4 space-y-3">
                            <h4 className="text-xs font-semibold text-slate-300">New User for {org.name}</h4>
                            {userError && <div className="text-xs text-red-400 bg-red-900/20 rounded px-3 py-2">{userError}</div>}
                            {userSuccess && <div className="text-xs text-green-400 bg-green-900/20 rounded px-3 py-2 flex items-center gap-1.5"><CheckCircle className="size-3.5" />{userSuccess}</div>}
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="text-xs text-slate-400 mb-1 block">Full Name *</label>
                                <input value={userForm.full_name} onChange={e => setUserForm(f => ({ ...f, full_name: e.target.value }))}
                                  placeholder="Dr. John Smith" className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-green-500/30" />
                              </div>
                              <div>
                                <label className="text-xs text-slate-400 mb-1 block">Email *</label>
                                <input type="email" value={userForm.email} onChange={e => setUserForm(f => ({ ...f, email: e.target.value }))}
                                  placeholder="john@clinic.com" className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-green-500/30" />
                              </div>
                              <div>
                                <label className="text-xs text-slate-400 mb-1 block">Phone</label>
                                <input value={userForm.phone} onChange={e => setUserForm(f => ({ ...f, phone: e.target.value }))}
                                  placeholder="+961 70 000 000" className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-green-500/30" />
                              </div>
                              <div>
                                <label className="text-xs text-slate-400 mb-1 block">Password (optional)</label>
                                <input type="password" value={userForm.password} onChange={e => setUserForm(f => ({ ...f, password: e.target.value }))}
                                  placeholder="Auto-generated if empty" className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-green-500/30" />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-slate-400 mb-1">Role</label>
                                <select
                                  value={userForm.role}
                                  onChange={(e) => setUserForm(f => ({ ...f, role: e.target.value }))}
                                  className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-red-500/50"
                                >
                                  {availableRoles.length > 0 ? (
                                    availableRoles.map((r) => (
                                      <option key={r.id} value={r.name}>
                                        {r.name.charAt(0).toUpperCase() + r.name.slice(1)}
                                      </option>
                                    ))
                                  ) : (
                                    <>
                                      <option value="admin">Admin</option>
                                      <option value="manager">Manager</option>
                                      <option value="provider">Provider</option>
                                      <option value="receptionist">Receptionist</option>
                                      <option value="accountant">Accountant</option>
                                    </>
                                  )}
                                </select>
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <button onClick={() => { setShowCreateUser(null); setUserError(""); setUserSuccess(""); }}
                                className="px-4 py-1.5 text-xs border border-slate-600 rounded-lg hover:bg-slate-700 transition-colors">Cancel</button>
                              <button onClick={() => handleCreateUser(org.id)} disabled={userLoading || !userForm.email || !userForm.full_name}
                                className="px-4 py-1.5 text-xs bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg font-medium flex items-center gap-1.5">
                                {userLoading ? <Loader2 className="size-3.5 animate-spin" /> : <UserPlus className="size-3.5" />}
                                Create User
                              </button>
                            </div>
                          </div>
                        )}

                        {editUserError && (
                          <div className="text-xs text-red-400 bg-red-900/20 rounded px-3 py-2 border border-red-900/50">
                            {editUserError}
                          </div>
                        )}

                        {/* Users table */}
                        {orgUsers[org.id] ? (
                          <div className="rounded-xl border border-slate-700 overflow-hidden">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b border-slate-700 bg-slate-800/50">
                                  <th className="px-4 py-2.5 text-start text-xs font-medium text-slate-400">Name</th>
                                  <th className="px-4 py-2.5 text-start text-xs font-medium text-slate-400">Email</th>
                                  <th className="px-4 py-2.5 text-start text-xs font-medium text-slate-400">Role</th>
                                  <th className="px-4 py-2.5 text-center text-xs font-medium text-slate-400">Status</th>
                                  <th className="px-4 py-2.5 text-start text-xs font-medium text-slate-400">Joined</th>
                                  <th className="px-4 py-2.5 w-20" />
                                </tr>
                              </thead>
                              <tbody>
                                {(orgUsers[org.id] as Record<string, unknown>[]).map((u, i) => {
                                  const isEditing = editingUser && (editingUser.id as string) === (u.id as string);
                                  return (
                                    <tr key={i} className="border-b border-slate-800 hover:bg-slate-800/30 transition-colors">
                                      <td className="px-4 py-2.5 font-medium">
                                        {isEditing ? (
                                          <input
                                            value={editUserForm.full_name}
                                            onChange={e => setEditUserForm(f => ({ ...f, full_name: e.target.value }))}
                                            className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                                          />
                                        ) : (u.full_name as string)}
                                      </td>
                                      <td className="px-4 py-2.5 text-slate-400 text-xs">{u.email as string}</td>
                                      <td className="px-4 py-2.5">
                                        {isEditing ? (
                                          <select
                                            value={editUserForm.role}
                                            onChange={e => setEditUserForm(f => ({ ...f, role: e.target.value }))}
                                            className="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                                          >
                                            {availableRoles.length > 0 ? availableRoles.map(r => (
                                              <option key={r.id} value={r.name}>{r.name.charAt(0).toUpperCase() + r.name.slice(1)}</option>
                                            )) : (
                                              <>
                                                <option value="admin">Admin</option>
                                                <option value="manager">Manager</option>
                                                <option value="provider">Provider</option>
                                                <option value="receptionist">Receptionist</option>
                                                <option value="accountant">Accountant</option>
                                              </>
                                            )}
                                          </select>
                                        ) : (
                                          <span className="inline-flex items-center rounded-full bg-slate-700 px-2 py-0.5 text-xs text-slate-300">
                                            {(u.role_name as string) ?? "—"}
                                          </span>
                                        )}
                                      </td>
                                      <td className="px-4 py-2.5 text-center">
                                        {isEditing ? (
                                          <select
                                            value={editUserForm.is_active ? "active" : "inactive"}
                                            onChange={e => setEditUserForm(f => ({ ...f, is_active: e.target.value === "active" }))}
                                            className="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white focus:outline-none"
                                          >
                                            <option value="active">Active</option>
                                            <option value="inactive">Inactive</option>
                                          </select>
                                        ) : u.is_active ? (
                                          <span className="inline-flex items-center gap-1 text-xs text-green-400"><CheckCircle className="size-3" />Active</span>
                                        ) : (
                                          <span className="inline-flex items-center gap-1 text-xs text-red-400"><XCircle className="size-3" />Inactive</span>
                                        )}
                                      </td>
                                      <td className="px-4 py-2.5 text-slate-400 text-xs">
                                        {new Date(u.created_at as string).toLocaleDateString()}
                                      </td>
                                      <td className="px-4 py-2.5">
                                        {isEditing ? (
                                          <div className="flex items-center gap-1">
                                            <button
                                              onClick={() => handleEditUser(u.id as string, org.id)}
                                              disabled={editUserLoading}
                                              className="rounded px-2 py-1 text-xs bg-green-600 hover:bg-green-500 text-white disabled:opacity-50 flex items-center gap-1"
                                            >
                                              {editUserLoading ? <Loader2 className="size-3 animate-spin" /> : <CheckCircle className="size-3" />}
                                              Save
                                            </button>
                                            <button
                                              onClick={() => { setEditingUser(null); setEditUserError(""); }}
                                              className="rounded px-2 py-1 text-xs border border-slate-600 hover:bg-slate-700 text-slate-300"
                                            >
                                              Cancel
                                            </button>
                                          </div>
                                        ) : (
                                          <div className="flex items-center gap-1">
                                            <button
                                              onClick={() => {
                                                setEditingUser(u);
                                                setEditUserForm({
                                                  full_name: (u.full_name as string) ?? "",
                                                  phone: (u.phone as string) ?? "",
                                                  role: (u.role_name as string) ?? "",
                                                  is_active: (u.is_active as boolean) ?? true,
                                                });
                                                fetchOrgRoles(org.id);
                                              }}
                                              className="rounded p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                                              title="Edit"
                                            >
                                              <Settings className="size-3.5" />
                                            </button>
                                            <button
                                              onClick={() => setDeleteConfirmUser({ ...u, orgId: org.id })}
                                              className="rounded p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-900/20 transition-colors"
                                              title="Delete"
                                            >
                                              <XCircle className="size-3.5" />
                                            </button>
                                          </div>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                            {(orgUsers[org.id] as unknown[]).length === 0 && (
                              <div className="px-4 py-6 text-center text-xs text-slate-500">No users yet.</div>
                            )}
                          </div>
                        ) : (
                          <div className="text-center text-xs text-slate-500 py-4 animate-pulse">Loading users...</div>
                        )}

                        {/* Quick stats */}
                        <div className="grid grid-cols-4 gap-3">
                          {[
                            { label: "Appointments Today", value: org.appts_today, color: "text-yellow-400" },
                            { label: "This Month", value: org.appts_month, color: "text-purple-400" },
                            { label: "Revenue (Month)", value: `$${Number(org.revenue_month).toLocaleString()}`, color: "text-emerald-400" },
                            { label: "Patients", value: org.patient_count, color: "text-pink-400" },
                          ].map(({ label, value, color }) => (
                            <div key={label} className="bg-slate-900 rounded-xl border border-slate-800 p-3 text-center">
                              <p className={`text-lg font-bold ${color}`}>{value}</p>
                              <p className="text-xs text-slate-500 mt-0.5">{label}</p>
                            </div>
                          ))}
                        </div>

                        {/* Open clinic button */}
                        <div className="flex gap-2">
                          <a
                            href={`/en/dashboard`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 text-xs border border-slate-700 hover:bg-slate-800 px-4 py-2 rounded-lg transition-colors"
                          >
                            <Settings className="size-3.5" />
                            Open Clinic Dashboard
                          </a>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {deleteConfirmUser && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !deleteUserLoading && setDeleteConfirmUser(null)} />
          <div className="relative z-10 w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl p-6 animate-in fade-in-0 zoom-in-95 duration-200">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-900/40 border border-red-800">
                <XCircle className="size-5 text-red-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-white">Delete User</h3>
                <p className="mt-1 text-sm text-slate-400">
                  Are you sure you want to delete{" "}
                  <strong className="text-white">{deleteConfirmUser.full_name as string}</strong>?
                  This will remove their access permanently.
                </p>
              </div>
            </div>
            <div className="mt-5 flex gap-2 justify-end">
              <button
                onClick={() => setDeleteConfirmUser(null)}
                disabled={deleteUserLoading}
                className="rounded-lg border border-slate-700 px-3 py-2 text-sm hover:bg-slate-800 text-slate-300 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteUser(deleteConfirmUser.id as string, deleteConfirmUser.orgId as string)}
                disabled={deleteUserLoading}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleteUserLoading ? <Loader2 className="size-4 animate-spin" /> : null}
                Delete User
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}