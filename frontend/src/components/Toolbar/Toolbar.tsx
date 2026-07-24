import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCircuitStore } from '../../stores/circuitStore.js';
import { useAuthStore } from '../../stores/authStore.js';
import { createSimulator } from '@circuit-lab/simulator-core';

export function Toolbar() {
  const navigate = useNavigate();
  const store = useCircuitStore();
  const { user, login, logout } = useAuthStore();

  const handleSimulate = useCallback(() => {
    const sim = createSimulator(store.project);
    const result = sim.solveDC();
    store.setSimulationState(result);
    store.setIsSimulating(true);
    setTimeout(() => store.setIsSimulating(false), 100);
  }, [store]);

  const handleSave = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects${store.project.id ? '/' + store.project.id : ''}`, {
        method: store.project.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: store.project.name,
          data: { components: store.project.components, wires: store.project.wires },
        }),
      });
      if (res.ok) {
        const data = await res.json();
        store.setProject({ ...store.project, id: data.id });
      }
    } catch (err) {
      console.error('Save failed:', err);
    }
  }, [store]);

  const clearBoard = useCallback(() => {
    store.setProject({
      ...store.project,
      components: [],
      wires: [],
      updatedAt: new Date().toISOString(),
    });
  }, [store]);

  return (
    <div style={styles.toolbar}>
      <div style={styles.left}>
        <span style={styles.logo} onClick={() => navigate('/')}>Circuit Lab</span>
        <span style={styles.separator}>|</span>
        <input
          style={styles.projectName}
          value={store.project.name}
          onChange={(e) => store.setProject({ ...store.project, name: e.target.value })}
        />
      </div>

      <div style={styles.center}>
        <ToolButton icon="↩" label="Undo" onClick={() => {}} />
        <ToolButton icon="↪" label="Redo" onClick={() => {}} />
        <span style={styles.separator} />
        <ToolButton icon="↹" label="Select" active={store.selectedTool === 'select'} onClick={() => store.setSelectedTool('select')} />
        <ToolButton icon="〰" label="Wire" active={store.selectedTool === 'wire'} onClick={() => store.setSelectedTool('wire')} />
        <ToolButton icon="⊞" label="Probe" active={store.selectedTool === 'probe'} onClick={() => store.setSelectedTool('probe')} />
        <span style={styles.separator} />
        <ToolButton icon="3D" label="3D View" active={store.viewMode === '3d'} onClick={() => store.setViewMode('3d')} />
        <ToolButton icon="2D" label="2D View" active={store.viewMode === '2d'} onClick={() => store.setViewMode('2d')} />
      </div>

      <div style={styles.right}>
        <button style={styles.clearBtn} onClick={clearBoard}>Clear</button>
        <button style={styles.saveBtn} onClick={handleSave}>Save</button>
        <button style={styles.simulateBtn} onClick={handleSimulate}>
          {store.isSimulating ? '⏳ Simulating...' : '▶ Simulate'}
        </button>
        {user ? (
          <div style={styles.userMenu}>
            <span style={styles.userName}>{user.name}</span>
            <button style={styles.logoutBtn} onClick={logout}>Logout</button>
          </div>
        ) : (
          <button style={styles.loginBtn} onClick={login}>Sign In</button>
        )}
      </div>
    </div>
  );
}

function ToolButton({ icon, label, active, onClick }: { icon: string; label: string; active?: boolean; onClick: () => void }) {
  return (
    <button
      style={{ ...styles.toolBtn, ...(active ? styles.toolBtnActive : {}) }}
      onClick={onClick}
      title={label}
    >
      {icon}
    </button>
  );
}

const styles: Record<string, React.CSSProperties> = {
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 16px',
    background: '#0f0f25',
    borderBottom: '1px solid #1a1a3e',
    gap: 16,
  },
  left: { display: 'flex', alignItems: 'center', gap: 12 },
  logo: { fontSize: 20, fontWeight: 700, color: '#00d2ff', cursor: 'pointer' },
  separator: { color: '#2a2a5e' },
  projectName: {
    background: 'transparent',
    border: '1px solid #2a2a5e',
    borderRadius: 6,
    padding: '4px 12px',
    color: '#e0e0e0',
    fontSize: 14,
    width: 200,
  },
  center: { display: 'flex', alignItems: 'center', gap: 4 },
  right: { display: 'flex', alignItems: 'center', gap: 8 },
  toolBtn: {
    padding: '6px 10px',
    background: 'transparent',
    color: '#8888aa',
    border: '1px solid transparent',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 14,
  },
  toolBtnActive: {
    background: '#1a1a3e',
    color: '#00d2ff',
    border: '1px solid #00d2ff',
  },
  simulateBtn: {
    padding: '6px 16px',
    background: '#00d2ff',
    color: '#0a0a1a',
    border: 'none',
    borderRadius: 6,
    fontWeight: 600,
    cursor: 'pointer',
    fontSize: 13,
  },
  saveBtn: {
    padding: '6px 16px',
    background: '#2a2a5e',
    color: '#e0e0e0',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 13,
  },
  clearBtn: {
    padding: '6px 12px',
    background: 'transparent',
    color: '#ff6b6b',
    border: '1px solid #ff6b6b',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 13,
  },
  loginBtn: {
    padding: '6px 14px',
    background: '#1a1a3e',
    color: '#00d2ff',
    border: '1px solid #00d2ff',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 13,
  },
  userMenu: { display: 'flex', alignItems: 'center', gap: 8 },
  userName: { color: '#8888aa', fontSize: 13 },
  logoutBtn: {
    padding: '4px 10px',
    background: 'transparent',
    color: '#ff6b6b',
    border: 'none',
    cursor: 'pointer',
    fontSize: 12,
  },
};
