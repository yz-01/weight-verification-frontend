"use client";

import { ContractorWasteOrders } from "@/components/dispatches/contractor-waste-orders";
import { Dispatches } from "@/components/dispatches/dispatches";
import { useAuth } from "@/components/providers/auth-provider";

/*
 * The contractor's 废料订单 is back in 环保材料管理 (JB248, 客户 11-23b 事项 1
 * 第三点), on its own page with its own statistics line; B08 had put it in
 * 垃圾清运. The recycler's console keeps this list as it was.
 */
export default function DispatchesPage() {
  const { user } = useAuth();
  if (!user) return null;
  return user.portal === "MSE_TRACE" ? <ContractorWasteOrders /> : <Dispatches />;
}
