import { redirect } from "next/navigation";

/**
 * Progress Claim is a Multi Engine package type now (batch H, H10 / HD17):
 * the old address opens its tab there.
 */
export default function ClaimsPage() {
  redirect("/evidence-packages?type=PROGRESS_CLAIM");
}
