"use client";

import { useQuery } from "@tanstack/react-query";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getProjects } from "@/services/contractor.service";

export function ProjectPicker({
  value,
  onValueChange,
  placeholder,
  allowAll = false,
  allLabel,
  className,
  disabled = false,
}: {
  value: string;
  onValueChange: (value: string) => void;
  placeholder: string;
  allowAll?: boolean;
  allLabel?: string;
  className?: string;
  disabled?: boolean;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["projects", "options"],
    queryFn: () => getProjects({ page_size: 100, sort_by: "name" }),
    staleTime: 60_000,
  });

  return (
    <Select value={value || undefined} onValueChange={onValueChange}>
      <SelectTrigger
        className={className ?? "w-full"}
        disabled={isLoading || disabled}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent position="popper">
        {allowAll && <SelectItem value="all">{allLabel}</SelectItem>}
        {(data?.results ?? []).map((project) => (
          <SelectItem key={project.id} value={project.id}>
            {project.code} - {project.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
