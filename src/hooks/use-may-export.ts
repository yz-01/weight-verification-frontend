import { useAuth } from "@/components/providers/auth-provider";

/**
 * Whether this account may take a file out (导出) or send one (发送).
 *
 * JB210 (Lucas 11-16 Q5 = A; walk 11-17 F-A4): a consultant does so only with
 * 「导出」 ticked on his project - 「导出：报表和各模块清单可以导出」. Without it he
 * previews and prints. Everyone else: as before, the screens decide.
 */
export function useMayExport(): boolean {
  const { user, can } = useAuth();
  return user?.account_type !== "CONSULTANT" || can("report.export");
}
