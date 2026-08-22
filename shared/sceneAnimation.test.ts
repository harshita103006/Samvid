import { describe, expect, it } from "vitest";
import { getSceneCameraDistance } from "./sceneAnimation";

describe("scene camera animation", () => {
  it("uses the closer target only while the field is active", () => {
    expect(getSceneCameraDistance({ active: false, collapsing: false })).toBe(7.35);
    expect(getSceneCameraDistance({ active: true, collapsing: false })).toBe(6.05);
  });

  it("starts the cinematic intro farther away before settling", () => {
    expect(getSceneCameraDistance({ active: false, collapsing: false, intro: true })).toBe(8.25);
  });

  it("prioritizes the idle distance during reverse collapse", () => {
    expect(getSceneCameraDistance({ active: true, collapsing: true })).toBe(7.35);
  });
});
