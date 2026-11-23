import type { HTMLAttributes, Ref } from "react";
import { cx } from "@/utils/cx";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Surface elevation style following BoardUI + Apple HIG hierarchy. */
  variant?: "default" | "elevated" | "inset";
  ref?: Ref<HTMLDivElement>;
}

/**
 * BoardUI Card surface — rounded-3xl with semantic surface tokens, hairline
 * border, and 1px contact shadow. Glass belongs only to floating functional
 * layers (sticky bars, modals, drawers), never content cards.
 */
export function Card({
  className,
  variant = "default",
  children,
  ref,
  ...props
}: CardProps) {
  const variantStyles = {
    default: "bg-background-primary-default border border-border-button-default shadow-card",
    elevated: "bg-background-primary-default border border-border-button-default shadow-md",
    inset: "bg-background-secondary-default border border-separator-border",
  };

  return (
    <div
      ref={ref}
      className={cx(
        "rounded-3xl transition-colors duration-150 overflow-hidden",
        variantStyles[variant],
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx("flex flex-col gap-1 p-5 sm:p-6 pb-2", className)} {...props}>
      {children}
    </div>
  );
}

export function CardTitle({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cx("text-title-3-semibold text-text-primary", className)}
      {...props}
    >
      {children}
    </h3>
  );
}

export function CardDescription({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cx("text-body-regular text-text-secondary", className)}
      {...props}
    >
      {children}
    </p>
  );
}

export function CardContent({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx("p-5 sm:p-6 pt-3", className)} {...props}>
      {children}
    </div>
  );
}

export function CardFooter({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cx(
        "flex items-center justify-between gap-3 border-t border-separator-border p-5 sm:p-6 pt-4",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
