export function formatFCFA(amount: number): string {
  return new Intl.NumberFormat("fr-FR").format(amount);
}

export function formatDay(iso: string): { num: string; label: string } {
  const d = new Date(iso);
  const num = new Intl.DateTimeFormat("fr-FR", { day: "2-digit" }).format(d);
  const label = new Intl.DateTimeFormat("fr-FR", { weekday: "short" }).format(d).replace(".", "");
  return { num, label: label.charAt(0).toUpperCase() + label.slice(1) };
}

export function formatFullDate(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "long" }).format(new Date(iso));
}

export function formatFullDateRange(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  const startLabel = sameMonth
    ? new Intl.DateTimeFormat("fr-FR", { day: "2-digit" }).format(start)
    : formatFullDate(startIso);
  return `Du ${startLabel} au ${formatFullDate(endIso)}`;
}

export function formatCompactDate(iso: string): string {
  const { num, label } = formatDay(iso);
  return `${num} ${label}`;
}

export function formatCompactRange(startIso: string, endIso: string): string {
  const startNum = new Intl.DateTimeFormat("fr-FR", { day: "2-digit" }).format(new Date(startIso));
  return `${startNum} → ${formatCompactDate(endIso)}`;
}

export function isOverdue(iso: string, status: string): boolean {
  if (status === "livre") return false;
  const due = new Date(iso);
  due.setHours(23, 59, 59, 999);
  return due.getTime() < Date.now();
}

export function isDueToday(dueDate: string, dueDateStart: string | null, status: string): boolean {
  if (status === "livre") return false;
  const today = new Date().toDateString();
  if (dueDateStart) {
    const start = new Date(dueDateStart);
    const end = new Date(dueDate);
    const now = new Date();
    now.setHours(12, 0, 0, 0);
    return start.getTime() <= now.getTime() && now.getTime() <= end.getTime();
  }
  return new Date(dueDate).toDateString() === today;
}

export function nextDays(count: number, offset = 0): string[] {
  const days: string[] = [];
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  for (let i = offset; i < offset + count; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    days.push(d.toISOString());
  }
  return days;
}

export function toDateInputValue(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function fromDateInputValue(value: string): string {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0).toISOString();
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
