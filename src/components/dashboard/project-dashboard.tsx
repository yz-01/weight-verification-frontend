"use client";

import { useQuery } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect } from "react";

import { CompanyBanner } from "@/components/dashboard/company-banner";
import { ContractorDashboard } from "@/components/dashboard/contractor-dashboard";
import { useAuth } from "@/components/providers/auth-provider";
import { getProject } from "@/services/contractor.service";

/**
 * 项目 Dashboard (C11): the contractor's existing daily dashboard, on a page
 * of its own under the company one, with the project it is reading named at
 * the top. The project lives in the URL (`?project=`), so entering a project
 * from the 公司总部 map or list lands here already narrowed to it.
 */
export function ProjectDashboard() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const project = searchParams.get("project") ?? "";
  const t = useTranslations("headquarters.banner");
  const { user, can } = useAuth();
  // Only a contractor with the dashboard has this level; anyone else goes
  // back to the home page their console has.
  const allowed = user?.portal === "MSE_TRACE" && can("dashboard.view");
  useEffect(() => {
    if (user && !allowed) router.replace("/dashboard");
  }, [allowed, router, user]);
  const named = useQuery({
    queryKey: ["projects", "detail", project],
    queryFn: () => getProject(project),
    enabled: Boolean(project) && allowed,
    staleTime: 60_000,
  });

  const choose = (next: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next) params.set("project", next);
    else params.delete("project");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  };

  if (!allowed) return null;
  return (
    <div className="space-y-4">
      <CompanyBanner
        scope="project"
        projectName={
          named.data
            ? `${named.data.code} · ${named.data.name}`
            : named.isError
              ? t("projectUnreadable")
              : undefined
        }
      />
      <ContractorDashboard project={project} onProjectChange={choose} />
    </div>
  );
}
