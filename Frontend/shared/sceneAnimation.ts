export type SceneCameraMode = {
  active: boolean;
  collapsing: boolean;
  intro?: boolean;
};

export const SCENE_CAMERA_DISTANCE = {
  intro: 8.25,
  idle: 7.35,
  active: 6.05,
} as const;

export function getSceneCameraDistance({ active, collapsing, intro = false }: SceneCameraMode) {
  if (collapsing) return SCENE_CAMERA_DISTANCE.idle;
  if (intro) return SCENE_CAMERA_DISTANCE.intro;
  return active ? SCENE_CAMERA_DISTANCE.active : SCENE_CAMERA_DISTANCE.idle;
}
