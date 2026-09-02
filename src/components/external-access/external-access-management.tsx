"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Link2, Loader2, Plus, ShieldX } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import {
  FieldWrapper,
  ListHeader,
  StatusBadge,
} from "@/components/shared/page-primitives";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  ExternalAccessField,
  ExternalAccessGrant,
  IssuedExternalAccessGrant,
} from "@/interfaces/external-access";
import { useDateFormat } from "@/lib/dates";
import {
  createExternalAccessGrant,
  getExternalAccessGrants,
  revokeExternalAccessGrant,
} from "@/services/external-access.service";

/** Exactly the five the backend accepts. Financial fields are refused there. */
const FIELDS: ExternalAccessField[] = [
  "project",
  "progress",
  "weighing",
  "documents",
  "evidence",
];

/** A datetime-local input wants `YYYY-MM-DDTHH:mm` in the reader's own zone. */
function localInput(at: Date): string {
  const offset = at.getTimezoneOffset() * 60_000;
  return new Date(at.getTime() - offset).toISOString().slice(0, 16);
}

/**
 * Issue and revoke external read-only links.
 *
 * The architecture document lists External Access Portal among the six
 * application ends. The reader page existed; nothing could issue a link for
 * it, so the whole end was unreachable. A link is read-only, scoped to one
 * project, limited to the sections chosen here, expires, and can be revoked.
 */
