import "@/app/globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Super Admin — Clinic OS",
};

export default function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-950 text-white font-sans antialiased">
      {children}
    </div>
  );
}
