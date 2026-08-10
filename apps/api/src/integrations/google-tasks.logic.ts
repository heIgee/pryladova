import { z } from "zod";

export const googleTasksSchema = z.object({
  items: z
    .array(
      z.object({
        title: z.string().optional(),
        status: z.string().optional(),
        due: z.string().optional(),
      }),
    )
    .optional(),
});

type GoogleTaskItem = {
  title: string;
  dueAt: string | null;
};

type GoogleTasksSummary = {
  openCount: number;
  dueTodayCount: number;
  tasks: GoogleTaskItem[];
};

const formatDateKey = (instant: Date): string =>
  new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);

const parseTaskDueAt = (due: string | undefined): string | null => {
  if (!due) {
    return null;
  }
  const parsed = Date.parse(due);
  if (Number.isNaN(parsed)) {
    return null;
  }
  return new Date(parsed).toISOString();
};

export const isDueToday = (dueAt: string | null, todayKey: string): boolean => {
  if (!dueAt) {
    return false;
  }
  return formatDateKey(new Date(dueAt)) === todayKey;
};

const taskSortGroup = (dueAt: string | null, todayKey: string): number => {
  if (!dueAt) {
    return 2;
  }
  const dueKey = formatDateKey(new Date(dueAt));
  if (dueKey >= todayKey) {
    return 0;
  }
  return 1;
};

const compareTasksByDue = (
  left: GoogleTaskItem,
  right: GoogleTaskItem,
  todayKey: string,
): number => {
  const leftGroup = taskSortGroup(left.dueAt, todayKey);
  const rightGroup = taskSortGroup(right.dueAt, todayKey);
  if (leftGroup !== rightGroup) {
    return leftGroup - rightGroup;
  }
  if (left.dueAt === null || right.dueAt === null) {
    return 0;
  }
  const leftMs = Date.parse(left.dueAt);
  const rightMs = Date.parse(right.dueAt);
  if (leftGroup === 0) {
    return leftMs - rightMs;
  }
  return rightMs - leftMs;
};

export const summarizeTasks = (
  items: Array<{ title?: string; status?: string; due?: string }>,
  now = new Date(),
  maxTasks = 5,
): GoogleTasksSummary => {
  const todayKey = formatDateKey(now);
  const open = items.filter((task) => task.status !== "completed");

  const mapped = open.map((task) => ({
    title: task.title?.trim() || "Untitled",
    dueAt: parseTaskDueAt(task.due),
  }));

  const dueTodayCount = mapped.filter((task) => isDueToday(task.dueAt, todayKey)).length;
  const sorted = [...mapped].sort((left, right) => compareTasksByDue(left, right, todayKey));

  return {
    openCount: mapped.length,
    dueTodayCount,
    tasks: sorted.slice(0, maxTasks),
  };
};
