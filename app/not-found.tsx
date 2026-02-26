import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h2 className="text-xl font-bold">404 — Page Not Found</h2>
      <Link href="/" className="text-primary underline hover:no-underline">
        Return Home
      </Link>
    </div>
  );
}
