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
      ? "app-badge-low"
      : variant === "moderate"
        ? "app-badge-medium"
        : "app-badge-high";

  const tooltip = t("tooltip", { count: riskScore });

  return (
    <span
      className={`app-badge ${bgClass}`}
      title={tooltip}
    >
      {label}
    </span>
  );
}
