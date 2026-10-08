"use client";

import { Download, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ExportFormat } from "@/services/contractor.service";

/**
 * Download the list currently on screen.
 *
 * A secondary action, so it sits in the toolbar as an outline pill rather than
 * competing with the one primary action in the page header.
 *
 * The caller supplies the format handler rather than the endpoint, because
 * what an export contains — which columns, worded how — belongs to the screen
 * that knows both. Failures are already toasted by the service layer; this
 * only has to stop spinning.
 */
export function ExportButton({
  onExport,
  disabled,
}: {
  onExport: (format: ExportFormat) => Promise<void>;
  disabled?: boolean;
}) {
  const t = useTranslations();
  const [busy, setBusy] = useState(false);

  async function run(format: ExportFormat) {
    setBusy(true);
    try {
      await onExport(format);
    } catch {
      // Already shown to the user by the service layer.
    } finally {
      setBusy(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled || busy}
        >
          {busy ? (
            <Loader2 className="animate-spin" />
          ) : (
            <Download />
          )}
          {t("common.export")}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onSelect={() => void run("xlsx")}>
          <FileSpreadsheet className="h-3.5 w-3.5" />
          {t("export.excel")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void run("pdf")}>
          <FileText className="h-3.5 w-3.5" />
          {t("export.pdf")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
