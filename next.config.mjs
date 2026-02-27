import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: (() => {
      try {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
        const host = url ? new URL(url).hostname : "placeholder.supabase.co";
        return [{ protocol: "https", hostname: host, pathname: "/storage/v1/object/public/**" }];
      } catch {
        return [{ protocol: "https", hostname: "placeholder.supabase.co", pathname: "/storage/v1/object/public/**" }];
      }
    })(),
  },
};

export default withNextIntl(nextConfig);
