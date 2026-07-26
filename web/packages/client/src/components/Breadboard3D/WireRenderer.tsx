import { useMemo } from 'react';
import * as THREE from 'three';
import type { Wire } from '@circuit-lab/shared';
import { useCircuitStore } from '../../stores/circuitStore.js';

export function WireRenderer({ wire }: { wire: Wire }) {
  const { project } = useCircuitStore();

  const fromComp = project.components.find((c) => c.id === wire.from.componentId);
  const toComp = project.components.find((c) => c.id === wire.to.componentId);

  const points = useMemo(() => {
    if (!fromComp || !toComp) return null;
    const fromPos = new THREE.Vector3(
      fromComp.position.x,
      fromComp.position.y + 0.3,
      fromComp.position.z
    );
    const toPos = new THREE.Vector3(
      toComp.position.x,
      toComp.position.y + 0.3,
      toComp.position.z
    );
    const mid = new THREE.Vector3().addVectors(fromPos, toPos).multiplyScalar(0.5);
    mid.y += 0.5;
    const curve = new THREE.QuadraticBezierCurve3(fromPos, mid, toPos);
    return curve.getPoints(16);
  }, [fromComp, toComp]);

  if (!points) return null;

  return (
    <mesh>
      <tubeGeometry args={[
        new THREE.CatmullRomCurve3(points),
        12,
        0.015,
        8,
        false,
      ]} />
      <meshStandardMaterial color="#4488cc" roughness={0.3} metalness={0.5} transparent opacity={0.85} />
    </mesh>
  );
}
