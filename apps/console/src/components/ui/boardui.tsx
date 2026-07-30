"use client";

import {
  Badge as BoardUIBadge,
  BoardUICard,
  Button as BoardUIButton,
  buttonVariants,
  cn,
} from "@boardui/ui";
import { Link } from "@/lib/router";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  variant = "secondary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return <BoardUIButton type="button" variant={variant} className={className} {...props} />;
}

export function ButtonLink({
  href,
  variant = "secondary",
  className,
  children,
}: {
  href: string;
  variant?: ButtonVariant;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={cn(buttonVariants({ variant, size: "md" }), className)}>
      <span className="inline-flex shrink-0 items-center justify-center px-1">{children}</span>
    </Link>
  );
}

export function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <BoardUICard className={cn("p-1", className)}>{children}</BoardUICard>
  );
}

export function CardSurface({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl bg-card p-4 shadow-board-card", className)}>{children}</div>
  );
}

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "info" | "success" | "warning" | "danger";
  className?: string;
}) {
  const tones = {
    neutral: "bg-muted text-muted-foreground",
    info: "bg-info-100 text-info-700",
    success: "bg-pos-100 text-pos-700",
    warning: "bg-warn-100 text-warn-700",
    danger: "bg-neg-100 text-neg-700",
  };
  return (
    <BoardUIBadge
      variant="secondary"
      className={cn(
        tones[tone],
        className,
      )}
    >
      {children}
    </BoardUIBadge>
  );
}

export function PageShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex w-full flex-1 flex-col gap-4 p-4 lg:p-6", className)}>
      {children}
    </div>
  );
}

export function SectionHeading({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-base font-semibold tracking-tight text-foreground">{title}</h2>
        {description ? (
          <p className="mt-1 max-w-[70ch] text-[0.8125rem] text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
