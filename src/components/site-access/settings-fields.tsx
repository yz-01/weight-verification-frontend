"use client";

/**
 * The small pieces the two company-settings screens share (JB99): the
 * contractor's own 公司设置 and MSE's 锁定设定 on the platform company page.
 */

import type { Settings2 } from "lucide-react";

import { FieldWrapper } from "@/components/shared/page-primitives";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

export function SectionTitle({ icon: Icon, title, description, action }: { icon: typeof Settings2; title: string; description: string; action?: React.ReactNode }) { return <div className="flex flex-wrap items-start justify-between gap-3"><div className="flex min-w-0 items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Icon className="size-5" /></span><div className="min-w-0"><h2 className="text-base font-semibold text-foreground">{title}</h2><p className="mt-0.5 text-sm text-muted-foreground">{description}</p></div></div>{action}</div>; }
export function NumberField({ label, value, min, max, disabled, onChange }: { label: string; value: number; min: number; max: number; disabled: boolean; onChange: (value: number) => void }) { return <FieldWrapper label={label}><Input type="number" value={value} min={min} max={max} disabled={disabled} onChange={(event) => onChange(Number(event.target.value))} /></FieldWrapper>; }
export function ChoiceField({ label, value, options, disabled, optionLabel = (row) => row, onChange }: { label: string; value: string; options: string[]; disabled: boolean; optionLabel?: (value: string) => string; onChange: (value: string) => void }) { return <FieldWrapper label={label}><Select disabled={disabled} value={value} onValueChange={onChange}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{options.map((option) => <SelectItem key={option} value={option}>{optionLabel(option)}</SelectItem>)}</SelectContent></Select></FieldWrapper>; }
export function Toggle({ label, description, checked, disabled = false, compact = false, onChange }: { label: string; description?: string; checked: boolean; disabled?: boolean; compact?: boolean; onChange: (checked: boolean) => void }) { return <label className={`flex items-center justify-between gap-4 rounded-lg border bg-card ${compact ? "px-3 py-2" : "p-3"}`}><span className="min-w-0"><span className="block text-sm font-medium">{label}</span>{description && <span className="mt-1 block text-xs text-muted-foreground">{description}</span>}</span><Switch checked={checked} disabled={disabled} onCheckedChange={onChange} /></label>; }
export function State({ text, danger = false }: { text: string; danger?: boolean }) { return <div className={`grid min-h-40 place-items-center rounded-xl border border-dashed border-panel-border p-6 text-center text-sm ${danger ? "text-destructive" : "text-muted-foreground"}`}>{text}</div>; }
export function ErrorBanner({ text }: { text: string }) { return <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{text}</div>; }
