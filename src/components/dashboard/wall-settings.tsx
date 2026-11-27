"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Link2, Settings2 } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";

import { WallControl } from "@/components/dashboard/wall-screen";
import { LoadFailed } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { WallSettingRow, WallSettings } from "@/interfaces/wall-screen";
import {
  createWallLink,
  getWallSettings,
  revokeWallLink,
  saveWallSettings,
  wallLinkAddress,
} from "@/services/wall-screen.service";

export const WALL_SETTINGS_KEY = ["wall-screen", "settings"] as const;

/**
 * 大屏展示设定 (JB291 五, 客户 11-27e: 「现场照片、项目资料及ESG展示内容由建筑商
 * 后台授权」): per active project, 上大屏 / 现场照片 / ESG; and the link for a
 * screen nobody signs in on (reception, meeting room). Head office only
 * (公司设置's manage right); the server checks the same and audits each save.
 * The button sits with the wall's other corner buttons and hides with them.
 */
export function WallSettingsButton({ onSaved }: { onSaved: () => void }) {
  const t = useTranslations("jb291");
  const [open, setOpen] = useState(false);
  return (
    <>
      <WallControl onClick={() => setOpen(true)} data-wall-settings-open>
        <Settings2 className="size-[1.4rem]" aria-hidden />
        {t("settings")}
      </WallControl>
      {open && <WallSettingsDialog open={open} onOpenChange={setOpen} onSaved={onSaved} />}
    </>
  );
}

export function WallSettingsDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const t = useTranslations("jb291");
  const common = useTranslations("common");
  const queryClient = useQueryClient();
  const settings = useQuery({ queryKey: WALL_SETTINGS_KEY, queryFn: getWallSettings });
  const [rows, setRows] = useState<WallSettingRow[] | null>(null);
  const shown = rows ?? settings.data?.projects ?? [];
  const changed = rows !== null && JSON.stringify(rows) !== JSON.stringify(settings.data?.projects ?? []);
  const save = useMutation({
    mutationFn: () => saveWallSettings(shown),
    onSuccess: (data) => {
      queryClient.setQueryData(WALL_SETTINGS_KEY, data);
      setRows(null);
      onSaved();
      onOpenChange(false);
    },
  });
  const set = (project: string, field: "shown" | "photos" | "esg", value: boolean) =>
    setRows(shown.map((row) => (row.project === project ? { ...row, [field]: value } : row)));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl" data-wall-settings>
        <DialogHeader>
          <DialogTitle>{t("settings")}</DialogTitle>
          <DialogDescription>{t("settingsIntro")}</DialogDescription>
        </DialogHeader>
        {settings.isError ? (
          <LoadFailed onRetry={() => void settings.refetch()} />
        ) : settings.isLoading ? (
          <p className="text-sm text-muted-foreground">{common("loading")}</p>
        ) : shown.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noActive")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("colProject")}</TableHead>
                <TableHead className="w-24 text-center">{t("colShown")}</TableHead>
                <TableHead className="w-24 text-center">{t("colPhotos")}</TableHead>
                <TableHead className="w-24 text-center">{t("colEsg")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((row) => (
                <TableRow key={row.project} data-wall-setting-row={row.project}>
                  <TableCell>
                    <span className="font-medium">{row.name}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{row.code}</span>
                  </TableCell>
                  <TableCell className="text-center">
                    <Switch
                      checked={row.shown}
                      onCheckedChange={(value) => set(row.project, "shown", value)}
                      aria-label={`${row.name} · ${t("colShown")}`}
                    />
                  </TableCell>
                  <TableCell className="text-center">
                    <Switch
                      checked={row.photos}
                      disabled={!row.shown}
                      onCheckedChange={(value) => set(row.project, "photos", value)}
                      aria-label={`${row.name} · ${t("colPhotos")}`}
                    />
                  </TableCell>
                  <TableCell className="text-center">
                    <Switch
                      checked={row.esg}
                      disabled={!row.shown}
                      onCheckedChange={(value) => set(row.project, "esg", value)}
                      aria-label={`${row.name} · ${t("colEsg")}`}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <p className="text-xs text-muted-foreground">{t("neverShown")}</p>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {common("cancel")}
          </Button>
          <Button onClick={() => save.mutate()} disabled={!changed || save.isPending} data-wall-settings-save>
            {save.isPending ? common("saving") : common("save")}
          </Button>
        </DialogFooter>
        {settings.data && <WallLinkBlock settings={settings.data} />}
      </DialogContent>
    </Dialog>
  );
}

/** 接待区大屏链接: made once, copied, ended - the token is shown only once. */
function WallLinkBlock({ settings }: { settings: WallSettings }) {
  const t = useTranslations("jb291");
  const format = useFormatter();
  const queryClient = useQueryClient();
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const make = useMutation({
    mutationFn: createWallLink,
    onSuccess: (data) => {
      setToken(data.token ?? null);
      setCopied(false);
      queryClient.setQueryData(WALL_SETTINGS_KEY, { projects: data.projects, link: data.link });
    },
  });
  const end = useMutation({
    mutationFn: revokeWallLink,
    onSuccess: (data) => {
      setToken(null);
      setConfirming(false);
      queryClient.setQueryData(WALL_SETTINGS_KEY, data);
    },
  });
  const link = settings.link;
  const address = token && typeof window !== "undefined" ? wallLinkAddress(token, window.location.origin) : null;
  const when = (value: string) =>
    format.dateTime(new Date(value), { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
  return (
    <section className="mt-2 space-y-3 rounded-lg border p-4" data-wall-link>
      <h3 className="flex items-center gap-2 font-semibold">
        <Link2 className="size-4" aria-hidden />
        {t("linkTitle")}
      </h3>
      <p className="text-sm text-muted-foreground">{t("linkIntro")}</p>
      {link ? (
        <p className="text-sm">
          {t("linkMadeAt", { time: when(link.created_at), name: link.created_by || "-" })}
          {" · "}
          {link.last_opened_at ? t("linkOpenedAt", { time: when(link.last_opened_at) }) : t("linkNeverOpened")}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">{t("linkNone")}</p>
      )}
      {address && (
        <div className="space-y-2 rounded-md bg-muted/60 p-3" data-wall-link-address>
          <p className="text-sm font-medium text-tone-amber-fg">{t("linkShownOnce")}</p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 break-all text-sm">{address}</code>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void navigator.clipboard?.writeText(address).then(() => setCopied(true));
              }}
            >
              {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
              {copied ? t("linkCopied") : t("linkCopy")}
            </Button>
          </div>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => make.mutate()} disabled={make.isPending} data-wall-link-make>
          {link ? t("linkRemake") : t("linkMake")}
        </Button>
        {link &&
          (confirming ? (
            <>
              <span className="self-center text-sm text-tone-rose-fg">{t("confirmRevoke")}</span>
              <Button variant="destructive" onClick={() => end.mutate()} disabled={end.isPending} data-wall-link-revoke-confirm>
                {t("linkRevokeConfirm")}
              </Button>
              <Button variant="ghost" onClick={() => setConfirming(false)}>
                {t("keepLink")}
              </Button>
            </>
          ) : (
            <Button variant="outline-destructive" onClick={() => setConfirming(true)} data-wall-link-revoke>
              {t("linkRevoke")}
            </Button>
          ))}
      </div>
    </section>
  );
}
