import {
  AlertTriangle,
  Calendar,
  ChartColumn,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Cog,
  Home,
  Menu,
  Receipt,
  UserCheck,
  Users,
  Zap,
} from "lucide-react";

/** Lucide-only icon system wrappers */
export function HomeIcon({ className }: { className?: string }) {
  return <Home className={className} strokeWidth={2} />;
}

export function CalendarIcon({ className }: { className?: string }) {
  return <Calendar className={className} strokeWidth={2} />;
}

export function UsersIcon({ className }: { className?: string }) {
  return <Users className={className} strokeWidth={2} />;
}

export function ReceiptIcon({ className }: { className?: string }) {
  return <Receipt className={className} strokeWidth={2} />;
}

export function ClipboardIcon({ className }: { className?: string }) {
  return <ClipboardList className={className} strokeWidth={2} />;
}

export function ChartBarIcon({ className }: { className?: string }) {
  return <ChartColumn className={className} strokeWidth={2} />;
}

export function CogIcon({ className }: { className?: string }) {
  return <Cog className={className} strokeWidth={2} />;
}

export function MenuIcon({ className }: { className?: string }) {
  return <Menu className={className} strokeWidth={2} />;
}

export function CheckCircleIcon({ className }: { className?: string }) {
  return <CheckCircle2 className={className} strokeWidth={2} />;
}

export function AlertTriangleIcon({ className }: { className?: string }) {
  return <AlertTriangle className={className} strokeWidth={2} />;
}

export function ZapIcon({ className }: { className?: string }) {
  return <Zap className={className} strokeWidth={2} />;
}

export function UserCheckIcon({ className }: { className?: string }) {
  return <UserCheck className={className} strokeWidth={2} />;
}

export function ChevronDownIcon({ className }: { className?: string }) {
  return <ChevronDown className={className} strokeWidth={2} />;
}
