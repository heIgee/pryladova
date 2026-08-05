import type { WeatherResponse } from "@pryladova/shared";
import type { LucideIcon } from "lucide-react";
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  LocateFixed,
  MapPin,
  RefreshCw,
  Sun,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { headerChipClassName, headerIconButtonClassName } from "@/components/layout/shell";
import { cn } from "@/lib/utils";
import type { GeocodeResult } from "@/lib/weather";
import { reverseGeocodeCity, searchWeatherCities } from "@/lib/weather";
import { readBrowserLocation, type WeatherLocation } from "@/lib/weather-location";

const weatherCodeToIcon = (code: number): LucideIcon => {
  if (code === 0) {
    return Sun;
  }
  if (code >= 1 && code <= 3) {
    return Cloud;
  }
  if (code === 45 || code === 48) {
    return CloudFog;
  }
  if (code >= 51 && code <= 57) {
    return CloudDrizzle;
  }
  if (code >= 61 && code <= 67) {
    return CloudRain;
  }
  if (code >= 71 && code <= 77) {
    return CloudSnow;
  }
  if (code >= 80 && code <= 82) {
    return CloudRain;
  }
  if (code >= 85 && code <= 86) {
    return CloudSnow;
  }
  if (code >= 95 && code <= 99) {
    return CloudLightning;
  }
  return Cloud;
};

const MIN_REFRESH_SPIN_MS = 400;

const popoverRowClassName =
  "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-caption text-foreground transition-colors hover:bg-muted";

export const WeatherHeader = ({
  weather,
  locationLabel,
  onLocationChange,
  onRefresh,
}: {
  weather: WeatherResponse;
  locationLabel: string | null;
  onLocationChange: (location: WeatherLocation) => void;
  onRefresh: () => Promise<void>;
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const refreshGeneration = useRef(0);
  const inputId = useId();
  const listboxId = useId();

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: MouseEvent): void => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      setSearchError(null);
      setGeoError(null);
      return;
    }

    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setSearchError(null);
      return;
    }

    const timer = window.setTimeout(() => {
      void searchWeatherCities(trimmed)
        .then((next) => {
          setResults(next);
          setSearchError(next.length === 0 ? "No matches" : null);
        })
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : "Search failed";
          setSearchError(message);
          setResults([]);
        });
    }, 300);

    return () => {
      window.clearTimeout(timer);
    };
  }, [open, query]);

  const handlePick = (result: GeocodeResult): void => {
    onLocationChange({ lat: result.lat, lon: result.lon, label: result.label });
    setOpen(false);
  };

  const handleUseBrowserLocation = (): void => {
    setBusy(true);
    setGeoError(null);
    void readBrowserLocation()
      .then(({ lat, lon }) => reverseGeocodeCity(lat, lon))
      .then((result) => {
        onLocationChange({ lat: result.lat, lon: result.lon, label: result.label });
        setOpen(false);
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "Location denied";
        setGeoError(message);
      })
      .finally(() => {
        setBusy(false);
      });
  };

  const canRefresh = weather.status !== "disabled";

  const handleRefresh = (): void => {
    if (!canRefresh) {
      return;
    }

    const generation = ++refreshGeneration.current;
    const startedAt = Date.now();
    setRefreshing(true);

    void onRefresh().finally(() => {
      const elapsed = Date.now() - startedAt;
      const finish = (): void => {
        if (refreshGeneration.current === generation) {
          setRefreshing(false);
        }
      };

      if (elapsed < MIN_REFRESH_SPIN_MS) {
        window.setTimeout(finish, MIN_REFRESH_SPIN_MS - elapsed);
        return;
      }

      finish();
    });
  };

  const chipLabel =
    weather.status === "ready"
      ? `${Math.round(weather.temperatureC)}° · ${weather.condition}`
      : weather.status === "unavailable"
        ? "Unavailable"
        : "Set location";

  const Icon = weather.status === "ready" ? weatherCodeToIcon(weather.weatherCode) : MapPin;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        className={cn(headerChipClassName, open && "bg-muted text-foreground")}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => {
          setOpen((value) => !value);
        }}
      >
        <Icon className="size-3 shrink-0" aria-hidden="true" />
        <span className="whitespace-nowrap">{chipLabel}</span>
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Weather location"
          className="absolute top-full right-0 z-20 mt-2 w-[min(18rem,calc(100vw-2rem))] rounded-xl bg-background p-2.5 shadow-lg ring-1 ring-border/60"
        >
          <div
            className={cn(
              "mb-2 flex items-center gap-2",
              locationLabel ? "justify-between" : "justify-end",
            )}
          >
            {locationLabel ? (
              <p className="min-w-0 flex-1 text-micro break-words text-muted-foreground">
                {locationLabel}
              </p>
            ) : null}
            <button
              type="button"
              disabled={!canRefresh}
              className={cn(headerIconButtonClassName, "size-7 shrink-0")}
              aria-label="Refresh weather"
              title="Refresh weather"
              onClick={handleRefresh}
            >
              <RefreshCw
                className={cn("size-3.5", refreshing && "animate-spin")}
                aria-hidden="true"
              />
            </button>
          </div>

          <button
            type="button"
            disabled={busy}
            className={cn(popoverRowClassName, "mb-3 disabled:opacity-50")}
            onClick={handleUseBrowserLocation}
          >
            <LocateFixed className="size-3.5 shrink-0" aria-hidden="true" />
            Use my location
          </button>

          {geoError ? <p className="mb-2 text-micro text-destructive">{geoError}</p> : null}

          <label htmlFor={inputId} className="mb-1 block text-micro text-muted-foreground">
            Search city
          </label>
          <input
            id={inputId}
            type="search"
            value={query}
            placeholder="Kyiv, Berlin…"
            autoComplete="off"
            role="combobox"
            aria-controls={listboxId}
            aria-expanded={results.length > 0}
            className="mb-2 w-full rounded-lg bg-muted px-2 py-1.5 text-caption text-foreground outline-none ring-1 ring-border/60 focus:ring-foreground/20"
            onChange={(event) => {
              setQuery(event.target.value);
            }}
          />

          {searchError ? (
            <p className="mb-1 text-micro text-muted-foreground">{searchError}</p>
          ) : null}

          <div id={listboxId} role="listbox" className="max-h-40 overflow-y-auto">
            {results.map((result) => (
              <button
                key={`${result.lat},${result.lon},${result.label}`}
                type="button"
                role="option"
                className={popoverRowClassName}
                onClick={() => {
                  handlePick(result);
                }}
              >
                {result.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
};
