import { useState, useCallback } from "react";

export function useReportDateRange(defaultMonths = 3) {
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - defaultMonths);
    return d.toISOString().split("T")[0];
  });
  const [endDate, setEndDate] = useState(() =>
    new Date().toISOString().split("T")[0]
  );

  const prevStart = useCallback(() => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffMs = end.getTime() - start.getTime();
    const prevEnd = new Date(start.getTime() - 1);
    const prevStartDate = new Date(prevEnd.getTime() - diffMs);
    return {
      start: prevStartDate.toISOString().split("T")[0],
      end: prevEnd.toISOString().split("T")[0],
    };
  }, [startDate, endDate]);

  return { startDate, endDate, setStartDate, setEndDate, prevStart };
}
