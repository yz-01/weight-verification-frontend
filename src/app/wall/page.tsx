import type { Metadata } from "next";

import { HeadquartersWall } from "@/components/dashboard/headquarters-wall";

export const metadata: Metadata = { title: "MSE Trace" };

/**
 * 总部大屏 (JB291): its own page and tab, outside the office console, so
 * nothing done in the back office changes or interrupts it.
 */
export default function HeadquartersWallPage() {
  return <HeadquartersWall />;
}
