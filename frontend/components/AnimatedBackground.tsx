"use client";

import { useRef, useMemo, useEffect } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { motion } from "framer-motion";
import * as THREE from "three";

// ── Neural Globe ──────────────────────────────────────────────────────────────
function NeuralGlobe() {
  const groupRef = useRef<THREE.Group>(null);

  const { lineSegs, pointCloud } = useMemo(() => {
    const COUNT = 180;
    const RADIUS = 2.1;
    const nodePos = new Float32Array(COUNT * 3);
    const nodeCol = new Float32Array(COUNT * 3);
    const vecs: THREE.Vector3[] = [];
    const goldenAngle = Math.PI * (Math.sqrt(5) - 1);

    for (let i = 0; i < COUNT; i++) {
      const y = 1 - (i / (COUNT - 1)) * 2;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = goldenAngle * i;
      const x = Math.cos(theta) * r * RADIUS;
      const yy = y * RADIUS;
      const z = Math.sin(theta) * r * RADIUS;
      nodePos[i * 3] = x;  nodePos[i * 3 + 1] = yy;  nodePos[i * 3 + 2] = z;
      vecs.push(new THREE.Vector3(x, yy, z));
      const t = i / (COUNT - 1);
      nodeCol[i * 3]     = 0.96 - t * 0.30;   // rose (0.96) → violet (0.66)
      nodeCol[i * 3 + 1] = 0.25 - t * 0.08;   // stays low — no green channel
      nodeCol[i * 3 + 2] = 0.37 + t * 0.60;   // rose (0.37) → violet (0.97)
    }

    const lineVerts: number[] = [];
    for (let i = 0; i < COUNT; i++)
      for (let j = i + 1; j < COUNT; j++)
        if (vecs[i].distanceTo(vecs[j]) < 1.22)
          lineVerts.push(vecs[i].x, vecs[i].y, vecs[i].z, vecs[j].x, vecs[j].y, vecs[j].z);

    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(lineVerts), 3));
    const lineSegs = new THREE.LineSegments(lineGeo,
      new THREE.LineBasicMaterial({ color: new THREE.Color(0.80, 0.15, 0.45), transparent: true, opacity: 0.14 }));

    const nodeGeo = new THREE.BufferGeometry();
    nodeGeo.setAttribute("position", new THREE.BufferAttribute(nodePos, 3));
    nodeGeo.setAttribute("color",    new THREE.BufferAttribute(nodeCol, 3));
    const pointCloud = new THREE.Points(nodeGeo,
      new THREE.PointsMaterial({ size: 0.055, vertexColors: true, transparent: true, opacity: 0.88, sizeAttenuation: true }));

    return { lineSegs, pointCloud };
  }, []);

  useEffect(() => () => {
    lineSegs.geometry.dispose();  (lineSegs.material as THREE.Material).dispose();
    pointCloud.geometry.dispose(); (pointCloud.material as THREE.Material).dispose();
  }, [lineSegs, pointCloud]);

  useFrame(({ clock, mouse }) => {
    if (!groupRef.current) return;
    const t = clock.elapsedTime;
    groupRef.current.rotation.y = t * 0.07;
    groupRef.current.rotation.x = Math.sin(t * 0.05) * 0.22 - mouse.y * 0.07;
    groupRef.current.rotation.z = Math.cos(t * 0.04) * 0.08 + mouse.x * 0.04;
    // Breathing scale
    groupRef.current.scale.setScalar(1 + Math.sin(t * 0.9) * 0.018);
  });

  return (
    <group ref={groupRef}>
      <primitive object={lineSegs} />
      <primitive object={pointCloud} />
    </group>
  );
}

// ── Star field ────────────────────────────────────────────────────────────────
function StarField() {
  const groupRef = useRef<THREE.Group>(null);

  const stars = useMemo(() => {
    const COUNT = 550;
    const pos = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      const theta = Math.random() * 2 * Math.PI;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 6 + Math.random() * 4.5;
      pos[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = r * Math.cos(phi);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return new THREE.Points(geo,
      new THREE.PointsMaterial({ size: 0.022, color: new THREE.Color(0.96, 0.60, 0.80), transparent: true, opacity: 0.38, sizeAttenuation: true }));
  }, []);

  useEffect(() => () => {
    stars.geometry.dispose(); (stars.material as THREE.Material).dispose();
  }, [stars]);

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    groupRef.current.rotation.y = clock.elapsedTime * 0.009;
    groupRef.current.rotation.x = clock.elapsedTime * 0.005;
  });

  return <group ref={groupRef}><primitive object={stars} /></group>;
}

// ── Shooting Stars ────────────────────────────────────────────────────────────
// Pre-allocated pool of line objects that streak across the scene periodically.
const POOL_SIZE = 6;

