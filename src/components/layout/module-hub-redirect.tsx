"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import type { Portal } from "@/interfaces/auth";
import { hubDestination, type PortalFeatureKey } from "@/lib/navigation";

/**
 * What a module's old hub address does now (A03).
 *
 * These addresses used to be a page of large cards, one per child, that a
 * reader had to pass through to reach any of them. The customer asked for the
 * page to go and for the menu to open the children directly - 「只移除大型
 * 卡片选择工作区的中间页面」. Bookmarks, notices and links in old messages
 * still carry the address, so it stays and forwards to the first child this
 * person can open, by the same rules the sidebar uses.
 */
export function ModuleHubRedirect({
  portal,
  feature,
}: {
  portal: Portal;
  feature: PortalFeatureKey;
}) {
  const t = useTranslations("moduleHub");
  const router = useRouter();
  const { user } = useAuth();
  const destination =
    user && user.portal === portal
      ? hubDestination(
          portal,
          feature,
          user.features,
          user.permissions,
          user.is_superuser,
        )
      : null;

  useEffect(() => {
    if (destination) router.replace(destination);
  }, [destination, router]);

  if (!user || destination) return null;
  return (
    <div className="rounded-lg border border-dashed px-6 py-16 text-center text-sm text-muted-foreground">
      {t("nothingToOpen")}
    </div>
  );
}
