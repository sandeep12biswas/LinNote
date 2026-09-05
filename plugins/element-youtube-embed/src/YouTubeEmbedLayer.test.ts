import { describe, expect, it } from "vitest";
import { extractYouTubeVideoId, nextZIndex } from "./YouTubeEmbedLayer";

describe("extractYouTubeVideoId", () => {
  it("extracts the id from a standard watch URL", () => {
    expect(extractYouTubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("extracts the id from a watch URL with trailing query params", () => {
    expect(extractYouTubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30s")).toBe("dQw4w9WgXcQ");
  });

  it("extracts the id from a youtu.be short link", () => {
    expect(extractYouTubeVideoId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("extracts the id from an embed URL", () => {
    expect(extractYouTubeVideoId("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("extracts the id from a youtube-nocookie embed URL", () => {
    expect(extractYouTubeVideoId("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("extracts the id from a Shorts link", () => {
    expect(extractYouTubeVideoId("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("returns null for a non-YouTube URL", () => {
    expect(extractYouTubeVideoId("https://example.com/watch?v=dQw4w9WgXcQ")).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(extractYouTubeVideoId("")).toBeNull();
  });
});

describe("nextZIndex", () => {
  it("returns 1 for an empty list", () => {
    expect(nextZIndex([])).toBe(1);
  });

  it("returns one past the highest existing zIndex", () => {
    expect(nextZIndex([{ zIndex: 2 }, { zIndex: 9 }, { zIndex: 4 }])).toBe(10);
  });
});
