import { TechnicalSupportWorkspace, type TechnicalSupportSection } from "@/components/support/technical-support-workspace";
const SECTIONS = new Set<TechnicalSupportSection>(["tickets", "states", "bugs", "api", "installations", "maintenance", "reports", "activity"]);
export default async function TechnicalSupportSectionPage({ params }: { params: Promise<{ section: string }> }) { const { section } = await params; return <TechnicalSupportWorkspace section={SECTIONS.has(section as TechnicalSupportSection) ? section as TechnicalSupportSection : "overview"} />; }
