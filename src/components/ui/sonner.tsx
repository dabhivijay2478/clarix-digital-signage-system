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

const Toaster = ({
  position = "bottom-right",
  richColors = true,
  style,
  ...props
}: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      position={position}
      richColors={richColors}
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
          "--success-bg": "hsl(151 72% 38%)",
          "--success-text": "hsl(0 0% 100%)",
          "--success-border": "hsl(151 72% 30%)",
          "--error-bg": "var(--destructive)",
          "--error-text": "var(--destructive-foreground)",
          "--error-border": "color-mix(in srgb, var(--destructive) 78%, black)",
          "--info-bg": "hsl(200 95% 42%)",
          "--info-text": "hsl(0 0% 100%)",
          "--info-border": "hsl(200 95% 32%)",
          "--warning-bg": "hsl(40 95% 43%)",
          "--warning-text": "hsl(0 0% 100%)",
          "--warning-border": "hsl(40 95% 33%)",
          ...style,
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
