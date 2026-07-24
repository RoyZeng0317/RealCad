import { useEffect, useRef, useCallback, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, ContactShadows, PerspectiveCamera, OrthographicCamera } from '@react-three/drei';
import * as THREE from 'three';
import { useCircuitStore } from '../stores/circuitStore.js';
import { connectSocket, joinProject } from '../services/socket.js';
import { ComponentPanel } from '../components/Panel/ComponentPanel.js';
import { Breadboard3D } from '../components/Breadboard3D/Breadboard3D.js';
import { CodeEditor } from '../components/Editor/CodeEditor.js';
import { Toolbar } from '../components/Toolbar/Toolbar.js';
import { COMPONENT_LIBRARY } from '@circuit-lab/simulator-core';

type ActiveTab = 'code' | 'serial' | 'waveforms' | 'properties';

const TAB_LABELS: Record<ActiveTab, string> = {
  code:       'Code Editor',
  serial:     'Serial Monitor',
  waveforms:  'Waveforms',
  properties: 'Properties',
};

// ── Serial Monitor ────────────────────────────────────────────────────────────
function SerialMonitorPanel() {
  const simulationState = useCircuitStore((s) => s.simulationState);
  const isSimulating    = useCircuitStore((s) => s.isSimulating);

  const lines: string[] = [];
  if (!simulationState) {
    lines.push('// Serial Monitor — Run Simulation (▶ Simulate) to see output');
  } else {
    lines.push(`[${new Date().toLocaleTimeString()}] Simulation complete`);
    lines.push('');
    lines.push('Node Voltages:');
    Object.entries(simulationState.nodeVoltages).forEach(([node, v]) => {
      lines.push(`  ${node.padEnd(20)} ${Number(v).toFixed(4)} V`);
    });
    if (Object.keys(simulationState.branchCurrents).length > 0) {
      lines.push('');
      lines.push('Branch Currents:');
      Object.entries(simulationState.branchCurrents).forEach(([branch, i]) => {
        lines.push(`  ${branch.padEnd(20)} ${Number(i).toFixed(6)} A`);
      });
    }
  }

  return (
    <div style={panelStyles.terminal}>
      {isSimulating && <div style={panelStyles.simulating}>⏳ Simulating...</div>}
      <pre style={panelStyles.terminalText}>{lines.join('\n')}</pre>
    </div>
  );
}

