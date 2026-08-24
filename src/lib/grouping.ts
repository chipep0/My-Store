export type GroupMode = "day" | "week" | "month" | "quarter";

export interface GroupInfo {
  key: string;
  sortKey: number;
  label: string;
}

/** Buckets a plain "YYYY-MM-DD" date into the chosen granularity, with a
 * stable sort key (period start) and a human label for the group header. */
export function groupInfo(dateStr: string, mode: GroupMode): GroupInfo {
  const d = new Date(dateStr + "T00:00:00");
  if (mode === "week") {
    const dow = (d.getDay() + 6) % 7;
    const start = new Date(d);
    start.setDate(d.getDate() - dow);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { key: "w" + start.toISOString().slice(0, 10), sortKey: start.getTime(), label: `Week of ${start.toLocaleDateString()} – ${end.toLocaleDateString()}` };
  }
  if (mode === "month") {
    const start = new Date(d.getFullYear(), d.getMonth(), 1);
    return { key: "m" + d.getFullYear() + "-" + d.getMonth(), sortKey: start.getTime(), label: start.toLocaleDateString(undefined, { month: "long", year: "numeric" }) };
  }
  if (mode === "quarter") {
    const q = Math.floor(d.getMonth() / 3);
    const start = new Date(d.getFullYear(), q * 3, 1);
    return { key: "q" + d.getFullYear() + "-" + q, sortKey: start.getTime(), label: `Q${q + 1} ${d.getFullYear()}` };
  }
  return { key: "d" + dateStr, sortKey: d.getTime(), label: d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" }) };
}

export interface Group<T> {
  label: string;
  sortKey: number;
  total: number;
  items: T[];
}

/** Groups a list of dated, amount-bearing records by the chosen granularity. */
export function groupByPeriod<T>(rows: T[], mode: GroupMode, dateOf: (row: T) => string, amountOf: (row: T) => number): Group<T>[] {
  const map: Record<string, Group<T>> = {};
  rows.forEach((row) => {
    const g = groupInfo(dateOf(row), mode);
    const grp = map[g.key] || (map[g.key] = { label: g.label, sortKey: g.sortKey, total: 0, items: [] });
    grp.total += amountOf(row) || 0;
    grp.items.push(row);
  });
  return Object.values(map).sort((a, b) => b.sortKey - a.sortKey);
}
