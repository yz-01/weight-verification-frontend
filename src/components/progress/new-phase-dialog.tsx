"use client";

/**
 * 「＋新增施工分类」 from wherever a 施工分类 is chosen (H14, HD3).
 *
 * Client 11/10 事项14: 「施工进度没有新建分类的地方手机端也一样，修复一下」. The
 * phases could only be made on the 施工分类 tab, which nobody opened: the
 * dropdowns people actually use - the phone's 新增进度 and the office's photo
 * wall and record filters - had no way in. Only the name is asked; the server
 * makes the code. A name already on the project returns that category.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { FieldWrapper } from "@/components/shared/page-primitives";
import { ProjectPicker } from "@/components/site-operations/project-picker";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/interfaces/api";
import type { ConstructionPhase } from "@/interfaces/contractor-ops";
import { createConstructionPhase } from "@/services/contractor-ops.service";

/** The option value that opens this dialog from a 施工分类 dropdown. */
export const NEW_PHASE_OPTION = "__new_phase__";

export function NewPhaseDialog({
  project: initialProject,
  onClose,
  onCreated,
}: {
  /** The project it is made in; empty asks for one (an all-projects filter). */
  project: string;
  onClose: () => void;
  onCreated: (phase: ConstructionPhase) => void;
}) {
  const t = useTranslations("contractorOps");
  const qc = useQueryClient();
  const [project, setProject] = useState(initialProject);
  const [name, setName] = useState("");
  const save = useMutation({
    mutationFn: () => createConstructionPhase({ project, name: name.trim() }),
    onSuccess: (phase) => {
      void qc.invalidateQueries({ queryKey: ["construction-phases"] });
      onCreated(phase);
    },
  });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("progress.newPhase.title")}</DialogTitle>
          <DialogDescription>{t("progress.newPhase.help")}</DialogDescription>
        </DialogHeader>
        {!initialProject && (
          <FieldWrapper label={t("field.project")} required>
            <ProjectPicker
              value={project}
              onValueChange={setProject}
              placeholder={t("field.selectProject")}
            />
          </FieldWrapper>
        )}
        <FieldWrapper label={t("progress.newPhase.name")} required>
          <Input
            value={name}
            autoFocus
            maxLength={200}
            onChange={(event) => setName(event.target.value)}
          />
        </FieldWrapper>
        {save.error && (
          <p role="alert" className="text-sm text-destructive">
            {save.error instanceof ApiError ? save.error.message : t("progress.saveError")}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("action.cancel")}
          </Button>
          <Button
            requires={[
              [project, t("field.project")],
              [name, t("progress.newPhase.name")],
            ]}
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? <Loader2 className="animate-spin" /> : <Save />}
            {t("action.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
