import type { PropsWithChildren, ReactNode } from "react";

type PanelProps = PropsWithChildren<{
  actions?: ReactNode;
  className?: string;
  title: string;
}>;

export function Panel({ actions, children, className, title }: PanelProps) {
  const classes = ["ui-panel", className].filter(Boolean).join(" ");

  return (
    <section className={classes}>
      <header className="ui-panel__header">
        <h2>{title}</h2>
        {actions ? <div className="ui-panel__actions">{actions}</div> : null}
      </header>
      <div className="ui-panel__body">{children}</div>
    </section>
  );
}
