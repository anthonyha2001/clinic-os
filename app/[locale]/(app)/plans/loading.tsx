import { Skeleton, SkeletonTable } from "@/components/ui/Skeleton";

export default function PlansLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-4 w-32 mt-1" />
        </div>
        <Skeleton className="h-10 w-32 rounded-lg" />
      </div>
      <SkeletonTable rows={6} cols={5} />
    </div>
  );
}
