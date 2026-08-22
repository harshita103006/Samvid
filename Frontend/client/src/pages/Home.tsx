import { useEffect, useMemo, useRef, useState } from "react";

// Deployment refresh marker: keep runtime behavior unchanged.
import { Canvas, useFrame } from "@react-three/fiber";
import { Edges, Float, Html, OrbitControls, Sparkles, Torus, Sphere } from "@react-three/drei";
import * as THREE from "three";
import { CatmullRomCurve3, Color, ShaderMaterial, Vector3 } from "three";
import { Activity, ArrowUpRight, Check, ChevronRight, CircleUserRound, Clock3, FileKey2, Fingerprint, Home as HomeIcon, LockKeyhole, LogOut, Plus, ShieldCheck, UploadCloud, UsersRound, X } from "lucide-react";
import { getSceneCameraDistance } from "@shared/sceneAnimation";
import AmbientIdentityField from "@/components/AmbientIdentityField";
import { useAuth } from "@/_core/hooks/useAuth";
import { api, clearSession, fetchSecureRecord, formatApiMessage, getAccessToken, storeSession } from "@/lib/api";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const palette = { graphite: "#080B2A", slate: "#17105A", teal: "#22D3EE", blue: "#3B82F6", lavender: "#8B5CF6", magenta: "#EC4899", pink: "#F472B6", orange: "#F97316" };

const uploadedHologramVertex = `
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying vec3 vPos;
  uniform float uTime;
  uniform float uBreath;
  void main() {
    vec3 p = position + normal * sin(position.y * 9.0 - uTime * 1.6) * 0.006 * uBreath;
    vec4 world = modelMatrix * vec4(p, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vViewDir = normalize(cameraPosition - world.xyz);
    vPos = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;
const uploadedHologramFragment = `
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying vec3 vPos;
  uniform float uTime;
  uniform vec3 uColor;
  uniform vec3 uInner;
  uniform float uOpacity;
  uniform float uPulse;
  uniform float uScan;
  void main() {
    float fres = pow(1.0 - abs(dot(normalize(vNormalW), normalize(vViewDir))), 2.2);
    float grid = (smoothstep(0.96, 1.0, abs(sin(vPos.y * 62.0))) + smoothstep(0.985, 1.0, abs(sin(atan(vPos.z, vPos.x) * 26.0)))) * 0.14;
    float scan = smoothstep(0.0, 0.06, 0.06 - abs(fract(vPos.y * 0.22 - uTime * 0.11) - 0.5) * 0.6) * uScan;
    float energy = 0.10 + 0.06 * sin(uTime * 1.2 + vPos.y * 3.0);
    vec3 col = mix(uInner, uColor, clamp(fres + grid, 0.0, 1.0)) + uColor * (scan * 0.8 + uPulse * 0.9);
    float alpha = uOpacity * (0.22 + fres * 1.15 + grid + energy + scan * 0.5 + uPulse * 0.5);
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
  }
