import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { pgClient } from "@/db/index";

export const POST = withAuth(
  { roles: ["admin", "manager"] },
  async (request, { user }) => {
    const body = await request.json();
    const testPhone = body?.phone as string;

    if (!testPhone) {
      return NextResponse.json({ error: "Phone number required" }, { status: 422 });
    }

    const [org] = await pgClient`
      SELECT whatsapp_provider, whatsapp_api_token,
             whatsapp_phone_number_id, whatsapp_number,
             whatsapp_enabled, name
      FROM organizations
      WHERE id = ${user.organizationId}
    `;

    if (!org?.whatsapp_enabled) {
      return NextResponse.json({ error: "WhatsApp is not enabled" }, { status: 422 });
    }

    const { sendWhatsAppWithConfig } = await import("@/lib/whatsapp/send");

    const result = await sendWhatsAppWithConfig({
      to: testPhone,
      message: `✅ Test message from *${org.name}*\n\nYour WhatsApp integration is working correctly! 🎉`,
      config: {
        provider: org.whatsapp_provider,
        apiToken: org.whatsapp_api_token,
        phoneNumberId: org.whatsapp_phone_number_id,
        fromNumber: org.whatsapp_number,
      },
    });

    return NextResponse.json(result);
  }
);