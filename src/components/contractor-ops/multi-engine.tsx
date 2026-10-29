"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowDownToLine,
  ArrowUp,
  ArrowUpToLine,
  Eye,
  ExternalLink,
  FileText,
  FolderCog,
  Inbox,
  Loader2,
  Paperclip,
  Plus,
  Share2,
  Trash2,
  Upload,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

import { useSubcontractors } from "@/components/contractor-ops/claim-engine";
import {
  ClaimCategoriesDialog,
  ClaimInfoBlock,
  ClaimInfoFields,
  EMPTY_CLAIM_INFO,
  SendLog,
  usePackageSend,
  claimInfoPayload,
  periodLabel,
  sendStatusKeys,
  useClaimInfoComplete,
  type ClaimInfoValue,
} from "@/components/contractor-ops/package-claim-parts";
import { usePackageRecordOpener } from "@/components/contractor-ops/package-record-opener";
import { ProjectFilter } from "@/components/contractor-ops/operations-workspaces";
import {
  AnswerLines,
  ExchangePanel,
} from "@/components/contractor-ops/package-exchange";
import { ClaimFacetBlock } from "@/components/contractor-ops/package-claim-facet";
import { PackTargetChooser } from "@/components/contractor-ops/pack-collect";
import { useAuth } from "@/components/providers/auth-provider";
import { ProjectPicker } from "@/components/site-operations/project-picker";
import { useOnProjectChange, usePageProject } from "@/components/providers/current-project-provider";
import { ExportButton } from "@/components/shared/export-button";
import { FileActionButtons, useFileActions } from "@/components/shared/file-actions";
import { RecordAttachmentsPanel } from "@/components/shared/record-attachments";
import { EmptyState, FieldWrapper, FilterBar, ListHeader, LoadFailed, QueryFailedNote, StatusBadge } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CategoryOptionItems } from "@/components/shared/category-options";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Shell } from "@/components/contractor-ops/package-shell";
import { PackageItemPictures } from "@/components/contractor-ops/package-item-pictures";
import { FileThumbs } from "@/components/shared/file-thumbs";
import { useClearSearchParam } from "@/hooks/use-url-selection";
import { useDateFormat } from "@/lib/dates";
import {
  PACKAGE_TYPES,
  type ArchiveRecordKind,
  type EvidencePackageDetail,
  type EvidencePackageRow,
  type PackageClaimInfo,
  type PackageItem,
  type PackageLayoutRow,
  type PackagePart,
  type PackageSelection,
  type PackageType,
} from "@/interfaces/contractor-ops";
import {
  addPackageItems,
  confirmEvidencePackage,
  createEvidencePackage,
  deleteEvidencePackage,
  evidencePackageFile,
  exportEvidencePackages,
  previewDraftPackage,
  previewEvidencePackage,
  downloadPackageItem,
  getEvidencePackage,
  getEvidencePackages,
  getPackageCandidates,
  getPackageRecordParts,
  getProjectCategories,
  removePackageItem,
  reorderPackageContents,
  updateEvidencePackage,
  updatePackageItem,
} from "@/services/contractor-ops.service";
import { clickOpensRow } from "@/components/shared/inside-row-control";

/**
 * Multi Engine - gather evidence from several columns into one PDF (T-235).
 *
 * Lucas 转述客户：「用来 export pdf 的，就是可以把文件整合在一起然后打包成 PDF」.
 *
 * ## This is not the archive queue
 *
 * 总栏目 (`archive-queue.tsx`) answers "what has nobody looked at yet", and
 * every record is in it whether anyone wants it or not. A package exists
 * because somebody deliberately chose these records - the choosing is the
 * content. Both list records; they mean completely different things, and
 * putting them on one screen would be the D-125 mistake again.
 *
 * ## A draft and a confirmed package are different objects
 *
 * A draft can be edited and deleted. A confirmed one cannot: it is the record
 * of why these documents were put together (D-138, D-142). So the screen never
 * draws an edit or delete control on a confirmed package and then refuses it -
 * it draws what is true for that package. `can_delete` and `can_return` come
 * from the server for exactly this reason.
 */

/** Columns a package can draw from. Attendance is a grouping, not a record. */
const KINDS: ArchiveRecordKind[] = [
  "MATERIAL_RECEIPT",
  "MATERIAL_OUTGOING",
  "EQUIPMENT_MOVEMENT",
  "HAZARD",
  "WASTE_OUTGOING",
  "DISPOSAL_REQUEST",
  "PROGRESS",
  "CONSULTANT_APPLICATION",
  // HD17: 杂费报销 records, packed as a Sundry Claim's sources.
  "SUNDRY_CLAIM",
  // J30-2: MR / 其他申请, once decided.
  "MATERIAL_REQUEST",
];

const PAGE_SIZE = 20;

/**
 * HD17 / H10: 「一套 Multi Engine，多种打包用途。Progress Claim 只是其中一种业务
 * 类型」. The six types are tabs over one list; Progress Claim's tab is the
 * claim screen it always was (period, 已进本期, 已 Claim, 收款), so /claims
 * lands here. Head office reads claims without reading packages, so it sees
 * that one tab only.
 */
