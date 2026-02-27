import { Skeleton } from "@/components/ui/Skeleton";

export default function PatientDetailLoading() {
  return (
    <div className="space-y-4 max-w-5xl">
      <Skeleton className="h-4 w-24" />
      <div className="rounded-xl border bg-card p-5">
        <div className="flex items-center gap-4">
          <Skeleton className="h-14 w-14 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <div className="grid grid-cols-3 lg:grid-cols-6 gap-3 mt-5 pt-4 border-t">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </div>
      <div className="flex gap-2 border-b pb-2">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-10 w-24 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}
