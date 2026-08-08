"use client";

import { useQuery } from "@tanstack/react-query";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Project } from "@/interfaces/contractor";
import { getProjects } from "@/services/contractor.service";

export function ProjectPicker({
  value,
  onValueChange,
  placeholder,
  allowAll = false,
  allLabel,
  className,
  disabled = false,
  projects,
  projectsLoading,
  projectsError,
}: {
  value: string;
  onValueChange: (value: string) => void;
  placeholder: string;
  allowAll?: boolean;
  allLabel?: string;
  className?: string;
  disabled?: boolean;
  projects?: Project[];
  projectsLoading?: boolean;
  projectsError?: boolean;
}) {
  const shouldLoadProjects = projects === undefined;
  const { data, isLoading, isError } = useQuery({
    queryKey: ["projects", "options"],
    queryFn: () => getProjects({ page_size: 100, sort_by: "name" }),
    enabled: shouldLoadProjects,
    staleTime: 60_000,
  });
  const options = projects ?? data?.results ?? [];
  const loading = projectsLoading ?? (shouldLoadProjects && isLoading);
  const failed = projectsError ?? (shouldLoadProjects && isError);

  return (
    <Select value={value || undefined} onValueChange={onValueChange}>
      <SelectTrigger
        className={className ?? "w-full"}
        disabled={loading || failed || disabled}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent position="popper">
        {allowAll && <SelectItem value="all">{allLabel}</SelectItem>}
        {options.map((project) => (
          <SelectItem key={project.id} value={project.id}>
            {project.code} - {project.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
