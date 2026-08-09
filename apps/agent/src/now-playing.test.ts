import { describe, expect, it } from "vitest";
import {
  mapMediaSession,
  pickCurrentSession,
  resolveHostMediaThumbnail,
  trackMediaKey,
} from "./now-playing-core.js";

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

describe("resolveHostMediaThumbnail", () => {
  const media = {
    title: "Anubis",
    artist: "Septicflesh",
    albumTitle: "Codex Omega",
    appName: "Player.exe",
    playbackStatus: "paused" as const,
    thumbnailDataUrl: "data:image/jpeg;base64,abc",
  };

  it("sends thumbnail on first track observation", () => {
    expect(resolveHostMediaThumbnail(media, { lastTrackKey: "", cachedThumbnail: null })).toEqual({
      lastTrackKey: "anubis|septicflesh|codex omega|player.exe",
      cachedThumbnail: "data:image/jpeg;base64,abc",
      thumbnailDataUrl: "data:image/jpeg;base64,abc",
    });
  });

  it("omits thumbnail on routine host ticks for the same track", () => {
    const state = {
      lastTrackKey: "anubis|septicflesh|codex omega|player.exe",
      cachedThumbnail: "data:image/jpeg;base64,abc",
    };

    expect(resolveHostMediaThumbnail(media, state)).toEqual({
      ...state,
      thumbnailDataUrl: null,
    });
  });

  it("sends thumbnail when SMTC provides it after an earlier null read", () => {
    const state = {
      lastTrackKey: "anubis|septicflesh|codex omega|player.exe",
      cachedThumbnail: null,
    };

    expect(resolveHostMediaThumbnail(media, state)).toEqual({
      lastTrackKey: state.lastTrackKey,
      cachedThumbnail: "data:image/jpeg;base64,abc",
      thumbnailDataUrl: "data:image/jpeg;base64,abc",
    });
  });
});

describe("trackMediaKey", () => {
  it("uses title, artist, album, and app name", () => {
    expect(
      trackMediaKey({
        title: " Song ",
        artist: " Artist ",
        albumTitle: " Album ",
        appName: "Spotify.exe",
        playbackStatus: "playing",
        thumbnailDataUrl: null,
      }),
    ).toBe("song|artist|album|spotify.exe");
  });

  it("differentiates tracks with the same title and artist", () => {
    const base = {
      title: "Song",
      artist: "Artist",
      playbackStatus: "playing" as const,
      thumbnailDataUrl: null,
    };

    expect(
      trackMediaKey({
        ...base,
        albumTitle: "Album A",
        appName: "App A",
      }),
    ).not.toBe(
      trackMediaKey({
        ...base,
        albumTitle: "Album B",
        appName: "App B",
      }),
    );
  });
});
