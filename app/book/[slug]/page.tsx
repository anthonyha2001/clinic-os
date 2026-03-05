import { PublicBookingClient } from "@/components/booking/PublicBookingClient";
import { pgClient } from "@/db/index";
import { notFound } from "next/navigation";

export default async function PublicBookingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [org] = await pgClient`
    SELECT id, name, slug, timezone, currency,
           booking_enabled, booking_message,
           phone, address, logo_url,
           working_hours, off_days
    FROM organizations
    WHERE slug = ${slug}
    LIMIT 1
  `;

  if (!org) notFound();
  if (!org.booking_enabled) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center p-8">
          <h1 className="text-2xl font-bold text-gray-800">{org.name}</h1>
          <p className="text-gray-500 mt-2">Online booking is currently unavailable.</p>
          {org.phone && <p className="mt-4 text-gray-700">Call us: <a href={`tel:${org.phone}`} className="text-blue-600 font-medium">{org.phone}</a></p>}
        </div>
      </div>
    );
  }

  return <PublicBookingClient org={org} />;
}