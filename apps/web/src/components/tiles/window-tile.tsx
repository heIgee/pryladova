import { pickSpinnerVerb, type TelemetryState } from "@pryladova/shared";
import { Monitor } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";

const MutedChip = ({ children }: { children: ReactNode }) => (
  <span className="inline-flex h-5 items-center rounded-md bg-muted px-2 text-micro font-medium leading-none text-muted-foreground">
    {children}
  </span>
);

const normalizeLabel = (value: string): string => value.trim().toLowerCase();

const titlesMatch = (left: string, right: string): boolean =>
  normalizeLabel(left) === normalizeLabel(right);

const classificationSeed = (telemetry: TelemetryState): string =>
  `${telemetry.appName}|${telemetry.windowTitle}|${telemetry.receivedAt}`;

export const WindowTile = ({
  telemetry,
  classificationEnabled,
  settingsError,
  settingsSyncing,
  settingsReady,
  onClassificationChange,
}: {
  telemetry: TelemetryState;
  classificationEnabled: boolean;
  settingsError: string | null;
  settingsSyncing: boolean;
  settingsReady: boolean;
  onClassificationChange: (enabled: boolean) => void;
}) => {
  const classification = telemetry.classification;
  const status = telemetry.classificationStatus;
  const displayName = classification?.displayAppName ?? telemetry.appName;

  const windowSubtitle =
    telemetry.windowTitle.trim().length > 0 &&
    !titlesMatch(telemetry.windowTitle, displayName) &&
    !titlesMatch(telemetry.windowTitle, telemetry.appName)
      ? telemetry.windowTitle
      : null;

  const showCategory = classificationEnabled && status === "ready" && classification !== null;
  const showWorkChip =
    classificationEnabled &&
    status === "ready" &&
    classification !== null &&
    classification.workRelated !== "maybe";
  const isClassifying = classificationEnabled && status === "pending";
  const isClassificationFailed = classificationEnabled && status === "failed";
  const isMisconfigured = classificationEnabled && status === "misconfigured";
  const showClassificationChips =
    showCategory ||
    showWorkChip ||
    isClassifying ||
    isClassificationFailed ||
    isMisconfigured ||
    !classificationEnabled ||
    status === "disabled";

  return (
    <Card size="sm">
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Monitor className="size-3.5 text-muted-foreground" />
          Window
        </CardTitle>
        {showClassificationChips ? (
          <CardAction>
            <div className="flex max-w-full flex-wrap justify-end gap-1.5">
              {showCategory ? <Badge>{classification.category}</Badge> : null}
              {showWorkChip ? (
                <Badge>{classification.workRelated === "yes" ? "Work" : "Personal"}</Badge>
              ) : null}
              {isClassifying ? (
                <Badge variant="secondary">{pickSpinnerVerb(classificationSeed(telemetry))}…</Badge>
              ) : null}
              {isClassificationFailed ? (
                <Badge variant="secondary">Classification failed</Badge>
              ) : null}
              {isMisconfigured ? (
                <Badge variant="secondary">Classification unavailable</Badge>
              ) : null}
              {!classificationEnabled || status === "disabled" ? (
                <MutedChip>Classification off</MutedChip>
              ) : null}
            </div>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <h2 className="truncate text-display font-medium">{displayName}</h2>
        {windowSubtitle ? (
          <p className="line-clamp-3 text-body leading-relaxed text-muted-foreground">
            {windowSubtitle}
          </p>
        ) : null}
      </CardContent>
      <CardFooter className="flex flex-col items-start gap-1">
        <label
          htmlFor="classify-toggle"
          className="flex w-fit cursor-pointer items-center gap-2 text-caption text-muted-foreground"
        >
          Classify with AI
          <Switch
            id="classify-toggle"
            size="sm"
            checked={classificationEnabled}
            disabled={!settingsReady || settingsSyncing}
            onCheckedChange={onClassificationChange}
          />
        </label>
        {settingsError ? <p className="text-caption text-destructive">{settingsError}</p> : null}
      </CardFooter>
    </Card>
  );
};
