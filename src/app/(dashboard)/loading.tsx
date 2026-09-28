import { KpiSkeleton, PanelSkeleton, SkeletonBlock } from "@/components/ui/states";

export default function Loading() {
  return (
    <>
      <div className="border-b border-line bg-surface">
        <div className="mx-auto max-w-[1440px] px-4 pb-4 pt-5 sm:px-6 lg:px-8">
          <SkeletonBlock className="h-5 w-40" />
          <SkeletonBlock className="mt-2 h-3.5 w-72" />
        </div>
      </div>
      <div className="mx-auto max-w-[1440px] space-y-5 px-4 py-5 sm:px-6 lg:px-8">
        <KpiSkeleton />
        <PanelSkeleton />
      </div>
    </>
  );
}
