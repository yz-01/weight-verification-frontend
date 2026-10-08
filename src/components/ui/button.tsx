import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { useTranslations } from "next-intl"

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { missingFields, type Requirement } from "@/lib/missing-fields"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button relative inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-primary bg-(image:--primary-gradient) font-semibold text-primary-foreground shadow-glow hover:brightness-110",
        outline:
          "border-input bg-card text-foreground hover:border-primary/50 hover:bg-accent hover:text-accent-foreground aria-expanded:bg-accent aria-expanded:text-accent-foreground dark:bg-field dark:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "hover:bg-accent hover:text-accent-foreground aria-expanded:bg-accent aria-expanded:text-accent-foreground",
        destructive:
          "border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-10 gap-2 px-4 pointer-coarse:h-11 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        xs: "h-7 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs pointer-coarse:after:absolute pointer-coarse:after:inset-x-[min(0px,calc((100%-44px)/2))] pointer-coarse:after:inset-y-[min(0px,calc((100%-44px)/2))] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 rounded-[min(var(--radius-md),12px)] px-3 text-[0.8125rem] pointer-coarse:after:absolute pointer-coarse:after:inset-x-[min(0px,calc((100%-44px)/2))] pointer-coarse:after:inset-y-[min(0px,calc((100%-44px)/2))] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-11 gap-2 px-5 text-[0.9375rem] has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4",
        icon: "size-9 pointer-coarse:size-11",
        "icon-xs":
          "size-7 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3.5 pointer-coarse:after:absolute pointer-coarse:after:inset-x-[min(0px,calc((100%-44px)/2))] pointer-coarse:after:inset-y-[min(0px,calc((100%-44px)/2))]",
        "icon-sm":
          "size-8 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg pointer-coarse:after:absolute pointer-coarse:after:inset-x-[min(0px,calc((100%-44px)/2))] pointer-coarse:after:inset-y-[min(0px,calc((100%-44px)/2))]",
        "icon-lg": "size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

/**
 * `disabledReason` is the sentence a greyed-out button owes the person looking
 * at it. Say what is missing or not permitted, in their words - "Choose a
 * lorry and a date first", not "invalid form state".
 *
 * A disabled button gets no pointer events, so the reason is carried by a
 * wrapper around it: that wrapper takes the hover for the tooltip, holds a
 * native `title` for anyone who never sees the tooltip, and is what assistive
 * technology reads through `aria-describedby`. The wrapper is `contents`, so
 * it adds nothing to the layout and a button inside a flex row or a dialog
 * footer keeps its place.
 *
 * Passing a reason for a button that is *not* disabled does nothing, so a
 * caller may compute one unconditionally.
 *
 * `requires` is the shorthand for the common case: the fields a form is still
 * waiting for, as `[value, label]` pairs. The button disables itself while any
 * of them is empty and writes its own reason naming them, so the list that
 * decides whether it can be pressed is the same list that explains why it
 * cannot. Use the labels the fields already carry on screen, and keep
 * `disabled` for the other reasons - a request in flight, a permission:
 *
 * ```tsx
 * <Button
 *   requires={[[form.name, t("field.name")], [form.serial, t("field.serial")]]}
 *   disabled={save.isPending}
 * />
 * ```
 */
/** A plain `bg-…` fill in a caller's classes (not `hover:bg-…`, not a clip). */
const OWN_FILL = /(^|\s)bg-(?!clip-|none\b|\(image)[a-z]/

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  disabledReason,
  requires,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
    disabledReason?: string
    requires?: readonly Requirement[]
  }) {
  const Comp = asChild ? Slot.Root : "button"
  const reasonId = React.useId()
  const t = useTranslations("common")

  const missing = requires ? missingFields(requires) : []
  const disabled = props.disabled || missing.length > 0
  const reason =
    disabledReason ??
    (missing.length > 0
      ? t("missingFields", { fields: missing.join(t("listSeparator")) })
      : undefined)
  const explained = Boolean(disabled && reason)

  const button = (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      aria-describedby={explained ? reasonId : props["aria-describedby"]}
      className={cn(
        buttonVariants({ variant, size }),
        // A caller that paints its own fill (a green "confirm", a red
        // "reject") gets that flat colour, not the primary gradient on top.
        variant === "default" && className && OWN_FILL.test(className) && "bg-none",
        className,
      )}
      {...props}
      disabled={disabled}
    />
  )

  if (!explained) return button

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="contents" title={reason}>
          {button}
        </span>
      </TooltipTrigger>
      <TooltipContent id={reasonId}>{reason}</TooltipContent>
    </Tooltip>
  )
}

export { Button, buttonVariants }
