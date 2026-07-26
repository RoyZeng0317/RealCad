import { useCallback, useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useCircuitStore } from '../../stores/circuitStore.js';
import { ComponentMesh } from './ComponentMesh.js';
import { WireRenderer } from './WireRenderer.js';
import { BreadboardMesh } from './BreadboardMesh.js';
import { snapToHole, BOARD_TOP } from './breadboardLayout.js';

export function Breadboard3D() {
  const { project, selectedTool, placingComponentType, setPlacingComponentType, addComponent } = useCircuitStore();
  const { gl, camera } = useThree();
  const raycaster = useRef(new THREE.Raycaster());
  const mouse = useRef(new THREE.Vector2());

  useEffect(() => {
    const canvas = gl.domElement;

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      const type = e.dataTransfer?.getData('componentType') as any;
      if (type) {
        const rect = canvas.getBoundingClientRect();
        mouse.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.current.setFromCamera(mouse.current, camera);
        const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -BOARD_TOP);
        const point = new THREE.Vector3();
        const ray = raycaster.current.ray;
        const intersect = ray.intersectPlane(groundPlane, point);
        if (intersect) {
          const snapped = snapToHole(point.x, point.z);
          if (snapped) {
            addComponent(type, { x: snapped.x, y: BOARD_TOP + 0.18, z: snapped.z });
          }
        }
      }
    };

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
    };

    canvas.addEventListener('drop', handleDrop);
    canvas.addEventListener('dragover', handleDragOver);

    return () => {
      canvas.removeEventListener('drop', handleDrop);
      canvas.removeEventListener('dragover', handleDragOver);
    };
  }, [gl, addComponent]);

  const handleClick = useCallback((e: any) => {
    if (selectedTool === 'component' && placingComponentType && e.point) {
      const snapped = snapToHole(e.point.x, e.point.z);
      if (snapped) {
        addComponent(placingComponentType, { x: snapped.x, y: BOARD_TOP + 0.18, z: snapped.z });
        setPlacingComponentType(null);
      }
    }
  }, [selectedTool, placingComponentType, addComponent, setPlacingComponentType]);

  return (
    <group>
      <BreadboardMesh />
      {project.components.map((comp) => (
        <ComponentMesh key={comp.id} component={comp} />
      ))}
      {project.wires.map((wire) => (
        <WireRenderer key={wire.id} wire={wire} />
      ))}
      {/* Horizontal invisible plane for click-to-place, aligned to board surface */}
      <mesh onClick={handleClick} position={[0, BOARD_TOP, 0]} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <planeGeometry args={[30, 30]} />
        <meshBasicMaterial side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}
