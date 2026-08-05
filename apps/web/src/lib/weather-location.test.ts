import { describe, expect, it } from "vitest";
import { readStoredWeatherLocation } from "./weather-location.js";

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