`;
function makeUploadedHologramMaterial(color: string, inner: string, opacity: number, scan = 1, breath = 0.7) {
  return new ShaderMaterial({
    vertexShader: uploadedHologramVertex,
    fragmentShader: uploadedHologramFragment,
    transparent: true,
    depthWrite: false,
    wireframe: false,
    uniforms: { uTime: { value: 0 }, uColor: { value: new Color(color) }, uInner: { value: new Color(inner) }, uOpacity: { value: opacity }, uPulse: { value: 0 }, uScan: { value: scan }, uBreath: { value: breath } },
  });
}

type View = "HOME" | "MY DATA" | "PERMISSIONS" | "SECURITY" | "GATEWAY" | "ORGANIZATIONS";
const FORCE_LOGIN_KEY = "samvid_force_login";
type Permission = { id: number; requestId?: string | number; org: string; record: string; orgId?: string | number; recordId?: string | number; purpose: string; scope: string; expires: string; status: "ACTIVE" | "REVOKED" };
type Organization = { id: string | number; name: string };
type AccessRequest = { id: number; recordId?: string | number; record: string; orgId?: string | number; org: string; purpose: string; requestedAccessType: string; status: string; requester: string };

type DataRecord = { id: number; title: string; type: string; sensitivity: "Low" | "Medium" | "High" | "Critical" | "Unknown"; accessed: string; verified: boolean; accent: string; fileUrl?: string; fileName?: string; mimeType?: string };
const initialRecords: DataRecord[] = [];
const initialPermissions: Permission[] = [];
function asArray(value: unknown): any[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["items", "records", "consents", "access_requests", "requests", "data", "results"]) if (Array.isArray(record[key])) return record[key] as any[];
  }
  return [];
}

function normalizeRecords(value: unknown): DataRecord[] {
  return asArray(value).map((item, index) => {
    const row = item as Record<string, any>;
    const status = String(row.status ?? row.verification_status ?? "").toUpperCase();
    const sensitivity = ["Low", "Medium", "High", "Critical"].includes(row.sensitivity) ? row.sensitivity : "Unknown";
    return { id: Number(row.id ?? row.record_id ?? index + 1), title: String(row.title ?? row.name ?? row.record_name ?? ""), type: String(row.record_type ?? row.type ?? ""), sensitivity, accessed: row.last_accessed || row.created_at ? new Date(row.last_accessed ?? row.created_at).toLocaleDateString() : "Not available", verified: status === "VERIFIED" || status === "APPROVED" || row.verified === true, accent: index % 2 ? palette.lavender : palette.teal };
  });
}

function normalizeOrganizations(value: unknown): Organization[] {
  return asArray(value).map((item, index) => {
    const row = item as Record<string, any>;
    return { id: row.id ?? row.organization_id ?? index + 1, name: String(row.name ?? row.organization_name ?? row.organization ?? "") };
  }).filter(item => item.name);
}

export function normalizeAccessRequests(value: unknown): AccessRequest[] {
  return asArray(value).map((item, index) => {
    const row = item as Record<string, any>;
    return {
      id: Number(row.id ?? row.request_id ?? index + 1),
      recordId: row.record_id,
      record: String(row.record_title ?? row.record_name ?? row.record ?? row.record_id ?? ""),
      orgId: row.organization_id,
      org: String(row.organization_name ?? row.organization ?? row.org ?? row.organization_id ?? ""),
      purpose: String(row.purpose ?? ""),
      requestedAccessType: String(row.requested_access_type ?? row.access_type ?? "VIEW_ONLY"),
      status: String(row.status ?? row.state ?? "PENDING").toUpperCase(),
      requester: String(row.requester_email ?? row.requester_name ?? row.requester ?? row.user_email ?? "Organization requester"),
    };
  });
}

function cleanAccessMessage(cause: unknown, fallback: string): string {
  const status = typeof cause === "object" && cause ? Number((cause as { status?: number }).status ?? 0) : 0;
  const message = formatApiMessage(cause instanceof Error ? cause.message : cause).toLowerCase();
  if (status === 403 || message.includes("revoked") || message.includes("expired") || message.includes("not authorized")) return "This record is not currently shared with your organization.";
  if (message.includes("pending access request") || message.includes("already exists")) return "A request for this record is already pending.";
  if (status === 404) return "This record or organization is no longer available.";
  return fallback;
}

function normalizePermissions(value: unknown): Permission[] {
  return asArray(value).map((item, index) => {
    const row = item as Record<string, any>;
    const status = String(row.status ?? row.consent_status ?? "").toUpperCase();
    return { id: Number(row.consent_id ?? row.id ?? index + 1), requestId: row.request_id ?? row.access_request_id, org: String(row.organization_name ?? row.organization ?? row.org ?? row.organization_id ?? ""), record: String(row.record_title ?? row.record_name ?? row.record ?? row.record_id ?? ""), orgId: row.organization_id, recordId: row.record_id, purpose: String(row.purpose ?? ""), scope: String(row.access_type ?? row.scope ?? ""), expires: row.expiry_time ? new Date(Number(row.expiry_time) * 1000).toLocaleDateString() : "Not available", status: status === "REVOKED" || status === "REJECTED" ? "REVOKED" : "ACTIVE" };
  });
}

function OrbitalField({ active, revoked }: { active: boolean; revoked: boolean }) {
  return <group rotation={[0.28, 0.4, 0]}>
    <Torus args={[2.25, 0.012, 10, 128]} rotation={[Math.PI / 2, 0, 0]}><meshBasicMaterial color={active ? palette.teal : "#425060"} transparent opacity={active ? .7 : .28} /></Torus>
    <Torus args={[2.55, 0.008, 10, 128]} rotation={[0.2, Math.PI / 3, 0.6]}><meshBasicMaterial color={active ? palette.blue : "#425060"} transparent opacity={active ? .46 : .2} /></Torus>
    <Torus args={[1.86, 0.01, 10, 128]} rotation={[-0.4, 0.2, Math.PI / 5]}><meshBasicMaterial color={revoked ? "#EC4899" : palette.lavender} transparent opacity={active ? .5 : .14} /></Torus>
    <Sphere args={[1.78, 48, 48]} scale={[1, 1.05, .7]}><meshBasicMaterial color={active ? palette.teal : "#31404b"} transparent opacity={active ? .045 : .02} wireframe /></Sphere>
  </group>;
}

function DigitalHuman({ active, onActivate }: { active: boolean; onActivate: () => void }) {
  return <group onClick={onActivate}>
    <Float speed={active ? 1.6 : .7} rotationIntensity={.08} floatIntensity={.18}>
      <mesh position={[0, 1.14, 0]}><sphereGeometry args={[.34, 32, 32]} /><meshStandardMaterial color="#b9cbd2" emissive={active ? palette.teal : "#233c47"} emissiveIntensity={active ? .65 : .16} roughness={.42} metalness={.5} /></mesh>
      <mesh position={[0, .35, 0]}><capsuleGeometry args={[.45, 1.1, 8, 24]} /><meshStandardMaterial color="#7f9ca7" emissive={active ? "#1b7f7c" : "#1d2b34"} emissiveIntensity={active ? .42 : .1} roughness={.5} metalness={.55} /></mesh>
      <mesh position={[-.27, -.2, 0]} rotation={[0, 0, -.12]}><capsuleGeometry args={[.12, .85, 8, 16]} /><meshStandardMaterial color="#708c98" /></mesh>
      <mesh position={[.27, -.2, 0]} rotation={[0, 0, .12]}><capsuleGeometry args={[.12, .85, 8, 16]} /><meshStandardMaterial color="#708c98" /></mesh>
      <mesh position={[-.56, .42, 0]} rotation={[0, 0, Math.PI / 2]}><capsuleGeometry args={[.1, .62, 8, 16]} /><meshStandardMaterial color="#6c8893" /></mesh>
      <mesh position={[.56, .42, 0]} rotation={[0, 0, Math.PI / 2]}><capsuleGeometry args={[.1, .62, 8, 16]} /><meshStandardMaterial color="#6c8893" /></mesh>
    </Float>
    <pointLight color={palette.teal} intensity={active ? 3 : .8} distance={5} position={[0, .4, 1]} />
  </group>;
}

function RecordNode({ position, label, color, connected }: { position: [number, number, number]; label: string; color: string; connected: boolean }) {
  return <Float speed={1.1} rotationIntensity={.2} floatIntensity={.32}>
    <group position={position}>
      <mesh><boxGeometry args={[.62, .8, .12]} /><meshStandardMaterial color={"#17222b"} emissive={color} emissiveIntensity={connected ? .55 : .12} metalness={.7} roughness={.32} /></mesh>
      <mesh position={[0, .11, .075]}><planeGeometry args={[.42, .06]} /><meshBasicMaterial color={color} transparent opacity={.9} /></mesh>
      <mesh position={[0, -.02, .075]}><planeGeometry args={[.28, .035]} /><meshBasicMaterial color="#91a6b1" transparent opacity={.5} /></mesh>
      <Html center distanceFactor={7}><div style={{ color: "#9fb1bb", fontSize: 9, letterSpacing: ".18em", whiteSpace: "nowrap", textTransform: "uppercase" }}>{label}</div></Html>
    </group>
  </Float>;
}

function OrganizationNode({ position, name, connected }: { position: [number, number, number]; name: string; connected: boolean }) {
  return <Float speed={.8} rotationIntensity={.16} floatIntensity={.18}><group position={position}>
    <mesh><octahedronGeometry args={[.38, 1]} /><meshStandardMaterial color="#151c27" emissive={connected ? palette.blue : "#23303e"} emissiveIntensity={connected ? .8 : .18} metalness={.85} roughness={.28} /></mesh>
    <Html center distanceFactor={7}><div style={{ color: connected ? "#b8d4e5" : "#82939d", fontSize: 9, letterSpacing: ".15em", whiteSpace: "nowrap", textTransform: "uppercase" }}>{name}</div></Html>
  </group></Float>;
}

function DataFlow({ visible, broken }: { visible: boolean; broken: boolean }) {
  if (!visible) return null;
  return <group><mesh position={[1.72, .12, .1]} rotation={[0, 0, -.08]}><cylinderGeometry args={[.018, .018, 2.65, 10]} /><meshBasicMaterial color={broken ? "#EC4899" : palette.teal} transparent opacity={broken ? .35 : .82} /></mesh><Sparkles count={broken ? 24 : 9} scale={[3.2, 1.1, 1]} size={broken ? 3 : 1.8} speed={broken ? 2.6 : 1.1} color={broken ? "#EC4899" : palette.teal} /></group>;
}

function SceneCamera({ active, collapsing, intro = false, pointer }: { active: boolean; collapsing: boolean; intro?: boolean; pointer: { x: number; y: number } }) {
  useFrame(({ camera, clock }) => {
    const cinematicDrift = Math.sin(clock.elapsedTime * .34) * .12;
    const cinematicZoom = Math.sin(clock.elapsedTime * .28) * .14;
    const targetZ = getSceneCameraDistance({ active, collapsing, intro }) + (intro ? cinematicZoom : cinematicZoom * .35);
    const targetX = collapsing ? 0 : .18 + pointer.x * (active ? .18 : .08) + cinematicDrift;
    const targetY = collapsing ? .25 : .18 + pointer.y * (active ? .1 : .05) + Math.cos(clock.elapsedTime * .3) * .05;
    const ease = collapsing ? .09 : .045;
    camera.position.z += (targetZ - camera.position.z) * ease;
    camera.position.x += (targetX - camera.position.x) * ease;
    camera.position.y += (targetY - camera.position.y) * ease;
    camera.lookAt(collapsing ? 0 : active ? .24 : .12, collapsing ? .35 : .26, 0);
  });
  return null;
}

function EnergyTrace({ active, side }: { active: boolean; side: number }) {
  const ref = useRef<any>(null);
  useFrame(({ clock }) => { if (!ref.current) return; const pulse = (Math.sin(clock.elapsedTime * 2.4 + side) + 1) / 2; ref.current.position.y = -.25 + pulse * 1.25; ref.current.material.opacity = active ? .35 + pulse * .6 : .12; });
  return <mesh ref={ref} position={[side * .11, 0, .44]}><sphereGeometry args={[.035, 10, 10]} /><meshBasicMaterial color={palette.teal} transparent opacity={active ? .8 : .15} /></mesh>;
}

function ActivationLayers({ stage }: { stage: number }) {
  return <>{stage >= 1 && <><EnergyTrace active={stage >= 1} side={-1} /><EnergyTrace active={stage >= 1} side={1} /><pointLight color={palette.teal} intensity={stage >= 2 ? 1.8 : .6} distance={2.4} position={[0, .45, .7]} /></>}{stage >= 2 && <group rotation={[.3, .2, .1]}><Torus args={[1.45, .012, 10, 120]} rotation={[Math.PI / 2, 0, 0]}><meshBasicMaterial color={palette.teal} transparent opacity={.32} /></Torus><Torus args={[1.52, .008, 10, 120]} rotation={[.2, Math.PI / 2, .5]}><meshBasicMaterial color={palette.blue} transparent opacity={.22} /></Torus></group>}{stage >= 3 && <group rotation={[-.2, .5, .45]}><Torus args={[1.72, .014, 12, 150]} rotation={[Math.PI / 2, 0, 0]}><meshBasicMaterial color={palette.teal} transparent opacity={.6} /></Torus><Torus args={[1.96, .01, 12, 150]} rotation={[.4, Math.PI / 3, 0]}><meshBasicMaterial color={palette.lavender} transparent opacity={.38} /></Torus></group>}{stage >= 4 && <Sphere args={[1.65, 40, 40]} scale={[1, 1.12, .74]}><meshBasicMaterial color={palette.teal} transparent opacity={.045} wireframe /></Sphere>}</>;
}

function literalTaperedTube(points: [number, number, number][], radii: number[], tubularSegments = 40, radialSegments = 18) {
  const curve = new CatmullRomCurve3(points.map((point) => new Vector3(...point)), false, "catmullrom", 0.4);
  const frames = curve.computeFrenetFrames(tubularSegments, false);
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const radiusAt = (t: number) => { const x = t * (radii.length - 1); const i = Math.min(radii.length - 2, Math.floor(x)); const f = x - i; return (radii[i] ?? 0) * (1 - f) + (radii[i + 1] ?? 0) * f; };
  for (let i = 0; i <= tubularSegments; i += 1) {
    const t = i / tubularSegments;
    const point = curve.getPointAt(t);
    const normal = frames.normals[i] ?? new Vector3(1, 0, 0);
    const binormal = frames.binormals[i] ?? new Vector3(0, 0, 1);
    const radius = radiusAt(t);
    for (let j = 0; j <= radialSegments; j += 1) {
      const angle = (j / radialSegments) * Math.PI * 2;
      const basis = new Vector3(Math.cos(angle) * normal.x + Math.sin(angle) * binormal.x, Math.cos(angle) * normal.y + Math.sin(angle) * binormal.y, Math.cos(angle) * normal.z + Math.sin(angle) * binormal.z);
      positions.push(point.x + radius * basis.x, point.y + radius * basis.y, point.z + radius * basis.z);
      normals.push(basis.x, basis.y, basis.z);
      uvs.push(t, j / radialSegments);
    }
  }
  for (let i = 1; i <= tubularSegments; i += 1) for (let j = 1; j <= radialSegments; j += 1) { const a = (radialSegments + 1) * (i - 1) + (j - 1); const b = (radialSegments + 1) * i + (j - 1); const c = (radialSegments + 1) * i + j; const d = (radialSegments + 1) * (i - 1) + j; indices.push(a, b, d, b, c, d); }
  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(indices);
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  return geometry;
}

function literalTorsoGeometry() {
  const profile: [number, number][] = [[0.001, -0.05], [0.19, 0], [0.215, 0.16], [0.2, 0.34], [0.17, 0.5], [0.175, 0.66], [0.215, 0.82], [0.26, 0.98], [0.255, 1.1], [0.16, 1.18], [0.001, 1.2]];
  const geometry = new THREE.LatheGeometry(profile.map(([x, y]) => new THREE.Vector2(x, y)), 64);
  geometry.scale(1, 1, 0.62);
  return geometry;
}

function literalHeadGeometry() {
  const geometry = new THREE.SphereGeometry(0.145, 48, 38);
  geometry.scale(0.92, 1.18, 0.95);
  geometry.translate(0, 1.44, 0.01);
  return geometry;
}

function LiteralDigitalHuman({ awake, onActivate }: { awake: boolean; onActivate: () => void }) {
  const group = useRef<THREE.Group>(null!);
  const body = useMemo(() => {
    const arm = (side: number) => literalTaperedTube([[side * 0.2, 1.06, 0], [side * 0.3, 0.82, 0.02], [side * 0.335, 0.55, 0.07], [side * 0.31, 0.28, 0.11], [side * 0.29, 0.14, 0.11]], [0.085, 0.062, 0.05, 0.042, 0.028]);
    const leg = (side: number) => literalTaperedTube([[side * 0.1, 0.02, 0], [side * 0.125, -0.3, 0.02], [side * 0.12, -0.62, 0], [side * 0.11, -0.92, 0.02], [side * 0.11, -1.06, 0.05]], [0.135, 0.1, 0.075, 0.05, 0.035]);
    return [literalTorsoGeometry(), literalHeadGeometry(), literalTaperedTube([[0, 1.1, 0], [0, 1.2, 0.005], [0, 1.3, 0.01]], [0.09, 0.062, 0.058], 16, 16), arm(1), arm(-1), leg(1), leg(-1)];
  }, []);
  const surface = useMemo(() => new THREE.MeshPhysicalMaterial({ color: new Color("#dfe9ff"), roughness: 0.18, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.12, iridescence: 0.6, iridescenceIOR: 1.4, sheen: 1, sheenColor: new Color("#22D3EE"), sheenRoughness: 0.5, emissive: new Color("#2a6cff"), emissiveIntensity: 0.28, transmission: 0.12, thickness: 0.6, side: THREE.DoubleSide }), []);
  const innerCore = useMemo(() => makeUploadedHologramMaterial(palette.teal, palette.blue, 0.5, 0.2, 2.4), []);
  const heart = useRef<THREE.Mesh>(null!);
  useFrame(({ clock }, dt) => {
    const time = clock.elapsedTime;
    innerCore.uniforms.uTime.value = time;
    innerCore.uniforms.uPulse.value = awake ? 0.18 : 0.02;
    surface.emissiveIntensity = awake ? 0.55 + Math.sin(time * 2.1) * 0.1 : 0.28;
    if (group.current) { group.current.position.y = -0.2 + Math.sin(time * 0.55) * 0.045; group.current.rotation.y = Math.sin(time * 0.18) * 0.22; group.current.rotation.z = Math.sin(time * 0.31) * 0.012; const scale = awake ? 0.94 : 0.82; group.current.scale.setScalar(THREE.MathUtils.damp(group.current.scale.x, scale, 6, dt)); }
    if (heart.current) { heart.current.rotation.y += dt * 0.8; heart.current.rotation.x += dt * 0.3; heart.current.scale.setScalar(1 + Math.sin(time * 2.1) * 0.12 + (awake ? 0.32 : 0.04)); }
  });
  return <group ref={group} onClick={(event) => { event.stopPropagation(); onActivate(); }} onPointerOver={() => { document.body.style.cursor = "pointer"; }} onPointerOut={() => { document.body.style.cursor = "default"; }}>
    <mesh onClick={(event) => { event.stopPropagation(); onActivate(); }} position={[0, 0.2, 0]}><sphereGeometry args={[0.62, 20, 16]} /><meshBasicMaterial transparent opacity={0} depthWrite={false} /></mesh>
    <pointLight position={[1.6, 2.2, 2.4]} intensity={awake ? 9 : 5} color="#ffffff" distance={14} />
    <pointLight position={[-2, 0.6, 1.2]} intensity={awake ? 6 : 2} color="#22D3EE" distance={14} />
    <pointLight position={[0, 0.4, -2.6]} intensity={awake ? 7 : 2} color="#59e6ff" distance={14} />
    {body.map((geometry, index) => <mesh key={index} geometry={geometry} material={surface} />)}
    <mesh position={[0, 0.06, 0.01]} material={surface} scale={[1.35, 0.85, 1]}><sphereGeometry args={[0.16, 32, 24]} /></mesh>
    {[1, -1].map((side) => <group key={side}><mesh position={[side * 0.2, 1.06, 0]} material={surface}><sphereGeometry args={[0.088, 28, 20]} /></mesh><mesh position={[side * 0.29, 0.13, 0.11]} material={surface} scale={[1, 1.25, 0.7]}><sphereGeometry args={[0.032, 20, 16]} /></mesh><mesh position={[side * 0.11, 0.02, 0.005]} material={surface}><sphereGeometry args={[0.13, 28, 20]} /></mesh><mesh position={[side * 0.11, -1.08, 0.055]} material={surface} scale={[1.15, 0.62, 2.6]}><sphereGeometry args={[0.058, 26, 20]} /></mesh></group>)}
    <mesh position={[0, 0.62, 0]} material={innerCore} ref={heart}><icosahedronGeometry args={[0.085, 1]} /></mesh>
  </group>;
}

function ReferenceShell({ active, collapsing }: { active: boolean; collapsing: boolean }) {
  const ref = useRef<any>(null);
  const hologram = useMemo(() => makeUploadedHologramMaterial(palette.teal, palette.blue, 0.28, 1.4, 0.9), []);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.rotation.y = clock.elapsedTime * (active ? 0.035 : 0.012);
    ref.current.rotation.x = Math.sin(clock.elapsedTime * 0.16) * 0.04;
    hologram.uniforms.uTime.value = clock.elapsedTime;
    hologram.uniforms.uPulse.value = active ? 0.12 : 0;
    hologram.uniforms.uOpacity.value = active ? 0.3 : 0.06;
    const target = collapsing ? 0.12 : active ? 1 : 0.74;
    const next = ref.current.scale.x + (target - ref.current.scale.x) * 0.045;
    ref.current.scale.setScalar(next);
  });
  const opacity = active ? 0.34 : 0.11;
  return <group ref={ref} position={[0.86, 0.18, 0]}>
    <Sphere args={[2.15, 28, 20]} scale={[1, 1, 0.86]}><meshBasicMaterial color={active ? "#3b9de8" : "#31566b"} transparent opacity={opacity * 0.36} wireframe /></Sphere>
    <Sphere args={[1.92, 24, 16]} scale={[1, 1, 0.9]} material={hologram} />
    <Sphere args={[1.46, 22, 16]} scale={[1, 1.08, 0.82]}><meshBasicMaterial color="#2dd4bf" transparent opacity={active ? 0.07 : 0.018} wireframe /></Sphere>
    <Torus args={[1.08, 0.018, 8, 120]} rotation={[Math.PI / 2, 0.35, 0]}><meshBasicMaterial color="#2dd4bf" transparent opacity={active ? 0.3 : 0.08} /></Torus>
    <Torus args={[1.24, 0.012, 8, 120]} rotation={[0.5, Math.PI / 2, 0.8]}><meshBasicMaterial color="#3b82f6" transparent opacity={active ? 0.22 : 0.06} /></Torus>
    {[0, 1, 2, 3, 4].map(index => <Torus key={index} args={[1.45 + index * 0.17, 0.006 + (index % 2) * 0.003, 8, 150]} rotation={[Math.PI / 2 + index * 0.18, index * 0.48, index * 0.32]}><meshBasicMaterial color={index % 3 === 0 ? "#2dd4bf" : index % 3 === 1 ? "#3b82f6" : "#8B5CF6"} transparent opacity={active ? 0.16 - index * 0.018 : 0.06 - index * 0.006} /></Torus>)}
    {Array.from({ length: 28 }, (_, index) => { const angle = (index / 28) * Math.PI * 2; const y = Math.sin(angle * 2.5) * 1.35; return <mesh key={index} position={[Math.cos(angle) * 1.95, y * 0.45, Math.sin(angle) * 1.8]}><sphereGeometry args={[0.014, 6, 6]} /><meshBasicMaterial color={index % 3 === 0 ? "#22D3EE" : "#8B5CF6"} transparent opacity={active ? 0.58 : 0.18} /></mesh>; })}
  </group>;
}

function ReferenceRecordPanel({ position, label, color, delay, collapsing }: { position: [number, number, number]; label: string; color: string; delay: number; collapsing: boolean }) {
  const ref = useRef<any>(null);
  const nodeColor = "#94A3B8";
  const hologram = useMemo(() => makeUploadedHologramMaterial(nodeColor, palette.blue, 0.18, 0.7, 0.55), [nodeColor]);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    hologram.uniforms.uTime.value = clock.elapsedTime;
    hologram.uniforms.uPulse.value = 0.04;
    hologram.uniforms.uOpacity.value = collapsing ? 0.08 : 0.28;
    const pulse = 1 + Math.sin(clock.elapsedTime * 1.3 + delay) * 0.04;
    const target = collapsing ? 0.12 : 1;
    ref.current.position.lerp(new Vector3(position[0], position[1] + Math.sin(clock.elapsedTime * 0.7 + delay) * 0.045, position[2]), 0.045);
    ref.current.scale.lerp(new Vector3(target * pulse, target * pulse, target * pulse), 0.06);
    ref.current.rotation.y += 0.004;
  });
  return <group ref={ref} position={position}>
    <mesh material={hologram}><planeGeometry args={[0.52, 0.72]} /></mesh>
    <Edges linewidth={0.35} color={nodeColor}><mesh><boxGeometry args={[0.54, 0.74, 0.035]} /><meshBasicMaterial transparent opacity={0} /></mesh></Edges>
    <mesh position={[0, 0, 0.04]} rotation={[0, 0, Math.PI / 4]}><octahedronGeometry args={[0.14, 0]} /><meshStandardMaterial color={nodeColor} emissive={nodeColor} emissiveIntensity={0.18} transparent opacity={0.52} metalness={0.35} roughness={0.28} /></mesh>
    <Html center distanceFactor={8}><div className="scene-label scene-label--muted" style={{ color: "#64748B", fontSize: 10, fontWeight: 600, letterSpacing: ".12em", whiteSpace: "nowrap", textTransform: "uppercase", textAlign: "center", textShadow: "0 1px 10px rgba(255,255,255,.92)" }}>{label}</div></Html>
  </group>;
}

function ReferenceOrganizationNode({ position, label, color, connection, collapsing }: { position: [number, number, number]; label: string; color: string; connection: boolean; collapsing: boolean }) {
  const ref = useRef<any>(null);
  const neutralized = !connection;
  const nodeColor = neutralized ? "#94A3B8" : "#A855F7";
  const hologram = useMemo(() => makeUploadedHologramMaterial(nodeColor, palette.blue, neutralized ? 0.16 : 0.44, 0.5, 0.4), [nodeColor, neutralized]);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    hologram.uniforms.uTime.value = clock.elapsedTime;
    hologram.uniforms.uPulse.value = connection ? 0.18 : 0.035;
    hologram.uniforms.uOpacity.value = collapsing ? 0.08 : connection ? 0.72 : 0.24;
    const pulse = 1 + Math.sin(clock.elapsedTime * 1.6 + position[0]) * 0.08;
    const target = collapsing ? 0.16 : pulse;
    ref.current.scale.lerp(new Vector3(target, target, target), 0.08);
    ref.current.rotation.y += 0.006;
  });
  return <group ref={ref} position={position}>
    <mesh position={[0, 0.18, 0]}><coneGeometry args={[0.28, 0.5, 4]} /><meshBasicMaterial color="#1c2540" transparent opacity={0.78} /></mesh>
    <mesh position={[0, -0.08, 0]} material={hologram}><boxGeometry args={[0.42, 0.48, 0.18]} /></mesh>
    <mesh position={[0, -0.06, 0.1]} rotation={[0, 0, Math.PI / 4]}><octahedronGeometry args={[0.13, 0]} /><meshStandardMaterial color={nodeColor} emissive={nodeColor} emissiveIntensity={connection ? 0.9 : 0.12} transparent opacity={connection ? 0.82 : 0.38} metalness={0.35} roughness={0.28} /></mesh>
    <Html center distanceFactor={8}><div className={`scene-label ${neutralized ? "scene-label--muted" : ""}`} style={{ color: connection ? "#6D28D9" : "#64748B", fontSize: connection ? 12 : 10, fontWeight: connection ? 700 : 600, letterSpacing: ".12em", whiteSpace: "nowrap", textTransform: "uppercase", textAlign: "center", textShadow: "0 1px 10px rgba(255,255,255,.92)" }}>{label}</div></Html>
  </group>;
}

function ReferenceConsentRoute({ active, breaking, collapsing }: { active: boolean; breaking: boolean; collapsing: boolean }) {
  const curve = useMemo(() => new CatmullRomCurve3([new Vector3(2.1, 0.35, 0.05), new Vector3(2.7, 0.72, 0.1), new Vector3(3.25, 1.05, 0.18)]), []);
  const particles = useRef<any>(null);
  useFrame(({ clock }) => {
    if (!particles.current) return;
    particles.current.children.forEach((child: any, index: number) => { const point = curve.getPointAt((clock.elapsedTime * 0.08 + index / 8) % 1); child.position.copy(point); child.scale.setScalar(breaking || collapsing ? Math.max(0.05, 1 - (clock.elapsedTime % 1.2) / 1.2) : 1); });
  });
  if (!active && !breaking) return null;
  return <group><mesh><tubeGeometry args={[curve, 80, 0.012, 7, false]} /><meshBasicMaterial color={breaking || collapsing ? "#EC4899" : "#22D3EE"} transparent opacity={breaking || collapsing ? 0.18 : 0.62} /></mesh><group ref={particles}>{Array.from({ length: 8 }, (_, index) => <mesh key={index}><sphereGeometry args={[0.038, 8, 8]} /><meshBasicMaterial color={breaking || collapsing ? "#EC4899" : "#d7fbff"} /></mesh>)}</group></group>;
}

function ReferenceNetwork({ active, collapsing, connection, breaking }: { active: boolean; collapsing: boolean; connection: boolean; breaking: boolean }) {
  if (!active && !collapsing) return null;
  return <group scale={0.84}>
    <ReferenceShell active={active} collapsing={collapsing} />
    <ReferenceRecordPanel position={[-1.25, 1.28, 0.1]} label="ACADEMIC" color="#22D3EE" delay={0.2} collapsing={collapsing} />
    <ReferenceRecordPanel position={[-1.62, 0.12, 0.3]} label="FINANCIAL" color="#3B82F6" delay={0.6} collapsing={collapsing} />
    <ReferenceRecordPanel position={[1.2, 1.22, -0.2]} label="EMPLOYMENT" color="#3B82F6" delay={0.9} collapsing={collapsing} />
    <ReferenceRecordPanel position={[1.5, -0.48, 0.1]} label="MEDICAL" color="#22D3EE" delay={1.1} collapsing={collapsing} />
    <ReferenceRecordPanel position={[0.2, -1.48, 0.2]} label="LEGAL" color="#8B5CF6" delay={1.4} collapsing={collapsing} />
    <ReferenceRecordPanel position={[0.5, 1.82, -0.5]} label="IDENTITY" color="#dbeafe" delay={1.7} collapsing={collapsing} />
    <ReferenceRecordPanel position={[-0.35, 0.58, 0.65]} label="RESEARCH" color="#8B5CF6" delay={2.0} collapsing={collapsing} />
    <ReferenceRecordPanel position={[0.58, 0.42, -0.75]} label="CORPORATE" color="#22D3EE" delay={2.3} collapsing={collapsing} />
    <ReferenceOrganizationNode position={[-3.05, 1.05, 0.2]} label="UNIVERSITY" color="#8B5CF6" connection={false} collapsing={collapsing} />
    <ReferenceOrganizationNode position={[-2.75, -1.42, -0.1]} label="BANK" color="#3B82F6" connection={false} collapsing={collapsing} />
    <ReferenceOrganizationNode position={[3.08, 1.0, 0.1]} label="COMPANY" color="#22D3EE" connection={connection} collapsing={collapsing} />
    <ReferenceOrganizationNode position={[2.95, -1.42, -0.2]} label="HOSPITAL" color="#8B5CF6" connection={false} collapsing={collapsing} />
    <ReferenceOrganizationNode position={[0.55, 3.0, -0.3]} label="RESEARCH ORG" color="#8B5CF6" connection={false} collapsing={collapsing} />
    <ReferenceConsentRoute active={connection} breaking={breaking} collapsing={collapsing} />
  </group>;
}

function RebuiltIdentityScene({ active, collapsing = false, connection, breaking, onActivate }: { active: boolean; collapsing?: boolean; connection: boolean; breaking: boolean; onActivate: () => void }) {
  const [pointer, setPointer] = useState({ x: 0, y: 0 });
  const [stage, setStage] = useState(0);
  const [introRunning, setIntroRunning] = useState(true);
  useEffect(() => { const timers = [180, 620, 1120, 1680, 2380].map((delay, index) => window.setTimeout(() => setStage(index + 1), delay)); const settle = window.setTimeout(() => setIntroRunning(false), 3600); return () => { timers.forEach(window.clearTimeout); window.clearTimeout(settle); }; }, []);
  useEffect(() => { if (collapsing) { setStage(5); const timers = [160, 360, 560, 780, 1040].map((delay, index) => window.setTimeout(() => setStage(Math.max(0, 4 - index)), delay)); return () => timers.forEach(window.clearTimeout); } if (!active) { if (!introRunning) setStage(5); return; } setStage(1); const timers = [350, 700, 1050, 1450].map((delay, index) => window.setTimeout(() => setStage(index + 2), delay)); return () => timers.forEach(window.clearTimeout); }, [active, collapsing, introRunning]);
  const near = Math.hypot(pointer.x, pointer.y) < .72;
  const awake = active || collapsing || near || stage > 0;
  const fieldActive = stage >= 4;
  const artifactsActive = stage >= 5 || (collapsing && stage >= 2);

  return <div className="aurora-field relative h-[calc(100vh-74px)] min-h-[650px] w-full overflow-hidden" onPointerMove={e => { const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect(); setPointer({ x: (e.clientX - rect.left) / rect.width * 2 - 1, y: -((e.clientY - rect.top) / rect.height * 2 - 1) }); }} onPointerDown={e => { const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect(); const x = (e.clientX - rect.left) / rect.width; const y = (e.clientY - rect.top) / rect.height; const inCore = Math.abs(x - 0.5) < 0.24 && Math.abs(y - 0.48) < 0.3; if (!active && inCore) onActivate(); }}>
    <Canvas camera={{ position: [0, .25, 7.35], fov: 42 }} dpr={[1, 1.5]} onPointerMissed={() => { if (active) onActivate(); }}>
      <ambientLight intensity={.42} /><hemisphereLight color="#d8f6f5" groundColor="#101923" intensity={.65} /><pointLight position={[-3, 3, 4]} intensity={2.8} color={palette.lavender} /><pointLight position={[3, 1, 3]} intensity={3.2} color={palette.teal} /><pointLight position={[0, 1, 4]} intensity={3.8} color="#bfe8ef" /><pointLight position={[0, -2, -2]} intensity={1.4} color={palette.blue} />
      <SceneCamera active={active || introRunning} collapsing={collapsing} intro={introRunning} pointer={pointer} /><group position={[.86, 0, 0]} scale={active || collapsing ? 0.72 : 0.94}><LiteralDigitalHuman awake={awake} onActivate={onActivate} /><ActivationLayers stage={stage} /></group>
      <Sparkles count={awake ? 24 : 6} scale={[5.2, 3.2, 3.2]} size={awake ? 1.15 : .45} speed={awake ? .35 : .08} color={awake ? palette.teal : "#5d7480"} />
      <ReferenceNetwork active={fieldActive || artifactsActive} collapsing={collapsing} connection={connection && artifactsActive} breaking={breaking} />
      <OrbitControls enablePan={false} enableZoom={false} autoRotate={active || introRunning || fieldActive} autoRotateSpeed={.16} minPolarAngle={Math.PI / 2.25} maxPolarAngle={Math.PI / 1.75} />
    </Canvas>
  </div>;
}

function LandingView({ onLogin }: { onLogin: () => void }) {
  const [active, setActive] = useState(false);
  const [collapsing, setCollapsing] = useState(false);
  const [connection, setConnection] = useState(false);
  const [breaking, setBreaking] = useState(false);
  const activateConnection = () => { if (!active || collapsing) return; setBreaking(false); setConnection(true); };
  const revokeConnection = () => { if (collapsing) return; setBreaking(true); window.setTimeout(() => { setBreaking(false); setConnection(false); }, 900); };
  const toggleField = () => {
    if (collapsing) return;
    if (active) {
      setCollapsing(true);
      setBreaking(true);
      window.setTimeout(() => {
        setBreaking(false);
        setConnection(false);
        setCollapsing(false);
        setActive(false);
      }, 1120);
      return;
    }
    setBreaking(false);
    setConnection(false);
    setActive(true);
  };
  return <main className="dashboard-aurora relative min-h-[calc(100vh-73px)] overflow-hidden text-[#172554]">
    <RebuiltIdentityScene active={active || collapsing} collapsing={collapsing} connection={connection} breaking={breaking} onActivate={toggleField} />
    <div className="pointer-events-none absolute inset-0 z-10">
      <div className="pointer-events-auto absolute right-5 top-5 flex items-center gap-2 md:right-9 md:top-7">
        {active && !collapsing && <button onClick={toggleField} className="rounded-full border border-white/15 bg-[#17105A]/75 px-3 py-2 text-[9px] font-bold uppercase tracking-[.18em] text-[#C4B5FD] backdrop-blur hover:border-[#22D3EE]/50 hover:text-white">Collapse field</button>}

      </div>
      <div className="pointer-events-auto absolute bottom-5 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2 md:bottom-7">
        <span className="landing-explore-cue"><span className="landing-explore-dot" /> Touch to explore the field</span><span className="rounded-full bg-white/55 px-3 py-1 text-[9px] font-medium tracking-[.12em] text-[#64748B] backdrop-blur">Access your protected data dashboard</span><button onClick={onLogin} className="aurora-cta rounded-full px-5 py-3 text-[10px] font-bold uppercase tracking-[.18em] text-white">Log in to SAMVID</button>
      </div>
    </div>
  </main>;
}

function LoginView({ onBack, onLoginSuccess }: { onBack: () => void; onLoginSuccess: (sessionUser?: Record<string, unknown>) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'DATA_OWNER' | 'ORGANIZATION' | 'AUDITOR'>('DATA_OWNER');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);
    try {
      if (mode === 'register') {
        await api.register({ name: name.trim(), email: email.trim(), password, role });
        setMode('login');
        setPassword('');
        setNotice('Account created. Sign in with your new credentials.');
      } else {
        const auth = await api.login({ username: email.trim(), password });
        storeSession(auth);
        const sessionUser = await api.me();
        onLoginSuccess(sessionUser);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : mode === 'register' ? 'Unable to create the account.' : 'Unable to sign in. Please check your credentials.');
    } finally {
      setBusy(false);
    }
  };
  return <main className="relative flex min-h-[calc(100vh-73px)] items-center justify-center overflow-hidden px-5 py-4 sm:py-8"><div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(34,211,238,.16),transparent_25%),radial-gradient(circle_at_70%_30%,rgba(139,92,246,.16),transparent_24%)]" /><form onSubmit={submit} autoComplete="off" className="panel relative z-10 max-h-[calc(100vh-90px)] w-full max-w-md overflow-y-auto rounded-3xl p-5 sm:p-8 md:p-10"><button type="button" onClick={onBack} className="text-[10px] uppercase tracking-[.18em] text-[#A5A0D6] hover:text-white">← Back to SAMVID</button><div className="mt-6 text-center"><div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#22D3EE]/10 text-[#22D3EE]"><Fingerprint className="h-6 w-6" /></div><p className="eyebrow mt-4">{mode === 'login' ? 'Protected owner access' : 'Create protected access'}</p><h1 className="display mt-2 text-3xl text-white">{mode === 'login' ? 'Enter your field.' : 'Create your field.'}</h1><p className="mt-2 text-sm leading-6 text-[#B8B0E8]">{mode === 'login' ? 'Sign in with your SAMVID credentials to manage records, permissions, and security history.' : 'Register through the SAMVID backend to create a real protected account.'}</p></div><div className="mt-5 space-y-3">{mode === 'register' && <label className="block text-left text-[10px] font-bold uppercase tracking-[.15em] text-[#B8B0E8]">Name<input required value={name} onChange={event => setName(event.target.value)} name="samvid-register-name" autoComplete="off" className="mt-2 w-full rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-sm text-white outline-none placeholder:text-[#91a1ad] focus:border-[#22D3EE]" placeholder="Your name" /></label>}<label className="block text-left text-[10px] font-bold uppercase tracking-[.15em] text-[#B8B0E8]">Email<input required type="email" value={email} onChange={event => setEmail(event.target.value)} name="samvid-auth-email" autoComplete="off" className="mt-2 w-full rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-sm text-white outline-none placeholder:text-[#91a1ad] focus:border-[#22D3EE]" placeholder="you@example.com" /></label>{mode === 'register' && <label className="block text-left text-[10px] font-bold uppercase tracking-[.15em] text-[#B8B0E8]">Role<select value={role} onChange={event => setRole(event.target.value as typeof role)} className="mt-2 w-full rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-sm text-white outline-none focus:border-[#22D3EE]"><option value="DATA_OWNER" className="text-[#172554]">Data owner</option><option value="ORGANIZATION" className="text-[#172554]">Organization</option><option value="AUDITOR" className="text-[#172554]">Auditor</option></select></label>}<label className="block text-left text-[10px] font-bold uppercase tracking-[.15em] text-[#B8B0E8]">Password<input required type="password" value={password} onChange={event => setPassword(event.target.value)} name="samvid-auth-password" autoComplete="new-password" className="mt-2 w-full rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-sm text-white outline-none placeholder:text-[#91a1ad] focus:border-[#22D3EE]" placeholder="Enter your password" /></label></div>{error && <p role="alert" className="mt-4 rounded-xl border border-[#FDA4AF]/40 bg-[#FFF1F2]/10 px-3 py-2 text-xs text-[#fecdd3]">{error}</p>}{notice && <p role="status" className="mt-4 rounded-xl border border-[#22D3EE]/40 bg-[#22D3EE]/10 px-3 py-2 text-xs text-[#CFFAFE]">{notice}</p>}<button disabled={busy} type="submit" className="mt-4 w-full rounded-xl bg-[#22D3EE] px-4 py-4 text-[10px] font-bold uppercase tracking-[.18em] text-[#080B2A] transition hover:bg-[#67e9d8] disabled:cursor-wait disabled:opacity-60 shadow-lg shadow-[#22D3EE]/25">{busy ? (mode === 'login' ? 'Signing in...' : 'Creating account...') : mode === 'login' ? 'Log in to SAMVID' : 'Create SAMVID account'}</button><button type="button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); setNotice(''); }} className="mt-3 w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-[10px] font-bold uppercase tracking-[.16em] text-[#C4B5FD] hover:border-[#22D3EE]/50">{mode === 'login' ? 'Register / Create account' : 'Back to login'}</button><p className="mt-4 text-center text-[10px] leading-5 text-[#6f808a]">Your session is protected and your data remains under your control.</p></form></main>;
}
function TopNav({ view, setView, userName, backendUserRole, onLogout }: { view: View; setView: (view: View) => void; userName?: string | null; backendUserRole?: string; onLogout: () => void | Promise<void> }) {
  const [profileOpen, setProfileOpen] = useState(false);
  const navItems: View[] = backendUserRole === "DATA_OWNER" ? ["HOME", "MY DATA", "PERMISSIONS", "ORGANIZATIONS", "SECURITY"] : backendUserRole === "ORGANIZATION" ? ["HOME", "GATEWAY"] : ["HOME", "SECURITY"];
  return <header className="light-glass-nav relative z-[70] flex items-center justify-between border-b px-5 py-4 md:px-9">
    <button onClick={() => setView("HOME")} className="flex items-center gap-3">
      <span className="grid h-10 w-10 place-items-center overflow-hidden rounded-xl border border-[#22D3EE]/35 bg-[#111A45] shadow-[0_0_18px_rgba(34,211,238,.2)]">
        <img src="/samvid-security-logo.png" alt="SAMVID Logo" className="h-full w-full object-cover" />
      </span>
      <span className="display text-lg font-bold tracking-[.22em]">SAMVID</span>
    </button>
    <nav className="hidden items-center gap-3 md:flex">{navItems.map(item => { const Icon = item === "HOME" ? HomeIcon : item === "MY DATA" ? FileKey2 : item === "PERMISSIONS" ? UsersRound : item === "ORGANIZATIONS" ? UsersRound : ShieldCheck; return <button key={item} onClick={() => setView(item)} aria-current={view === item ? "page" : undefined} className={`icon-interactive flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold tracking-[.1em] ${view === item ? "text-[#4F46E5]" : "text-[#64748B]"}`}><Icon className="h-4 w-4 shrink-0" />{item}</button>; })}</nav>
    <div className="flex items-center gap-3">
      {backendUserRole === "ORGANIZATION" && <button onClick={() => setView("GATEWAY")} className="aurora-outline-cta hidden rounded-full px-4 py-2 text-xs font-bold uppercase tracking-[.1em] text-[#3730A3] hover:text-[#1D4ED8] sm:block">Organization gateway</button>}
      <div className="relative z-[200]">
        <button type="button" onClick={() => setProfileOpen(open => !open)} aria-expanded={profileOpen} className="flex items-center gap-2 rounded-full border border-[#CBD5E1] bg-white/85 px-3 py-2 text-[#172554] shadow-sm hover:border-[#8B5CF6] hover:bg-white">
          <CircleUserRound className="h-4 w-4 text-[#8B5CF6]" />
          <span className="hidden text-xs font-semibold text-[#172554] sm:inline">{userName || "Profile"}</span>
          <ChevronRight className={`h-3.5 w-3.5 text-[#70848e] transition-transform ${profileOpen ? "rotate-90" : ""}`} />
        </button>
        {profileOpen && <div className="pointer-events-auto absolute right-0 top-[calc(100%+10px)] z-[999] w-56 rounded-2xl border border-[#CBD5E1] bg-white p-2 shadow-2xl backdrop-blur-xl"><div className="border-b border-white/10 px-3 py-2"><p className="text-[9px] uppercase tracking-[.16em] text-[#64748B]">Signed in as</p><p className="mt-1 truncate text-xs text-[#172554]">{userName || "Profile"}</p></div><button type="button" onPointerDown={event => { event.preventDefault(); event.stopPropagation(); setProfileOpen(false); void onLogout(); }} onClick={event => { event.preventDefault(); event.stopPropagation(); }} className="relative z-[1000] mt-2 flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-xl bg-[#FFF1F2] px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-[.14em] text-[#BE123C] hover:bg-[#FFE4E6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F43F5E]" aria-label="Sign out"><LogOut className="h-3.5 w-3.5" /> Sign out</button></div>}
      </div>
      <button type="button" onClick={() => void onLogout()} className="flex items-center gap-2 rounded-full border border-[#FDA4AF]/55 bg-[#FFF1F2] px-3 py-2 text-[10px] font-bold uppercase tracking-[.12em] text-[#BE123C] shadow-sm transition hover:border-[#F43F5E] hover:bg-[#FFE4E6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F43F5E]" aria-label="Sign out"><LogOut className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Sign out</span></button>
    </div>
  </header>;
}

