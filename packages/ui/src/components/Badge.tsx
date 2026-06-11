import type { HTMLAttributes, PropsWithChildren } from "react";
import {
  Badge as CossBadge,
  type BadgeProps as CossBadgeProps
} from "../coss/ui/badge";
import { cn } from "../coss/lib/utils";

type BadgeTone = "neutral" | "success" | "warning" | "danger" | "info" | "error";
type BadgeSize = "sm" | "default" | "lg";
type CossBadgeVariant = NonNullable<CossBadgeProps["variant"]>;
type CossBadgeSize = NonNullable<CossBadgeProps["size"]>;

export function Badge({
  children,
  className,
  size = "default",
  tone = "neutral",
  ...props
}: PropsWithChildren<
  HTMLAttributes<HTMLSpanElement> & { size?: BadgeSize; tone?: BadgeTone }
>) {
  const normalizedTone = normalizeTone(tone);
  const classes = cn(
    "ui-badge",
    "coss-badge",
    `ui-badge--${normalizedTone}`,
    className
  );

  return (
    <CossBadge
      className={classes}
      render={<span {...props} />}
      size={normalizeSize(size)}
      variant={normalizedTone}
    >
      {children}
    </CossBadge>
  );
}

function normalizeTone(tone: BadgeTone): CossBadgeVariant {
  switch (tone) {
    case "neutral":
      return "secondary";
    case "danger":
      return "error";
    default:
      return tone;
  }
}

function normalizeSize(size: BadgeSize): CossBadgeSize {
  return size;
}
