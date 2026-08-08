"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useEffect } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { ProjectPicker } from "@/components/site-operations/project-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getActiveProjectId,
  setActiveProjectId,
} from "@/lib/project-context";

export function ConsultantProjectPicker({
  value,
  onChange,
  allowAll = false,
}: {
  value: string;
  onChange: (projectId: string) => void;
  allowAll?: boolean;
}) {
  const t = useTranslations("consultantWorkflow");
  const { user, refresh } = useAuth();
  const queryClient = useQueryClient();
  const isConsultant = user?.account_type === "CONSULTANT";
  const consultantProjects = (user?.consultant_projects ?? []).filter(
    (project) => project.is_current,
  );

  useEffect(() => {
    if (!isConsultant || value || consultantProjects.length === 0) return;
    const stored = getActiveProjectId();
    const initial =
      consultantProjects.find((project) => project.project_id === stored)
        ?.project_id ?? consultantProjects[0].project_id;
    setActiveProjectId(initial);
    onChange(initial);
  }, [consultantProjects, isConsultant, onChange, value]);

  if (!isConsultant) {
    return (
      <ProjectPicker
        value={value}
        onValueChange={(next) => onChange(next === "all" ? "" : next)}
        placeholder={t("project.choose")}
        allowAll={allowAll}
        allLabel={t("project.all")}
        className="w-full sm:w-80"
      />
    );
  }

  const changeConsultantProject = async (projectId: string) => {
    setActiveProjectId(projectId);
    onChange(projectId);
    await refresh();
    await queryClient.invalidateQueries();
  };

  return (
    <Select value={value || undefined} onValueChange={changeConsultantProject}>
      <SelectTrigger className="w-full sm:w-80">
        <SelectValue placeholder={t("project.choose")} />
      </SelectTrigger>
      <SelectContent>
        {consultantProjects.map((project) => (
          <SelectItem key={project.project_id} value={project.project_id}>
            {project.project_code} - {project.project_name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
