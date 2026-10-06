"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { FieldTaskSheet } from "@/components/dashboard/field-task-sheet";
import { ConsultantApplicationDetail } from "@/components/consultant-workflow/application-detail";
import { RecordSheet } from "@/components/contractor-ops/archive-queue";
import { ReviewMovementActions } from "@/components/contractor-ops/equipment-applications";
import {
  OutgoingActions,
  OutgoingDetailDialog,
  RejectOutgoingDialog,
  ReturnProcessingDialog,
} from "@/components/contractor-ops/operations-workspaces";
import { ReviewDisposalDialog } from "@/components/contractor-ops/site-disposal-workspaces";
import { WasteOutgoingReviewDialog } from "@/components/contractor-ops/waste-outgoing-workspace";
import { MaterialRequestDetail } from "@/components/material-requests/material-requests-office";
import { useAuth } from "@/components/providers/auth-provider";
import { LoadFailed } from "@/components/shared/page-primitives";
import { SundryClaimDetail } from "@/components/sundry-claims/sundry-claims-office";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ApprovalRow } from "@/interfaces/contractor-dashboard";
import type {
  ArchiveQueueRow,
  CategoryRecordKind,
  MaterialOutgoing,
} from "@/interfaces/contractor-ops";
import {
  getCategoryRecord,
  getDisposalRequest,
  getEquipmentMovements,
  reviewMaterialOutgoing,
} from "@/services/contractor-ops.service";
import { getWasteOutgoingRecord } from "@/services/waste-outgoing.service";

/**
 * Where each queue's record is opened from the 总部 list (C16), and decided.
 *
 * Every decision is the module's own: its review component, its service call,
 * its permission. The record is opened in place - the module's own detail, or
 * the shared detail sheet with the module's review buttons inside - and the
 * conversation is the record's. One cannot open here and goes to its own
 * page: a document approval (the approval centre). A site task opens in the
 * task detail (C17), with the confirm / return the task list has.
 */
const SHEET_KIND: Partial<Record<string, CategoryRecordKind>> = {
  DISPOSAL_REQUEST: "DISPOSAL_REQUEST",
  WASTE_OUTGOING: "WASTE_OUTGOING",
  EQUIPMENT_MOVEMENT: "EQUIPMENT_MOVEMENT",
};

export const APPROVAL_PAGE_LINKS: Record<string, (id: string) => string> = {
  APPROVAL: (id) => `/approvals?approval=${encodeURIComponent(id)}`,
};

export function useApprovalOpener() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [row, setRow] = useState<ApprovalRow | null>(null);
  const close = () => {
    setRow(null);
    // A decision taken inside moves every count on the page.
    void queryClient.invalidateQueries({ queryKey: ["contractor-dashboard"] });
  };
  const open = (next: ApprovalRow) => {
    const page = APPROVAL_PAGE_LINKS[next.source];
    if (page) {
      router.push(page(next.id));
      return;
    }
    setRow(next);
  };
  return { open, element: row ? <OpenedApproval row={row} onClose={close} /> : null };
}

function OpenedApproval({ row, onClose }: { row: ApprovalRow; onClose: () => void }) {
  const router = useRouter();
  const sheet = SHEET_KIND[row.source];
  if (sheet) {
    const sheetRow: ArchiveQueueRow<CategoryRecordKind> = {
      id: row.id,
      kind: sheet,
      reference: row.approval_no || row.title,
      detail: row.title,
      project_id: row.project_id || null,
      project_name: row.project,
      submitted_at: row.submitted_at || row.created_at || "",
      status: row.status,
      status_label: "",
      photo: null,
      seen_at: null,
      archivable: false,
      archived: null,
    };
    return (
      <RecordSheet
        row={sheetRow}
        fetchRecord={getCategoryRecord}
        onClose={onClose}
        actions={<SheetDecision row={row} onDone={onClose} />}
      />
    );
  }
  switch (row.source) {
    case "MATERIAL_OUTGOING":
      return <OutgoingDecision id={row.id} onClose={onClose} />;
    case "MATERIAL_REQUEST":
      return (
        <MaterialRequestDetail
          id={row.id}
          onClose={onClose}
          // Asking again is a new request on the MR screen (C05).
          onRaiseAgain={() => router.push("/material-requests")}
        />
      );
    case "SUNDRY_CLAIM":
      return <SundryClaimDetail id={row.id} onClose={onClose} />;
    case "FIELD_TASK":
      return <FieldTaskSheet id={row.id} onClose={onClose} />;
    case "CONSULTANT_APPLICATION":
      return (
        <Dialog open onOpenChange={(next) => !next && onClose()}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
            <DialogHeader>
              <DialogTitle>{row.approval_no || row.title}</DialogTitle>
            </DialogHeader>
            <ConsultantApplicationDetail id={row.id} />
          </DialogContent>
        </Dialog>
      );
    default:
      return null;
  }
}

