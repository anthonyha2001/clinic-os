import { Skeleton, SkeletonTable } from "@/components/ui/Skeleton";

export default function BillingLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-4 w-40 mt-2" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-24 rounded-lg" />
          <Skeleton className="h-10 w-28 rounded-lg" />
        </div>
      </div>
      <div className="flex gap-2 flex-wrap">
        <Skeleton className="h-9 w-16 rounded-lg" />
        <Skeleton className="h-9 w-20 rounded-lg" />
        <Skeleton className="h-9 w-24 rounded-lg" />
        <Skeleton className="h-9 w-28 rounded-lg" />
      </div>
      <SkeletonTable rows={6} cols={6} />
    </div>
  );
}
