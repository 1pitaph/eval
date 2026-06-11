import type { HTMLAttributes, PropsWithChildren, ReactNode } from "react";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle
} from "../coss/ui/card";
import { cn } from "../coss/lib/utils";

type PanelProps = PropsWithChildren<
  HTMLAttributes<HTMLElement> & {
  actions?: ReactNode;
  title: string;
}
>;

export function Panel({
  actions,
  children,
  className,
  title,
  ...props
}: PanelProps) {
  const classes = cn("ui-panel", "coss-card", className);

  return (
    <Card className={classes} render={<section {...props} />}>
      <CardHeader
        className="ui-panel__header coss-card__header"
        render={<header />}
      >
        <CardTitle render={<h2 />}>{title}</CardTitle>
        {actions ? (
          <CardAction className="ui-panel__actions coss-card__actions">
            {actions}
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="ui-panel__body coss-card__content">
        {children}
      </CardContent>
    </Card>
  );
}