export function ExternalAccessManagement() {
  const t = useTranslations("externalAccess");
  const common = useTranslations("common");
  const df = useDateFormat();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [issued, setIssued] = useState<IssuedExternalAccessGrant | null>(null);
  const [revoking, setRevoking] = useState<ExternalAccessGrant | null>(null);
  const [reason, setReason] = useState("");

  const grants = useQuery({
    queryKey: ["external-access-grants"],
    queryFn: () => getExternalAccessGrants({ page_size: 100 }),
  });

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["external-access-grants"] });

  const revoke = useMutation({
    mutationFn: (grant: ExternalAccessGrant) =>
      revokeExternalAccessGrant(grant.id, reason),
    onSuccess: async () => {
      setRevoking(null);
      setReason("");
      await refresh();
    },
  });

  const rows = grants.data?.results ?? [];

  return (
    <div className="space-y-4">
      <ListHeader
        title={t("title")}
        subtitle={t("help")}
        action={
          <Button onClick={() => setCreating(true)}>
            <Plus />
            {t("action.create")}
          </Button>
        }
      />

      <div className="rounded-lg border bg-card shadow-sm">
        {grants.isLoading ? (
          <p className="p-5 text-sm text-muted-foreground">
            <Loader2 className="mr-2 inline size-4 animate-spin" />
            {common("loading")}
          </p>
        ) : grants.isError ? (
          <div className="m-5 flex flex-wrap items-center gap-3 rounded-lg border border-destructive/25 bg-destructive/5 p-4">
            <p className="text-sm text-destructive">{t("loadError")}</p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void grants.refetch()}
            >
              {common("retry")}
            </Button>
          </div>
        ) : !rows.length ? (
          <p className="m-5 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            {t("empty")}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {[
                    "name",
                    "project",
                    "shows",
                    "expires",
                    "lastUsed",
                    "status",
                  ].map((key) => (
                    <TableHead key={key}>{t(`column.${key}`)}</TableHead>
                  ))}
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((grant) => (
                  <TableRow key={grant.id}>
                    <TableCell>
                      <span className="font-medium">{grant.name}</span>
                      <span className="block font-mono text-xs text-muted-foreground">
                        {grant.token_hint}…
                      </span>
                    </TableCell>
                    <TableCell>
                      {grant.project_name
                        ? `${grant.project_code} / ${grant.project_name}`
                        : t("wholeCompany")}
                    </TableCell>
                    <TableCell className="max-w-56">
                      <div className="flex flex-wrap gap-1">
                        {grant.allowed_fields.map((field) => (
                          <StatusBadge
                            key={field}
                            label={t(`field.${field}`)}
                            tone="neutral"
                          />
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {df.dateTime(grant.expires_at)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {grant.last_used_at
                        ? df.dateTime(grant.last_used_at)
                        : t("neverUsed")}
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        label={t(
                          grant.revoked_at
                            ? "status.revoked"
                            : grant.is_valid
                              ? "status.valid"
                              : "status.expired",
                        )}
                        tone={
                          grant.revoked_at
                            ? "danger"
                            : grant.is_valid
                              ? "positive"
                              : "neutral"
                        }
                      />
                    </TableCell>
                    <TableCell>
                      {!grant.revoked_at && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setRevoking(grant)}
                        >
                          <ShieldX />
                          {t("action.revoke")}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {creating && (
        <GrantDialog
          onClose={() => setCreating(false)}
          onIssued={async (grant) => {
            setCreating(false);
            setIssued(grant);
            await refresh();
          }}
        />
      )}

      {issued && (
        <IssuedLinkDialog grant={issued} onClose={() => setIssued(null)} />
      )}

      {revoking && (
        <ConfirmDialog
          open
          onOpenChange={(next) => !next && setRevoking(null)}
          title={t("action.revoke")}
          description={t("revokeConfirm", { name: revoking.name })}
          confirmLabel={t("action.revoke")}
          confirmIcon={ShieldX}
          isPending={revoke.isPending}
          reason={reason}
          onReasonChange={setReason}
          onConfirm={() => revoke.mutate(revoking)}
        />
      )}
    </div>
  );
}

function GrantDialog({
  onClose,
  onIssued,
}: {
  onClose: () => void;
  onIssued: (grant: IssuedExternalAccessGrant) => void | Promise<void>;
}) {
  const t = useTranslations("externalAccess");
  const common = useTranslations("common");
  const [name, setName] = useState("");
  const [project, setProject] = useState("");
  // Read the clock once, lazily: calling it during every render is impure and
  // would also drift the default while the dialog is open.
  const [expiresAt, setExpiresAt] = useState(() =>
    localInput(new Date(Date.now() + 30 * 24 * 3600_000)),
  );
  const [fields, setFields] = useState<ExternalAccessField[]>([
    "project",
    "progress",
    "weighing",
  ]);

  const toggle = (field: ExternalAccessField) =>
    setFields((current) =>
      current.includes(field)
        ? current.filter((item) => item !== field)
        : [...current, field],
    );

  const save = useMutation({
    mutationFn: () =>
      createExternalAccessGrant({
        name: name.trim(),
        project: project || null,
        allowed_fields: fields,
        expires_at: new Date(expiresAt).toISOString(),
      }),
    onSuccess: onIssued,
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("action.create")}</DialogTitle>
          <DialogDescription>{t("createHelp")}</DialogDescription>
        </DialogHeader>

        <FieldWrapper label={t("column.name")} required hint={t("nameHint")}>
          <Input value={name} onChange={(event) => setName(event.target.value)} />
        </FieldWrapper>

        <FieldWrapper label={t("column.project")} hint={t("projectHint")}>
          <ProjectPicker
            value={project}
            onValueChange={setProject}
            placeholder={t("wholeCompany")}
          />
        </FieldWrapper>

        <FieldWrapper label={t("column.shows")} required hint={t("showsHint")}>
          <div className="flex flex-wrap gap-2">
            {FIELDS.map((field) => (
              <Button
                key={field}
                type="button"
                size="sm"
                variant={fields.includes(field) ? "default" : "outline"}
                onClick={() => toggle(field)}
              >
                {fields.includes(field) && <Check />}
                {t(`field.${field}`)}
              </Button>
            ))}
          </div>
        </FieldWrapper>

        <FieldWrapper label={t("column.expires")} required>
          <Input
            type="datetime-local"
            value={expiresAt}
            onChange={(event) => setExpiresAt(event.target.value)}
          />
        </FieldWrapper>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {common("cancel")}
          </Button>
          <Button
            disabled={!name.trim() || !fields.length || !expiresAt || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? <Loader2 className="animate-spin" /> : <Link2 />}
            {t("action.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The link, shown once.
 *
 * The server keeps only a hash of the token, so this dialog is the single
 * moment the URL exists in readable form. Closing it without copying means
 * revoking and issuing a new one.
 */
function IssuedLinkDialog({
  grant,
  onClose,
}: {
  grant: IssuedExternalAccessGrant;
  onClose: () => void;
}) {
  const t = useTranslations("externalAccess");
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(grant.portal_url);
      setCopied(true);
    } catch {
      // Clipboard access can be refused; the URL is selectable either way.
      setCopied(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("issued.title")}</DialogTitle>
          <DialogDescription>{t("issued.help")}</DialogDescription>
        </DialogHeader>

        <p className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm leading-6">
          {t("issued.onceOnly")}
        </p>

        <div className="flex items-center gap-2">
          <Input readOnly value={grant.portal_url} className="font-mono text-xs" />
          <Button variant="outline" onClick={copy}>
            {copied ? <Check /> : <Copy />}
            {t(copied ? "issued.copied" : "issued.copy")}
          </Button>
        </div>

        <DialogFooter>
          <Button onClick={onClose}>{t("issued.done")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
