import DeskSkeleton from "@/components/admin/DeskSkeleton";

/**
 * One loading boundary for the whole desk.
 *
 * A segment's loading.tsx covers that segment and everything under it, so this
 * single file answers every admin navigation. Individual routes can still add
 * their own where the shape differs enough to be worth it.
 */
export default function AdminLoading() {
  return <DeskSkeleton />;
}
