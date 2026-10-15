"use client";

/**
 * 「名单里没有可以顺手新增」 (I27, ID65; the ID7 way): add a company to the
 * supplier list without leaving the form that needed it.
 *
 * The same create call, the same permission (`supplier.create`) and the same
 * required fields as the supplier page - code, name, industry and main
 * products - so a company added here is a full supplier, findable and
 * editable on 供应商 like any other. The rest of its profile is filled there.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { FieldWrapper } from "@/components/shared/page-primitives";
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
import { Textarea } from "@/components/ui/textarea";
import type { Supplier } from "@/interfaces/contractor";
import { createSupplier } from "@/services/contractor.service";

/** 「＋ 新增供应商」 under a supplier picker, for whoever may add one. */
export function QuickAddSupplierButton({
  onCreated,
  defaults,
}: {
  onCreated: (supplier: Supplier) => void;
  /** What the form starts with - a clearance company's line of business. */
  defaults?: { industry?: string; main_products?: string };
}) {
  const t = useTranslations("suppliers.quickAdd");
  const { can } = useAuth();
  const [open, setOpen] = useState(false);
  if (!can("supplier.create")) return null;
  return (
    <>
      <Button type="button" variant="link" size="sm" className="h-auto px-0" onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        {t("open")}
      </Button>
      {open && (
        <QuickAddSupplierDialog
          defaults={defaults}
          onClose={() => setOpen(false)}
          onCreated={(supplier) => {
            setOpen(false);
            onCreated(supplier);
          }}
        />
      )}
    </>
  );
}

function QuickAddSupplierDialog({
  defaults,
  onClose,
  onCreated,
}: {
  defaults?: { industry?: string; main_products?: string };
  onClose: () => void;
  onCreated: (supplier: Supplier) => void;
}) {
  const t = useTranslations();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [industry, setIndustry] = useState(defaults?.industry ?? "");
  const [products, setProducts] = useState(defaults?.main_products ?? "");
  const [contact, setContact] = useState("");
  const [phone, setPhone] = useState("");
  const save = useMutation({
    mutationFn: () =>
      createSupplier({
        name: name.trim(),
        code: code.trim(),
        industry: industry.trim(),
        main_products: products.trim(),
        contact_person: contact.trim(),
        contact_phone: phone.trim(),
      }),
    onSuccess: (supplier) => {
      // Every picker and filter reads the list afresh, so the new one is there.
      void qc.invalidateQueries({ queryKey: ["suppliers"] });
      onCreated(supplier);
    },
  });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("suppliers.quickAdd.title")}</DialogTitle>
          <DialogDescription>{t("suppliers.quickAdd.description")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <FieldWrapper label={t("suppliers.field.name")} required className="sm:col-span-2">
            <Input value={name} onChange={(event) => setName(event.target.value)} autoFocus />
          </FieldWrapper>
          <FieldWrapper label={t("suppliers.field.code")} required hint={t("suppliers.quickAdd.codeHint")}>
            <Input value={code} onChange={(event) => setCode(event.target.value)} />
          </FieldWrapper>
          <FieldWrapper label={t("suppliers.field.industry")} required>
            <Input value={industry} onChange={(event) => setIndustry(event.target.value)} />
          </FieldWrapper>
          <FieldWrapper label={t("suppliers.field.mainProducts")} required className="sm:col-span-2">
            <Textarea rows={2} value={products} onChange={(event) => setProducts(event.target.value)} />
          </FieldWrapper>
          <FieldWrapper label={t("suppliers.field.contactPerson")} optional={t("common.optional")}>
            <Input value={contact} onChange={(event) => setContact(event.target.value)} />
          </FieldWrapper>
          <FieldWrapper label={t("suppliers.field.contactPhone")} optional={t("common.optional")}>
            <Input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} />
          </FieldWrapper>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            requires={[
              [name.trim(), t("suppliers.field.name")],
              [code.trim(), t("suppliers.field.code")],
              [industry.trim(), t("suppliers.field.industry")],
              [products.trim(), t("suppliers.field.mainProducts")],
            ]}
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? <Loader2 className="animate-spin" /> : <Plus />}
            {t("suppliers.quickAdd.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
