type WhatsAppConfig = {
    provider: string;
    apiToken?: string | null;
    phoneNumberId?: string | null;
    fromNumber?: string | null;
  };
  
  type SendParams = {
    to: string;
    message: string;
    config?: WhatsAppConfig;
  };
  
  type SendResult = {
    success: boolean;
    messageId?: string;
    error?: string;
    mock?: boolean;
  };
  
  export async function sendWhatsAppWithConfig({ to, message, config }: SendParams): Promise<SendResult> {
    const phone = normalizePhone(to);
  
    // ── Meta WhatsApp Business API ──
    if (config?.provider === "meta" && config.apiToken && config.phoneNumberId) {
      try {
        const res = await fetch(
          `https://graph.facebook.com/v18.0/${config.phoneNumberId}/messages`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${config.apiToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              messaging_product: "whatsapp",
              to: phone,
              type: "text",
              text: { body: message },
            }),
          }
        );
        const data = await res.json();
        if (!res.ok) return { success: false, error: data?.error?.message ?? JSON.stringify(data) };
        return { success: true, messageId: data.messages?.[0]?.id };
      } catch (e) {
        return { success: false, error: String(e) };
      }
    }
  
    // ── Twilio WhatsApp ──
    if (config?.provider === "twilio" && config.apiToken && config.fromNumber) {
      try {
        const [accountSid, authToken] = (config.apiToken ?? "").split(":");
        const credentials = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
        const res = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
          {
            method: "POST",
            headers: {
              Authorization: `Basic ${credentials}`,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
              From: `whatsapp:${config.fromNumber}`,
              To: `whatsapp:${phone}`,
              Body: message,
            }),
          }
        );
        const data = await res.json();
        if (!res.ok) return { success: false, error: data?.message ?? JSON.stringify(data) };
        return { success: true, messageId: data.sid };
      } catch (e) {
        return { success: false, error: String(e) };
      }
    }
  
    // ── Mock / development ──
    if (process.env.NODE_ENV !== "production") {
      console.log("📱 [WhatsApp MOCK]", { to: phone, messageLength: message?.length ?? 0 });
    }
    return { success: true, messageId: `mock_${Date.now()}`, mock: true };
  }
  
  // Convenience wrapper — fetches org config automatically
  export async function sendWhatsApp({
    to,
    message,
    orgId,
  }: {
    to: string;
    message: string;
    orgId: string;
  }): Promise<SendResult> {
    const { pgClient } = await import("@/db/index");
    const [org] = await pgClient`
      SELECT whatsapp_provider, whatsapp_api_token,
             whatsapp_phone_number_id, whatsapp_number,
             whatsapp_enabled
      FROM organizations
      WHERE id = ${orgId}
      LIMIT 1
    `;
  
    return sendWhatsAppWithConfig({
      to,
      message,
      config: org
        ? {
            provider: org.whatsapp_enabled ? (org.whatsapp_provider ?? "mock") : "mock",
            apiToken: org.whatsapp_api_token,
            phoneNumberId: org.whatsapp_phone_number_id,
            fromNumber: org.whatsapp_number,
          }
        : { provider: "mock" },
    });
  }
  
  export function normalizePhone(phone: string): string {
    let p = String(phone ?? "").replace(/[\s\-().]/g, "");
    if (!p.startsWith("+")) {
      if (p.startsWith("0")) p = "+961" + p.slice(1);
      else if (p.startsWith("961")) p = "+" + p;
      else p = "+961" + p;
    }
    return p;
  }