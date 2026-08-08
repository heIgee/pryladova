import { describe, expect, it } from "vitest";
import { formatGeolocationError, readStoredWeatherLocation } from "./weather-location.js";

describe("formatGeolocationError", () => {
  it("maps geolocation error codes to stable messages", () => {
    expect(formatGeolocationError({ code: 1, message: "" })).toBe("Location permission denied");
    expect(formatGeolocationError({ code: 2, message: "" })).toBe("Location unavailable");
    expect(formatGeolocationError({ code: 3, message: "" })).toBe("Location request timed out");
  });

  it("passes through Error messages", () => {
    expect(formatGeolocationError(new Error("Geolocation is not supported"))).toBe(
      "Geolocation is not supported",
    );
  });

  it("falls back for unknown errors", () => {
    expect(formatGeolocationError(null)).toBe("Could not get location");
    expect(formatGeolocationError(new Error("   "))).toBe("Could not get location");
  });
});

describe("readStoredWeatherLocation", () => {
  it("returns null when storage is empty", () => {
    localStorage.removeItem("pryladova.weatherLocation");
    expect(readStoredWeatherLocation()).toBeNull();
  });

  it("parses stored location", () => {
    localStorage.setItem(
      "pryladova.weatherLocation",
      JSON.stringify({ lat: 50.45, lon: 30.52, label: "Kyiv, Ukraine" }),
    );
    expect(readStoredWeatherLocation()).toEqual({
      lat: 50.45,
      lon: 30.52,
      label: "Kyiv, Ukraine",
    });
  });
});
