"use client";

import { useTranslations } from "next-intl";

interface RiskBadgeProps {
  riskScore: number;
  threshold?: number;
}

export function RiskBadge({ riskScore, threshold = 3 }: RiskBadgeProps) {
  const t = useTranslations("patients.risk");

  const variant =
    riskScore === 0
      ? "low"
      : riskScore < threshold
        ? "moderate"
        : "high";

  const label =
    variant === "low"
      ? t("low")
      : variant === "moderate"
        ? t("moderate")
        : t("high");

  const bgClass =
    variant === "low"
      ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
      : variant === "moderate"
        ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"
        : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";

  const tooltip = t("tooltip", { count: riskScore });

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${bgClass}`}
      title={tooltip}
    >
      {label}
    </span>
  );
}
