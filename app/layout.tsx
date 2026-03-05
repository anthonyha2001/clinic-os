import "./globals.css";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { PWAInstallPrompt } from "@/components/pwa/PWAInstallPrompt";
import { PWARegister } from "@/components/pwa/PWARegister";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#1E3A5F" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Clinic OS" />
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body className="font-sans antialiased">
        <ThemeProvider>
          <PWARegister />
          <PWAInstallPrompt />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
