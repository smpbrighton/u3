import { HugeiconsIcon } from "@hugeicons/react"
import { CheckmarkCircle02Icon, InformationCircleIcon, Loading03Icon, CancelCircleIcon, Alert02Icon } from "@hugeicons/core-free-icons"
import { useResolvedTheme } from "../../theme-state"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { cn } from "./utils"

const Toaster = ({ className, style, toastOptions, ...props }: Omit<ToasterProps, "theme">) => {
  const theme = useResolvedTheme()

  return (
    <Sonner
      {...props}
      theme={theme}
      duration={props.duration ?? 5000}
      visibleToasts={props.visibleToasts ?? 1}
      containerAriaLabel={props.containerAriaLabel ?? "알림"}
      className={cn("u3-shell toaster group", className)}
      icons={{
        success: <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-4" />,
        info: <HugeiconsIcon icon={InformationCircleIcon} className="size-4" />,
        warning: <HugeiconsIcon icon={Alert02Icon} className="size-4" />,
        error: <HugeiconsIcon icon={CancelCircleIcon} className="size-4" />,
        loading: <HugeiconsIcon icon={Loading03Icon} className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
          fontFamily: '"Pretendard", system-ui, sans-serif',
          ...style,
        } as React.CSSProperties
      }
      toastOptions={{
        ...toastOptions,
        closeButtonAriaLabel: "닫기",
        classNames: {
          ...toastOptions?.classNames,
          title: cn("font-normal!", toastOptions?.classNames?.title),
          actionButton: cn("font-normal!", toastOptions?.classNames?.actionButton),
          cancelButton: cn("font-normal!", toastOptions?.classNames?.cancelButton),
        },
      }}
    />
  )
}

export { Toaster }
