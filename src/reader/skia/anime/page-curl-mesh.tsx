import {
  ImageShader,
  Picture,
  Rect,
  Shader,
  Skia,
  type SkImage,
  type SkPicture,
  type SkSurface,
  type Uniforms,
} from '@shopify/react-native-skia';
import { useEffect } from 'react';
import { useDerivedValue, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { runOnUI } from 'react-native-worklets';

import type { CompiledReaderPicture } from '../rendering/picture-compiler';

/**
 * Continuous page surface adapted from react-native-natural-page-turn.
 * The surface is one Skia rectangle backed by one texture. It deliberately
 * avoids drawing a Picture once per column: the curl profile is solved into
 * 65 points and the RuntimeEffect performs the interpolation per fragment.
 */
const PROFILE_POINTS = 65;
const PROFILE_SEGMENTS = PROFILE_POINTS - 1;
const PROFILE_RUNS = 4;
const QUADRATURE_OFFSET = 0.5 / Math.sqrt(3);
const CAMERA_DISTANCE = 4;
const MAX_PERSPECTIVE_SCALE = 1.34;

const PAGE_CURL_SHADER = Skia.RuntimeEffect.Make(`
uniform shader frontTexture;
uniform float2 pageSize;
uniform float4 geometry;
uniform float4 perspective;
uniform float4 profile[${PROFILE_POINTS}];
uniform float4 runs[${PROFILE_RUNS}];

float perspectiveScale(float depth) {
  return min(
    perspective.z,
    perspective.y / max(0.001, perspective.y - max(0.0, depth))
  );
}

float4 readProfile(int pointIndex) {
  ${profileSelector(0, PROFILE_POINTS)}
}

float4 sampleRun(float bookX, float4 run) {
  if (run.w < 0.5) {
    return float4(0.0, 1.0, -100000.0, -1.0);
  }
  int low = int(run.x);
  int high = int(run.y);
  float lowX = readProfile(low).x;
  float highX = readProfile(high).x;
  if (bookX < min(lowX, highX) || bookX > max(lowX, highX)) {
    return float4(0.0, 1.0, -100000.0, -1.0);
  }
  for (int step = 0; step < 7; step += 1) {
    if (high - low > 1) {
      int middle = (low + high) / 2;
      float middleX = readProfile(middle).x;
      bool lower = run.z > 0.0 ? middleX <= bookX : middleX >= bookX;
      if (lower) low = middle; else high = middle;
    }
  }
  float4 before = readProfile(low);
  float4 after = readProfile(high);
  float deltaX = after.x - before.x;
  if (abs(deltaX) < 0.000001) {
    return float4(0.0, 1.0, -100000.0, -1.0);
  }
  float screenProgress = clamp((bookX - before.x) / deltaX, 0.0, 1.0);
  float beforeScale = perspectiveScale(before.y);
  float afterScale = perspectiveScale(after.y);
  float denominator =
    (1.0 - screenProgress) * beforeScale + screenProgress * afterScale;
  float correctedProgress = denominator <= 0.000001
    ? screenProgress
    : screenProgress * afterScale / denominator;
  float material = (float(low) + correctedProgress) / ${PROFILE_SEGMENTS}.0;
  float depth = mix(before.y, after.y, correctedProgress);
  float normalZ = abs(mix(before.w, after.w, correctedProgress));
  bool screenFront = deltaX > 0.0;
  bool sourceFront = (screenFront ? 1.0 : -1.0) * perspective.w > 0.0;
  float shade = (1.0 - normalZ) * 0.16;
  return float4(material, 1.0 - min(0.2, shade), depth, sourceFront ? 1.0 : -1.0);
}

half4 main(float2 position) {
  float bookX = (position.x - geometry.x) / geometry.y;
  float4 visible = float4(0.0, 1.0, -100000.0, -1.0);
  float4 candidate;
  ${Array.from({ length: PROFILE_RUNS }, (_, index) => `candidate = sampleRun(bookX, runs[${index}]);
  if (candidate.z > visible.z) visible = candidate;`).join('\n  ')}
  if (visible.z < -99999.0 || visible.w < 0.0) return half4(0.0);
  float sourceY = 0.5 + (position.y / pageSize.y - 0.5) / perspectiveScale(visible.z);
  float2 source = float2(clamp(visible.x, 0.0, 1.0), clamp(sourceY, 0.0, 1.0));
  half4 paper = frontTexture.eval(source);
  return half4(paper.rgb * visible.y, paper.a);
}
`);

interface PageCurlMeshProps {
  readonly picture: CompiledReaderPicture;
  readonly width: number;
  readonly height: number;
  readonly direction: 1 | -1;
  readonly progress: SharedValue<number>;
  readonly grabX: number;
  readonly grabY: number;
  readonly gestureMode?: 'full' | 'weak';
  readonly pressedEdgeX?: number;
  readonly heldRollTilt?: number;
}

function capturePictureTexture(
  texture: SharedValue<SkImage | null>,
  backingSurface: SharedValue<SkSurface | null>,
  picture: SkPicture,
  width: number,
  height: number,
): void {
  "worklet";
  const surface = Skia.Surface.MakeOffscreen(Math.max(1, Math.round(width)), Math.max(1, Math.round(height)));
  if (!surface) {
    texture.value = null;
    return;
  }
  const canvas = surface.getCanvas();
  canvas.clear(Skia.Color('transparent'));
  canvas.drawPicture(picture);
  surface.flush();
  texture.value = surface.makeImageSnapshot();
  // Android snapshots may remain GPU-backed by this Surface. Keep it alive
  // until the texture is released instead of disposing it immediately.
  backingSurface.value = surface;
}

function disposePictureTexture(
  texture: SharedValue<SkImage | null>,
  backingSurface: SharedValue<SkSurface | null>,
): void {
  "worklet";
  texture.value?.dispose();
  texture.value = null;
  backingSurface.value?.dispose();
  backingSurface.value = null;
}

export function PageCurlMesh(props: PageCurlMeshProps) {
  const { picture, width, height } = props;
  const image = useSharedValue<SkImage | null>(null);
  const backingSurface = useSharedValue<SkSurface | null>(null);

  // SkPicture and SkImage are native host objects. Keep the rasterisation on
  // the UI runtime, as the reference implementation does, instead of sending
  // the image through React state on the JS runtime.
  useEffect(() => {
    runOnUI(capturePictureTexture)(image, backingSurface, picture.picture, width, height);
    return () => runOnUI(disposePictureTexture)(image, backingSurface);
  }, [backingSurface, height, image, picture, width]);

  const uniforms = useSharedValue<Uniforms>(
    createCurlUniforms(0, props.direction, props.grabX, props.grabY, width, height, props.gestureMode, props.pressedEdgeX, props.heldRollTilt),
  );
  useDerivedValue(() => {
    const next = createCurlUniforms(
      props.progress.value,
      props.direction,
      props.grabX,
      props.grabY,
      width,
      height,
      props.gestureMode,
      props.pressedEdgeX,
      props.heldRollTilt,
    );
    // Replace the uniform object instead of passing an anonymous callback to
    // SharedValue.modify. The latter is treated as a Remote Function by some
    // Android Worklets builds when it is created inside useDerivedValue.
    uniforms.value = next;
  }, [height, props.direction, props.grabX, props.grabY, props.gestureMode, props.heldRollTilt, props.pressedEdgeX, props.progress, uniforms, width]);

  if (!PAGE_CURL_SHADER) {
    return <Picture picture={picture.picture} />;
  }

  return (
    <Rect x={0} y={0} width={width} height={height}>
      <Shader source={PAGE_CURL_SHADER} uniforms={uniforms}>
        <ImageShader
          fit="fill"
          image={image}
          height={1}
          sampling={{ B: 0, C: 0.5 }}
          tx="clamp"
          ty="clamp"
          width={1}
          x={0}
          y={0}
        />
      </Shader>
    </Rect>
  );
}

function profileSelector(start: number, end: number): string {
  if (end - start === 1) return `return profile[${start}];`;
  const middle = Math.floor((start + end) * 0.5);
  return `if (pointIndex < ${middle}) { ${profileSelector(start, middle)} } else { ${profileSelector(middle, end)} }`;
}

function createCurlUniforms(
  progress: number,
  direction: 1 | -1,
  grabX: number,
  grabY: number,
  width: number,
  height: number,
  gestureMode?: 'full' | 'weak',
  pressedEdgeX = 1,
  heldRollTilt = 0,
): Uniforms {
  "worklet";
  const minPressedEdgeX = 0.14;
  const turn = Math.min(1, Math.max(0, progress));
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const spineX = direction > 0 ? 0 : safeWidth;
  const startMaterial = Math.min(1, Math.max(0, Math.abs(grabX - spineX) / safeWidth));
  const pressedPose = gestureMode !== undefined && turn < 0.16 && pressedEdgeX < 0.999;
  const gripScale = gestureMode === 'weak' ? 0.25 : 1;
  const pressedAmplitude = 2.1266855842119465 * gripScale * Math.sqrt(
    Math.min(1, Math.max(0, (1 - pressedEdgeX) / (1 - minPressedEdgeX))),
  );
  const rootAmplitude = pressedPose
    ? pressedAmplitude
    : Math.PI * (0.62 + 0.26 * startMaterial);
  const swing = Math.min(1, Math.max(0, (Math.PI - rootAmplitude) / Math.PI));
  const landingStart = swing / Math.max(1e-4, swing + 1);
  const landing = !pressedPose && turn > landingStart;
  const landedLength = landing
    ? Math.min(1, Math.max(0, (turn - landingStart) / Math.max(1e-4, 1 - landingStart)))
    : 0;
  const retained = landing ? (1 - landedLength) ** (1 + 7 / 14) : 1;
  const amplitude = landing
    ? rootAmplitude * retained
    : rootAmplitude * Math.min(1, Math.max(0, turn / Math.max(1e-4, landingStart)));
  const rotation = pressedPose
    ? heldRollTilt
    : landing
    ? Math.PI - amplitude
    : (Math.PI - rootAmplitude) * Math.min(1, Math.max(0, turn / Math.max(1e-4, landingStart)));
  const uniformity = 1 - retained ** 3;
  const cornerTilt = (grabY / safeHeight - 0.5) * 0.62 * turn * (1 - turn);
  // RuntimeEffect uniforms are flattened by Skia's uniform processor. Use
  // ordinary number arrays here; Float32Array is treated as a single vector
  // by the Android animated-prop bridge and arrives as only four values.
  const profile = new Array<number>(PROFILE_POINTS * 4).fill(0);
  let x = 0;
  let z = 0;
  profile[0] = 0;
  profile[1] = 0;
  for (let segment = 0; segment < PROFILE_SEGMENTS; segment += 1) {
    const material = (segment + 0.5) / PROFILE_SEGMENTS;
    const first = material - QUADRATURE_OFFSET / PROFILE_SEGMENTS;
    const second = material + QUADRATURE_OFFSET / PROFILE_SEGMENTS;
    const firstClamped = Math.min(1, Math.max(0, first));
    const secondClamped = Math.min(1, Math.max(0, second));
    const firstAirborne = Math.max(1e-4, 1 - landedLength);
    const firstMaterial = landedLength > 0 && firstClamped <= landedLength
      ? 0
      : (firstClamped - landedLength) / firstAirborne;
    const secondMaterial = landedLength > 0 && secondClamped <= landedLength
      ? 0
      : (secondClamped - landedLength) / firstAirborne;
    const firstPinned = Math.cos(Math.PI * Math.min(1, Math.max(0, firstMaterial)));
    const secondPinned = Math.cos(Math.PI * Math.min(1, Math.max(0, secondMaterial)));
    const firstUniform = 1 - 2 * Math.min(1, Math.max(0, firstMaterial));
    const secondUniform = 1 - 2 * Math.min(1, Math.max(0, secondMaterial));
    const firstCurl = firstPinned + uniformity * (firstUniform - firstPinned);
    const secondCurl = secondPinned + uniformity * (secondUniform - secondPinned);
    const firstAngle = (landedLength > 0 && firstClamped <= landedLength ? Math.PI : rotation + amplitude * firstCurl) + cornerTilt;
    const secondAngle = (landedLength > 0 && secondClamped <= landedLength ? Math.PI : rotation + amplitude * secondCurl) + cornerTilt;
    x += (Math.cos(firstAngle) + Math.cos(secondAngle)) * 0.5 / PROFILE_SEGMENTS;
    z += (Math.sin(firstAngle) + Math.sin(secondAngle)) * 0.5 / PROFILE_SEGMENTS;
    const offset = (segment + 1) * 4;
    profile[offset] = x;
    profile[offset + 1] = z;
  }
  for (let index = 0; index < PROFILE_POINTS; index += 1) {
    const before = Math.max(0, index - 1) * 4;
    const after = Math.min(PROFILE_POINTS - 1, index + 1) * 4;
    const offset = index * 4;
    const tangentX = profile[after]! - profile[before]!;
    const tangentZ = profile[after + 1]! - profile[before + 1]!;
    const length = Math.max(1e-7, Math.hypot(tangentX, tangentZ));
    profile[offset + 2] = -tangentZ / length;
    profile[offset + 3] = tangentX / length;
  }

  const projected = new Array<number>(PROFILE_POINTS * 4).fill(0);
  for (let index = 0; index < PROFILE_POINTS; index += 1) {
    const offset = index * 4;
    const physicalX = profile[offset]! * direction;
    const depth = Math.max(0, profile[offset + 1]!);
    const scale = Math.min(MAX_PERSPECTIVE_SCALE, CAMERA_DISTANCE / Math.max(0.001, CAMERA_DISTANCE - depth));
    projected[offset] = 0.5 + (physicalX - 0.5) * scale;
    projected[offset + 1] = depth;
    projected[offset + 2] = profile[offset + 2]! * direction;
    projected[offset + 3] = profile[offset + 3]!;
  }

  const runs = new Array<number>(PROFILE_RUNS * 4).fill(0);
  let runCount = 0;
  let runStart = 0;
  let runDirection = 0;
  for (let segment = 0; segment < PROFILE_SEGMENTS; segment += 1) {
    const delta = projected[(segment + 1) * 4]! - projected[segment * 4]!;
    if (Math.abs(delta) < 1e-6) continue;
    const nextDirection = delta > 0 ? 1 : -1;
    if (runDirection === 0) {
      runDirection = nextDirection;
    } else if (nextDirection !== runDirection && runCount < PROFILE_RUNS - 1) {
      const offset = runCount * 4;
      runs[offset] = runStart;
      runs[offset + 1] = segment;
      runs[offset + 2] = runDirection;
      runs[offset + 3] = 1;
      runCount += 1;
      runStart = segment;
      runDirection = nextDirection;
    }
  }
  const finalOffset = runCount * 4;
  runs[finalOffset] = runStart;
  runs[finalOffset + 1] = PROFILE_POINTS - 1;
  runs[finalOffset + 2] = runDirection || direction;
  runs[finalOffset + 3] = 1;

  return {
    pageSize: [safeWidth, safeHeight],
    geometry: [spineX, safeWidth, PROFILE_POINTS - 1, PROFILE_RUNS],
    perspective: [0.5, CAMERA_DISTANCE, MAX_PERSPECTIVE_SCALE, direction],
    profile: projected,
    runs,
  };
}
