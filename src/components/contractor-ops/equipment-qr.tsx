"use client";

/**
 * One machine's QR code, from 设备清单 (2026-10 I24, ID59).
 *
 * 「后台应该可以生成设备二维码给手机端去扫码，在设备清单那里 … 二维码是可以打印给
 * 供应商的」 (Lucas, 2026-10-15). The code is the machine's own link
 * (`/scan/equipment?equipment=<id>`): scanned in 设备进退场 or 设备操作员工时 it
 * picks this machine. Here it is shown with the number it is printed beside,
 * and can be printed as its A4 sticker - the same sticker as a ticked batch -
 * or downloaded as a picture to send to the supplier.
 */

import { useMutation, useQuery } from "@tanstack/react-query";
import { Download, Loader2 } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useEffect } from "react";

import { FileActionButtons } from "@/components/shared/file-actions";
import { QueryFailedNote } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { SiteEquipment } from "@/interfaces/contractor-ops";
import {
  downloadEquipmentQr,
  equipmentQrObjectUrl,
  equipmentQrStickers,
} from "@/services/contractor-ops.service";

/** The big number on the sticker: the 现场编号, else the equipment number. */
export function stickerNumber(machine: Pick<SiteEquipment, "site_no" | "code">): string {
  return machine.site_no?.trim() || machine.code;
}

export function EquipmentQrDialog({
  machine,
  onClose,
}: {
  machine: SiteEquipment;
  onClose: () => void;
}) {
  const t = useTranslations("contractorOps");
  const image = useQuery({
    queryKey: ["equipment-qr", machine.id],
    queryFn: () => equipmentQrObjectUrl(machine.id),
    // A picture held as a blob URL: fetched for this dialog, let go with it.
    gcTime: 0,
    staleTime: Infinity,
  });
  const imageUrl = image.data;
  useEffect(
    () => () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    },
    [imageUrl],
  );
  const save = useMutation({
    mutationFn: () => downloadEquipmentQr(machine.id, stickerNumber(machine)),
  });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("equipmentQr.title", { name: machine.name })}</DialogTitle>
          <DialogDescription>{t("equipmentQr.help")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-3 rounded-lg border bg-paper p-4 text-center">
          {imageUrl ? (
            <Image
              src={imageUrl}
              alt={t("equipmentQr.imageAlt", { name: machine.name })}
              width={224}
              height={224}
              unoptimized
              className="size-56 rounded bg-paper object-contain"
            />
          ) : image.isError ? (
            <QueryFailedNote query={image} what={t("equipmentQr.what")} />
          ) : (
            <div className="grid size-56 place-items-center">
              <Loader2 className="size-7 animate-spin text-primary" />
            </div>
          )}
          <p className="text-3xl font-bold tabular-nums tracking-tight">{stickerNumber(machine)}</p>
          <p className="font-medium">
            {[machine.name, machine.registration_no].filter(Boolean).join(" · ")}
          </p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-left text-xs">
            <dt className="text-muted-foreground">{t("field.supplier")}</dt>
            <dd className="font-medium">{machine.supplier_name || "—"}</dd>
            <dt className="text-muted-foreground">{t("field.project")}</dt>
            <dd className="font-medium">{machine.project_name}</dd>
          </dl>
        </div>
        <p className="text-xs text-muted-foreground">{t("equipmentQr.siteNoHint")}</p>
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          {/* The A4 sticker - 预览 · 打印 · 导出 · 发送, the PDF rule. */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <FileActionButtons
              label={t("equipmentQr.sticker")}
              source={{
                load: () => equipmentQrStickers([machine.id]),
                title: t("equipmentQr.stickerTitle", { number: stickerNumber(machine) }),
              }}
            />
          </div>
          <Button
            variant="outline"
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? <Loader2 className="animate-spin" /> : <Download />}
            {t("equipmentQr.download")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
