"use client"

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
          "--toast-error-bg": "var(--destructive)",
          "--toast-error-text": "var(--destructive-foreground)",
          "--toast-error-border": "color-mix(in srgb, var(--destructive) 60%, transparent)",
          "--toast-success-bg": "color-mix(in srgb, var(--primary) 15%, transparent)",
          "--toast-success-text": "var(--primary)",
          "--toast-success-border": "color-mix(in srgb, var(--primary) 30%, transparent)",
          "--toast-info-bg": "color-mix(in srgb, hsl(200 100% 50%) 15%, transparent)",
          "--toast-info-text": "hsl(200 100% 50%)",
          "--toast-info-border": "color-mix(in srgb, hsl(200 100% 50%) 30%, transparent)",
          "--toast-warning-bg": "color-mix(in srgb, hsl(40 100% 50%) 15%, transparent)",
          "--toast-warning-text": "hsl(40 100% 50%)",
          "--toast-warning-border": "color-mix(in srgb, hsl(40 100% 50%) 30%, transparent)",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