// ── Waveforms ─────────────────────────────────────────────────────────────────
function WaveformsPanel() {
  const simulationState = useCircuitStore((s) => s.simulationState);

  if (!simulationState) {
    return (
      <div style={panelStyles.empty}>
        No simulation data — press <strong style={{ color: '#00d2ff' }}>▶ Simulate</strong> first
      </div>
    );
  }

  const nodes   = Object.entries(simulationState.nodeVoltages);
  const maxAbs  = Math.max(...nodes.map(([, v]) => Math.abs(Number(v))), 1);

  return (
    <div style={panelStyles.waveforms}>
      <div style={panelStyles.waveHeader}>Node Voltages</div>
      {nodes.length === 0 && (
        <div style={panelStyles.empty}>No node data in simulation result</div>
      )}
      {nodes.map(([node, voltage]) => {
        const v      = Number(voltage);
        const pct    = Math.abs(v) / maxAbs;
        const isNeg  = v < 0;
        const color  = isNeg ? '#ff6688' : '#00d2ff';
        const barW   = `${Math.round(pct * 100)}%`;
        return (
          <div key={node} style={panelStyles.waveRow}>
            <span style={panelStyles.waveLabel}>{node}</span>
            <div style={panelStyles.waveBarBg}>
              <div style={{ ...panelStyles.waveBar, width: barW, background: color }} />
            </div>
            <span style={{ ...panelStyles.waveValue, color }}>{v.toFixed(3)} V</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Properties ────────────────────────────────────────────────────────────────
function PropertiesPanel() {
  const selectedId          = useCircuitStore((s) => s.selectedComponentId);
  const components          = useCircuitStore((s) => s.project.components);
  const updateProperty      = useCircuitStore((s) => s.updateComponentProperty);

  const comp = components.find((c) => c.id === selectedId);

  if (!comp) {
    return (
      <div style={panelStyles.empty}>
        點選麵包板上的零件以查看屬性<br />
        <span style={{ fontSize: 12, color: '#555588' }}>Click a component on the board to view properties</span>
      </div>
    );
  }

  const def = COMPONENT_LIBRARY[comp.type];
  const mergedProps = { ...(def?.defaultProperties ?? {}), ...comp.properties };

  return (
    <div style={panelStyles.props}>
      <div style={panelStyles.propsHeader}>
        <span style={{ color: '#00d2ff', fontWeight: 600 }}>{def?.name ?? comp.type}</span>
        <span style={{ color: '#555588', fontSize: 11 }}>{comp.type}</span>
      </div>

      {def?.description && (
        <div style={panelStyles.propsDesc}>{def.description}</div>
      )}

      <div style={panelStyles.propsSection}>Properties</div>
      {Object.entries(mergedProps).map(([key, defVal]) => {
        const val = comp.properties[key] ?? defVal;
        const isNum  = typeof defVal === 'number';
        const isBool = typeof defVal === 'boolean';
        return (
          <div key={key} style={panelStyles.propRow}>
            <label style={panelStyles.propLabel}>{key}</label>
            {isBool ? (
              <select
                style={panelStyles.propInput}
                value={String(val)}
                onChange={(e) => updateProperty(comp.id, key, e.target.value === 'true')}
              >
                <option value="true">true</option>
                <option value="false">false</option>
              </select>
            ) : (
              <input
                style={panelStyles.propInput}
                type={isNum ? 'number' : 'text'}
                value={String(val)}
                onChange={(e) => updateProperty(
                  comp.id, key,
                  isNum ? parseFloat(e.target.value) || 0 : e.target.value
                )}
              />
            )}
          </div>
        );
      })}

      {def?.ports && def.ports.length > 0 && (
        <>
          <div style={panelStyles.propsSection}>Ports</div>
          {def.ports.map((port) => (
            <div key={port.id} style={panelStyles.portRow}>
              <span style={panelStyles.portId}>{port.id}</span>
              <span style={panelStyles.portName}>{port.name}</span>
              <span style={{ ...panelStyles.portType, color: portTypeColor(port.type) }}>{port.type}</span>
            </div>
          ))}
        </>
      )}

      <div style={panelStyles.propsSection}>Position</div>
      <div style={panelStyles.propRow}>
        <label style={panelStyles.propLabel}>x / y / z</label>
        <span style={panelStyles.propValue}>
          {comp.position.x.toFixed(2)}, {comp.position.y.toFixed(2)}, {comp.position.z.toFixed(2)}
        </span>
      </div>
    </div>
  );
}

function portTypeColor(type: string) {
  switch (type) {
    case 'input':  return '#88ccff';
    case 'output': return '#88ffaa';
    case 'power':  return '#ffcc88';
    default:       return '#aaaacc';
  }
}

// ── EditorPage ────────────────────────────────────────────────────────────────
export function EditorPage() {
  const { projectId } = useParams();
  const store = useCircuitStore();
  const viewMode = store.viewMode;
  const canvasRef    = useRef<HTMLDivElement>(null);
  const mainAreaRef  = useRef<HTMLDivElement>(null);
  const [bottomHeight, setBottomHeight] = useState(250);
  const [activeTab, setActiveTab]       = useState<ActiveTab>('code');
  const dragging = useRef(false);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    const startY = e.clientY;
    const startH = bottomHeight;

    const onMove = (ev: MouseEvent) => {
      if (!dragging.current || !mainAreaRef.current) return;
      const rect = mainAreaRef.current.getBoundingClientRect();
      const newH = Math.max(100, Math.min(rect.height - 100, startH - (ev.clientY - startY)));
      setBottomHeight(newH);
    };

    const onUp = () => {
      dragging.current = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [bottomHeight]);

  useEffect(() => {
    if (projectId) {
      const socket = connectSocket();
      joinProject(projectId);
    }
  }, [projectId]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const sel = store.selectedComponentId;
    if ((e.key === 'Delete' || e.key === 'Backspace') && sel) {
      store.removeComponent(sel);
      store.selectComponent(null);
      e.preventDefault();
    }
    if (e.key === 'Escape') {
      store.selectComponent(null);
      store.setSelectedTool('select');
      store.setPlacingComponentType(null);
    }
  }, [store]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div style={styles.container}>
      <Toolbar />
      <div style={styles.workspace}>
        <ComponentPanel />
        <div ref={mainAreaRef} style={styles.mainArea}>
          <div ref={canvasRef} style={styles.canvas}>
            <Canvas
              dpr={[1, 2]}
              shadows
              gl={{ antialias: true, toneMapping: THREE.NoToneMapping, toneMappingExposure: 1.0 }}
              style={{ background: '#0a0a1a' }}
            >
              {viewMode === '2d' ? (
                <OrthographicCamera
                  makeDefault
                  args={[-10, 10, 10, -10, 0.1, 100]}
                  position={[0, 15, 0]}
                  zoom={55}
                />
              ) : (
                <PerspectiveCamera
                  makeDefault
                  position={[12, 9, 12]}
                  fov={40}
                  near={0.1}
                  far={100}
                />
              )}

              <ambientLight intensity={0.06} color="#404060" />
              <directionalLight
                position={[6, 10, 5]}
                intensity={0.6}
                color="#ffe8d0"
                castShadow
                shadow-bias={-0.001}
                shadow-mapSize-width={2048}
                shadow-mapSize-height={2048}
              />
              <directionalLight
                position={[-4, 6, -6]}
                intensity={0.15}
                color="#6080a0"
              />

              <Breadboard3D />

              {viewMode === '3d' && (
                <ContactShadows
                  position={[0, -0.3, 0]}
                  opacity={0.2}
                  scale={15}
                  blur={3}
                  far={4}
                  resolution={512}
                />
              )}

              <OrbitControls
                enablePan
                enableZoom
                enableRotate={viewMode === '3d'}
                minDistance={1}
                maxDistance={50}
                minPolarAngle={viewMode === '2d' ? 0 : 0.1}
                maxPolarAngle={viewMode === '2d' ? 0 : Math.PI / 2.1}
                target={[0, 0.8, 0]}
                dampingFactor={0.08}
                enableDamping
              />
            </Canvas>
          </div>

          <div style={{ ...styles.bottomPanel, height: bottomHeight }}>
            {/* Tab bar */}
            <div style={styles.editorTabBar}>
              <span style={styles.dragGrip} onMouseDown={handleMouseDown}>[=]</span>
              {(Object.keys(TAB_LABELS) as ActiveTab[]).map((tab) => (
                <button
                  key={tab}
                  style={{ ...styles.tab, ...(activeTab === tab ? styles.tabActive : {}) }}
                  onClick={() => setActiveTab(tab)}
                >
                  {TAB_LABELS[tab]}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div style={styles.tabContent}>
              {activeTab === 'code'       && <CodeEditor />}
              {activeTab === 'serial'     && <SerialMonitorPanel />}
              {activeTab === 'waveforms'  && <WaveformsPanel />}
              {activeTab === 'properties' && <PropertiesPanel />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles: Record<string, React.CSSProperties> = {
  container: {
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    background: '#0a0a1a',
    color: '#e0e0e0',
    fontFamily: 'system-ui, sans-serif',
    overflow: 'hidden',
  },
  workspace: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden',
  },
  mainArea: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  canvas: {
    flex: 1,
    position: 'relative',
    minHeight: 0,
    overflow: 'hidden',
  },
  dragGrip: {
    padding: '0 10px',
    color: '#5555aa',
    cursor: 'row-resize',
    userSelect: 'none',
    fontSize: 16,
    lineHeight: '30px',
  },
  bottomPanel: {
    display: 'flex',
    flexDirection: 'column',
    background: '#0f0f25',
    overflow: 'hidden',
    flexShrink: 0,
  },
  editorTabBar: {
    display: 'flex',
    alignItems: 'center',
    background: '#0a0a1a',
    borderBottom: '1px solid #1a1a3e',
    cursor: 'default',
    userSelect: 'none',
    flexShrink: 0,
  },
  tab: {
    padding: '8px 20px',
    background: 'transparent',
    color: '#6666aa',
    border: 'none',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 500,
    transition: 'color 0.15s',
  },
  tabActive: {
    color: '#00d2ff',
    borderBottom: '2px solid #00d2ff',
    background: '#0f0f25',
  },
  tabContent: {
    flex: 1,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
};

const panelStyles: Record<string, React.CSSProperties> = {
  empty: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#555588',
    fontSize: 14,
    gap: 6,
    textAlign: 'center',
    padding: 24,
  },
  terminal: {
    flex: 1,
    background: '#07071a',
    overflow: 'auto',
    padding: '12px 16px',
    position: 'relative',
  },
  terminalText: {
    fontFamily: "'Consolas', 'Fira Code', monospace",
    fontSize: 12,
    color: '#88ffcc',
    lineHeight: 1.7,
    whiteSpace: 'pre-wrap',
  },
  simulating: {
    position: 'absolute',
    top: 12,
    right: 16,
    color: '#ffcc00',
    fontSize: 12,
  },
  waveforms: {
    flex: 1,
    overflow: 'auto',
    padding: '12px 20px',
  },
  waveHeader: {
    fontSize: 11,
    fontWeight: 700,
    color: '#555588',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    marginBottom: 10,
  },
  waveRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  waveLabel: {
    width: 120,
    fontSize: 12,
    color: '#aaaacc',
    fontFamily: 'monospace',
    flexShrink: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  waveBarBg: {
    flex: 1,
    height: 16,
    background: '#12122a',
    borderRadius: 3,
    overflow: 'hidden',
  },
  waveBar: {
    height: '100%',
    borderRadius: 3,
    transition: 'width 0.3s ease',
    minWidth: 2,
  },
  waveValue: {
    width: 70,
    fontSize: 12,
    fontFamily: 'monospace',
    textAlign: 'right',
    flexShrink: 0,
  },
  props: {
    flex: 1,
    overflow: 'auto',
    padding: '12px 20px',
  },
  propsHeader: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 10,
    marginBottom: 6,
    fontSize: 14,
  },
  propsDesc: {
    fontSize: 12,
    color: '#6666aa',
    marginBottom: 12,
    lineHeight: 1.5,
  },
  propsSection: {
    fontSize: 11,
    fontWeight: 700,
    color: '#555588',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    margin: '12px 0 6px',
    borderBottom: '1px solid #1a1a3e',
    paddingBottom: 4,
  },
  propRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginBottom: 6,
  },
  propLabel: {
    width: 130,
    fontSize: 12,
    color: '#8888bb',
    flexShrink: 0,
    fontFamily: 'monospace',
  },
  propInput: {
    flex: 1,
    background: '#12122a',
    border: '1px solid #1e1e42',
    borderRadius: 4,
    color: '#e0e0e0',
    fontSize: 12,
    padding: '4px 8px',
    outline: 'none',
    fontFamily: 'monospace',
  },
  propValue: {
    fontSize: 12,
    color: '#aaaacc',
    fontFamily: 'monospace',
  },
  portRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 5,
    fontSize: 12,
    fontFamily: 'monospace',
  },
  portId: {
    width: 60,
    color: '#00d2ff',
    flexShrink: 0,
  },
  portName: {
    flex: 1,
    color: '#aaaacc',
  },
  portType: {
    fontSize: 11,
    flexShrink: 0,
  },
};
