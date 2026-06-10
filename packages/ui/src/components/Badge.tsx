import type { PropsWithChildren } from "react";

type BadgeTone = "neutral" | "success" | "warning" | "danger" | "info";

export function Badge({
  children,
  tone = "neutral"
}: PropsWithChildren<{ tone?: BadgeTone }>) {
  return <span className={`ui-badge ui-badge--${tone}`}>{children}</span>;
}