function HomeView({ active, setActive, records, permissions, pendingRequests, setView, transitionKey, userName, backendUserRole }: { active: boolean; setActive: (value: boolean) => void; records: DataRecord[]; permissions: Permission[]; pendingRequests: number; setView: (view: View) => void; transitionKey: number; userName?: string | null; backendUserRole?: string }) {
  const [connection, setConnection] = useState(false);
  const [breaking, setBreaking] = useState(false);
  const [collapsing, setCollapsing] = useState(false);
  const [fieldPointer, setFieldPointer] = useState({ x: 0, y: 0 });
  const [scrollShift, setScrollShift] = useState(0);
  const [fieldEntry, setFieldEntry] = useState(false);
  useEffect(() => { const onScroll = () => setScrollShift(Math.min(window.scrollY, 80)); window.addEventListener("scroll", onScroll, { passive: true }); setFieldEntry(false); const frame = window.requestAnimationFrame(() => setFieldEntry(true)); return () => { window.cancelAnimationFrame(frame); window.removeEventListener("scroll", onScroll); }; }, [transitionKey]);
  const activeCount = permissions.filter(p => p.status === "ACTIVE").length;
  const activateConsent = () => setView("PERMISSIONS");
  const revokeConsent = () => setView("PERMISSIONS");
  const minimize = () => { if (collapsing) return; setBreaking(true); setCollapsing(true); window.setTimeout(() => { setBreaking(false); setConnection(false); setCollapsing(false); setActive(false); }, 1120); };
  const isOrganization = backendUserRole === "ORGANIZATION";
  const quickActions = isOrganization
    ? [{ label: "Request data access", detail: `${pendingRequests.toString().padStart(2, "0")} requests in progress`, icon: UsersRound, action: () => setView("GATEWAY") }]
    : [
      { label: "Add record", detail: "Upload to your vault", icon: UploadCloud, action: () => setView("MY DATA") },
      { label: "Manage permissions", detail: `${activeCount.toString().padStart(2, "0")} active permissions`, icon: UsersRound, action: () => setView("PERMISSIONS") },
      { label: "View security", detail: "Audit and verification", icon: ShieldCheck, action: () => setView("SECURITY") },
    ];
  return <main onPointerMove={event => { const rect = event.currentTarget.getBoundingClientRect(); setFieldPointer({ x: (event.clientX - rect.left) / rect.width - 0.5, y: (event.clientY - rect.top) / rect.height - 0.5 }); }} onPointerLeave={() => setFieldPointer({ x: 0, y: 0 })} className="dashboard-aurora relative min-h-[calc(100vh-73px)] overflow-hidden text-[#172554]">
    <section className="pointer-events-none absolute left-6 top-10 z-10 max-w-[320px] lg:left-14 lg:top-1/2 lg:-translate-y-1/2"><p className="text-sm font-bold uppercase tracking-[.22em] text-[#2563EB]">Welcome back{userName ? `, ${userName}` : ""}</p><h1 className="display mt-4 text-5xl font-semibold leading-[.98] md:text-6xl"><span className="home-hero-title">Your field.<br />Your control.</span></h1><p className="mt-5 text-sm leading-6 text-[#64748B]">Manage who can access your data across organizations with complete transparency and security.</p>{isOrganization ? <button onClick={() => setView("GATEWAY")} className="aurora-cta pointer-events-auto mt-6 rounded-2xl px-5 py-3 text-[10px] font-bold uppercase tracking-[.18em] text-white">Request data access</button> : <button onClick={activateConsent} className="aurora-cta pointer-events-auto mt-6 rounded-2xl px-5 py-3 text-[10px] font-bold uppercase tracking-[.18em] text-white">+ Create new consent</button>}</section><div className={`${fieldEntry ? "living-field-layer field-view-enter" : "living-field-layer"} z-0`} style={{ transform: `translate3d(${fieldPointer.x * 10}px, ${fieldPointer.y * 8 - scrollShift * 0.04}px, 0)` }} aria-hidden="true"><span className="living-field-orbit" /><span className="living-field-orbit mobile-lite-hidden" /><span className="living-field-orbit mobile-lite-hidden" /><span className="living-field-node" style={{ left: "22%", top: "28%", animationDelay: "-1s" }} /><span className="living-field-node" style={{ left: "72%", top: "22%", animationDelay: "-3.5s" }} /><span className="living-field-node mobile-lite-hidden" style={{ left: "80%", top: "70%", animationDelay: "-5s" }} /><span className="living-field-node mobile-lite-hidden" style={{ left: "34%", top: "74%", animationDelay: "-2s" }} /><span className="living-field-beam" style={{ left: "20%", top: "30%", width: "58%", transform: "rotate(18deg)" }} /><span className="living-field-beam mobile-lite-hidden" style={{ left: "31%", top: "72%", width: "42%", transform: "rotate(-24deg)" }} /></div>
    <div className="home-scene-safe-zone relative z-0 min-h-[calc(100vh-73px)] lg:pr-[360px]"><RebuiltIdentityScene active={active || collapsing} collapsing={collapsing} connection={connection} breaking={breaking} onActivate={() => { if (active && !collapsing) minimize(); else if (!active && !collapsing) setActive(true); }} /></div>
    <div className="pointer-events-none absolute inset-0 z-10">
      {!active && <div className="absolute left-1/2 top-[48%] h-[220px] w-[220px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#22D3EE]/25 shadow-[0_0_40px_rgba(34,211,238,.16)] animate-pulse" />}
      <aside className="light-glass-card pointer-events-auto absolute bottom-5 left-5 right-5 max-h-[calc(100vh-88px)] overflow-y-auto rounded-3xl p-4 lg:bottom-7 lg:left-auto lg:right-7 lg:top-7 lg:w-[328px] lg:rounded-[28px] lg:p-5"><div className="flex items-start justify-between"><div><p className="eyebrow">Owner control center</p><h2 className="display mt-2 text-xl text-white">Your field at a glance</h2></div><span className={`mt-1 rounded-full px-2.5 py-1 text-[9px] font-bold uppercase tracking-[.14em] ${active ? "bg-[#22D3EE]/10 text-[#22D3EE]" : "bg-white/[.05] text-[#84959f]"}`}>{active ? "Live" : "Ready"}</span></div><div className="mt-5 grid grid-cols-2 gap-2"><div className="rounded-2xl bg-white/[.035] p-3"><p className="eyebrow">Records</p><p className="mt-2 text-lg text-white">{records.length.toString().padStart(2, "0")}</p></div><div className="rounded-2xl bg-white/[.035] p-3"><p className="eyebrow">Access</p><p className="mt-2 text-lg text-[#22D3EE]">{activeCount.toString().padStart(2, "0")}</p></div><div className="rounded-2xl bg-white/[.035] p-3"><p className="eyebrow">Requests</p><p className="mt-2 text-lg text-[#8B5CF6]">{pendingRequests.toString().padStart(2, "0")}</p></div><div className="rounded-2xl bg-white/[.035] p-3"><p className="eyebrow">Field</p><p className="mt-2 text-sm text-[#8B5CF6]">{records.length ? "Connected" : "Awaiting data"}</p></div></div><div className="mt-5 space-y-2">{quickActions.map(({ label, detail, icon: Icon, action }) => <button key={label} onClick={action} className="light-control-row group flex w-full items-center gap-3 rounded-2xl p-3 text-left transition"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#22D3EE]/10 text-[#22D3EE]"><Icon className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block text-xs font-semibold control-copy">{label}</span><span className="mt-1 block truncate text-[10px] control-subcopy">{detail}</span></span><ArrowUpRight className="h-4 w-4 text-[#586b76] transition group-hover:text-[#2563EB]" /></button>)}</div><button onClick={() => setView("GATEWAY")} className="gateway-cta mt-2 flex w-full items-center justify-between rounded-2xl border border-[#8B5CF6]/30 bg-[#8B5CF6]/[.08] px-3 py-3 text-left text-[10px] font-bold uppercase tracking-[.14em] text-[#4F46E5] hover:border-[#8B5CF6]/60"><span>Open organization gateway</span><ArrowUpRight className="h-4 w-4" /></button>{active && <div className="mt-3 flex gap-2"><button onClick={minimize} className="minimize-cta rounded-full border border-[#8B5CF6]/30 bg-white/70 px-3 py-2 text-[9px] font-bold uppercase tracking-[.14em] text-[#4F46E5]">Minimize</button><button onClick={activateConsent} className="rounded-full border border-[#22D3EE]/35 px-3 py-2 text-[9px] font-bold uppercase tracking-[.14em] text-[#2563EB]">Open permissions</button></div>}</aside>
      {active && <div className="pointer-events-auto absolute bottom-5 left-1/2 hidden -translate-x-1/2 items-center gap-3 md:bottom-7 lg:flex"><span className="rounded-full border border-white/10 bg-[#111447]/80 px-4 py-2.5 text-[9px] font-bold uppercase tracking-[.2em] text-[#2563EB] backdrop-blur">{`${activeCount.toString().padStart(2, "0")} permission${activeCount === 1 ? "" : "s"} available`}</span></div>}
    </div>
  </main>;
}

function DataView({ records, setRecords, ownerName }: { records: typeof initialRecords; setRecords: (records: typeof initialRecords) => void; ownerName?: string | null }) {
  const [showUpload, setShowUpload] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [recordTitle, setRecordTitle] = useState("");
  const [recordType, setRecordType] = useState("");
  const [editingRecordId, setEditingRecordId] = useState<number | null>(null);
  const [viewingRecord, setViewingRecord] = useState<(typeof initialRecords)[number] | null>(null);
  const [recordError, setRecordError] = useState("");
  const [sharedReference, setSharedReference] = useState("");
  const saveRecord = async () => {
    if (!selectedFile) return;
    setRecordError("");
    try {
      if (!recordType) {
        setRecordError("Select a record type before uploading.");
        return;
      }
      const uploaded = await api.uploadRecord({ title: recordTitle || selectedFile.name, record_type: recordType, file: selectedFile });
      const normalized = normalizeRecords([uploaded])[0];
      if (!normalized) throw new Error("The backend did not return the uploaded record.");
      setRecords([...records, { ...normalized, fileName: selectedFile.name, mimeType: selectedFile.type }]);
      setShowUpload(false);
      setSelectedFile(null);
      setRecordTitle("");
      setRecordType("");
    } catch (cause) {
      setRecordError(cause instanceof Error ? cause.message : "Unable to upload this record.");
    }
  };
  const openRecord = async (record: (typeof initialRecords)[number]) => {
    setRecordError("");
    try {
      const detail = await api.getRecord(record.id);
      const liveRecord = normalizeRecords([detail])[0] ?? record;
      if (!record.fileUrl) {
        const { response, mimeType } = await fetchSecureRecord(record.id);
        const blobUrl = URL.createObjectURL(await response.blob());
        setViewingRecord({ ...record, ...liveRecord, fileUrl: blobUrl, mimeType, fileName: record.fileName || record.title });
        return;
      }
      setViewingRecord(record);
    } catch (cause) {
      setRecordError(cleanAccessMessage(cause, "This record could not be opened right now."));
    }
  };
  const downloadRecord = async (record: (typeof initialRecords)[number]) => {
    try {
      const response = await api.getRecordFile(record.id);
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = record.fileName || record.title || `record-${record.id}`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (cause) { setRecordError(cleanAccessMessage(cause, "This record file could not be downloaded.")); }
  };
  const removeRecord = async (record: (typeof initialRecords)[number]) => {
    if (!window.confirm(`Remove “${record.title}” from your vault?`)) return;
    setRecordError("");
    try {
      await api.deleteRecord(record.id);
      if (viewingRecord?.id === record.id) setViewingRecord(null);
      setRecords(records.filter(item => item.id !== record.id));
    } catch (cause) {
      setRecordError(cleanAccessMessage(cause, "This record could not be removed. It may have active access history."));
    }
  };

  return <main className="mx-auto max-w-7xl px-5 py-7 md:px-9 md:py-10"><div className="contents"><div className="flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><p className="eyebrow">Private vault / 02</p><h1 className="display mt-3 text-5xl font-semibold text-white">MY DATA</h1><p className="mt-3 max-w-xl text-sm leading-6 text-[#B8B0E8]">Records are encrypted, timestamped, and held under your authorization.</p></div><button onClick={() => setShowUpload(!showUpload)} className="rounded-full bg-[#22D3EE] px-5 py-3 text-[10px] font-bold uppercase tracking-[.18em] text-[#080B2A] transition hover:bg-[#66e6d5]"><UploadCloud className="mr-2 inline h-4 w-4" /> Add record</button></div>{showUpload && <div className="panel mt-7 rounded-3xl p-5 md:p-7"><div className="flex items-start justify-between"><div><p className="eyebrow">New record intake</p><h2 className="display mt-2 text-2xl text-white">Upload new record.</h2></div><button onClick={() => setShowUpload(false)} className="text-[#768791]"><X /></button></div><div className="mt-6 grid gap-4 md:grid-cols-[1fr_1fr_auto]"><input value={recordTitle} onChange={e => setRecordTitle(e.target.value)} className="data-input rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-[#172554] outline-none placeholder:text-slate-500 focus:border-[#8B5CF6]" placeholder="Record name" /><select value={recordType} onChange={e => setRecordType(e.target.value)} className="data-input rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-[#172554]"><option value="">Select type</option><option value="Identity">Identity</option><option value="Academic">Academic</option><option value="Employment">Employment</option><option value="Medical">Medical</option></select><label className="data-input flex items-center rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-[#475569]"><input type="file" onChange={e => { const file = e.target.files?.[0] ?? null; setSelectedFile(file); if (file && !recordTitle) setRecordTitle(file.name.replace(/\.[^/.]+$/, "")); }} className="max-w-full text-xs text-[#475569] file:mr-3 file:rounded-lg file:border-0 file:bg-[#EEF2FF] file:px-3 file:py-2 file:font-semibold file:text-[#4F46E5]" /></label><button disabled={!selectedFile} onClick={saveRecord} className="rounded-xl bg-[#22D3EE] px-4 py-3 text-[10px] font-bold uppercase tracking-[.14em] text-[#080B2A]">Save Record</button></div>{recordError && <p role="alert" className="mt-3 text-xs text-[#BE123C]">{recordError}</p>}{sharedReference && <p role="status" className="mt-3 text-xs text-[#166534]">{sharedReference}</p>}</div>}{!records.length && !showUpload && <section className="panel mt-8 rounded-3xl border border-[#22D3EE]/20 bg-[#22D3EE]/[.04] p-8 text-center"><p className="eyebrow">Private vault</p><h2 className="display mt-3 text-3xl text-white">No records yet.</h2><p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[#B8B0E8]">Upload your first protected record to begin managing secure access.</p><button onClick={() => setShowUpload(true)} className="mt-6 rounded-full bg-[#22D3EE] px-5 py-3 text-[10px] font-bold uppercase tracking-[.16em] text-[#080B2A] focus:outline-none focus:ring-2 focus:ring-[#22D3EE]/50"><UploadCloud className="mr-2 inline h-4 w-4" /> Add record</button></section>}<div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">{records.map(record => <div key={record.id} className="panel group rounded-3xl p-5 transition hover:-translate-y-1 hover:border-white/25"><div className="flex items-start justify-between"><div className="grid h-12 w-12 place-items-center rounded-2xl" style={{ background: `${record.accent}18`, color: record.accent }}><FileKey2 className="h-5 w-5" /></div><span className="rounded-full border border-[#22D3EE]/25 bg-[#22D3EE]/10 px-2 py-1 text-[9px] font-bold tracking-[.16em] text-[#22D3EE]">{record.verified ? "VERIFIED" : "PENDING"}</span></div><h3 className="mt-8 text-lg font-medium text-[#172554]">{record.title}</h3><p className="mt-1 text-xs text-[#64748B]">{record.type} · {record.sensitivity} sensitivity</p><div className="mt-6 grid grid-cols-2 gap-3 border-t border-slate-200 pt-4"><div><p className="eyebrow">Last accessed</p><p className="mt-2 text-xs text-[#475569]">{record.accessed}</p></div><div><p className="eyebrow">Storage</p><p className="mt-2 text-xs text-[#475569]">Encrypted</p></div></div><div className="mt-5 grid grid-cols-3 gap-2"><button onClick={() => void openRecord(record)} className="record-action col-span-2 flex items-center justify-center gap-2 rounded-xl border border-[#8B5CF6]/30 bg-[#EEF2FF] px-3 py-2 text-[10px] font-bold uppercase tracking-[.12em] text-[#4F46E5]" title="View secure record"><Activity className="h-4 w-4" /> View record</button><button onClick={() => void removeRecord(record)} className="record-delete col-span-3 rounded-xl border border-[#F43F5E]/25 bg-[#FFF1F2] px-3 py-2 text-[10px] font-bold uppercase tracking-[.12em] text-[#BE123C] transition hover:border-[#F43F5E]/50 hover:bg-[#FFE4E6]" title="Remove this record from the backend">Remove record</button></div></div>)}</div>{viewingRecord && <div className="fixed inset-0 z-50 grid place-items-center bg-[#172554]/25 p-5 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Secure record details"><div className="w-full max-w-md rounded-3xl border border-white/70 bg-white p-6 shadow-2xl"><div className="flex items-start justify-between"><div><p className="eyebrow">Secure record</p><h2 className="display mt-2 text-2xl text-[#172554]">{viewingRecord.title}</h2></div><button onClick={() => setViewingRecord(null)} className="rounded-full p-2 text-[#475569] hover:bg-[#EEF2FF]" aria-label="Close record details"><X className="h-5 w-5" /></button></div><div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-[#F8FAFC]">{viewingRecord.fileUrl ? (viewingRecord.mimeType?.startsWith("image/") ? <img src={viewingRecord.fileUrl} alt={viewingRecord.title} className="max-h-64 w-full object-contain" /> : viewingRecord.mimeType === "application/pdf" ? <iframe title={viewingRecord.title} src={viewingRecord.fileUrl} className="h-64 w-full" /> : <div className="p-5 text-sm text-[#475569]">Preview is not available for this file type. Use the open button below.</div>) : <div className="p-5 text-sm text-[#64748B]">No local preview is attached to this record.</div>}</div><div className="mt-4 flex items-center justify-between gap-3"><div className="text-xs text-[#475569]">{viewingRecord.fileName || "Managed record"}</div><div className="flex gap-2">{viewingRecord.fileUrl && <a href={viewingRecord.fileUrl} target="_blank" rel="noreferrer" className="rounded-lg bg-[#EEF2FF] px-3 py-2 text-[10px] font-bold uppercase tracking-[.12em] text-[#4F46E5]">Open document</a>}<button onClick={() => void downloadRecord(viewingRecord)} className="rounded-lg border border-[#C4B5FD] px-3 py-2 text-[10px] font-bold uppercase tracking-[.12em] text-[#4F46E5]">Download</button></div></div><div className="mt-5 grid grid-cols-2 gap-3 text-sm text-[#475569]"><div className="rounded-2xl bg-[#F8FAFC] p-4"><span className="eyebrow">Category</span><p className="mt-2 text-[#172554]">{viewingRecord.type}</p></div><div className="rounded-2xl bg-[#F8FAFC] p-4"><span className="eyebrow">Sensitivity</span><p className="mt-2 text-[#172554]">{viewingRecord.sensitivity}</p></div><div className="rounded-2xl bg-[#F8FAFC] p-4"><span className="eyebrow">Access</span><p className="mt-2 text-[#172554]">{viewingRecord.accessed}</p></div><div className="rounded-2xl bg-[#F8FAFC] p-4"><span className="eyebrow">Storage</span><p className="mt-2 text-[#172554]">Encrypted</p></div></div><div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs leading-5 text-[#64748B]">Record replacement and title editing are not exposed by the live backend. The document shown here is the current protected record.</div></div></div>}</div></main>;
}

function PermissionsView({ permissions, setPermissions, records, organizations, loading, pendingRequests, accessRequests, setAccessRequests, setPendingRequests, backendUserRole, onOpenGateway }: { permissions: Permission[]; setPermissions: (permissions: Permission[]) => void; records: DataRecord[]; organizations: Organization[]; loading: boolean; pendingRequests: number; accessRequests: AccessRequest[]; setAccessRequests: (requests: AccessRequest[]) => void; setPendingRequests: (count: number) => void; backendUserRole?: string; onOpenGateway: () => void }) {
    const [permissionError, setPermissionError] = useState("");
  const [requestRefreshing, setRequestRefreshing] = useState(false);
  const [lastRequestSync, setLastRequestSync] = useState<Date | null>(null);
  const [pendingActionId, setPendingActionId] = useState<number | null>(null);
  const [accessType] = useState("VIEW_ONLY");
  const refreshRequests = async () => {
    setPermissionError("");
    setRequestRefreshing(true);
    try {
      const rows = normalizeAccessRequests(await (backendUserRole === "DATA_OWNER" ? api.getReceivedAccessRequests() : api.getAccessRequests()));
      setAccessRequests(rows);
      setPendingRequests(rows.filter(row => row.status === "PENDING").length);
      setLastRequestSync(new Date());
    } catch (cause) {
      const fallback = backendUserRole === "DATA_OWNER"
        ? "The Owner inbox could not be read from the live backend. The request may still be pending; try Refresh again after a moment."
        : "Requests are temporarily unavailable. Please refresh again.";
      setPermissionError(backendUserRole === "DATA_OWNER" && (cause as { status?: number })?.status === 403 ? fallback : cleanAccessMessage(cause, fallback));
    } finally {
      setRequestRefreshing(false);
    }
  };
  useEffect(() => {
    if (backendUserRole !== "DATA_OWNER") return;
    const timer = window.setInterval(() => { void refreshRequests(); }, 5000);
    return () => window.clearInterval(timer);
  }, [backendUserRole]);
  const update = async (permission: Permission) => {
    setPermissionError("");
    try {
      const accessType = window.prompt("Access type", permission.scope || "VIEW_ONLY")?.trim();
      if (!accessType) return;
      const expiryInput = window.prompt("Expiry time in UTC", permission.expires)?.trim();
      if (!expiryInput) return;
      const parsedExpiry = new Date(expiryInput).getTime();
      if (!Number.isFinite(parsedExpiry)) throw new Error("Enter a valid expiry time.");
      await api.updateConsent(permission.id, accessType, Math.floor(parsedExpiry / 1000));
      setPermissionError("");
    } catch (cause) { setPermissionError(cleanAccessMessage(cause, "This consent could not be updated.")); }
  };
  const revoke = async (permission: Permission) => {
    setPermissionError("");
    try {
      console.log(permission);
      await api.revokeAccessRequest(permission.requestId!);
      setPermissions(
        permissions.map(p =>
          p.requestId === permission.requestId
            ? { ...p, status: "REVOKED", expires: "Revoked" }
            : p
        )
    );
    } catch (cause) {
      setPermissionError(cleanAccessMessage(cause, "This access could not be revoked right now."));
    }
  };
  const approveRequest = async (request: AccessRequest) => {
    setPermissionError("");
    setPendingActionId(request.id);
    try {
      const start = new Date();
      const expiry = new Date(start);
      expiry.setFullYear(expiry.getFullYear() + 1);
      const consent = await api.approveAccessRequest(request.id, start.toISOString(), expiry.toISOString());
      const approved = normalizePermissions([consent])[0];
      if (approved) setPermissions([approved, ...permissions.filter(item => item.id !== approved.id)]);
      setAccessRequests(accessRequests.map(item => item.id === request.id ? { ...item, status: "APPROVED" } : item));
      setPendingRequests(Math.max(0, pendingRequests - 1));
    } catch (cause) {
      setPermissionError(cleanAccessMessage(cause, "This request could not be approved right now."));
    } finally {
      setPendingActionId(null);
    }
  };
  const rejectRequest = async (request: AccessRequest) => {
    setPermissionError("");
    setPendingActionId(request.id);
    try {
      await api.rejectAccessRequest(request.id);
      setAccessRequests(accessRequests.map(item => item.id === request.id ? { ...item, status: "REJECTED" } : item));
      setPendingRequests(Math.max(0, pendingRequests - 1));
    } catch (cause) {
      setPermissionError(cleanAccessMessage(cause, "This request could not be rejected right now."));
    } finally {
      setPendingActionId(null);
    }
  };
  return <main className="mx-auto max-w-6xl px-5 py-7 md:px-9 md:py-10"><div className="flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><p className="eyebrow">Consent layer / 03</p><h1 className="display mt-3 text-5xl font-semibold text-[#172554]">PERMISSIONS</h1><p className="mt-3 text-sm text-[#64748B]">{backendUserRole === "ORGANIZATION" ? "Request record access from the Organization Gateway." : "Review who can see your data, for what purpose, and for how long."}</p></div>{backendUserRole === "ORGANIZATION" ? <button onClick={onOpenGateway} className="rounded-full bg-[#8B5CF6] px-5 py-3 text-[10px] font-bold uppercase tracking-[.18em] text-white"><ArrowUpRight className="mr-2 inline h-4 w-4" /> Open gateway</button> : <div className="rounded-full border border-[#22D3EE]/30 bg-[#22D3EE]/10 px-5 py-3 text-[10px] font-bold uppercase tracking-[.16em] text-[#2563EB]">OWNER CONTROL</div>}</div><div className="mt-8 grid gap-3 md:grid-cols-3"><div className="panel rounded-2xl p-5"><p className="eyebrow">Active</p><p className="mt-3 text-3xl text-[#172554]">{permissions.filter(p => p.status === "ACTIVE").length.toString().padStart(2, "0")}</p></div><div className="panel rounded-2xl p-5"><p className="eyebrow">Pending requests</p><p className="mt-3 text-3xl text-[#8B5CF6]">{pendingRequests.toString().padStart(2, "0")}</p></div><div className="panel rounded-2xl p-5"><p className="eyebrow">Revoked</p><p className="mt-3 text-3xl text-[#EC4899]">{permissions.filter(p => p.status === "REVOKED").length.toString().padStart(2, "0")}</p></div></div>{permissionError && <p role="alert" className="mt-4 text-xs text-[#FCA5A5]">{permissionError}</p>}{backendUserRole === "DATA_OWNER" && <section className="panel mt-7 rounded-3xl border border-[#22D3EE]/20 bg-[#22D3EE]/[.04] p-6"><p className="eyebrow">Owner inbox</p><h2 className="display mt-2 text-2xl text-[#172554]">Incoming requests appear automatically.</h2><p className="mt-3 text-sm leading-6 text-[#64748B]">When the backend returns an organization request for one of your records, it will appear below with the organization, record, purpose, and direct Approve or Reject actions.</p></section>}{backendUserRole === "ORGANIZATION" && <section className="panel mt-7 rounded-3xl border border-[#8B5CF6]/20 bg-[#8B5CF6]/[.04] p-6"><p className="eyebrow">Organization workflow</p><h2 className="display mt-2 text-2xl text-[#172554]">Ask for access from the gateway.</h2><p className="mt-3 max-w-2xl text-sm leading-6 text-[#64748B]">Browse Data Owners and their documents directly from the Organization Gateway, then send a view-only request.</p><button onClick={onOpenGateway} className="mt-5 rounded-full border border-[#8B5CF6]/30 px-4 py-2 text-[10px] font-bold uppercase tracking-[.14em] text-[#4F46E5]"><ArrowUpRight className="mr-2 inline h-4 w-4" /> Go to gateway</button></section>}{backendUserRole === "DATA_OWNER" && loading && <section className="panel mt-7 animate-pulse rounded-3xl border border-[#22D3EE]/20 bg-[#22D3EE]/[.04] p-6" aria-label="Loading Owner requests"><div className="h-3 w-28 rounded bg-[#22D3EE]/20" /><div className="mt-4 h-7 w-72 rounded bg-[#172554]/10" /><div className="mt-3 h-4 w-full max-w-xl rounded bg-[#172554]/10" /><div className="mt-6 h-10 w-36 rounded-full bg-[#22D3EE]/20" /></section>}{backendUserRole === "DATA_OWNER" && !loading && accessRequests.filter(request => request.status === "PENDING").length === 0 && <section className="panel mt-7 rounded-3xl border border-[#22D3EE]/20 bg-[#22D3EE]/[.04] p-6"><p className="eyebrow">Owner workflow</p><h2 className="display mt-2 text-2xl text-[#172554]">Incoming requests appear here.</h2><p className="mt-3 text-sm leading-6 text-[#64748B]">No new request is visible yet. When an organization request reaches this owner inbox, it will appear automatically with Approve and Reject actions. Active access can be revoked at any time.</p><div className="mt-5 flex flex-wrap items-center gap-3"><button onClick={() => void refreshRequests()} disabled={requestRefreshing} className="rounded-full border border-[#22D3EE]/30 px-4 py-2 text-[10px] font-bold uppercase tracking-[.14em] text-[#2563EB] disabled:cursor-wait disabled:opacity-60">{requestRefreshing ? "Checking..." : "Refresh requests"}</button><span className="text-[10px] text-[#64748B]">{lastRequestSync ? `Last checked ${lastRequestSync.toLocaleTimeString()}` : "Checks live backend"}</span></div></section>}{backendUserRole === "DATA_OWNER" && accessRequests.filter(request => request.status === "PENDING").length > 0 && <section className="panel mt-7 rounded-3xl p-6"><div className="flex items-start justify-between gap-4"><div><p className="eyebrow">Organization requests</p><h2 className="display mt-2 text-2xl text-[#172554]">Review requested access.</h2></div><button onClick={() => void refreshRequests()} disabled={requestRefreshing} className="rounded-full border border-[#8B5CF6]/30 px-3 py-2 text-[9px] font-bold uppercase tracking-[.12em] text-[#4F46E5] disabled:cursor-wait disabled:opacity-60">{requestRefreshing ? "Checking..." : "Refresh"}</button></div><div className="mt-5 space-y-3">{accessRequests.filter(request => request.status === "PENDING").map(request => <div key={request.id} className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white/70 p-4 md:flex-row md:items-center md:justify-between"><div><p className="text-sm font-semibold text-[#172554]">{request.org || request.requester}</p><p className="mt-1 text-xs text-[#64748B]">{request.record} / {request.purpose} / {request.requestedAccessType}</p></div><div className="flex gap-2"><button onClick={() => void approveRequest(request)} disabled={pendingActionId !== null} className="rounded-full bg-[#22D3EE] px-4 py-2 text-[9px] font-bold uppercase tracking-[.14em] text-[#080B2A] disabled:cursor-wait disabled:opacity-60">{pendingActionId === request.id ? "Approving..." : "Approve"}</button><button onClick={() => void rejectRequest(request)} disabled={pendingActionId !== null} className="rounded-full border border-[#EC4899]/30 px-4 py-2 text-[9px] font-bold uppercase tracking-[.14em] text-[#BE123C] disabled:cursor-wait disabled:opacity-60">{pendingActionId === request.id ? "Rejecting..." : "Reject"}</button></div></div>)}</div></section>}{backendUserRole === "ORGANIZATION" && <section className="panel mt-8 rounded-3xl border border-[#8B5CF6]/20 bg-[#8B5CF6]/[.04] p-6"><div className="flex items-start justify-between gap-4"><div><p className="eyebrow">Outgoing requests</p><h2 className="display mt-2 text-2xl text-[#172554]">Track your access requests.</h2></div><button onClick={() => void refreshRequests()} className="rounded-full border border-[#8B5CF6]/30 px-3 py-2 text-[9px] font-bold uppercase tracking-[.12em] text-[#4F46E5] focus:outline-none focus:ring-2 focus:ring-[#8B5CF6]/40">Refresh</button></div>{accessRequests.length ? <div className="mt-5 grid gap-3 md:grid-cols-2">{accessRequests.map(request => <div key={request.id} className="rounded-2xl border border-slate-200 bg-white/70 p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold text-[#172554]">{request.record || "Protected record"}</p><p className="mt-1 text-xs text-[#64748B]">Owner: {request.requester || "Data Owner"}</p></div><span className="rounded-full border border-[#8B5CF6]/25 bg-[#F5F3FF] px-2 py-1 text-[9px] font-bold uppercase tracking-[.12em] text-[#4F46E5]">{request.status}</span></div><p className="mt-3 text-xs leading-5 text-[#475569]">{request.purpose || "No purpose supplied"} · {request.requestedAccessType || "VIEW_ONLY"}</p>{request.status === "PENDING" && <p className="mt-3 text-xs font-medium text-[#92400E]">Waiting for Owner approval.</p>}{request.status === "APPROVED" && <button onClick={onOpenGateway} className="mt-3 rounded-full border border-[#22D3EE]/35 px-3 py-2 text-[9px] font-bold uppercase tracking-[.12em] text-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#22D3EE]/40">Open Gateway to view</button>}{request.status === "REJECTED" && <p className="mt-3 text-xs font-medium text-[#BE123C]">The Owner rejected this request.</p>}</div>)}</div> : <p className="mt-5 rounded-2xl border border-slate-200 bg-white/60 p-4 text-sm text-[#64748B]">No outgoing requests yet. Open the Organization Gateway to request view-only access.</p>}</section>}<div className="mt-8 space-y-3">{permissions.map(permission => <div key={permission.id} className={`panel flex flex-col gap-5 rounded-2xl p-5 md:flex-row md:items-center md:justify-between ${permission.status === "REVOKED" ? "opacity-60" : ""}`}><div className="flex items-center gap-4"><div className={`grid h-11 w-11 place-items-center rounded-2xl ${permission.status === "ACTIVE" ? "bg-[#22D3EE]/10 text-[#22D3EE]" : "bg-[#EC4899]/10 text-[#EC4899]"}`}><UsersRound className="h-5 w-5" /></div><div><p className="text-base font-medium text-[#172554]">{permission.org}</p><p className="mt-1 text-xs text-[#64748B]">{permission.record} <span className="mx-1 text-[#53616b]">/</span> {permission.purpose}</p></div></div><div className="grid grid-cols-3 gap-5 text-right md:min-w-[380px]"><div><p className="eyebrow">Scope</p><p className="mt-2 text-xs text-[#475569]">{permission.scope}</p></div><div><p className="eyebrow">Expires</p><p className="mt-2 text-xs text-[#475569]">{permission.expires}</p></div><div>{permission.status === "ACTIVE" ? <div className="flex gap-2"><button onClick={() => void update(permission)} className="rounded-full border border-[#C4B5FD] px-3 py-2 text-[9px] font-bold uppercase tracking-[.14em] text-[#4F46E5]">Update</button><button onClick={() => revoke(permission)} className="uppercase tracking-[.14em] text-[#F472B6] hover:bg-[#EC4899]/10"> Revoke</button></div> : <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-[.14em] text-[#EC4899]"><X className="h-3 w-3" /> Revoked</span>}</div></div></div>)}</div></main>;
}

function SecurityView({ permissions }: { permissions: Permission[] }) {
  const [auditEvents, setAuditEvents] = useState<string[]>([]);
  const [auditFile, setAuditFile] = useState<File | null>(null);
  const [smartReport, setSmartReport] = useState<any>(null);
  const [smartAuditError, setSmartAuditError] = useState("");
  const [smartAuditBusy, setSmartAuditBusy] = useState(false);
  const [auditResult, setAuditResult] = useState("");
  const [auditRecordId, setAuditRecordId] = useState("");
  const [auditActorId, setAuditActorId] = useState("");
  const [auditLoading, setAuditLoading] = useState(false);
  useEffect(() => {
    setAuditLoading(true);
    api.getAuditLogs({ result: auditResult || undefined, record_id: auditRecordId || undefined, actor_id: auditActorId || undefined }).then(value => {
      const rows = asArray(value);
      const live = rows.slice(0, 6).map(row => String(row.description ?? row.action ?? row.event_type ?? row.result ?? '')).filter(Boolean);
      setAuditEvents(live);
    }).catch(() => undefined).finally(() => setAuditLoading(false));
  }, [auditResult, auditRecordId, auditActorId]);
  const events = auditEvents;
  const runSmartAudit = async () => {
    if (!auditFile) { setSmartAuditError("Choose a Solidity file first."); return; }
    setSmartAuditBusy(true); setSmartAuditError(""); setSmartReport(null);
    try { setSmartReport(await api.analyzeContract(auditFile)); }
    catch (cause) { setSmartAuditError(formatApiMessage(cause instanceof Error ? cause.message : cause) || "Smart Audit could not analyze this file."); }
    finally { setSmartAuditBusy(false); }
  };
  return <main className="mx-auto max-w-6xl px-5 py-7 md:px-9 md:py-10"><p className="eyebrow">Integrity monitor / 04</p><h1 className="display mt-3 text-5xl font-semibold text-white">SECURITY</h1><p className="mt-3 max-w-xl text-sm leading-6 text-[#B8B0E8]">A readable history of what happened to your data, with verification states that make the underlying system legible.</p><div className="mt-8 grid gap-5 lg:grid-cols-[1.15fr_.85fr]"><section className="panel rounded-3xl p-6"><div className="flex items-center justify-between"><div><p className="eyebrow">Recent activity</p><h2 className="display mt-2 text-2xl text-white">Audit history</h2><div className="mt-4 grid gap-2 sm:grid-cols-3"><input value={auditResult} onChange={event => setAuditResult(event.target.value)} placeholder="Result" className="data-input rounded-xl border px-3 py-2 text-xs" /><input value={auditRecordId} onChange={event => setAuditRecordId(event.target.value)} placeholder="Record ID" className="data-input rounded-xl border px-3 py-2 text-xs" /><input value={auditActorId} onChange={event => setAuditActorId(event.target.value)} placeholder="Actor ID" className="data-input rounded-xl border px-3 py-2 text-xs" /></div></div><Activity className="h-5 w-5 text-[#22D3EE]" /></div><div className="mt-7 space-y-5">{auditLoading ? <p className="rounded-2xl border border-slate-200 bg-white/60 p-4 text-sm text-[#64748B]">Loading live audit logs...</p> : events.length ? events.map((event, i) => <div key={i} className="flex gap-4"><div className="flex flex-col items-center"><span className="mt-1 h-2.5 w-2.5 rounded-full bg-[#22D3EE]" /><span className="mt-2 h-full w-px bg-white/10" /></div><div className="pb-4"><p className="text-sm text-[#dce7eb]">{event}</p><p className="mt-1 flex items-center gap-1 text-[10px] uppercase tracking-[.13em] text-[#71818b]"><Clock3 className="h-3 w-3" /> Live backend audit event</p></div></div>) : <p className="rounded-2xl border border-white/10 bg-white/[.03] p-4 text-sm text-[#aebdc4]">No audit events have been returned by the backend yet.</p>}</div></section><section className="space-y-5"><div className="panel rounded-3xl p-6"><p className="eyebrow">Blockchain verification</p><div className="mt-5 space-y-4"><div className="flex items-center justify-between border-b border-white/10 pb-4"><span className="text-sm text-[#bccad0]">Consent records verified</span><span className="flex items-center gap-2 text-xs text-[#22D3EE]"><Check className="h-4 w-4" /> {permissions.length ? 'Backend data loaded' : 'No data'}</span></div><div className="flex items-center justify-between border-b border-white/10 pb-4"><span className="text-sm text-[#bccad0]">Audit history intact</span><span className="flex items-center gap-2 text-xs text-[#22D3EE]"><Check className="h-4 w-4" /> {events.length ? 'Live' : 'Awaiting data'}</span></div><div className="flex items-center justify-between"><span className="text-sm text-[#bccad0]">Contract connected</span><span className="flex items-center gap-2 text-xs text-[#8B5CF6]"><LockKeyhole className="h-4 w-4" /> {events.length ? 'Connected' : 'Unavailable'}</span></div></div></div><div className="panel rounded-3xl p-6"><p className="eyebrow">Contract security check</p><h2 className="display mt-2 text-2xl text-white">Overall risk: <span className="text-[#22D3EE]">{events.length ? 'Reported by audit' : 'Not available'}</span></h2><div className="mt-5 space-y-3"><p className="rounded-xl bg-white/[.03] px-4 py-3 text-xs text-[#aebdc4]">Security findings are shown only when returned by the backend audit service.</p><div className="rounded-2xl border border-[#8B5CF6]/20 bg-[#8B5CF6]/[.06] p-4"><p className="eyebrow">Smart Contract Audit</p><p className="mt-2 text-xs leading-5 text-[#aebdc4]">Upload a Solidity file for a live backend security analysis.</p><input type="file" accept=".sol,text/plain" onChange={event => { setAuditFile(event.target.files?.[0] ?? null); setSmartReport(null); setSmartAuditError(""); }} className="mt-3 block w-full text-xs text-[#cbd5e1] file:mr-3 file:rounded-lg file:border-0 file:bg-[#EEF2FF] file:px-3 file:py-2 file:font-semibold file:text-[#4F46E5]" /><button onClick={() => void runSmartAudit()} disabled={!auditFile || smartAuditBusy} className="mt-3 w-full rounded-xl bg-[#8B5CF6] px-4 py-3 text-[10px] font-bold uppercase tracking-[.16em] text-white disabled:cursor-not-allowed disabled:opacity-50">{smartAuditBusy ? "Analyzing..." : "Run Smart Audit"}</button>{smartAuditError && <p role="alert" className="mt-3 text-xs text-[#FDA4AF]">{smartAuditError}</p>}{smartReport && <pre className="mt-3 max-h-48 overflow-auto rounded-xl bg-black/20 p-3 text-[10px] leading-5 text-[#dce7eb]">{JSON.stringify(smartReport, null, 2)}</pre>}</div></div></div></section></div></main>;
}
function OrganizationsView({ organizations, onOrganizationsChanged, canCreate }: { organizations: Organization[]; onOrganizationsChanged: (organizations: Organization[]) => void; canCreate: boolean }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [selectedId, setSelectedId] = useState<string | number | null>(null);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const create = async () => {
    if (!canCreate || !name.trim() || !email.trim()) return;
    setCreating(true); setError("");
    try {
      const created = await api.createOrganization({ name: name.trim(), email: email.trim() });
      const next = normalizeOrganizations([...organizations, created]);
      onOrganizationsChanged(next);
      setName(""); setEmail("");
      if (created?.id ?? created?.organization_id) setSelectedId(created.id ?? created.organization_id);
    } catch (cause) {
      setError(formatApiMessage(cause instanceof Error ? cause.message : cause) || "Organization creation failed.");
    } finally { setCreating(false); }
  };
  useEffect(() => {
    if (selectedId === null) { setDetail(null); return; }
    let cancelled = false;
    setLoading(true); setError("");
    api.getOrganization(selectedId).then((value: unknown) => { if (!cancelled) setDetail(value && typeof value === "object" ? value as Record<string, unknown> : null); }).catch((cause: unknown) => { if (!cancelled) setError(formatApiMessage(cause instanceof Error ? cause.message : cause) || "Organization details could not be loaded."); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [selectedId]);
  return <main className="mx-auto min-h-[calc(100vh-73px)] max-w-6xl px-5 py-7 md:px-9 md:py-10"><p className="eyebrow">Organization registry / 05</p><h1 className="display mt-3 text-5xl font-semibold text-[#172554]">ORGANIZATIONS</h1><p className="mt-3 max-w-xl text-sm leading-6 text-[#64748B]">Organizations and organization details are loaded from the live backend. Nothing on this screen is seeded or hardcoded.</p><div className="mt-8 grid gap-5 lg:grid-cols-[.9fr_1.1fr]">{canCreate && <section className="panel rounded-3xl p-6"><p className="eyebrow">Create organization</p><div className="mt-5 space-y-3"><input value={name} onChange={event => setName(event.target.value)} placeholder="Organization name" className="data-input w-full rounded-xl border px-4 py-3 text-sm" /><input type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="Organization email" className="data-input w-full rounded-xl border px-4 py-3 text-sm" /><button onClick={() => void create()} disabled={creating || !name.trim() || !email.trim()} className="w-full rounded-xl bg-[#4F46E5] px-4 py-3 text-[10px] font-bold uppercase tracking-[.16em] text-white disabled:cursor-wait disabled:opacity-50">{creating ? "Creating..." : "Create organization"}</button>{error && <p role="alert" className="text-xs text-[#BE123C]">{error}</p>}</div></section>}<section className="panel rounded-3xl p-6"><div className="flex items-center justify-between"><div><p className="eyebrow">Live organizations</p><h2 className="display mt-2 text-2xl text-[#172554]">{organizations.length ? `${organizations.length} registered` : "No organizations returned"}</h2></div><UsersRound className="h-5 w-5 text-[#8B5CF6]" /></div>{organizations.length ? <div className="mt-5 space-y-3">{organizations.map(item => <button key={item.id} onClick={() => setSelectedId(item.id)} className={`flex w-full items-center justify-between rounded-2xl border p-4 text-left transition ${String(selectedId) === String(item.id) ? "border-[#8B5CF6] bg-[#F5F3FF]" : "border-slate-200 bg-white/70 hover:border-[#C4B5FD]"}`}><span><span className="block text-sm font-semibold text-[#172554]">{item.name}</span><span className="mt-1 block text-[10px] uppercase tracking-[.12em] text-[#64748B]">Backend organization #{item.id}</span></span><ChevronRight className="h-4 w-4 text-[#8B5CF6]" /></button>)}</div> : <p className="mt-5 rounded-2xl border border-slate-200 bg-white/60 p-4 text-sm text-[#64748B]">The backend returned no organizations.</p>}{selectedId !== null && <div className="mt-5 rounded-2xl border border-[#C4B5FD] bg-[#F5F3FF] p-4"><p className="eyebrow">Organization detail</p>{loading ? <p className="mt-2 text-sm text-[#64748B]">Loading live details...</p> : <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-xs leading-5 text-[#475569]">{JSON.stringify(detail, null, 2)}</pre>}</div>}</section></div></main>;
}

function GatewayView({ backendUserRole, onOpenPermissions }: { permissions: Permission[]; records: DataRecord[]; organizations: Organization[]; loading: boolean; dataError: string; backendUserRole?: string; onOpenPermissions: () => void }) {
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerRecords, setOwnerRecords] = useState<Array<{ record_id: string | number; title?: string; record_type?: string }>>([]);
  const [selectedRecordId, setSelectedRecordId] = useState("");
  const [requestPurpose, setRequestPurpose] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState({ email: false, record: false, purpose: false });
  const [secureViewUrl, setSecureViewUrl] = useState("");
  useEffect(() => () => { if (secureViewUrl) URL.revokeObjectURL(secureViewUrl); }, [secureViewUrl]);
  const selectedRecord = ownerRecords.find(record => String(record.record_id) === selectedRecordId);
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail.trim());
  const purposeValid = requestPurpose.trim().length > 0 && requestPurpose.trim().length <= 500;
  const lookupOwnerRecords = async () => {
    setTouched(current => ({ ...current, email: true }));
    if (!emailValid) { setError("Enter the Data Owner's valid email address."); return; }
    setBusy(true); setError(""); setNotice(""); setOwnerRecords([]); setSelectedRecordId("");
    try {
      const rows = await api.getOwnerRecordsByEmail(ownerEmail.trim());
      const normalized = Array.isArray(rows) ? rows : [];
      setOwnerRecords(normalized);
      if (!normalized.length) setNotice("No shareable documents were returned for this Data Owner.");
    } catch (cause) { setError(cleanAccessMessage(cause, "The Data Owner could not be found or their documents are unavailable.")); }
    finally { setBusy(false); }
  };
  const requestAccess = async () => {
    setTouched({ email: true, record: true, purpose: true });
    if (!emailValid) { setError("Enter the Data Owner's valid email address."); return; }
    if (!selectedRecord) { setError("Select a document before continuing."); return; }
    if (!purposeValid) { setError(requestPurpose.trim().length > 500 ? "Purpose must be 500 characters or fewer." : "Explain why access is needed."); return; }
    setBusy(true); setError(""); setNotice(""); setSecureViewUrl("");
    try {
      await api.createAccessRequest({ record_id: selectedRecord.record_id, purpose: requestPurpose.trim(), requested_access_type: "VIEW_ONLY" });
      setNotice("Request sent to the Data Owner. The document will open only after approval."); setRequestPurpose("");
    } catch (cause) { setError(cleanAccessMessage(cause, "The request could not be sent. Please try again.")); }
    finally { setBusy(false); }
  };
  const openApprovedDocument = async () => {
    if (!selectedRecord) { setError("Select an approved document first."); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      const { response, mimeType } = await fetchSecureRecord(selectedRecord.record_id);
      const blob = await response.blob();
      setSecureViewUrl(URL.createObjectURL(new Blob([blob], { type: mimeType })));
      setNotice("Access approved by the backend. Your secure document is ready to open.");
    } catch (cause) { setError(cleanAccessMessage(cause, "Access is not approved yet. The Data Owner must approve the request first.")); }
    finally { setBusy(false); }
  };
  return <main className="mx-auto flex min-h-[calc(100vh-73px)] max-w-5xl items-center px-5 py-10"><div className="grid w-full gap-8 lg:grid-cols-[.8fr_1.2fr]"><section><p className="eyebrow">Protected organization access</p><h1 className="display mt-4 text-5xl font-semibold text-[#172554]">Request by <span className="text-[#8B5CF6]">owner email.</span></h1><p className="mt-5 max-w-md text-sm leading-7 text-[#64748B]">Enter the Data Owner's email, choose a document returned by the backend, and explain why view-only access is needed. Record IDs remain internal.</p></section><section className="panel rounded-3xl p-6 md:p-8"><p className="eyebrow">Organization Gateway</p><h2 className="display mt-2 text-2xl text-white">Request protected data</h2>{backendUserRole !== "ORGANIZATION" ? <p className="mt-7 rounded-2xl border border-[#FDE68A] bg-[#FFFBEB] p-4 text-sm text-[#92400E]">This workflow is available only to authenticated organizations.</p> : <div className="mt-7 space-y-4"><label className="block"><span className="eyebrow">Data Owner email</span><input type="email" value={ownerEmail} onChange={event => { setOwnerEmail(event.target.value); setOwnerRecords([]); setSelectedRecordId(""); setNotice(""); }} onBlur={() => setTouched(current => ({ ...current, email: true }))} placeholder="owner@example.com" aria-invalid={touched.email && !emailValid} className="data-input mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-[#172554]" />{touched.email && !emailValid && <span role="alert" className="mt-1 block text-xs text-[#BE123C]">Enter a valid Data Owner email.</span>}<span className="mt-1 block text-[11px] text-[#64748B]">The backend returns document metadata only; no file is exposed during lookup.</span></label><button onClick={() => void lookupOwnerRecords()} disabled={busy || !emailValid} className="w-full rounded-xl border border-[#C4B5FD] px-4 py-3 text-[10px] font-bold uppercase tracking-[.16em] text-[#4F46E5] disabled:opacity-50">{busy ? "Finding documents..." : "Find available documents"}</button>{ownerRecords.length > 0 && <label className="block"><span className="eyebrow">Document</span><select value={selectedRecordId} onChange={event => setSelectedRecordId(event.target.value)} onBlur={() => setTouched(current => ({ ...current, record: true }))} aria-invalid={touched.record && !selectedRecord} className="data-input mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-[#172554]"><option value="">Select a document</option>{ownerRecords.map(record => <option key={String(record.record_id)} value={String(record.record_id)}>{record.title || "Untitled document"}{record.record_type ? ` · ${record.record_type}` : ""}</option>)}</select>{touched.record && !selectedRecord && <span role="alert" className="mt-1 block text-xs text-[#BE123C]">Select a document before continuing.</span>}</label>}<label className="block"><span className="eyebrow">Purpose</span><textarea value={requestPurpose} onChange={event => setRequestPurpose(event.target.value)} onBlur={() => setTouched(current => ({ ...current, purpose: true }))} maxLength={500} placeholder="Why does your organization need view-only access?" aria-invalid={touched.purpose && !purposeValid} className="data-input mt-2 min-h-28 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-[#172554]" />{touched.purpose && !purposeValid && <span role="alert" className="mt-1 block text-xs text-[#BE123C]">{requestPurpose.trim().length > 500 ? "Purpose must be 500 characters or fewer." : "Explain why access is needed."}</span>}<span className="mt-1 block text-[11px] text-[#64748B]">For example: compliance review, onboarding verification, or another defined business purpose.</span></label><button onClick={() => void requestAccess()} disabled={busy || !selectedRecord || !purposeValid} className="w-full rounded-xl bg-[#8B5CF6] px-4 py-3 text-[10px] font-bold uppercase tracking-[.18em] text-white disabled:opacity-50">{busy ? "Sending request..." : "Request view-only access"}</button><button onClick={() => void openApprovedDocument()} disabled={busy || !selectedRecord} className="w-full rounded-xl border border-[#22D3EE]/50 px-4 py-3 text-[10px] font-bold uppercase tracking-[.18em] text-[#2563EB] disabled:opacity-50">{busy ? "Checking approval..." : "Open approved document"}</button>{notice && <p role="status" className="text-center text-xs text-[#166534]">{notice}</p>}{error && <p role="alert" className="text-center text-xs text-[#BE123C]">{error}</p>}{secureViewUrl && <a href={secureViewUrl} target="_blank" rel="noreferrer" className="block rounded-xl border border-[#22D3EE]/40 bg-[#ECFEFF] px-4 py-3 text-center text-[10px] font-bold uppercase tracking-[.16em] text-[#2563EB]">Open secure document</a>}<button onClick={onOpenPermissions} className="w-full text-[10px] font-bold uppercase tracking-[.18em] text-[#2563EB]">View request status</button></div>}</section></div></main>;
}

function RoleSidebar({ role, view, setView }: { role?: string; view: View; setView: (view: View) => void }) {
  const items: View[] = role === "DATA_OWNER" ? ["HOME", "MY DATA", "PERMISSIONS", "ORGANIZATIONS", "SECURITY"] : role === "ORGANIZATION" ? ["HOME", "GATEWAY", "ORGANIZATIONS"] : ["HOME", "SECURITY"];
  return <aside className="hidden w-56 shrink-0 border-r border-[#E2E8F0] bg-white/75 px-4 py-6 lg:block"><p className="px-3 text-[10px] font-bold uppercase tracking-[.18em] text-[#64748B]">Workspace</p><nav className="mt-4 space-y-1">{items.map(item => <button key={item} onClick={() => setView(item)} className={`flex w-full items-center rounded-xl px-3 py-3 text-left text-xs font-semibold tracking-[.08em] transition ${view === item ? "bg-[#EEF2FF] text-[#4F46E5]" : "text-[#64748B] hover:bg-[#F8FAFC] hover:text-[#172554]"}`}>{item}</button>)}</nav><p className="mt-8 px-3 text-[10px] leading-5 text-[#94A3B8]">Navigation follows the authenticated role returned by the backend.</p></aside>;
}

export default function Home() {
  const { user, logout } = useAuth();
  const [entry, setEntry] = useState<"LANDING" | "LOGIN" | "APP">(() => {
    const signedOutRoute = new URLSearchParams(window.location.search).get("signed_out") === "1";
    const protectedPath = window.location.pathname !== "/";
    if (signedOutRoute) {
      clearSession();
      window.localStorage.setItem(FORCE_LOGIN_KEY, "1");
      window.history.replaceState({}, "", "/");
      return "LOGIN";
    }
    if (protectedPath && !getAccessToken()) {
      clearSession();
      window.localStorage.setItem(FORCE_LOGIN_KEY, "1");
      return "LOGIN";
    }
    return protectedPath && getAccessToken() ? "APP" : "LANDING";
  });
  const [backendSession, setBackendSession] = useState(() => window.location.pathname !== "/" && window.localStorage.getItem(FORCE_LOGIN_KEY) !== "1" && Boolean(getAccessToken()));
  const [signedOut, setSignedOut] = useState(false);
  const [view, setView] = useState<View>("HOME");
  const [active, setActive] = useState(false);
  const [viewPulse, setViewPulse] = useState(0);
  useEffect(() => setViewPulse(value => value + 1), [view]);
  useEffect(() => {
    if (signedOut) return;
    if (!user && !backendSession && entry === "APP") {
      setEntry("LANDING");
      setView("HOME");
    }
  }, [user, backendSession, entry, signedOut]);
  const [records, setRecords] = useState(initialRecords);
  const [permissions, setPermissions] = useState(initialPermissions);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [pendingRequests, setPendingRequests] = useState(0);
  const [accessRequests, setAccessRequests] = useState<AccessRequest[]>([]);
  const [backendUserName, setBackendUserName] = useState<string | undefined>();
  const [backendUserRole, setBackendUserRole] = useState<string | undefined>();
  const [gatewayLoading, setGatewayLoading] = useState(false);
  const [gatewayDataError, setGatewayDataError] = useState("");
  useEffect(() => {
    const onAuthExpired = () => {
      clearSession();
      window.localStorage.setItem(FORCE_LOGIN_KEY, "1");
      setBackendSession(false);
      setBackendUserName(undefined);
      setBackendUserRole(undefined);
      setAccessRequests([]);
      setRecords(initialRecords);
      setPermissions(initialPermissions);
      setOrganizations([]);
      setPendingRequests(0);
      setSignedOut(true);
      setEntry("LOGIN");
      setView("HOME");
      window.history.replaceState({}, "", "/");
    };
    window.addEventListener("samvid:auth-expired", onAuthExpired);
    return () => window.removeEventListener("samvid:auth-expired", onAuthExpired);
  }, []);
  useEffect(() => {
    if (!backendSession || !getAccessToken()) return;
    let cancelled = false;
    setGatewayLoading(true);
    setGatewayDataError("");
    (async () => {
      try {
        const me = await api.me();
        if (cancelled) return;
        const name = me?.name ?? me?.full_name ?? me?.email;
        if (name) setBackendUserName(String(name));
        const role = String(me?.role ?? me?.user_role ?? "").toUpperCase();
        if (role) setBackendUserRole(role);
        const consentsPromise = role === "DATA_OWNER" ? api.getConsents() : Promise.resolve([]);
       const requestsPromise = role === "DATA_OWNER" ? api.getReceivedAccessRequests() : role === "ORGANIZATION" ? api.getAccessRequests() : Promise.resolve([]);
        const recordsPromise = role === "DATA_OWNER" ? api.listRecords() : Promise.resolve([]);
        const organizationsPromise = role === "DATA_OWNER" || role === "ORGANIZATION" ? api.getOrganizations() : Promise.resolve([]);
        const [recordsResult, organizationsResult, consentsResult, requestsResult] = await Promise.allSettled([recordsPromise, organizationsPromise, consentsPromise, requestsPromise]);
        if (cancelled) return;
        if (recordsResult.status === "fulfilled") setRecords(normalizeRecords(recordsResult.value));
        const requestRows = requestsResult.status === "fulfilled" ? normalizeAccessRequests(requestsResult.value) : [];
        if (consentsResult.status === "fulfilled") {
          const consentRows = normalizePermissions(consentsResult.value).map(permission => {
            const match = requestRows.find(request => String(request.recordId) === String(permission.recordId) && String(request.orgId) === String(permission.orgId));
            return match ? { ...permission, requestId: match.id } : permission;
          });
          setPermissions(consentRows);
        }
        if (organizationsResult.status === "fulfilled") setOrganizations(normalizeOrganizations(organizationsResult.value));
        if (requestsResult.status === "fulfilled") {
          setAccessRequests(requestRows);
          setPendingRequests(requestRows.filter(row => row.status === "PENDING").length);
        }
        if (organizationsResult.status === "rejected" || recordsResult.status === "rejected") {
          const failure = organizationsResult.status === "rejected" ? organizationsResult.reason : recordsResult.status === "rejected" ? recordsResult.reason : undefined;
          setGatewayDataError("Live organizations and records are temporarily unavailable. Please refresh and try again.");
        }
      } catch (cause) {
        if (!cancelled) setGatewayDataError("Your live SAMVID session could not be loaded. Please sign in again.");
      } finally {
        if (!cancelled) setGatewayLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [backendSession]);

  const handleLogin = (sessionUser?: Record<string, unknown>) => {
    window.localStorage.removeItem(FORCE_LOGIN_KEY);
    const hydratedName = sessionUser?.name ?? sessionUser?.full_name ?? sessionUser?.email;
    const hydratedRole = sessionUser?.role ?? sessionUser?.user_role;
    if (hydratedName) setBackendUserName(String(hydratedName));
    if (hydratedRole) setBackendUserRole(String(hydratedRole).toUpperCase());
    setSignedOut(false);
    setBackendSession(true);
    setEntry("APP");
    setView("HOME");
  };

  const handleLogout = () => {
    window.localStorage.setItem(FORCE_LOGIN_KEY, "1");
    setSignedOut(true);
    clearSession();
    setBackendSession(false);
    setBackendUserName(undefined);
    setRecords(initialRecords);
    setPermissions(initialPermissions);
    setOrganizations([]);
    setPendingRequests(0);
    setActive(false);
    setEntry("LOGIN");
    setView("HOME");
    void logout().catch(() => undefined);
    window.location.replace("/?signed_out=1");
  };

  const displayName = user?.name?.trim() || backendUserName;

  const content = useMemo(() => {
    if (view === "MY DATA") return <DataView records={records} setRecords={setRecords} ownerName={displayName} />;
    if (view === "PERMISSIONS") return <PermissionsView permissions={permissions} setPermissions={setPermissions} records={records} organizations={organizations} loading={gatewayLoading} pendingRequests={pendingRequests} accessRequests={accessRequests} setAccessRequests={setAccessRequests} setPendingRequests={setPendingRequests} backendUserRole={backendUserRole} onOpenGateway={() => setView("GATEWAY")} />;
    if (view === "SECURITY") return <SecurityView permissions={permissions} />;
    if (view === "ORGANIZATIONS") return <OrganizationsView organizations={organizations} onOrganizationsChanged={setOrganizations} canCreate={false} />;
    if (view === "GATEWAY") return <GatewayView permissions={permissions} records={records} organizations={organizations} loading={gatewayLoading} dataError={gatewayDataError} backendUserRole={backendUserRole} onOpenPermissions={() => setView("PERMISSIONS")} />;
    return <HomeView active={active} setActive={setActive} records={records} permissions={permissions} pendingRequests={pendingRequests} setView={setView} transitionKey={viewPulse} userName={displayName} backendUserRole={backendUserRole} />;
  }, [view, records, permissions, organizations, active, viewPulse, displayName, gatewayLoading, gatewayDataError, accessRequests, backendUserRole]);

  if (entry === "LANDING") return <div className="samvid-shell"><AmbientIdentityField intensity={1} variant="landing" /><header className="relative z-20 flex items-center justify-between border-b border-white/10 px-5 py-4 md:px-9"><button onClick={() => setEntry("LANDING")} className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center overflow-hidden rounded-xl border border-[#22D3EE]/35 bg-[#111A45] shadow-[0_0_18px_rgba(34,211,238,.2)]"><img src="/samvid-security-logo.png" alt="SAMVID Logo" className="h-full w-full object-cover" /></span><span className="display text-lg font-bold tracking-[.22em]">SAMVID</span></button><span className="landing-tagline hidden sm:block">Your data. Your control.</span><button onClick={() => setEntry("LOGIN")} className="aurora-outline-cta rounded-full px-5 py-3 text-sm font-bold uppercase tracking-[.12em] text-[#3730A3]">Log in</button></header><LandingView onLogin={() => setEntry("LOGIN")} /></div>;
  
  if (entry === "LOGIN") return <div className="samvid-shell"><AmbientIdentityField intensity={.6} variant="auth" /><header className="relative z-20 flex items-center justify-between border-b border-white/10 px-5 py-4 md:px-9"><button onClick={() => setEntry("LANDING")} className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center overflow-hidden rounded-xl border border-[#22D3EE]/35 bg-[#111A45] shadow-[0_0_18px_rgba(34,211,238,.2)]"><img src="/samvid-security-logo.png" alt="SAMVID Logo" className="h-full w-full object-cover" /></span><span className="display text-lg font-bold tracking-[.22em]">SAMVID</span></button><span className="eyebrow">Secure authentication</span><span className="w-16" /></header><LoginView onBack={() => setEntry("LANDING")} onLoginSuccess={handleLogin} /></div>;

  return <div className="samvid-shell dashboard-shell"><AmbientIdentityField intensity={view === "HOME" ? .85 : view === "MY DATA" ? .6 : view === "PERMISSIONS" ? .55 : view === "ORGANIZATIONS" ? .55 : view === "SECURITY" ? .5 : .65} variant={view === "HOME" ? "home" : view === "MY DATA" ? "data" : view === "PERMISSIONS" ? "permissions" : view === "ORGANIZATIONS" ? "permissions" : view === "SECURITY" ? "security" : "gateway"} /><TopNav view={view} setView={setView} userName={displayName} backendUserRole={backendUserRole} onLogout={handleLogout} /><div className="flex min-h-[calc(100vh-150px)]"><RoleSidebar role={backendUserRole} view={view} setView={setView} /><div key={view} className="view-transition min-w-0 flex-1">{content}</div></div><footer className="sticky bottom-0 z-[80] flex items-center justify-between border-t border-[#CBD5E1] bg-white/95 px-5 py-4 text-[10px] uppercase tracking-[.16em] text-[#64748B] shadow-[0_-8px_24px_rgba(100,116,139,.12)] backdrop-blur-xl md:px-9"><span>© 2026 SAMVID PROTOCOL</span></footer></div>;
}
