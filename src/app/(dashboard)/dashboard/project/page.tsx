import { Suspense } from "react";

import { ProjectDashboard } from "@/components/dashboard/project-dashboard";

/** 项目 Dashboard (C11): one project's day, under the 公司总部 Dashboard. */
export default function ProjectDashboardPage() {
  return (
    <Suspense>
      <ProjectDashboard />
    </Suspense>
  );
}
