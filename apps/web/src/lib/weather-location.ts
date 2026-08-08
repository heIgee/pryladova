export const WEATHER_LOCATION_KEY = "pryladova.weatherLocation";

export type WeatherLocation = {
  lat: number;
  lon: number;
  label: string;
};

export const readStoredWeatherLocation = (): WeatherLocation | null => {
  const raw = localStorage.getItem(WEATHER_LOCATION_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object") {
      return null;
    }
    const record = parsed as Record<string, unknown>;
    const lat = record.lat;
    const lon = record.lon;
    const label = record.label;
    if (
      typeof lat !== "number" ||
      typeof lon !== "number" ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lon)
    ) {
      return null;
    }
    if (typeof label !== "string" || label.trim().length === 0) {
      return null;
    }
    return { lat, lon, label: label.trim() };
  } catch {
    return null;
  }
};

export const persistWeatherLocation = (location: WeatherLocation): void => {
  localStorage.setItem(WEATHER_LOCATION_KEY, JSON.stringify(location));
};

const isGeolocationPositionError = (error: unknown): error is GeolocationPositionError =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  typeof (error as GeolocationPositionError).code === "number";

export const formatGeolocationError = (error: unknown): string => {
  if (isGeolocationPositionError(error)) {
    switch (error.code) {
      case 1:
        return "Location permission denied";
      case 2:
        return "Location unavailable";
      case 3:
        return "Location request timed out";
      default:
        break;
    }
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "Could not get location";
};

export const readBrowserLocation = (): Promise<{ lat: number; lon: number }> =>
  new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation is not supported"));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
        });
      },
      (error) => {
        reject(error);
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  });
