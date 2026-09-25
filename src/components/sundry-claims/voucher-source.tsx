"use client";

/**
 * The payment voucher area on a sundry claim (T-399, D-282).
 *
 * One area, four ways in, because finance's voucher is usually already on
 * the screen somewhere:
 *
 * * 选文件 - the file input. On a phone `accept="image/*"` is what offers the
 *   camera and the gallery, so it stays the plain input it was;
 * * 拖进来 - a file dropped onto the area;
 * * Ctrl+V - a screenshot pasted while anything in the area has focus (the
 *   area itself is focusable, so clicking it is enough);
 * * 【从聊天室挑选】 - a photo already sent in THIS claim's conversation. That
 *   sends the message id, not the picture: the server copies the photo
 *   itself and refuses a message from any other record.
 *
 * Whatever was chosen is shown before it is uploaded, because the upload
 * locks it (D-231) and a voucher nobody looked at is the one that turns out
 * to be the wrong screenshot.
 */

import { useQuery } from "@tanstack/react-query";
import { ImageIcon, Images, Loader2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDateFormat } from "@/lib/dates";
import { recordConversationKey } from "@/lib/record-chat";
import { cn } from "@/lib/utils";
import {
  carriesFiles,
  imageFilesFrom,
  pickablePhotos,
  type TransferLike,
  type VoucherChoice,
} from "@/lib/voucher-sources";
import { getRecordConversation } from "@/services/contractor-ops.service";

export function VoucherSource({
  claimId,
  value,
  onChange,
}: {
  claimId: string;
  value: VoucherChoice | null;
  onChange: (choice: VoucherChoice | null) => void;
}) {
  const t = useTranslations("sundryClaim.proofs");
  const df = useDateFormat();
  const [dragging, setDragging] = useState(false);
  const [refused, setRefused] = useState(false);
  const [showChat, setShowChat] = useState(false);
  // Remounting the input clears the name it shows once the choice changes
  // some other way - a paste, a drop, a chat pick, or 【换一张】.
  const [inputKey, setInputKey] = useState(0);

  // The same query the conversation panel below reads, so opening the
  // chooser costs nothing when the panel has already loaded.
  const chat = useQuery({
    queryKey: recordConversationKey("SUNDRY_CLAIM", claimId),
    queryFn: () => getRecordConversation("SUNDRY_CLAIM", claimId),
    enabled: showChat,
  });
  const photos = useMemo(() => pickablePhotos(chat.data?.messages), [chat.data]);

  const file = value?.source === "file" ? value.file : null;
  const fileUrl = useMemo(() => (file ? URL.createObjectURL(file) : ""), [file]);
  useEffect(() => () => {
    if (fileUrl) URL.revokeObjectURL(fileUrl);
  }, [fileUrl]);
  const previewUrl = value?.source === "chat" ? value.photo.url : fileUrl;

  const take = (transfer: TransferLike | null, fromInput = false) => {
    const [image] = imageFilesFrom(transfer);
    if (image) {
      setRefused(false);
      onChange({ source: "file", file: image });
      if (!fromInput) setInputKey((key) => key + 1);
      return true;
    }
    setRefused(carriesFiles(transfer));
    return false;
  };

  return (
    <div
      className="space-y-2"
      // Anywhere in the area: the drop zone, the file input, the buttons.
      // Only a paste that carries an image is taken, so text pasted
      // elsewhere on the screen is left alone.
      onPaste={(event) => {
        if (imageFilesFrom(event.clipboardData).length > 0) {
          event.preventDefault();
          take(event.clipboardData);
        }
      }}
    >
      <div
        tabIndex={0}
        aria-label={t("dropHint")}
        className={cn(
          "space-y-2 rounded-md border border-dashed p-2 outline-none focus-visible:ring-2 focus-visible:ring-ring",
          dragging && "border-primary bg-primary/5",
        )}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          take(event.dataTransfer);
        }}
      >
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <ImageIcon className="mt-0.5 size-3.5 shrink-0" />
          {t("dropHint")}
        </p>
        <Input
          key={inputKey}
          type="file"
          accept="image/*"
          className="h-8 text-xs"
          onChange={(event) => {
            if (!take({ files: event.target.files }, true)) onChange(null);
          }}
        />
        {refused && <p role="alert" className="text-xs text-destructive">{t("notImage")}</p>}
        {previewUrl ? (
          <figure className="space-y-1">
            <p className="text-xs font-medium">{t("preview")}</p>
            <a href={previewUrl} target="_blank" rel="noreferrer" className="block overflow-hidden rounded border">
              {/* A local blob or the conversation's own copy - not an
                  optimisable asset. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previewUrl} alt={t("preview")} className="max-h-48 w-full object-contain" />
            </a>
            <figcaption className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
              <span className="min-w-0 truncate">
                {value?.source === "chat"
                  ? t("fromChat", { name: value.photo.author || "—" })
                  : file?.name}
              </span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={() => {
                  onChange(null);
                  setInputKey((key) => key + 1);
                }}
              >
                <X />
                {t("clearChoice")}
              </Button>
            </figcaption>
          </figure>
        ) : null}
      </div>

      <Button
        type="button"
        size="sm"
        variant="outline"
        className="w-full"
        aria-expanded={showChat}
        onClick={() => setShowChat((open) => !open)}
      >
        <Images />
        {showChat ? t("hideChat") : t("pickFromChat")}
      </Button>
      {showChat && (
        <div className="rounded-md border p-2">
          {chat.isLoading ? (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              {t("chatLoading")}
            </p>
          ) : chat.isError ? (
            <p role="alert" className="text-xs text-destructive">{t("chatFailed")}</p>
          ) : photos.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("chatEmpty")}</p>
          ) : (
            <ul className="grid grid-cols-3 gap-1.5">
              {photos.map((photo) => {
                const chosen = value?.source === "chat" && value.photo.id === photo.id;
                return (
                  <li key={photo.id}>
                    <button
                      type="button"
                      aria-pressed={chosen}
                      title={`${photo.author} · ${df.dateTime(photo.sentAt)}`}
                      className={cn(
                        "block aspect-square w-full overflow-hidden rounded border",
                        chosen && "ring-2 ring-primary",
                      )}
                      onClick={() => {
                        setRefused(false);
                        setInputKey((key) => key + 1);
                        onChange({ source: "chat", photo });
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photo.url} alt={t("fromChat", { name: photo.author || "—" })} className="size-full object-cover" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