function ShootingStars() {
  const groupRef = useRef<THREE.Group>(null);

  type StarSlot = {
    line: THREE.Line;
    active: boolean;
    life: number;
    maxLife: number;
    vel: THREE.Vector3;
  };

  const pool = useMemo<StarSlot[]>(() => {
    return Array.from({ length: POOL_SIZE }, () => {
      const positions = new Float32Array(6);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      const mat = new THREE.LineBasicMaterial({
        color: new THREE.Color(0.98, 0.75, 0.40),
        transparent: true,
        opacity: 0,
      });
      return { line: new THREE.Line(geo, mat), active: false, life: 0, maxLife: 1.5, vel: new THREE.Vector3() };
    });
  }, []);

  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    for (const s of pool) group.add(s.line);
    return () => {
      for (const s of pool) { s.line.geometry.dispose(); (s.line.material as THREE.Material).dispose(); }
    };
  }, [pool]);

  const nextSpawnAt = useRef(4);

  useFrame(({ clock }, delta) => {
    const t = clock.elapsedTime;

    if (t > nextSpawnAt.current) {
      const idle = pool.find(s => !s.active);
      if (idle) {
        nextSpawnAt.current = t + 1.8 + Math.random() * 3.5;
        const elev = (Math.random() - 0.5) * 1.1;
        const azim = Math.random() * Math.PI * 2;
        const r = 7.5;
        const sx = Math.cos(elev) * Math.cos(azim) * r;
        const sy = Math.sin(elev) * r;
        const sz = Math.cos(elev) * Math.sin(azim) * r;

        const dir = new THREE.Vector3(-sx, -sy + (Math.random() - 0.5) * 1.5, -sz)
          .normalize().multiplyScalar(0.20 + Math.random() * 0.14);
        idle.vel.copy(dir);
        idle.life = 0;
        idle.maxLife = 0.9 + Math.random() * 0.9;
        idle.active = true;
        idle.line.position.set(sx, sy, sz);

        // Trail points in local space (behind the direction of travel)
        const pos = idle.line.geometry.attributes.position.array as Float32Array;
        const trailLen = 1.0 + Math.random() * 0.8;
        const back = dir.clone().normalize().multiplyScalar(-trailLen);
        pos[0] = 0; pos[1] = 0; pos[2] = 0;
        pos[3] = back.x; pos[4] = back.y; pos[5] = back.z;
        idle.line.geometry.attributes.position.needsUpdate = true;
      }
    }

    for (const s of pool) {
      if (!s.active) continue;
      s.life += delta;
      const p = s.life / s.maxLife;
      if (p >= 1) {
        s.active = false;
        (s.line.material as THREE.LineBasicMaterial).opacity = 0;
        continue;
      }
      s.line.position.add(s.vel);
      const opacity = p < 0.2 ? (p / 0.2) : Math.max(0, 1 - (p - 0.2) / 0.8);
      (s.line.material as THREE.LineBasicMaterial).opacity = opacity * 0.78;
    }
  });

  return <group ref={groupRef} />;
}

// ── Energy Rings ──────────────────────────────────────────────────────────────
// 3 concentric rings that expand outward from the globe and fade.
function EnergyRings() {
  const groupRef = useRef<THREE.Group>(null);

  const rings = useMemo(() => {
    return Array.from({ length: 3 }, (_, i) => {
      const geo = new THREE.RingGeometry(1, 1.035, 72);
      const mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(0.92, 0.15, 0.40),
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
      });
      return { mesh: new THREE.Mesh(geo, mat), phase: i / 3 };
    });
  }, []);

  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    for (const r of rings) group.add(r.mesh);
    return () => {
      for (const r of rings) { r.mesh.geometry.dispose(); (r.mesh.material as THREE.Material).dispose(); }
    };
  }, [rings]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    for (const ring of rings) {
      const p = ((t * 0.22 + ring.phase) % 1);
      const scale = 1.2 + p * 4.2;
      ring.mesh.scale.setScalar(scale);
      const opacity = p < 0.15 ? (p / 0.15) * 0.28 : (1 - p) * 0.28;
      (ring.mesh.material as THREE.MeshBasicMaterial).opacity = opacity;
      ring.mesh.rotation.x = Math.PI * 0.5 + Math.sin(t * 0.12 + ring.phase * 6) * 0.35;
      ring.mesh.rotation.z = t * 0.04 + ring.phase * 2.1;
    }
  });

  return <group ref={groupRef} />;
}

// ── Aurora orb (Framer Motion) ────────────────────────────────────────────────
type OrbProps = {
  style: React.CSSProperties;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  animate: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transition: Record<string, any>;
};

