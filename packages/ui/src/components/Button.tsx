import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  PropsWithChildren,
  ReactNode
} from "react";
import {
  Button as CossButton,
  type ButtonProps as CossButtonProps
} from "../coss/ui/button";
import { cn } from "../coss/lib/utils";

type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "danger"
  | "outline"
  | "destructive"
  | "destructive-outline";
type ButtonSize = "xs" | "sm" | "default" | "lg" | "icon" | "icon-sm" | "icon-lg";
type CossButtonVariant = NonNullable<CossButtonProps["variant"]>;
type CossButtonSize = NonNullable<CossButtonProps["size"]>;

type ButtonProps = PropsWithChildren<
  ButtonHTMLAttributes<HTMLButtonElement> & {
    loading?: boolean;
    loadingLabel?: ReactNode;
    size?: ButtonSize;
    variant?: ButtonVariant;
  }
>;

export function Button({
  children,
  className,
  disabled,
  loading = false,
  loadingLabel,
  size = "default",
  type = "button",
  variant = "secondary",
  ...props
}: ButtonProps) {
  const classes = cn(
    "ui-button",
    "coss-button",
    `ui-button--${variant}`,
    loading && "is-loading",
    className
  );

  return (
    <CossButton
      className={classes}
      disabled={disabled || loading}
      loading={loading}
      render={<button type={type} />}
      size={normalizeSize(size)}
      variant={normalizeVariant(variant)}
      {...props}
    >
      {loading ? (loadingLabel ?? children) : children}
    </CossButton>
  );
}

type ButtonLinkProps = PropsWithChildren<
  AnchorHTMLAttributes<HTMLAnchorElement> & {
    size?: ButtonSize;
    variant?: ButtonVariant;
  }
>;

export function ButtonLink({
  children,
  className,
  size = "default",
  variant = "secondary",
  ...props
}: ButtonLinkProps) {
  const classes = cn("ui-button", "coss-button", `ui-button--${variant}`, className);

  return (
    <CossButton
      className={classes}
      render={<a {...props} />}
      size={normalizeSize(size)}
      variant={normalizeVariant(variant)}
    >
      {children}
    </CossButton>
  );
}

function normalizeVariant(variant: ButtonVariant): CossButtonVariant {
  switch (variant) {
    case "primary":
      return "default";
    case "danger":
      return "destructive";
    default:
      return variant;
  }
}

function normalizeSize(size: ButtonSize): CossButtonSize {
  return size;
}