export function MultiEngineWorkspace() {
  const t = useTranslations("multiEngine");
  const { can } = useAuth();
  const asked = useSearchParams().get("type") as PackageType | null;
  const packages = can("package.view");
  const claims = can("claim.view");
  const [chosen, setType] = useState<PackageType | "" | null>(null);
  // JB52 (客户 10-28 事项 5、13): the Progress Claim tab is a filter of the one
  // list. Who reads claims without packages reads only those packages.
  const type: PackageType | "" =
    !packages ? "PROGRESS_CLAIM" : chosen ?? (asked && PACKAGE_TYPES.includes(asked) ? asked : "");

  return (
    <div className="flex flex-col gap-4">
      {packages && (
        <nav aria-label={t("type.label")} className="flex flex-wrap gap-1.5">
          {(["", ...PACKAGE_TYPES] as const)
            .filter((value) => value !== "PROGRESS_CLAIM" || claims || packages)
            .map((value) => (
              <button
                key={value || "all"}
                type="button"
                onClick={() => setType(value)}
                aria-current={type === value ? "true" : undefined}
                className={`inline-flex h-8 items-center rounded-full border px-3 text-xs font-medium transition-colors pointer-coarse:h-10 ${
                  type === value
                    ? "border-primary/40 bg-primary/12 text-primary"
                    : "border-border bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                {value ? t(`type.${value}`) : t("type.all")}
              </button>
            ))}
        </nav>
      )}
      <PackageList type={type} />
    </div>
  );
}

function PackageList({ type }: { type: PackageType | "" }) {
  const t = useTranslations("multiEngine");
  const formatter = useDateFormat();
  const { can } = useAuth();
  // The top bar's 「当前项目」 (B13): 「Multi Engine 又要选一次项目」 was the
  // client's complaint, so the list is on it and has no project box.
  const [project, setProject] = usePageProject();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  // `?package=` opens one: 「返回 Multi Engine」 from a module's list comes
  // back to the package it was collecting into (2026-10-10, 二 7), and a
  // record's 「已打包」 links here too. Closing takes it out of the address.
  const linked = useSearchParams().get("package");
  const clearLinked = useClearSearchParam("package");
  // An old CLM- claim's link (`?claim=`, notices, a category's records)
  // opens the package it raised (JB52 第 4 点).
  const linkedClaim = useSearchParams().get("claim");
  const clearClaim = useClearSearchParam("claim");
  // query-failure: a link that finds nothing leaves the list as it is; the api toasts the refusal.
  const claimPackage = useQuery({
    queryKey: ["claim-package-link", linkedClaim],
    queryFn: () => getEvidencePackages({ claim: linkedClaim ?? undefined, page_size: 1 }),
    enabled: Boolean(linkedClaim),
  });
  const [chosenId, setOpenId] = useState<string | null>(null);
  const openId = chosenId ?? linked ?? (linkedClaim ? (claimPackage.data?.results[0]?.id ?? null) : null);
  // Progress Claim filters (JB52 第 3 点): 期数, 分类, 分包商.
  const isClaimTab = type === "PROGRESS_CLAIM";
  const [period, setPeriod] = useState("");
  const [claimCategory, setClaimCategory] = useState("");
  const [subcontractor, setSubcontractor] = useState("");
  const [managingCategories, setManagingCategories] = useState(false);
  const claimFilters = isClaimTab
    ? {
        period: period || undefined,
        claim_category: claimCategory || undefined,
        subcontractor: subcontractor || undefined,
      }
    : {};
  // Page 1 of the next project, and the one open on the last project closes
  // (B13 audit #8).
  useOnProjectChange(project, () => {
    setPage(1);
    setOpenId(null);
    setClaimCategory("");
  });
  const [creating, setCreating] = useState(false);
  // 收到的资料包 (J30-1): what the sites sent to head office in the system.
  // The notice opens the list with `?received=1`.
  const headOffice = can("project.view_all");
  const [received, setReceived] = useState(useSearchParams().get("received") === "1");
  const receivedOnly = headOffice && received;

  const query = useQuery({
    queryKey: ["evidence-packages", project, search, page, type, receivedOnly, ...(isClaimTab ? [claimFilters] : [])],
    queryFn: () =>
      getEvidencePackages({
        project: project || undefined,
        search: search || undefined,
        type: type || undefined,
        received: receivedOnly ? 1 : undefined,
        ...claimFilters,
        page,
        page_size: PAGE_SIZE,
      }),
  });

  const rows = query.data?.results ?? [];
  const total = query.data?.count ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-4">
      <ListHeader
        title={t("title")}
        subtitle={t("subtitle")}
        action={
          can("package.manage") || (isClaimTab && can("category.manage")) ? (
            <div className="flex flex-wrap gap-2">
              {/* 客户 10-28: 「这个应该是新增claim 分类，不是新增claim」 - where
                  「开一期 Claim」 was, the Claim categories. */}
              {isClaimTab && can("category.manage") && (
                <Button variant="outline" onClick={() => setManagingCategories(true)} data-claim-categories-button>
                  <FolderCog className="size-4" />
                  {t("claimCategories.button")}
                </Button>
              )}
              {can("package.manage") && (
                <Button onClick={() => setCreating(true)}>
                  <Plus className="size-4" />
                  {t("new")}
                </Button>
              )}
            </div>
          ) : undefined
        }
      />

      <FilterBar>
        <ProjectFilter
          value={project}
          onChange={(next) => {
            setProject(next);
            setPage(1);
          }}
        />
        <Input
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          placeholder={t("searchPlaceholder")}
          className="w-full sm:w-72"
        />
        {isClaimTab && (
          <ClaimTabFilters
            project={project}
            period={period}
            category={claimCategory}
            subcontractor={subcontractor}
            onChange={(next) => {
              setPeriod(next.period);
              setClaimCategory(next.category);
              setSubcontractor(next.subcontractor);
              setPage(1);
            }}
          />
        )}
        {headOffice ? (
          <Button
            type="button"
            variant={receivedOnly ? "default" : "outline"}
            aria-pressed={receivedOnly}
            data-received-packages
            onClick={() => {
              setReceived((current) => !current);
              setPage(1);
            }}
          >
            <Inbox className="size-4" />
            {t("received")}
          </Button>
        ) : null}
        {/* The packages listed, as a file (H16, HD13). */}
        <ExportButton
          disabled={total === 0}
          disabledReason={t("empty")}
          title={t("title")}
          onExport={(format) =>
            exportEvidencePackages({
              format,
              title: t("title"),
              query: {
                project: project || undefined,
                search: search || undefined,
                type: type || undefined,
                ...claimFilters,
              },
              columns: [
                { key: "package_no", label: t("export.number") },
                { key: "name", label: t("column.name") },
                {
                  key: "package_type",
                  label: t("column.type"),
                  values: Object.fromEntries(PACKAGE_TYPES.map((value) => [value, t(`type.${value}`)])),
                },
                { key: "project_name", label: t("column.project") },
                {
                  key: "state",
                  label: t("column.state"),
                  values: { DRAFT: t("state.DRAFT"), CONFIRMED: t("state.CONFIRMED") },
                },
                {
                  key: "review_state",
                  label: t("column.review"),
                  values: {
                    NOT_SENT: t("review.NOT_SENT"),
                    SENT: t("review.SENT"),
                    REVIEWED: t("review.REVIEWED"),
                  },
                },
                { key: "created_by_name", label: t("column.packedBy") },
                { key: "confirmed_by_name", label: t("export.confirmedBy") },
                { key: "created_at", label: t("column.when") },
                { key: "confirmed_at", label: t("export.confirmedAt") },
                { key: "recipient_count", label: t("export.recipients") },
                { key: "current_round", label: t("export.round") },
              ],
            })
          }
        />
      </FilterBar>

      {query.isLoading ? (
        <p className="text-sm text-muted-foreground">{t("loading")}</p>
      ) : query.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {t("failed")}
        </p>
      ) : rows.length === 0 ? (
        <EmptyState icon={Inbox} title={t("empty")} />
      ) : (
        <div className="surface-panel overflow-hidden rounded-xl">
          <Table className="min-w-[52rem]">
            <TableHeader>
              <TableRow>
                <TableHead>{t("column.name")}</TableHead>
                <TableHead>{t("column.type")}</TableHead>
                <TableHead>{t("column.project")}</TableHead>
                <TableHead className="text-right tabular">{t("column.items")}</TableHead>
                <TableHead>{t("column.state")}</TableHead>
                <TableHead>{t("column.review")}</TableHead>
                <TableHead>{t("column.packedBy")}</TableHead>
                <TableHead>{t("column.when")}</TableHead>
                <TableHead className="text-right">{t("column.action")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer"
                  onClick={(event) => {
                    if (clickOpensRow(event)) setOpenId(row.id);
                  }}
                >
                  <TableCell className="font-medium">
                    {row.package_no && (
                      <span className="block text-xs font-normal text-muted-foreground tabular">
                        {row.package_no}
                      </span>
                    )}
                    {row.name}
                    <ClaimLine info={row.claim_info} />
                    {row.remarks && (
                      <span className="block max-w-88 truncate text-xs font-normal text-muted-foreground">
                        {row.remarks}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {t(`type.${row.package_type ?? "OTHER"}`)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.project_name}
                  </TableCell>
                  <TableCell className="text-right tabular">
                    {row.item_count}
                    {row.returned_count > 0 && (
                      <span className="ml-1.5 text-xs text-destructive">
                        {t("returnedCount", { count: row.returned_count })}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusBadge
                      label={t(`state.${row.state}`)}
                      tone={row.state === "CONFIRMED" ? "positive" : "neutral"}
                    />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    <SendStatusWords row={row} />
                    {(row.recipient_count ?? 0) > 0 && (
                      <span className="block text-xs">
                        {t("recipientCount", { count: row.recipient_count ?? 0 })}
                      </span>
                    )}
                  </TableCell>
                  {/* H3 / HD20: 「是谁打包」 - who made it, who confirmed it. */}
                  <TableCell className="text-muted-foreground">
                    <span className="block">{row.created_by_name || "—"}</span>
                    {row.confirmed_by_name && (
                      <span className="block text-xs">
                        {t("confirmedByShort", { name: row.confirmed_by_name })}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {formatter.dateTime(row.created_at)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setOpenId(row.id)}
                    >
                      {t("open")}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {lastPage > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <span className="text-muted-foreground">
            {t("pageOf", { page, pages: lastPage })}
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1}
              disabledReason={t("firstPage")}
              onClick={() => setPage((current) => current - 1)}
            >
              {t("previous")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= lastPage}
              disabledReason={t("lastPage")}
              onClick={() => setPage((current) => current + 1)}
            >
              {t("next")}
            </Button>
          </div>
        </div>
      )}

      {creating && (
        <NewPackageDialog
          initialType={type || "OTHER"}
          initialProject={project}
          onClose={() => setCreating(false)}
          onCreated={(row) => {
            setCreating(false);
            setOpenId(row.id);
          }}
        />
      )}
      {openId && (
        <PackageSheet
          id={openId}
          onClose={() => {
            setOpenId(null);
            clearLinked();
            clearClaim();
          }}
        />
      )}
      {managingCategories && (
        <ClaimCategoriesDialog project={project} onClose={() => setManagingCategories(false)} />
      )}
    </div>
  );
}

function NewPackageDialog({
  initialType,
  initialProject,
  onClose,
  onCreated,
}: {
  initialType: PackageType;
  initialProject: string;
  onClose: () => void;
  onCreated: (row: EvidencePackageDetail) => void;
}) {
  const t = useTranslations("multiEngine");
  const common = useTranslations("common");
  const claims = useTranslations("claims");
  const queryClient = useQueryClient();
  const [project, setProject] = useState(initialProject);
  const [name, setName] = useState("");
  const [packageType, setPackageType] = useState<PackageType>(initialType);
  // JB52 第 1 点: a Progress Claim's 期数 / 类型 / 分类 / 分包商, all optional.
  const [claimInfo, setClaimInfo] = useState<ClaimInfoValue>(EMPTY_CLAIM_INFO);
  const isClaim = packageType === "PROGRESS_CLAIM";
  const claimComplete = useClaimInfoComplete(project, claimInfo);

  const create = useMutation({
    mutationFn: () =>
      createEvidencePackage({
        project,
        name,
        package_type: packageType,
        ...(isClaim ? claimInfoPayload(claimInfo) : {}),
      }),
    onSuccess: (row) => {
      queryClient.invalidateQueries({ queryKey: ["evidence-packages"] });
      onCreated(row);
    },
  });

  return (
    <Shell title={t("newTitle")} onClose={onClose}>
      <div className="space-y-4 p-4">
        {/* The project is chosen once and cannot move afterwards, because the
            records inside come from this project's columns (D-143). Said here
            rather than discovered when adding a record is refused. */}
        <p className="rounded-lg border border-dashed border-panel-border bg-muted/30 p-3 text-xs text-muted-foreground">
          {t("oneProjectHelp")}
        </p>
        <FieldWrapper label={t("type.label")} required hint={t("type.help")}>
          <TypePicker value={packageType} onChange={setPackageType} />
        </FieldWrapper>
        <FieldWrapper label={t("field.project")} required>
          <ProjectPicker
            value={project}
            onValueChange={(next) => {
              setProject(next);
              // A category belongs to its project.
              setClaimInfo((current) => ({ ...current, fields: { ...current.fields, category: "", otherName: "" } }));
            }}
            placeholder={t("field.selectProject")}
          />
        </FieldWrapper>
        <FieldWrapper label={t("field.name")} required>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("field.namePlaceholder")}
          />
        </FieldWrapper>
        {isClaim && <ClaimInfoFields project={project} value={claimInfo} onChange={setClaimInfo} />}
      </div>
      <footer className="flex flex-col-reverse gap-2 border-t border-panel-border bg-muted p-4 sm:flex-row sm:items-center sm:justify-end">
        <Button variant="outline" onClick={onClose}>
          {common("cancel")}
        </Button>
        <Button
          requires={[
            [project, t("field.project")],
            [name.trim(), t("field.name")],
          ]}
          disabled={create.isPending || (isClaim && !claimComplete)}
          disabledReason={claims("completeClaimFields")}
          onClick={() => create.mutate()}
        >
          {common("create")}
        </Button>
      </footer>
    </Shell>
  );
}

/** The six types as buttons; Progress Claim is one of them (JB52). */
function TypePicker({
  value,
  onChange,
}: {
  value: PackageType;
  onChange: (next: PackageType) => void;
}) {
  const t = useTranslations("multiEngine");
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {PACKAGE_TYPES.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={value === option}
          onClick={() => onChange(option)}
          className={`min-h-10 rounded-lg border px-3 py-1.5 text-left text-sm font-medium transition-colors ${
            value === option
              ? "border-primary/40 bg-primary/12 text-primary"
              : "border-border bg-card text-muted-foreground hover:text-foreground"
          }`}
        >
          {t(`type.${option}`)}
        </button>
      ))}
    </div>
  );
}

/**
 * One package, opened: its records, and what can still be done to it.
 *
 * Everything on this panel is decided by the package's own state rather than
 * by the person's role, because the state is what actually governs: a
 * confirmed package refuses edits from everyone, including the person who made
 * it.
 */
export function PackageSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const t = useTranslations("multiEngine");
  const common = useTranslations("common");
  const queryClient = useQueryClient();
  const formatter = useDateFormat();
  const { can } = useAuth();
  // 「添加资料」 first asks which column, and goes to that module's own list
  // (2026-10-10, 二 1-2); the simple list in this dialog stays one press away.
  const [choosing, setChoosing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [ticking, setTicking] = useState<PackageItem | null>(null);
  // 「上传资料」 (JB30): the upload form under the two buttons.
  const [uploading, setUploading] = useState(false);
  // JB49: each record opens in full over the package.
  const opener = usePackageRecordOpener();
  const [remarks, setRemarks] = useState("");
  /*
   * `null` rather than `""` until somebody types: the box shows the package's
   * own name until then, and an empty string here would read as "the name was
   * cleared" and grey out Save on a box that visibly has text in it.
   */
  const [name, setName] = useState<string | null>(null);

  const detail = useQuery({
    queryKey: ["evidence-packages", "detail", id],
    queryFn: () => getEvidencePackage(id),
  });
  const data = detail.data;

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["evidence-packages"] });
  };
  // 「对外分享」 (JB51), the system's one 发送 since JB64: 「发给谁？」, the
  // PIN, the share window, 「发出去了吗？」.
  const packageSend = usePackageSend(data, refresh);

  const remove = useMutation({
    mutationFn: (item: string) => removePackageItem(id, item),
    onSuccess: refresh,
  });
  /*
   * The order of the merged PDF: the records and the files uploaded from the
   * computer in one list (JB63, 客户 10-28: 「所有上传文件及系统业务记录，都
   * 可以自由调整排列顺序，放在最前面、中间或最后面」). Buttons rather than
   * drag-and-drop: this is used on a laptop in a site office and occasionally
   * on a tablet, and a drag target that is a few pixels off is a reorder
   * nobody can undo once the package is confirmed.
   */
  const layout: PackageLayoutRow[] =
    data?.layout ?? (data?.items ?? []).map((entry) => ({ kind: "item" as const, id: entry.id }));
  const itemsById = new Map((data?.items ?? []).map((entry) => [entry.id, entry]));
  const reorder = useMutation({
    mutationFn: (order: { kind: "item" | "file"; id: string }[]) => reorderPackageContents(id, order),
    onSuccess: refresh,
  });

  const moveTo = (index: number, target: number) => {
    const order = layout.map((row) => ({ kind: row.kind, id: row.id }));
    if (target < 0 || target >= order.length || target === index) return;
    const [row] = order.splice(index, 1);
    order.splice(target, 0, row);
    reorder.mutate(order);
  };
  const last = layout.length - 1;
  // 移到最前 · 上移 · 下移 · 移到最后 - each with its words on hover and for
  // a screen reader.
  const moveButtons = (index: number) => (
    <div className="flex gap-1" data-move-buttons>
      {(
        [
          ["moveFirst", ArrowUpToLine, 0, index === 0, "alreadyFirst"],
          ["moveUp", ArrowUp, index - 1, index === 0, "alreadyFirst"],
          ["moveDown", ArrowDown, index + 1, index === last, "alreadyLast"],
          ["moveLast", ArrowDownToLine, last, index === last, "alreadyLast"],
        ] as const
      ).map(([label, Icon, target, off, reason]) => (
        <Button
          key={label}
          size="icon-sm"
          variant="ghost"
          aria-label={t(label)}
          title={t(label)}
          disabled={off || reorder.isPending}
          disabledReason={t(reason)}
          onClick={() => moveTo(index, target)}
        >
          <Icon className="size-4" />
        </Button>
      ))}
    </div>
  );
  // JB63: 「打包前能够预览完整资料」 - the whole draft as one PDF, looked at only.
  const draftFile = useFileActions();
  /*
   * The name is typed in the create dialog, before the package contains
   * anything - so what it turned out to be is only known later. Without this
   * the only way to fix a name is to delete the package and pick every record
   * again, which is why the endpoint is reachable from here rather than from
   * nowhere.
   */
  const rename = useMutation({
    mutationFn: () => updateEvidencePackage(id, { name: (name ?? data?.name ?? "").trim() }),
    onSuccess: () => {
      setName(null);
      refresh();
    },
  });
  const confirm = useMutation({
    mutationFn: () => confirmEvidencePackage(id, remarks || data?.remarks || ""),
    onSuccess: refresh,
  });
  const retype = useMutation({
    mutationFn: (next: PackageType) => updateEvidencePackage(id, { package_type: next }),
    onSuccess: refresh,
  });
  const drop = useMutation({
    mutationFn: () => deleteEvidencePackage(id),
    onSuccess: () => {
      refresh();
      onClose();
    },
  });

  const isDraft = data?.state === "DRAFT";
  const openItem = (item: PackageItem) => {
    if (!data) return;
    opener.open(item.record_kind as ArchiveRecordKind, item.record_id, {
      reference: item.reference,
      project_id: data.project,
      project_name: data.project_name,
    });
  };

  return (
    <Shell title={data?.name ?? t("title")} onClose={onClose}>
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {detail.isLoading ? (
          <p className="text-sm text-muted-foreground">{t("loading")}</p>
        ) : detail.isLoadingError || !data ? (
          <p role="alert" className="text-sm text-destructive">
            {t("failed")}
          </p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              {data.package_no ? `${data.package_no} · ` : ""}
              {t(`type.${data.package_type ?? "OTHER"}`)} · {data.project_name} ·{" "}
              {t(`state.${data.state}`)} · <SendStatusWords row={data} inline />
              {(data.current_round ?? 0) > 1 && <> · {t("exchange.round", { n: data.current_round ?? 0 })}</>}
            </p>
            {/* H3 / HD20: 「是谁打包」. */}
            <p className="text-xs text-muted-foreground">
              {t("packedBy", { name: data.created_by_name || "—", when: formatter.dateTime(data.created_at) })}
              {data.confirmed_at && (
                <>
                  {" · "}
                  {t("confirmedBy", {
                    name: data.confirmed_by_name || "—",
                    when: formatter.dateTime(data.confirmed_at),
                  })}
                </>
              )}
            </p>
            {/* JB52: a Progress Claim's 期数 / 类型 / 分类 / 分包商 - no amount,
                no 收款 (「MSE Trace 不算工程款」; the data is kept). A Sundry
                Claim package still adds up its sundry claims. */}
            {data.package_type === "PROGRESS_CLAIM" && (
              <ClaimInfoBlock pkg={data} canEdit={isDraft && can("package.manage")} onChanged={refresh} />
            )}
            {data.claim && data.package_type === "SUNDRY_CLAIM" && (
              <ClaimFacetBlock facet={data.claim} onChanged={refresh} />
            )}

            {data.merge_report.length > 0 && (
              /* Named, not counted. A package that quietly lost two pages is
                 handed on as complete (D-141). */
              <div
                role="alert"
                className="space-y-1 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm"
              >
                <p className="font-medium">{t("mergeReportTitle")}</p>
                <ul className="list-inside list-disc text-xs">
                  {data.merge_report.map((note) => (
                    <li key={`${note.item_id}:${note.reason}`}>
                      {note.reference} — {t(`mergeReason.${note.reason}`)}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <FieldWrapper
              label={t("field.contents")}
              required={isDraft}
              hint={isDraft && can("package.manage") ? t("orderHint") : undefined}
            >
              {layout.length === 0 ? (
                <p className="rounded-lg border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
                  {t("noItems")}
                </p>
              ) : (
                <ul className="space-y-2">
                  {layout.map((row, index) => {
                    if (row.kind === "file") {
                      return (
                        <li key={`file:${row.id}`} className="rounded-lg border border-dashed p-3" data-package-file>
                          <div className="flex flex-wrap items-start gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="flex items-center gap-1.5 font-medium">
                                <span className="tabular-nums text-muted-foreground">{index + 1}.</span>
                                <Paperclip className="size-4 shrink-0 text-muted-foreground" />
                                <span className="truncate" title={row.name}>
                                  {row.name}
                                </span>
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {t(row.letter ? "layoutLetter" : "layoutUpload")} · {row.uploaded_by_name || "—"} ·{" "}
                                {formatter.dateTime(row.uploaded_at)}
                              </p>
                            </div>
                            {isDraft && can("package.manage") && moveButtons(index)}
                          </div>
                        </li>
                      );
                    }
                    const item = itemsById.get(row.id);
                    if (!item) return null;
                    return (
                    <li
                      key={item.id}
                      className="cursor-pointer rounded-lg border p-3 transition-colors hover:bg-muted/30"
                      data-package-item
                      onClick={(event) => {
                        // JB49: the card opens the whole record; its photos,
                        // buttons and links keep their own press.
                        if (!item.source_missing && clickOpensRow(event)) openItem(item);
                      }}
                    >
                      <div className="flex flex-wrap items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">
                            <span className="tabular-nums text-muted-foreground">{index + 1}. </span>
                            {item.reference || t(`kind.${item.record_kind}`)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {t(`kind.${item.record_kind}`)} ·{" "}
                            {t("partsSummary", {
                              fields: item.fields.length,
                              photos: item.photos.length,
                              documents: item.documents.length,
                              files: (item.files ?? []).length,
                            })}
                          </p>
                          <PackageItemPictures
                            reference={item.reference}
                            photos={item.photos}
                            documents={item.documents}
                          />
                          {item.source_missing && (
                            <p className="text-xs text-destructive">
                              {t("sourceMissing")}
                            </p>
                          )}
                          {item.review_state === "RETURNED" && (
                            <p className="mt-1 rounded border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
                              {t("returnedWithReason", {
                                reason: item.returned_reason,
                              })}
                            </p>
                          )}
                          {item.review_state === "ACCEPTED" && (
                            <p className="mt-1 text-xs text-primary">
                              {t("itemAccepted")}
                            </p>
                          )}
                          {(item.round_no ?? 1) > 1 && (
                            <p className="text-xs text-muted-foreground">
                              {t("exchange.newInRound", { n: item.round_no ?? 1 })}
                            </p>
                          )}
                          <AnswerLines answers={item.answers ?? []} />
                        </div>
                        {!item.source_missing && (
                          <Button size="sm" variant="outline" onClick={() => openItem(item)}>
                            <ExternalLink className="size-4" />
                            {t("openRecord")}
                          </Button>
                        )}
                        {isDraft && can("package.manage") && (
                          <div className="flex flex-wrap gap-2">
                            {moveButtons(index)}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setTicking(item)}
                            >
                              {t("choose")}
                            </Button>
                            {/* One record on its own (T-348). 客户举例「DO 可以
                                直接 export」 - the whole bundle download below is
                                untouched; this is for the case where sending
                                forty pages and naming a page number was the only
                                way to hand over one delivery order. */}
                            <ExportButton
                              size="sm"
                              formats={["pdf"]}
                              label={t("exportOne")}
                              title={item.reference}
                              onExport={() =>
                                downloadPackageItem(id, item.id, item.reference)
                              }
                            />
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive"
                              disabled={remove.isPending}
                              onClick={() => remove.mutate(item.id)}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </li>
                    );
                  })}
                </ul>
              )}
            </FieldWrapper>

            {isDraft && can("package.manage") && (
              <>
                <FieldWrapper label={t("type.label")} hint={t("type.help")}>
                  <TypePicker
                    value={data.package_type ?? "OTHER"}
                    onChange={(next) => {
                      if (next !== data.package_type) retype.mutate(next);
                    }}
                  />
                </FieldWrapper>
                <FieldWrapper label={t("field.name")} required hint={t("renameHelp")}>
                  <div className="flex gap-2">
                    <Input
                      value={name ?? data.name}
                      onChange={(event) => setName(event.target.value)}
                    />
                    <Button
                      variant="outline"
                      requires={[[(name ?? data.name).trim(), t("field.name")]]}
                      disabled={rename.isPending}
                      onClick={() => rename.mutate()}
                    >
                      {t("rename")}
                    </Button>
                  </div>
                </FieldWrapper>
                {/* 客户 10-26 事项 6: 「multi engine 打包增加一个上传资料的位置」 -
                    records already in the system on the left, files from the
                    computer on the right; both go into the merged PDF. */}
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => setChoosing(true)}
                  >
                    <Plus className="size-4" />
                    {t("addRecords")}
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full"
                    data-action="upload-files"
                    onClick={() => setUploading(true)}
                  >
                    <Upload className="size-4" />
                    {t("uploads.add")}
                  </Button>
                </div>
                <RecordAttachmentsPanel
                  kind="EVIDENCE_PACKAGE"
                  recordId={data.id}
                  title={t("uploads.title")}
                  hint={t("uploads.hint")}
                  hideWhenEmpty
                  adding={uploading}
                  onAddingChange={setUploading}
                  onChanged={refresh}
                />
                {/* JB50: a Progress Claim's letter - optional, first in the PDF. */}
                {data.package_type === "PROGRESS_CLAIM" && (
                  <RecordAttachmentsPanel
                    kind="PACKAGE_LETTER"
                    recordId={data.id}
                    title={t("letter.title")}
                    hint={t("letter.hint")}
                    addLabel={t("letter.add")}
                    onChanged={refresh}
                  />
                )}
                {/* Asked at Confirm and not at creation: at creation nobody
                    knows yet what the bundle turned out to be, and a
                    required field answered before the answer exists is
                    answered with anything. */}
                <FieldWrapper label={t("field.remarks")} required hint={t("remarksHelp")}>
                  <Textarea
                    rows={3}
                    value={remarks || data.remarks}
                    onChange={(event) => setRemarks(event.target.value)}
                  />
                </FieldWrapper>
              </>
            )}

            {!isDraft && (
              <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">
                  {t("confirmedHelp")}
                </p>
                {/* The PDF's fingerprint is for whoever has to prove later
                    that nothing was swapped; to everybody else it is a
                    string of hex. A plain-words badge, and the hash one
                    press away (works on a phone, unlike a hover tooltip). */}
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className="inline-flex items-center rounded-full border bg-background px-2 py-0.5 text-xs"
                    title={data.pdf_sha256 || undefined}
                  >
                    {t("locked")}
                  </span>
                  {data.pdf_sha256 && (
                    <details className="text-xs text-muted-foreground">
                      <summary className="cursor-pointer select-none">{t("technicalDetails")}</summary>
                      <p className="mt-1 break-all font-mono text-2xs">
                        {t("digest", { digest: data.pdf_sha256 })}
                      </p>
                    </details>
                  )}
                </div>
                {data.exported_at && (
                  /* D-148: once the PDF is outside, nothing here can call it
                     back. Said as a sentence, not as a greyed-out button. */
                  <p className="text-xs">{t("exportedHelp")}</p>
                )}
              </div>
            )}
            {(!isDraft || !can("package.manage")) && (
              /* What was uploaded into it - as it went into the PDF once
                 confirmed (JB30). */
              <>
                {data.package_type === "PROGRESS_CLAIM" && (
                  <RecordAttachmentsPanel
                    kind="PACKAGE_LETTER"
                    recordId={data.id}
                    title={t("letter.title")}
                    readOnly
                    hideWhenEmpty
                  />
                )}
                <RecordAttachmentsPanel
                  kind="EVIDENCE_PACKAGE"
                  recordId={data.id}
                  title={t("uploads.title")}
                  readOnly
                  hideWhenEmpty
                />
              </>
            )}
            {!isDraft && <SendLog pkg={data} onChanged={refresh} />}
            {!isDraft && <ExchangePanel data={data} onChanged={refresh} />}
          </>
        )}
      </div>

      <footer className="flex flex-wrap items-center gap-2 border-t px-4 py-3">
        {data && !isDraft && (
          <>
            {/* 预览 · 打印 · 导出 · 发送 (PDF 统一操作规则). Previewing and
                printing do not count as the package having left; 导出 and
                发送 do, as the download always has (D-148). */}
            <FileActionButtons
              omit={["share"]}
              source={{
                load: () => previewEvidencePackage(data.id, data.name),
                loadToSend: () => evidencePackageFile(data.id, data.name),
                title: data.name,
              }}
            />
            {/* JB51: 「系统内发送」 is in 收件方 below; this one leaves the
                system and is written down in 发送记录. */}
            <Button
              size="sm"
              disabled={Boolean(packageSend.busy)}
              onClick={() => packageSend.send()}
              data-package-share-button
            >
              <Share2 className="size-3.5" />
              {t("share.button")}
            </Button>
          </>
        )}
        {data && isDraft && can("package.manage") && (
          <>
            <Button
              variant="ghost"
              className="text-destructive"
              disabled={drop.isPending}
              onClick={() => drop.mutate()}
            >
              {common("remove")}
            </Button>
            <Button
              variant="outline"
              className="ml-auto"
              data-action="preview-draft"
              requires={[[data.items.length > 0, t("field.contents")]]}
              disabled={Boolean(draftFile.busy)}
              disabledReason={common("loading")}
              onClick={() =>
                void draftFile.run(
                  "preview",
                  { load: () => previewDraftPackage(data.id, data.name), title: data.name },
                  { blockedReason: t("draftPreviewOnly") },
                )
              }
            >
              {draftFile.busy ? <Loader2 className="size-4 animate-spin" /> : <Eye className="size-4" />}
              {t("previewDraft")}
            </Button>
            <Button
              requires={[
                [data.items.length > 0, t("field.contents")],
                [(remarks || data.remarks).trim(), t("field.remarks")],
              ]}
              disabled={confirm.isPending}
              onClick={() => confirm.mutate()}
            >
              <FileText className="size-4" />
              {t("confirm")}
            </Button>
          </>
        )}
      </footer>

      {choosing && data && (
        <PackTargetChooser
          pkg={{ id: data.id, name: data.name, project: data.project }}
          onClose={() => setChoosing(false)}
          onQuickList={() => {
            setChoosing(false);
            setAdding(true);
          }}
        />
      )}
      {adding && data && (
        <AddRecordsDialog
          packageId={data.id}
          project={data.project}
          claimInfo={data.claim_info ?? null}
          onClose={() => setAdding(false)}
          onAdded={() => {
            setAdding(false);
            refresh();
          }}
        />
      )}
      {packageSend.element}
      {draftFile.element}
      {opener.element}
      {ticking && data && (
        <TickPartsDialog
          packageId={data.id}
          item={ticking}
          onClose={() => setTicking(null)}
          onSaved={() => {
            setTicking(null);
            refresh();
          }}
        />
      )}
    </Shell>
  );
}

/** Pick records of one column, in this package's project, to add. */
function AddRecordsDialog({
  packageId,
  project,
  claimInfo,
  onClose,
  onAdded,
}: {
  packageId: string;
  project: string;
  /** A Progress Claim's month narrows the list (JB52 第 5 点). */
  claimInfo: PackageClaimInfo | null;
  onClose: () => void;
  onAdded: () => void;
}) {
  const t = useTranslations("multiEngine");
  const common = useTranslations("common");
  const formatter = useDateFormat();
  const [kind, setKind] = useState<ArchiveRecordKind>(
    claimInfo?.kind === "PROGRESS" ? "PROGRESS" : "MATERIAL_RECEIPT",
  );
  const month = periodLabel(claimInfo?.period);
  const [monthOnly, setMonthOnly] = useState(Boolean(month));
  // JB49 第 3 点: each record opens in full before it is ticked.
  const opener = usePackageRecordOpener();
  const [picked, setPicked] = useState<string[]>([]);
  // D12: 「打包人自行勾选照片、DO、文件、沟通…不默认把所有非照片全加」 - the
  // packer says what the records carry; photographs start ticked, the rest
  // do not. Each record can still be opened and re-ticked afterwards.
  const [include, setInclude] = useState<PackagePart[]>(["photos"]);

  // Page by page, so an older record is one 【Load more】 away rather than
  // cut off at the newest fifty.
  const query = useInfiniteQuery({
    queryKey: ["evidence-packages", "candidates", kind, project, monthOnly ? month : ""],
    queryFn: ({ pageParam }) =>
      getPackageCandidates({
        kind,
        project,
        ...(monthOnly && month ? { month } : {}),
        page: pageParam,
        page_size: 50,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.page < lastPage.total_pages ? lastPage.page + 1 : undefined,
  });
  const add = useMutation({
    mutationFn: () => addPackageItems(packageId, kind, picked, include),
    onSuccess: onAdded,
  });

  const rows = query.data?.pages.flatMap((page) => page.results) ?? [];
  const total = query.data?.pages[0]?.count ?? 0;

  return (
    <Shell title={t("addRecords")} onClose={onClose}>
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        <nav aria-label={t("columns")} className="flex flex-wrap gap-1.5">
          {KINDS.map((row) => (
            <button
              key={row}
              type="button"
              onClick={() => {
                setKind(row);
                setPicked([]);
              }}
              aria-current={kind === row ? "true" : undefined}
              className={`inline-flex h-8 items-center rounded-full border px-3 text-xs font-medium transition-colors pointer-coarse:h-10 ${
                kind === row
                  ? "border-primary/40 bg-primary/12 text-primary"
                  : "border-border bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              {t(`kind.${row}`)}
            </button>
          ))}
        </nav>

        {month && (
          <label className="flex items-center gap-2 text-sm" data-month-only>
            <Checkbox
              checked={monthOnly}
              onCheckedChange={(next) => {
                setMonthOnly(next === true);
                setPicked([]);
              }}
            />
            {t("monthOnly", { month })}
          </label>
        )}
        <FieldWrapper label={t("field.records")} required>
          {query.isLoading ? (
            <p className="text-sm text-muted-foreground">{t("loading")}</p>
          ) : query.isError ? (
            <LoadFailed what={t("what.candidates")} onRetry={() => void query.refetch()} />
          ) : rows.length === 0 ? (
            <p className="rounded-lg border border-dashed border-panel-border p-4 text-center text-sm text-muted-foreground">
              {t("noCandidates")}
            </p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {rows.map((row) => (
                <li key={row.id} className="flex items-start gap-3 p-3">
                  <Checkbox
                    checked={picked.includes(row.id)}
                    onCheckedChange={(next) =>
                      setPicked((current) =>
                        next
                          ? [...current, row.id]
                          : current.filter((value) => value !== row.id),
                      )
                    }
                    aria-label={row.reference}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{row.reference}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {row.detail} · {formatter.dateTime(row.submitted_at)}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      opener.open(kind, row.id, {
                        reference: row.reference,
                        project_id: row.project_id,
                        project_name: row.project_name,
                      })
                    }
                  >
                    <ExternalLink className="size-4" />
                    {t("openRecord")}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {query.hasNextPage && (
            <Button
              type="button"
              variant="outline"
              className="mt-2 w-full"
              disabled={query.isFetchingNextPage}
              onClick={() => void query.fetchNextPage()}
            >
              {query.isFetchingNextPage ? <Loader2 className="size-4 animate-spin" /> : null}
              {t("loadMore", { shown: rows.length, total })}
            </Button>
          )}
        </FieldWrapper>

        <FieldWrapper label={t("include.title")} hint={t("include.hint")}>
          <div className="flex flex-wrap gap-x-4 gap-y-2 rounded-lg border bg-muted/30 p-3">
            {/* No chat box (E7, Q25): 「全部的 PDF…都不需要聊天记录」. The chat
                stays on the record in the system; no package prints it. */}
            {(["photos", "documents", "files"] as const).map((part) => (
              <label key={part} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={include.includes(part)}
                  aria-label={t(`group.${part}`)}
                  onCheckedChange={(next) =>
                    setInclude((current) =>
                      next ? [...current, part] : current.filter((value) => value !== part),
                    )
                  }
                />
                {t(`group.${part}`)}
              </label>
            ))}
          </div>
        </FieldWrapper>
      </div>
      <footer className="flex flex-col-reverse gap-2 border-t border-panel-border bg-muted p-4 sm:flex-row sm:items-center sm:justify-end">
        <Button variant="outline" onClick={onClose}>
          {common("cancel")}
        </Button>
        <Button
          requires={[[picked.length > 0, t("field.records")]]}
          disabled={add.isPending}
          onClick={() => add.mutate()}
        >
          {t("addSelected", { count: picked.length })}
        </Button>
      </footer>
      {opener.element}
    </Shell>
  );
}

/**
 * Tick which parts of one record this package carries (D-149).
 *
 * 客户：「勾选的时候，最好可以选择照片或者字段，DO 等」. The boxes start as the
 * record was added: its fields and whatever groups were ticked when adding it
 * - photographs only, unless the packer said otherwise (D12).
 */
function TickPartsDialog({
  packageId,
  item,
  onClose,
  onSaved,
}: {
  packageId: string;
  item: PackageItem;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("multiEngine");
  const labels = useTranslations("mySubmissions");
  const common = useTranslations("common");
  // Every part of the record, not only the ones already ticked: the member
  // row carries the ticked subset, and building the boxes from it meant a part
  // unticked once could never be ticked again.
  const parts = useQuery({
    queryKey: ["package-record-parts", item.record_kind, item.record_id],
    queryFn: () => getPackageRecordParts(item.record_kind, item.record_id),
  });
  const all = parts.data ?? item;
  // A group the stored selection does not mention is the whole group; an
  // empty list is none (D-162). A record added since D12 stores an empty
  // list for every group that was not ticked when it was added.
  const initial = (group: keyof PackageSelection, ids: string[]) =>
    group in item.selection ? (item.selection[group] ?? []) : ids;
  const [edited, setSelection] = useState<PackageSelection | null>(null);
  const selection: PackageSelection = edited ?? {
    fields: initial("fields", all.fields.map((field) => field.key)),
    photos: initial("photos", all.photos.map((shot) => shot.id ?? "")),
    documents: initial("documents", all.documents.map((doc) => doc.id)),
    files: initial("files", (all.files ?? []).map((file) => file.id)),
  };

  const save = useMutation({
    mutationFn: () => updatePackageItem(packageId, item.id, selection),
    onSuccess: onSaved,
  });

  const toggle = (group: keyof PackageSelection, value: string) =>
    setSelection(() => {
      const current = selection;
      const list = current[group] ?? [];
      return {
        ...current,
        [group]: list.includes(value)
          ? list.filter((entry) => entry !== value)
          : [...list, value],
      };
    });

  return (
    <Shell title={item.reference || t("choose")} onClose={onClose}>
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {/* Without the full record only the parts already ticked are listed,
            so a part unticked earlier cannot be seen or ticked again. */}
        <QueryFailedNote query={parts} what={t("what.recordParts")} />
        <section className="space-y-2">
          {/*
            Every part can be ticked (D-236): 「资料包里的资料**全部都要能由当事人
            自己勾选**」. What starts ticked changed with D12: 「不默认把所有非照片
            全加」 - a record joins with its fields and photographs, and the
            packer ticks the DO and the files in. The conversation is no longer
            a part at all (E7, Q25): no PDF prints the chat.
          */}
          <h3 className="panel-title">
            {t("group.fields")}
          </h3>
          <ul className="divide-y rounded-lg border">
            {all.fields.map((field) => (
              <li key={field.key} className="flex items-start gap-3 p-2.5">
                <Checkbox
                  checked={(selection.fields ?? []).includes(field.key)}
                  onCheckedChange={() => toggle("fields", field.key)}
                  aria-label={labels(`field.${field.key}`)}
                />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">
                    {labels(`field.${field.key}`)}
                  </p>
                  <p className="break-words text-sm">{field.value}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {all.photos.length > 0 && (
          <section className="space-y-2">
            <h3 className="panel-title">
              {t("group.photos")}
            </h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {all.photos.map((shot) => (
                <label
                  key={shot.id ?? shot.url}
                  className="overflow-hidden rounded-lg border"
                >
                  <Image
                    src={shot.url}
                    alt={shot.caption || item.reference}
                    width={320}
                    height={240}
                    unoptimized
                    className="aspect-4/3 w-full object-cover object-bottom"
                  />
                  <span className="flex items-center gap-2 px-2 py-1.5">
                    <Checkbox
                      checked={(selection.photos ?? []).includes(shot.id ?? "")}
                      onCheckedChange={() => toggle("photos", shot.id ?? "")}
                      aria-label={shot.caption || t("group.photos")}
                    />
                    <span className="truncate text-xs text-muted-foreground">
                      {shot.caption || t("group.photos")}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </section>
        )}

        {all.documents.length > 0 && (
          <section className="space-y-2">
            <h3 className="panel-title">
              {t("group.documents")}
            </h3>
              <ul className="divide-y rounded-lg border">
              {all.documents.map((doc) => (
                <li key={doc.id} className="flex items-center gap-3 p-2.5">
                  <Checkbox
                    checked={(selection.documents ?? []).includes(doc.id)}
                    onCheckedChange={() => toggle("documents", doc.id)}
                    aria-label={doc.caption}
                  />
                  <FileThumbs files={[{ id: doc.id, name: doc.caption, thumbnail_url: doc.url }]} />
                  <span className="truncate text-sm">{doc.caption}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {(all.files ?? []).length > 0 && (
          <section className="space-y-2">
            <h3 className="panel-title">
              {t("group.files")}
            </h3>
            <ul className="divide-y rounded-lg border">
              {(all.files ?? []).map((file) => (
                <li key={file.id} className="flex items-center gap-3 p-2.5">
                  <Checkbox
                    checked={(selection.files ?? []).includes(file.id)}
                    onCheckedChange={() => toggle("files", file.id)}
                    aria-label={file.name}
                  />
                  <FileThumbs files={[{ id: file.id, name: file.name }]} />
                  <span className="min-w-0 flex-1 truncate text-sm">{file.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{file.uploaded_by_name}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
      <footer className="flex flex-col-reverse gap-2 border-t border-panel-border bg-muted p-4 sm:flex-row sm:items-center sm:justify-end">
        <Button variant="outline" onClick={onClose}>
          {common("cancel")}
        </Button>
        <Button disabled={save.isPending} onClick={() => save.mutate()}>
          {common("save")}
        </Button>
      </footer>
    </Shell>
  );
}

/* The consultant's side (D-147, D-150, D-151) lives in `package-review.tsx`. */
export { PackageReviewWorkspace } from "@/components/contractor-ops/package-review";

/* -- JB51 / JB52 list helpers ------------------------------------------- */

const ALL_VALUES = "__all__";

/**
 * The Progress Claim tab's filters (JB52 第 3 点): 期数, 分类, 分包商. The
 * category list is the page's project's; without one it says so.
 */
function ClaimTabFilters({
  project,
  period,
  category,
  subcontractor,
  onChange,
}: {
  project: string;
  period: string;
  category: string;
  subcontractor: string;
  onChange: (next: { period: string; category: string; subcontractor: string }) => void;
}) {
  const t = useTranslations("multiEngine");
  const categories = useQuery({
    queryKey: ["project-categories", "claims", project, false],
    queryFn: () => getProjectCategories({ project, kind: "CLAIM", page_size: 200 }),
    enabled: Boolean(project),
  });
  const subcontractors = useSubcontractors("");
  const value = { period, category, subcontractor };
  const filtered = Boolean(period || category || subcontractor);
  return (
    <div className="flex w-full flex-wrap items-end gap-2" data-claim-tab-filters>
      <label className="grid gap-1 text-xs text-muted-foreground">
        {t("filter.period")}
        <Input
          type="month"
          value={period}
          onChange={(event) => onChange({ ...value, period: event.target.value })}
          className="w-44"
          aria-label={t("filter.period")}
        />
      </label>
      <label className="grid gap-1 text-xs text-muted-foreground">
        {t("filter.category")}
        <Select
          value={category || ALL_VALUES}
          onValueChange={(next) => onChange({ ...value, category: next === ALL_VALUES ? "" : next })}
          disabled={!project}
        >
          <SelectTrigger className="w-52" aria-label={t("filter.category")}>
            <SelectValue placeholder={t("filter.allCategories")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUES}>{t("filter.allCategories")}</SelectItem>
            <CategoryOptionItems rows={categories.data?.results ?? []} />
          </SelectContent>
        </Select>
      </label>
      <label className="grid gap-1 text-xs text-muted-foreground">
        {t("filter.subcontractor")}
        <Select
          value={subcontractor || ALL_VALUES}
          onValueChange={(next) => onChange({ ...value, subcontractor: next === ALL_VALUES ? "" : next })}
        >
          <SelectTrigger className="w-52" aria-label={t("filter.subcontractor")}>
            <SelectValue placeholder={t("filter.allSubcontractors")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUES}>{t("filter.allSubcontractors")}</SelectItem>
            {(subcontractors.data?.results ?? []).map((row) => (
              <SelectItem key={row.id} value={row.id}>
                {row.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
      {filtered && (
        <Button variant="ghost" onClick={() => onChange({ period: "", category: "", subcontractor: "" })}>
          {t("filter.clear")}
        </Button>
      )}
      {!project && <p className="w-full text-xs text-muted-foreground">{t("filter.pickProject")}</p>}
      <QueryFailedNote query={categories} what={t("filter.category")} />
      <QueryFailedNote query={subcontractors} what={t("filter.subcontractor")} />
    </div>
  );
}

/** A Progress Claim row's number, month and category under its name (JB52). */
function ClaimLine({ info }: { info: PackageClaimInfo | null | undefined }) {
  if (!info) return null;
  const parts = [info.claim_no, periodLabel(info.period), info.category_name, info.subcontractor_name].filter(Boolean);
  if (!parts.length) return null;
  return <span className="block text-xs font-normal text-muted-foreground">{parts.join(" · ")}</span>;
}

/**
 * 未发送 / 已发送系统内 / 已发起分享 / 已对外发送 (JB51 第 4 点), with the
 * consultant's 等待回复 / 已审阅 kept beside 已发送系统内 as before.
 */
function SendStatusWords({ row, inline = false }: { row: EvidencePackageRow; inline?: boolean }) {
  const t = useTranslations("multiEngine");
  const keys = sendStatusKeys(row);
  const words = keys.map((key) => t(`sendStatus.${key}`));
  if (row.review_state !== "NOT_SENT") words.push(t(`review.${row.review_state}`));
  const text = words.join(" · ");
  return inline ? <>{text}</> : <span className="block" data-send-status>{text}</span>;
}
