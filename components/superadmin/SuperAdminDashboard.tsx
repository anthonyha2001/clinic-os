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
  const [userForm, setUserForm] = useState({ email: "", full_name: "", phone: "", password: "" });
  const [userLoading, setUserLoading] = useState(false);
  const [userError, setUserError] = useState("");
  const [userSuccess, setUserSuccess] = useState("");

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
    setUserForm({ email: "", full_name: "", phone: "", password: "" });
    setOrgUsers(prev => ({ ...prev, [orgId]: [] })); // force refresh
    fetchOrgUsers(orgId);
    setUserLoading(false);
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
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-red-600 mb-4">
              <Shield className="size-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white">Superadmin</h1>
            <p className="text-gray-400 text-sm mt-1">Clinic OS Control Panel</p>
          </div>
          <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6 space-y-4">
            {authError && (
              <div className="rounded-lg bg-red-900/30 border border-red-700 px-4 py-2 text-sm text-red-400">
                {authError}
              </div>
            )}
            <div>
              <label className="text-xs font-medium text-gray-400 mb-1.5 block">Access PIN</label>
              <div className="relative">
                <input
                  type={showPin ? "text" : "password"}
                  value={pin}
                  onChange={e => setPin(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleLogin()}
                  placeholder="Enter superadmin PIN"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/50 pr-10"
                />
                <button
                  onClick={() => setShowPin(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                >
                  {showPin ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>
            <button
              onClick={handleLogin}
              disabled={authLoading || !pin}
              className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg py-2.5 text-sm font-medium transition-colors flex items-center justify-center gap-2"
            >
              {authLoading ? <Loader2 className="size-4 animate-spin" /> : <Shield className="size-4" />}
              {authLoading ? "Authenticating..." : "Access Control Panel"}
            </button>
          </div>
          <p className="text-center text-xs text-gray-600 mt-4">
            Set SUPERADMIN_PIN in .env.local
          </p>
        </div>
      </div>
    );
  }

  // DASHBOARD
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Top bar */}
      <div className="border-b border-gray-800 bg-gray-900 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-red-600 flex items-center justify-center">
            <Shield className="size-4 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold">Clinic OS Superadmin</h1>
            <p className="text-xs text-gray-400">Full system control</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors px-3 py-1.5 rounded-lg hover:bg-gray-800"
          >
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 px-3 py-1.5 rounded-lg hover:bg-gray-800"
          >
            <LogOut className="size-3.5" />
            Logout
          </button>
        </div>
      </div>

      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        {/* KPI Cards */}
        {summary && (
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
            {[
              { label: "Organizations", value: summary.total_orgs, icon: Building2, color: "text-blue-400" },
              { label: "Active Users", value: summary.active_users, icon: Users, color: "text-green-400" },
              { label: "Appts Today", value: summary.appts_today, icon: Calendar, color: "text-yellow-400" },
              { label: "Appts This Month", value: summary.appts_month, icon: TrendingUp, color: "text-purple-400" },
              { label: "Revenue (Month)", value: `$${Number(summary.revenue_month).toLocaleString()}`, icon: DollarSign, color: "text-emerald-400" },
              { label: "Total Patients", value: summary.total_patients, icon: Activity, color: "text-pink-400" },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="bg-gray-900 rounded-xl border border-gray-800 p-4">
                <Icon className={`size-5 ${color} mb-2`} />
                <p className="text-2xl font-bold">{value}</p>
                <p className="text-xs text-gray-400 mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Organizations */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Database className="size-5 text-blue-400" />
              <h2 className="font-semibold">Organizations</h2>
              <span className="bg-gray-800 text-gray-400 text-xs rounded-full px-2 py-0.5">{orgs.length}</span>
            </div>
            <button
              onClick={() => setShowCreateOrg(s => !s)}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
            >
              <Plus className="size-3.5" />
              New Organization
            </button>
          </div>

          {/* Create org form */}
          {showCreateOrg && (
            <div className="px-5 py-4 border-b border-gray-800 bg-gray-800/50">
              <h3 className="text-sm font-semibold mb-3">Create Organization</h3>
              {orgError && <div className="mb-3 text-xs text-red-400 bg-red-900/20 rounded-lg px-3 py-2">{orgError}</div>}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Clinic Name *</label>
                  <input value={orgForm.name} onChange={e => setOrgForm(f => ({ ...f, name: e.target.value, slug: e.target.value.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") }))}
                    placeholder="Dr. Smith Clinic" className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Slug *</label>
                  <input value={orgForm.slug} onChange={e => setOrgForm(f => ({ ...f, slug: e.target.value }))}
                    placeholder="dr-smith-clinic" className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Timezone</label>
                  <select value={orgForm.timezone} onChange={e => setOrgForm(f => ({ ...f, timezone: e.target.value }))}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none">
                    {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Currency</label>
                  <select value={orgForm.currency} onChange={e => setOrgForm(f => ({ ...f, currency: e.target.value }))}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none">
                    {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <button onClick={() => setShowCreateOrg(false)} className="px-4 py-1.5 text-xs border border-gray-600 rounded-lg hover:bg-gray-700 transition-colors">Cancel</button>
                <button onClick={handleCreateOrg} disabled={orgLoading || !orgForm.name}
                  className="px-4 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg text-white font-medium flex items-center gap-1.5 transition-colors">
                  {orgLoading ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
                  Create
                </button>
              </div>
            </div>
          )}

          {/* Orgs list */}
          {loading ? (
            <div className="p-8 text-center text-gray-500 text-sm animate-pulse">Loading organizations...</div>
          ) : orgs.length === 0 ? (
            <div className="p-8 text-center text-gray-500 text-sm">No organizations yet.</div>
          ) : (
            <div className="divide-y divide-gray-800">
              {orgs.map(org => {
                const online = isOnline(org.last_activity);
                const suspended = suspendedOrgs.has(org.id);
                const expanded = expandedOrg === org.id;

                return (
                  <div key={org.id}>
                    <div className="px-5 py-4 hover:bg-gray-800/30 transition-colors">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 min-w-0">
                          {/* Online indicator */}
                          <div className="relative shrink-0">
                            <div className={`h-10 w-10 rounded-xl flex items-center justify-center text-sm font-bold ${suspended ? "bg-gray-700 text-gray-400" : "bg-blue-900/50 text-blue-400"}`}>
                              {org.name.charAt(0).toUpperCase()}
                            </div>
                            <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-gray-900 ${online && !suspended ? "bg-green-400" : "bg-gray-600"}`} />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-semibold text-sm truncate">{org.name}</p>
                              {suspended && <span className="text-xs bg-red-900/30 text-red-400 border border-red-800 rounded-full px-1.5 py-0.5">Suspended</span>}
                              <span className="text-xs text-gray-500">/{org.slug}</span>
                            </div>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {org.user_count} users · {org.patient_count} patients · {org.timezone} · {org.currency}
                            </p>
                          </div>
                        </div>

                        {/* Stats */}
                        <div className="hidden lg:flex items-center gap-6 text-center shrink-0">
                          <div>
                            <p className="text-sm font-semibold">{org.appts_today}</p>
                            <p className="text-xs text-gray-500">Today</p>
                          </div>
                          <div>
                            <p className="text-sm font-semibold">{org.appts_month}</p>
                            <p className="text-xs text-gray-500">This month</p>
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-emerald-400">${Number(org.revenue_month).toLocaleString()}</p>
                            <p className="text-xs text-gray-500">Revenue</p>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className={`h-2 w-2 rounded-full ${online && !suspended ? "bg-green-400" : "bg-gray-600"}`} />
                            <span className="text-xs text-gray-400">{online && !suspended ? "Active" : "Inactive"}</span>
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
                            className="text-xs px-3 py-1.5 rounded-lg border border-gray-700 hover:bg-gray-800 transition-colors flex items-center gap-1"
                          >
                            {expanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
                            Manage
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Expanded panel */}
                    {expanded && (
                      <div className="border-t border-gray-800 bg-gray-800/20 px-5 py-4 space-y-4">
                        {/* Users list */}
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="text-sm font-semibold text-gray-300">Users in {org.name}</h3>
                          <button
                            onClick={() => setShowCreateUser(showCreateUser === org.id ? null : org.id)}
                            className="flex items-center gap-1.5 text-xs bg-green-700 hover:bg-green-600 text-white px-3 py-1.5 rounded-lg transition-colors"
                          >
                            <UserPlus className="size-3.5" />
                            Add User
                          </button>
                        </div>

                        {/* Create user form */}
                        {showCreateUser === org.id && (
                          <div className="rounded-xl border border-gray-700 bg-gray-900 p-4 space-y-3">
                            <h4 className="text-xs font-semibold text-gray-300">New User for {org.name}</h4>
                            {userError && <div className="text-xs text-red-400 bg-red-900/20 rounded px-3 py-2">{userError}</div>}
                            {userSuccess && <div className="text-xs text-green-400 bg-green-900/20 rounded px-3 py-2 flex items-center gap-1.5"><CheckCircle className="size-3.5" />{userSuccess}</div>}
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="text-xs text-gray-400 mb-1 block">Full Name *</label>
                                <input value={userForm.full_name} onChange={e => setUserForm(f => ({ ...f, full_name: e.target.value }))}
                                  placeholder="Dr. John Smith" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500/30" />
                              </div>
                              <div>
                                <label className="text-xs text-gray-400 mb-1 block">Email *</label>
                                <input type="email" value={userForm.email} onChange={e => setUserForm(f => ({ ...f, email: e.target.value }))}
                                  placeholder="john@clinic.com" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500/30" />
                              </div>
                              <div>
                                <label className="text-xs text-gray-400 mb-1 block">Phone</label>
                                <input value={userForm.phone} onChange={e => setUserForm(f => ({ ...f, phone: e.target.value }))}
                                  placeholder="+961 70 000 000" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500/30" />
                              </div>
                              <div>
                                <label className="text-xs text-gray-400 mb-1 block">Password (optional)</label>
                                <input type="password" value={userForm.password} onChange={e => setUserForm(f => ({ ...f, password: e.target.value }))}
                                  placeholder="Auto-generated if empty" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500/30" />
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <button onClick={() => { setShowCreateUser(null); setUserError(""); setUserSuccess(""); }}
                                className="px-4 py-1.5 text-xs border border-gray-600 rounded-lg hover:bg-gray-700 transition-colors">Cancel</button>
                              <button onClick={() => handleCreateUser(org.id)} disabled={userLoading || !userForm.email || !userForm.full_name}
                                className="px-4 py-1.5 text-xs bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg font-medium flex items-center gap-1.5">
                                {userLoading ? <Loader2 className="size-3.5 animate-spin" /> : <UserPlus className="size-3.5" />}
                                Create User
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Users table */}
                        {orgUsers[org.id] ? (
                          <div className="rounded-xl border border-gray-700 overflow-hidden">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b border-gray-700 bg-gray-800/50">
                                  <th className="px-4 py-2.5 text-start text-xs font-medium text-gray-400">Name</th>
                                  <th className="px-4 py-2.5 text-start text-xs font-medium text-gray-400">Email</th>
                                  <th className="px-4 py-2.5 text-start text-xs font-medium text-gray-400">Phone</th>
                                  <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-400">Status</th>
                                  <th className="px-4 py-2.5 text-start text-xs font-medium text-gray-400">Joined</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(orgUsers[org.id] as Record<string, unknown>[]).map((u, i) => (
                                  <tr key={i} className="border-b border-gray-800 hover:bg-gray-800/30 transition-colors">
                                    <td className="px-4 py-2.5 font-medium">{u.full_name as string}</td>
                                    <td className="px-4 py-2.5 text-gray-400">{u.email as string}</td>
                                    <td className="px-4 py-2.5 text-gray-400">{(u.phone as string) ?? "—"}</td>
                                    <td className="px-4 py-2.5 text-center">
                                      {u.is_active ? (
                                        <span className="inline-flex items-center gap-1 text-xs text-green-400"><CheckCircle className="size-3" />Active</span>
                                      ) : (
                                        <span className="inline-flex items-center gap-1 text-xs text-red-400"><XCircle className="size-3" />Inactive</span>
                                      )}
                                    </td>
                                    <td className="px-4 py-2.5 text-gray-400 text-xs">
                                      {new Date(u.created_at as string).toLocaleDateString()}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            {(orgUsers[org.id] as unknown[]).length === 0 && (
                              <div className="px-4 py-6 text-center text-xs text-gray-500">No users yet.</div>
                            )}
                          </div>
                        ) : (
                          <div className="text-center text-xs text-gray-500 py-4 animate-pulse">Loading users...</div>
                        )}

                        {/* Quick stats */}
                        <div className="grid grid-cols-4 gap-3">
                          {[
                            { label: "Appointments Today", value: org.appts_today, color: "text-yellow-400" },
                            { label: "This Month", value: org.appts_month, color: "text-purple-400" },
                            { label: "Revenue (Month)", value: `$${Number(org.revenue_month).toLocaleString()}`, color: "text-emerald-400" },
                            { label: "Patients", value: org.patient_count, color: "text-pink-400" },
                          ].map(({ label, value, color }) => (
                            <div key={label} className="bg-gray-900 rounded-xl border border-gray-800 p-3 text-center">
                              <p className={`text-lg font-bold ${color}`}>{value}</p>
                              <p className="text-xs text-gray-500 mt-0.5">{label}</p>
                            </div>
                          ))}
                        </div>

                        {/* Open clinic button */}
                        <div className="flex gap-2">
                          <a
                            href={`/en/dashboard`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 text-xs border border-gray-700 hover:bg-gray-800 px-4 py-2 rounded-lg transition-colors"
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
    </div>
  );
}