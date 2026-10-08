"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: (
          <CircleCheckIcon className="size-4" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4" />
        ),
        error: (
          <OctagonXIcon className="size-4" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--panel-border)",
          "--border-radius": "var(--radius-xl)",
          "--success-bg": "color-mix(in srgb, var(--tone-green) 14%, var(--popover))",
          "--success-text": "var(--tone-green-fg)",
          "--success-border": "color-mix(in srgb, var(--tone-green) 40%, transparent)",
          "--error-bg": "color-mix(in srgb, var(--tone-rose) 14%, var(--popover))",
          "--error-text": "var(--tone-rose-fg)",
          "--error-border": "color-mix(in srgb, var(--tone-rose) 40%, transparent)",
          "--warning-bg": "color-mix(in srgb, var(--tone-amber) 14%, var(--popover))",
          "--warning-text": "var(--tone-amber-fg)",
          "--warning-border": "color-mix(in srgb, var(--tone-amber) 40%, transparent)",
          "--info-bg": "color-mix(in srgb, var(--tone-blue) 14%, var(--popover))",
          "--info-text": "var(--tone-blue-fg)",
          "--info-border": "color-mix(in srgb, var(--tone-blue) 40%, transparent)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
