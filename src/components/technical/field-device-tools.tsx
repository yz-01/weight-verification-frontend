"use client";

import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";

import { DeviceUploadTools } from "@/components/technical/device-upload-tools";
import { Button } from "@/components/ui/button";

/**
 * `/field-staff/device`: this phone's uploads, for a technician standing next
 * to the worker. Linked from nowhere in the field app; the office's 技术管理
 * page names the address.
 */
export function FieldDeviceTools() {
  const t = useTranslations("technical");
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" title={t("phone.back")}>
          <Link href="/field-staff">
            <ArrowLeft />
          </Link>
        </Button>
        <div className="min-w-0">
          <h1 className="panel-title">{t("phone.title")}</h1>
          <p className="text-xs text-muted-foreground">{t("phone.subtitle")}</p>
        </div>
      </div>
      <DeviceUploadTools />
    </div>
  );
}
