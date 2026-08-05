import { describe, expect, it } from "vitest";
import { mapMediaSession, pickCurrentSession, trackMediaKey } from "./now-playing-core.js";

describe("mapMediaSession", () => {
  it("maps full payload including thumbnail", () => {
    const media = mapMediaSession({
      id: "spotify",
      sourceAppUserModelId: "Spotify.exe",
      title: "Song",
      artist: "Artist",
      albumTitle: "Album",
      playbackStatus: "playing",
      thumbnail: "data:image/jpeg;base64,abc123",
    });

    expect(media).toEqual({
      title: "Song",
      artist: "Artist",
      albumTitle: "Album",
      appName: "Spotify.exe",
      playbackStatus: "playing",
      thumbnailDataUrl: "data:image/jpeg;base64,abc123",
    });
  });

  it("returns null thumbnail when field missing or invalid", () => {
    const media = mapMediaSession({
      id: "spotify",
      sourceAppUserModelId: "Spotify.exe",
      title: "Song",
      playbackStatus: "paused",
    });

    expect(media?.thumbnailDataUrl).toBeNull();
    expect(
      mapMediaSession({ id: "x", sourceAppUserModelId: "x", title: "", playbackStatus: "playing" }),
    ).toBeNull();
    expect(
      mapMediaSession({
        id: "x",
        sourceAppUserModelId: "x",
        title: "Song",
        playbackStatus: "playing",
        thumbnail: "https://example.com/x.jpg",
      })?.thumbnailDataUrl,
    ).toBeNull();
  });
});

describe("pickCurrentSession", () => {
  it("prefers playing over paused and ignores sessions without title", () => {
    const picked = pickCurrentSession([
      { id: "a", sourceAppUserModelId: "a", title: "Paused song", playbackStatus: "paused" },
      { id: "b", sourceAppUserModelId: "b", playbackStatus: "playing" },
      { id: "c", sourceAppUserModelId: "c", title: "Playing song", playbackStatus: "playing" },
    ]);

    expect(picked?.id).toBe("c");
  });
});

describe("trackMediaKey", () => {
  it("uses title and artist only", () => {
    expect(
      trackMediaKey({
        title: " Song ",
        artist: " Artist ",
        albumTitle: "Different Album",
        appName: null,
        playbackStatus: "playing",
        thumbnailDataUrl: null,
      }),
    ).toBe("song|artist");
  });
});
