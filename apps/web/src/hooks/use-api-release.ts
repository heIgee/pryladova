import { useEffect, useState, useSyncExternalStore } from "react";
import { fetchApiRelease } from "@/lib/health";
import { getPanelPollSnapshot, subscribePanelPoll } from "@/lib/panel-poll";
import { readAppRelease, resolveDisplayedRelease } from "@/lib/release";

export const useDisplayedRelease = (): { release: string; title: string } => {
  const { connectFailed, panel } = useSyncExternalStore(
    subscribePanelPoll,
    getPanelPollSnapshot,
    getPanelPollSnapshot,
  );
  const apiDown = panel.status === "loading" && connectFailed;
  const [healthSynced, setHealthSynced] = useState(false);
  const [apiRelease, setApiRelease] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (apiDown) {
      setHealthSynced(false);
      setApiRelease(undefined);
      return;
    }

    let active = true;

    const load = async (): Promise<void> => {
      try {
        const release = await fetchApiRelease();
        if (!active) {
          return;
        }
        setApiRelease(release);
        setHealthSynced(true);
      } catch {
        if (!active) {
          return;
        }
        setHealthSynced(false);
        setApiRelease(undefined);
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, [apiDown]);

  const buildRelease = readAppRelease();
  const release = resolveDisplayedRelease(buildRelease, { healthSynced, apiRelease });
  const title = healthSynced ? `API release ${apiRelease ?? "—"}` : `Web build ${buildRelease}`;

  return { release, title };
};
