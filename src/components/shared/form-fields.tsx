"use client";

import { useTranslations } from "next-intl";

import { FieldWrapper } from "@/components/shared/page-primitives";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

/**
 * Form controls bound to a TanStack Form field.
 *
 * The field API is structurally simple but its generic type is not, and
 * spelling it out at every call site buries the markup. This is the narrow
 * slice these controls actually touch.
 */
export interface BoundField<T = string> {
  name: string;
  state: {
    value: T;
    meta: { errors: Array<string | undefined> };
  };
  handleBlur: () => void;
  handleChange: (value: T) => void;
}

/** Narrowed to just the error slot, so any `BoundField<T>` can be passed. */
function firstError(field: {
  state: { meta: { errors: Array<string | undefined> } };
}): string | undefined {
  return field.state.meta.errors.find(Boolean);
}

export function TextField({
  field,
  label,
  required,
  optional,
  placeholder,
  hint,
  type = "text",
  autoComplete,
  className,
  disabled,
  min,
  max,
  step,
}: {
  field: BoundField;
  label: string;
  required?: boolean;
  optional?: boolean;
  placeholder?: string;
  hint?: string;
  type?: string;
  autoComplete?: string;
  className?: string;
  disabled?: boolean;
  min?: string | number;
  max?: string | number;
  step?: string | number;
}) {
  const t = useTranslations();
  const error = firstError(field);
  return (
    <FieldWrapper
      label={label}
      required={required}
      optional={optional ? t("common.optional") : undefined}
      error={error}
      hint={hint}
      className={className}
    >
      <Input
        id={field.name}
        type={type}
        autoComplete={autoComplete}
        disabled={disabled}
        min={min}
        max={max}
        step={step}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        value={field.state.value ?? ""}
        onBlur={field.handleBlur}
        onChange={(event) => field.handleChange(event.target.value)}
      />
    </FieldWrapper>
  );
}

export function TextAreaField({
  field,
  label,
  required,
  optional,
  placeholder,
  rows = 3,
  className,
}: {
  field: BoundField;
  label: string;
  required?: boolean;
  optional?: boolean;
  placeholder?: string;
  rows?: number;
  className?: string;
}) {
  const t = useTranslations();
  const error = firstError(field);
  return (
    <FieldWrapper
      label={label}
      required={required}
      optional={optional ? t("common.optional") : undefined}
      error={error}
      className={className}
    >
      <Textarea
        id={field.name}
        rows={rows}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        value={field.state.value ?? ""}
        onBlur={field.handleBlur}
        onChange={(event) => field.handleChange(event.target.value)}
      />
    </FieldWrapper>
  );
}

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export function SelectField({
  field,
  label,
  options,
  required,
  optional,
  placeholder,
  hint,
  disabled,
  className,
}: {
  field: BoundField;
  label: string;
  options: SelectOption[];
  required?: boolean;
  optional?: boolean;
  placeholder?: string;
  hint?: string;
  disabled?: boolean;
  className?: string;
}) {
  const t = useTranslations();
  const error = firstError(field);
  return (
    <FieldWrapper
      label={label}
      required={required}
      optional={optional ? t("common.optional") : undefined}
      error={error}
      hint={hint}
      className={className}
    >
      {/*
        `?? ""` rather than `|| undefined`. Radix reads an empty string as
        "nothing chosen" and still shows the placeholder, but an `undefined`
        that later becomes a string flips the component from uncontrolled to
        controlled — React warns, and the warning is right: a control that
        changes mode mid-life can drop the value it is holding.
      */}
      <Select
        value={field.state.value ?? ""}
        disabled={disabled || options.length === 0}
        onValueChange={(value) => field.handleChange(value)}
      >
        <SelectTrigger
          id={field.name}
          aria-invalid={error ? true : undefined}
          className="w-full bg-card"
        >
          <SelectValue
            placeholder={placeholder ?? t("common.selectPlaceholder")}
          />
        </SelectTrigger>
        <SelectContent>
          {options.length === 0 ? (
            <div className="px-2 py-3 text-center text-sm text-muted-foreground">
              {t("common.noOptions")}
            </div>
          ) : (
            options.map((option) => (
              <SelectItem
                key={option.value}
                value={option.value}
                disabled={option.disabled}
              >
                {option.label}
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
    </FieldWrapper>
  );
}
