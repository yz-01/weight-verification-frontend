import { TechnicalSupportWorkspace, type TechnicalSupportSection } from "@/components/support/technical-support-workspace";
import { redirect } from "next/navigation";
const SECTIONS = new Set<TechnicalSupportSection>(["tickets", "bugs", "api", "installations", "maintenance", "reports"]);
export default async function TechnicalSupportSectionPage({ params }: { params: Promise<{ section: string }> }) { const { section } = await params; if (section === "states") redirect("/support-tickets/tickets"); if (section === "activity") redirect("/audit-logs/search?category=TECHNICAL_SUPPORT"); return <TechnicalSupportWorkspace section={SECTIONS.has(section as TechnicalSupportSection) ? section as TechnicalSupportSection : "overview"} />; }