/** The review buttons of a record opened in the shared sheet. */
function SheetDecision({ row, onDone }: { row: ApprovalRow; onDone: () => void }) {
  if (row.source === "DISPOSAL_REQUEST") return <DisposalDecision id={row.id} onDone={onDone} />;
  if (row.source === "WASTE_OUTGOING") return <WasteOutgoingDecision id={row.id} onDone={onDone} />;
  if (row.source === "EQUIPMENT_MOVEMENT") return <MovementDecision id={row.id} onDone={onDone} />;
  // 工程进度 is decided by the sheet's own 确认归档.
  return null;
}

function DecisionBar({ onReview }: { onReview: () => void }) {
  const t = useTranslations("headquarters.approvals");
  return (
    <div className="flex justify-end rounded-lg border bg-muted/30 p-2">
      <Button size="sm" onClick={onReview}>
        <ClipboardCheck />
        {t("decide")}
      </Button>
    </div>
  );
}

function DisposalDecision({ id, onDone }: { id: string; onDone: () => void }) {
  const { can } = useAuth();
  const [reviewing, setReviewing] = useState(false);
  // A ref, not state: the dialog calls onSaved and then onClose in one tick.
  const saved = useRef(false);
  const record = useQuery({
    queryKey: ["site-disposals", "detail", id],
    queryFn: () => getDisposalRequest(id),
  });
  if (record.isError) return <LoadFailed onRetry={() => void record.refetch()} />;
  const row = record.data;
  // Kept open once started: approving shows the temporary link once (D-217),
  // and the request is no longer REQUESTED by the time it does.
  if (!reviewing && (!row || !can("disposal.manage") || row.status !== "REQUESTED")) {
    return null;
  }
  return (
    <>
      {!reviewing && <DecisionBar onReview={() => setReviewing(true)} />}
      {reviewing && row && (
        <ReviewDisposalDialog
          row={row}
          onClose={() => {
            setReviewing(false);
            if (saved.current) onDone();
          }}
          onSaved={() => {
            saved.current = true;
          }}
        />
      )}
    </>
  );
}

function WasteOutgoingDecision({ id, onDone }: { id: string; onDone: () => void }) {
  const { can, user } = useAuth();
  const [reviewing, setReviewing] = useState(false);
  const record = useQuery({
    queryKey: ["waste-outgoing", "detail", id],
    queryFn: () => getWasteOutgoingRecord(id),
  });
  if (record.isError) return <LoadFailed onRetry={() => void record.refetch()} />;
  const row = record.data;
  // The module's own rule: an approver who is also the delegate, or the
  // person it was handed to (waste-outgoing-workspace `mayDecide`).
  const mayDecide =
    !!row &&
    row.status === "PENDING_APPROVAL" &&
    can("waste_outgoing.approve") &&
    (can("waste_outgoing.delegate") || row.delegated_to === user?.id);
  if (!row || !mayDecide) return null;
  return (
    <>
      <DecisionBar onReview={() => setReviewing(true)} />
      {reviewing && (
        <WasteOutgoingReviewDialog
          record={row}
          onClose={() => setReviewing(false)}
          onSaved={() => {
            setReviewing(false);
            onDone();
          }}
        />
      )}
    </>
  );
}

function MovementDecision({ id, onDone }: { id: string; onDone: () => void }) {
  const movement = useQuery({
    queryKey: ["equipment-movements", "one", id],
    queryFn: () => getEquipmentMovements({ id, page_size: 1 }),
  });
  if (movement.isError) return <LoadFailed onRetry={() => void movement.refetch()} />;
  const row = movement.data?.results[0];
  if (!row) return null;
  return <ReviewMovementActions movement={row} onDone={() => onDone()} />;
}

/** 材料出场 / 退场申请: the module's detail dialog with its own step buttons. */
function OutgoingDecision({ id, onClose }: { id: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [rejecting, setRejecting] = useState<MaterialOutgoing | null>(null);
  const [returning, setReturning] = useState<MaterialOutgoing | null>(null);
  const review = useMutation({
    mutationFn: ({ rowId, status, note }: { rowId: string; status: MaterialOutgoing["status"]; note?: string }) =>
      reviewMaterialOutgoing(rowId, status, note),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["material-outgoing"] });
      onClose();
    },
  });
  return (
    <>
      <OutgoingDetailDialog
        id={id}
        onClose={onClose}
        renderActions={(current) => (
          <OutgoingActions
            row={current}
            pending={review.isPending}
            // A rejection asks for its reason first (D-211), as on the list.
            onReview={(status) =>
              status === "REJECTED"
                ? setRejecting(current)
                : review.mutate({ rowId: current.id, status, note: "" })
            }
            onReturn={() => setReturning(current)}
          />
        )}
      />
      {rejecting && (
        <RejectOutgoingDialog
          row={rejecting}
          pending={review.isPending}
          onClose={() => setRejecting(null)}
          onConfirm={(note) => {
            review.mutate({ rowId: rejecting.id, status: "REJECTED", note });
            setRejecting(null);
          }}
        />
      )}
      {returning && (
        <ReturnProcessingDialog
          row={returning}
          onClose={() => setReturning(null)}
          onSaved={() => {
            setReturning(null);
            onClose();
          }}
        />
      )}
    </>
  );
}
