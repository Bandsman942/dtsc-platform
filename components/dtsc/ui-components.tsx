"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function PremiumCard({
  children,
  className,
  glow = false,
  gradient = false,
}: {
  children: ReactNode;
  className?: string;
  glow?: boolean;
  gradient?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className={cn(
        "relative overflow-hidden rounded-[1.75rem] border p-5",
        gradient
          ? "border-cyan-300/25 bg-[linear-gradient(135deg,rgba(0,43,91,0.92),rgba(6,17,31,0.88))] text-white shadow-[0_24px_80px_rgba(0,23,54,0.24)]"
          : "border-dtsc-border/70 bg-dtsc-surface/82 text-dtsc-ink shadow-[0_18px_60px_rgba(0,23,54,0.10)] backdrop-blur-2xl",
        glow && "shadow-[0_0_45px_rgba(0,194,255,0.18)]",
        className
      )}
    >
      {children}
    </motion.div>
  );
}

export function GlassCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.985 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className={cn("rounded-[1.75rem] border border-white/18 bg-white/72 p-5 shadow-[0_18px_70px_rgba(0,23,54,0.12)] backdrop-blur-2xl dark:border-white/10 dark:bg-white/8", className)}
    >
      {children}
    </motion.div>
  );
}

export function MobileStatCard({
  icon: Icon,
  label,
  value,
  tone = "cyan",
  className,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  tone?: "cyan" | "emerald" | "violet" | "amber";
  className?: string;
}) {
  const tones = {
    cyan: "bg-cyan-400/14 text-cyan-500",
    emerald: "bg-emerald-400/14 text-emerald-500",
    violet: "bg-violet-400/14 text-violet-500",
    amber: "bg-amber-400/14 text-amber-500",
  };
  return (
    <motion.div
      whileTap={{ scale: 0.985 }}
      className={cn("rounded-3xl border border-dtsc-border/70 bg-dtsc-surface/82 p-4 shadow-[0_16px_48px_rgba(0,23,54,0.08)] backdrop-blur-xl", className)}
    >
      <span className={cn("mb-3 flex h-10 w-10 items-center justify-center rounded-2xl", tones[tone])}>
        <Icon className="h-5 w-5" />
      </span>
      <p className="text-2xl font-black text-dtsc-ink">{value}</p>
      <p className="mt-1 text-xs font-bold text-dtsc-muted">{label}</p>
    </motion.div>
  );
}

export function MobileBadge({
  children,
  tone = "default",
  className,
}: {
  children: ReactNode;
  tone?: "default" | "primary" | "success" | "warning" | "danger";
  className?: string;
}) {
  const tones = {
    default: "border-dtsc-border bg-dtsc-soft text-dtsc-muted",
    primary: "border-cyan-300/40 bg-cyan-400/14 text-cyan-600 dark:text-cyan-200",
    success: "border-emerald-300/40 bg-emerald-400/14 text-emerald-600 dark:text-emerald-200",
    warning: "border-amber-300/40 bg-amber-400/14 text-amber-700 dark:text-amber-200",
    danger: "border-red-300/40 bg-red-400/14 text-red-600 dark:text-red-200",
  };
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-black", tones[tone], className)}>
      {children}
    </span>
  );
}

export function MobileAvatar({
  src,
  name,
  online,
  className,
}: {
  src?: string | null;
  name: string;
  online?: boolean;
  className?: string;
}) {
  const initials = name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <span className={cn("relative inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/20 bg-gradient-to-br from-cyan-400/35 to-[#002b5b]/35 text-sm font-black text-dtsc-ink shadow-[0_12px_32px_rgba(0,23,54,0.14)] dark:text-white", className)}>
      {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : initials}
      {online !== undefined && <span className={cn("absolute bottom-0.5 right-0.5 z-20 h-3 w-3 rounded-full border-2 border-dtsc-surface shadow-[0_0_14px_rgba(52,211,153,0.75)]", online ? "animate-dtsc-online-pulse bg-emerald-400" : "bg-slate-400")} />}
    </span>
  );
}