function AuroraOrb({ style, animate, transition }: OrbProps) {
  return (
    <motion.div
      className="aurora-orb"
      animate={animate}
      transition={transition}
      style={style}
    />
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export function AnimatedBackground() {
  return (
    <>
      {/* Three.js scene */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 2.5, ease: "easeOut" }}
        style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }}
      >
        <Canvas
          camera={{ position: [0, 0, 5.5], fov: 60 }}
          gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
          style={{ background: "transparent" }}
          dpr={[1, 1.5]}
        >
          <fog attach="fog" args={["#0c0510", 9, 20]} />
          <NeuralGlobe />
          <StarField />
          <ShootingStars />
          <EnergyRings />
        </Canvas>
      </motion.div>

      {/* CSS / Framer Motion overlay */}
      <div
        style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none", overflow: "hidden" }}
        aria-hidden="true"
      >
        {/* Orb 1 — rose, top-left */}
        <AuroraOrb
          animate={{ x: ["0%", "7%", "-5%", "0%"], y: ["0%", "-5%", "7%", "0%"], scale: [1, 1.09, 0.94, 1] }}
          transition={{ duration: 24, ease: "easeInOut", repeat: Infinity, repeatType: "mirror" }}
          style={{
            width: "clamp(380px, 55vw, 900px)", height: "clamp(380px, 55vw, 900px)",
            top: "-15%", left: "-10%",
            background: "radial-gradient(circle, rgba(244,63,94,0.38) 0%, rgba(190,18,60,0.14) 50%, transparent 70%)",
            zIndex: 1,
          }}
        />

        {/* Orb 2 — violet, top-right */}
        <AuroraOrb
          animate={{ x: ["0%", "-9%", "5%", "0%"], y: ["0%", "6%", "-4%", "0%"], scale: [1, 1.11, 0.91, 1] }}
          transition={{ duration: 30, ease: "easeInOut", repeat: Infinity, repeatType: "mirror" }}
          style={{
            width: "clamp(320px, 45vw, 700px)", height: "clamp(320px, 45vw, 700px)",
            top: "-5%", right: "-8%",
            background: "radial-gradient(circle, rgba(168,85,247,0.26) 0%, rgba(126,34,206,0.10) 50%, transparent 70%)",
            zIndex: 1,
          }}
        />

        {/* Orb 3 — deep rose, bottom-center */}
        <AuroraOrb
          animate={{ x: ["0%", "5%", "-3%", "0%"], y: ["0%", "-9%", "4%", "0%"], scale: [1, 1.07, 0.96, 1] }}
          transition={{ duration: 34, ease: "easeInOut", repeat: Infinity, repeatType: "mirror" }}
          style={{
            width: "clamp(300px, 50vw, 800px)", height: "clamp(300px, 50vw, 800px)",
            bottom: "-20%", left: "20%",
            background: "radial-gradient(circle, rgba(159,18,57,0.28) 0%, rgba(244,63,94,0.08) 50%, transparent 70%)",
            zIndex: 1,
          }}
        />

        {/* Orb 4 — amber, bottom-right */}
        <AuroraOrb
          animate={{ x: ["0%", "-6%", "4%", "0%"], y: ["0%", "-6%", "5%", "0%"], scale: [1, 1.13, 0.92, 1] }}
          transition={{ duration: 26, ease: "easeInOut", repeat: Infinity, repeatType: "mirror" }}
          style={{
            width: "clamp(220px, 30vw, 500px)", height: "clamp(220px, 30vw, 500px)",
            bottom: "10%", right: "5%",
            background: "radial-gradient(circle, rgba(251,146,60,0.20) 0%, rgba(194,65,12,0.07) 50%, transparent 70%)",
            zIndex: 1,
          }}
        />

        {/* Orb 5 — large central breathing glow */}
        <AuroraOrb
          animate={{ opacity: [0.55, 0.90, 0.55], scale: [1, 1.18, 1] }}
          transition={{ duration: 7, ease: "easeInOut", repeat: Infinity }}
          style={{
            width: "clamp(500px, 65vw, 1100px)", height: "clamp(500px, 65vw, 1100px)",
            top: "50%", left: "50%",
            marginTop: "clamp(-250px, -32.5vw, -550px)",
            marginLeft: "clamp(-250px, -32.5vw, -550px)",
            background: "radial-gradient(circle, rgba(159,18,57,0.12) 0%, rgba(168,85,247,0.05) 45%, transparent 70%)",
            filter: "blur(120px)",
            zIndex: 1,
          }}
        />

        {/* Subtle grid */}
        <div style={{
          position: "absolute", inset: 0, zIndex: 2,
          backgroundImage:
            "linear-gradient(rgba(244,63,94,0.030) 1px, transparent 1px), " +
            "linear-gradient(90deg, rgba(244,63,94,0.030) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
        }} />

        {/* Radial vignette */}
        <div style={{
          position: "absolute", inset: 0, zIndex: 3,
          background: "radial-gradient(ellipse at 50% 50%, transparent 28%, rgba(12,5,16,0.62) 100%)",
        }} />

        {/* Film grain */}
        <div style={{
          position: "absolute", inset: 0, zIndex: 4,
          backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E\")",
          backgroundRepeat: "repeat",
          backgroundSize: "180px 180px",
          opacity: 0.03,
          mixBlendMode: "overlay",
        }} />
      </div>
    </>
  );
}
