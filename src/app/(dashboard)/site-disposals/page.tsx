import { WasteClearanceRedirect } from "@/components/contractor-ops/waste-clearance-redirect";

// 工地清运 lives in 垃圾清运 now (B08); the old address opens its tab there.
export default function SiteDisposalsPage() {
  return <WasteClearanceRedirect kind="disposal" />;
}
