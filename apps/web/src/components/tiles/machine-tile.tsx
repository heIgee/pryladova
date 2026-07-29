import type { HostPayload } from "@pryladova/shared";
import { Cpu, MemoryStick, Server, Timer } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  formatDuration,
  formatPercent,
  formatPresence,
  IDLE_ACTIVE_THRESHOLD_MS,
} from "@/lib/format";

const StatBar = ({
  icon,
  label,
  percent,
  value,
}: {
  icon: ReactNode;
  label: string;
  percent: number;
  value: string;
}) => (
  <div className="flex flex-col gap-1.5">
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-1.5 text-caption text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <span className="text-stat font-medium tabular-nums">{value}</span>
    </div>
    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
      <div
        className="h-full rounded-full bg-chart-2 transition-[width] duration-500 ease-out"
        style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
      />
    </div>
  </div>
);

export const MachineTile = ({
  host,
  className,
}: {
  host: HostPayload | null;
  className?: string;
}) => (
  <Card size="sm" className={className}>
    <CardHeader className="border-b">
      <CardTitle className="flex items-center gap-2 text-sm">
        <Server className="size-3.5 text-muted-foreground" />
        Machine
      </CardTitle>
      <CardAction>
        <Badge
          variant={
            host && host.idleMs < IDLE_ACTIVE_THRESHOLD_MS
              ? "default"
              : host
                ? "secondary"
                : "outline"
          }
        >
          {host ? formatPresence(host.idleMs) : "Waiting"}
        </Badge>
      </CardAction>
    </CardHeader>
    <CardContent className="grid gap-4">
      {host ? (
        <>
          <StatBar
            icon={<Cpu className="size-3.5" />}
            label="CPU"
            percent={host.cpuPercent}
            value={formatPercent(host.cpuPercent)}
          />
          <StatBar
            icon={<MemoryStick className="size-3.5" />}
            label="RAM"
            percent={host.ramPercent}
            value={formatPercent(host.ramPercent)}
          />
          <div className="flex items-center gap-1.5 text-caption text-muted-foreground">
            <Timer className="size-3.5" />
            <span>Uptime</span>
            <span className="ml-auto font-medium text-foreground tabular-nums">
              {formatDuration(host.uptimeSec)}
            </span>
          </div>
        </>
      ) : (
        <p className="text-caption text-muted-foreground">Waiting for host metrics…</p>
      )}
    </CardContent>
  </Card>
);
