"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, Loader2, MapPin, PackageCheck, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { FieldCamera } from "@/components/shared/field-camera";
import { FieldSignaturePad } from "@/components/field-staff/field-signature-pad";
import { FieldWrapper, StatusBadge } from "@/components/shared/page-primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { DeliveryNoteEvidenceKind, DeliveryNotePublic } from "@/interfaces/contractor";
import {
  completePublicDeliveryNote,
  getPublicDeliveryNote,
  recordPublicDeliveryArrival,
  uploadPublicDeliveryEvidence,
} from "@/services/contractor.service";

const EVIDENCE_KINDS: DeliveryNoteEvidenceKind[] = ["VEHICLE", "UNLOADING", "DELIVERY_NOTE", "OTHER"];

function getLocation(): Promise<{ latitude: string; longitude: string; location_accuracy_m?: string }> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.reject(new Error("Location access is required."));
  }
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({
        latitude: position.coords.latitude.toFixed(7),
        longitude: position.coords.longitude.toFixed(7),
        location_accuracy_m: position.coords.accuracy.toFixed(2),
      }),
      () => reject(new Error("Allow location access before recording site evidence.")),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  });
}

export function PublicDeliveryNote({ token }: { token: string }) {
  const t = useTranslations("deliveryNotePublic");
  const [current, setCurrent] = useState<DeliveryNotePublic | null>(null);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState<DeliveryNoteEvidenceKind | null>(null);
  const [quantity, setQuantity] = useState("");
  const [receiver, setReceiver] = useState("");
  const [decision, setDecision] = useState<"RECEIVED" | "REJECTED">("RECEIVED");
  // Deliberately a third state rather than a boolean: "" means the
  // receiver has not looked yet, and that must not submit as "same".
  const [match, setMatch] = useState<"" | "SAME" | "DIFFERENT">("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [note, setNote] = useState("");
  const [signature, setSignature] = useState<File>();

  const query = useQuery({
    queryKey: ["public-delivery-note", token],
    queryFn: () => getPublicDeliveryNote(token),
    retry: false,
  });
  const noteData = current ?? query.data ?? null;

  const arrive = useMutation({
    mutationFn: async () => recordPublicDeliveryArrival(token, await getLocation()),
    onSuccess: setCurrent,
    onError: (reason) => setError(reason instanceof Error ? reason.message : t("error.action")),
  });
  const complete = useMutation({
    mutationFn: async () => {
      if (!signature) throw new Error(t("error.signatureRequired"));
      const location = await getLocation();
      return completePublicDeliveryNote(token, {
        decision,
        actual_quantity: quantity,
        receiver_name: receiver,
        receiver_signature: signature,
        rejection_reason: rejectionReason,
        note,
        ...location,
      });
    },
    onSuccess: setCurrent,
    onError: (reason) => setError(reason instanceof Error ? reason.message : t("error.action")),
  });

  const upload = async (kind: DeliveryNoteEvidenceKind, image?: File) => {
    if (!image) return;
    setError("");
    setUploading(kind);
    try {
      const location = await getLocation();
      const saved = await uploadPublicDeliveryEvidence(token, {
        kind,
        image,
        ...location,
        client_event_id: crypto.randomUUID(),
      });
      setCurrent(saved);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("error.action"));
    } finally {
      setUploading(null);
    }
  };

  if (query.isLoading) return <main className="grid min-h-dvh place-items-center"><Loader2 className="size-8 animate-spin text-primary" /></main>;
  if (query.isError || !noteData) return <main className="mx-auto max-w-xl px-5 py-16"><h1 className="text-2xl font-semibold">{t("invalid")}</h1><p className="mt-2 text-sm text-muted-foreground">{t("invalidBody")}</p></main>;

  const isStopped = ["CLOSED", "CANCELLED", "VOIDED"].includes(noteData.status);
  const isComplete = noteData.status === "COMPLETED";
  const evidenceComplete = EVIDENCE_KINDS.every((kind) => noteData.evidence.some((item) => item.kind === kind));

  return (
    <main className="mx-auto min-h-dvh max-w-xl bg-background px-4 py-5 pb-12">
      <header className="border-b pb-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">{noteData.company_name}</p>
        <h1 className="mt-1 text-2xl font-semibold">{t("title")}</h1>
        <p className="mt-1 font-mono text-sm text-muted-foreground">{noteData.note_no}</p>
      </header>
      <section className="mt-4 rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex items-start gap-3"><span className="grid size-12 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><PackageCheck /></span><div className="min-w-0"><h2 className="font-semibold">{noteData.material_name}</h2><p className="mt-1 text-sm text-muted-foreground">{noteData.project_name} · {noteData.supplier_name}</p><p className="mt-1 text-sm text-muted-foreground">{noteData.vehicle_plate} · {noteData.driver_name}</p><p className="mt-1 text-sm font-medium">{noteData.expected_quantity} {noteData.unit}</p>{noteData.category_name && <p className="mt-1 text-xs text-muted-foreground">{t("compare.column")}: {noteData.category_name}</p>}</div></div>
        <div className="mt-4"><StatusBadge label={t(`status.${noteData.status}`)} tone={isStopped ? "danger" : isComplete ? "positive" : "info"} /></div>
      </section>
      {error && <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}
      {!isStopped && !isComplete && noteData.status === "ISSUED" && <Button size="lg" className="mt-5 h-14 w-full text-base" disabled={arrive.isPending} onClick={() => arrive.mutate()}>{arrive.isPending ? <Loader2 className="animate-spin" /> : <MapPin />}{t("action.arrive")}</Button>}
      {!isStopped && !isComplete && noteData.status === "ARRIVED" && <>
        <section className="mt-6"><h2 className="text-base font-semibold">{t("photosTitle")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("photosBody")}</p><div className="mt-3 grid gap-3">{EVIDENCE_KINDS.map((kind) => <FieldCamera key={kind} label={t(`evidence.${kind}`)} fileCount={noteData.evidence.filter((item) => item.kind === kind).length} disabled={uploading !== null} onCapture={(file) => void upload(kind, file)} />)}</div></section>
        <section className="mt-6 space-y-4 rounded-xl border bg-card p-4"><h2 className="font-semibold">{t("decisionTitle")}</h2><div className="grid grid-cols-2 gap-2"><Button type="button" variant={decision === "RECEIVED" ? "default" : "outline"} onClick={() => { setDecision("RECEIVED"); setMatch(""); setQuantity(""); }}><CheckCircle2 />{t("action.receive")}</Button><Button type="button" variant={decision === "REJECTED" ? "destructive" : "outline"} onClick={() => { setDecision("REJECTED"); setMatch(""); setQuantity(""); }}><XCircle />{t("action.reject")}</Button></div>{decision === "RECEIVED" ? (
        <div className="space-y-3">
          <div className="rounded-lg border bg-muted/40 p-4 text-center">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("compare.onDocket")}</p>
            <p className="mt-1 text-4xl font-bold tabular-nums">{noteData.expected_quantity}</p>
            <p className="text-sm text-muted-foreground">{noteData.unit}</p>
          </div>
          <FieldWrapper label={t("compare.question")} required>
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" size="lg" className="h-16 text-base" variant={match === "SAME" ? "default" : "outline"} onClick={() => { setMatch("SAME"); setQuantity(noteData.expected_quantity); }}><CheckCircle2 className="size-6" />{t("compare.same")}</Button>
              <Button type="button" size="lg" className="h-16 text-base" variant={match === "DIFFERENT" ? "destructive" : "outline"} onClick={() => { setMatch("DIFFERENT"); setQuantity(noteData.expected_quantity); }}><XCircle className="size-6" />{t("compare.different")}</Button>
            </div>
          </FieldWrapper>
          {match === "DIFFERENT" && (
            <FieldWrapper label={t("compare.actual")} required error={!quantity && complete.isError ? t("error.quantityRequired") : undefined}>
              <Input inputMode="decimal" type="number" min="0" step="0.001" className="h-14 text-center text-2xl tabular-nums" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
              <p className="mt-1 text-xs text-muted-foreground">{t("compare.amendNotice")}</p>
            </FieldWrapper>
          )}
        </div>
      ) : (
        <FieldWrapper label={t("field.quantity")} required error={!quantity && complete.isError ? t("error.quantityRequired") : undefined}><Input inputMode="decimal" type="number" min="0" step="0.001" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></FieldWrapper>
      )}<FieldWrapper label={t("field.receiver")} required><Input value={receiver} onChange={(event) => setReceiver(event.target.value)} /></FieldWrapper>{decision === "REJECTED" && <FieldWrapper label={t("field.rejectionReason")} required><Textarea value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} /></FieldWrapper>}<FieldWrapper label={t("field.note")} optional={t("optional")}><Textarea value={note} onChange={(event) => setNote(event.target.value)} /></FieldWrapper><FieldSignaturePad label={t("field.signature")} clearLabel={t("action.clearSignature")} required value={signature} onChange={setSignature} /><Button size="lg" className="h-14 w-full text-base" disabledReason={!evidenceComplete ? t("action.photosRequired") : undefined} requires={[[decision !== "RECEIVED" || match, t("compare.question")], [quantity, t("field.quantity")], [receiver, t("field.receiver")], [signature, t("field.signature")], [decision !== "REJECTED" || rejectionReason, t("field.rejectionReason")]]} disabled={!evidenceComplete || complete.isPending} onClick={() => complete.mutate()}>{complete.isPending ? <Loader2 className="animate-spin" /> : <PackageCheck />}{evidenceComplete ? t("action.submit") : t("action.photosRequired")}</Button></section>
      </>}
      {isComplete && <section className="mt-8 rounded-xl border border-success/30 bg-success/5 p-6 text-center"><CheckCircle2 className="mx-auto size-12 text-success" /><h2 className="mt-3 text-lg font-semibold">{t(`decision.${noteData.decision}`)}</h2><p className="mt-2 text-sm text-muted-foreground">{t("completeBody")}</p>{noteData.quantity_was_amended && <p className="mt-3 rounded-lg border border-warning/30 bg-warning/15 p-3 text-sm font-medium text-warning">{t("compare.amended", { from: noteData.quantity_amended_from ?? "", to: noteData.actual_quantity ?? "" })}</p>}</section>}
    </main>
  );
}
