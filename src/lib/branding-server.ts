import { BUILTIN_BRANDING, brandingQuery } from "@/lib/branding";
import type { Branding } from "@/interfaces/auth";

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000"
).replace(/\/$/, "");

export async function getPublicBranding(
  input?: Parameters<typeof brandingQuery>[0],
): Promise<Branding> {
  const query = brandingQuery(input);
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/branding/${query.size ? `?${query}` : ""}`,
      {
        cache: "no-store",
        // Branding must never hold a page open when the API or object storage
        // is cold. The client can still apply cached branding after hydration.
        signal: AbortSignal.timeout(800),
      },
    );
    if (!response.ok) return BUILTIN_BRANDING;
    const envelope = (await response.json()) as {
      success: boolean;
      data?: Branding;
    };
    return envelope.success && envelope.data
      ? envelope.data
      : BUILTIN_BRANDING;
  } catch {
    return BUILTIN_BRANDING;
  }
}
