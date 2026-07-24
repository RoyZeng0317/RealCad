import { useState, useMemo } from 'react';
import { useCircuitStore } from '../../stores/circuitStore.js';
import { COMPONENT_LIBRARY } from '@circuit-lab/simulator-core';
import type { ComponentType, ComponentCategory } from '@circuit-lab/shared';

const categoryOrder: ComponentCategory[] = ['passive', 'active', 'power', 'logic', 'microcontroller', 'display', 'electromechanical', 'measurement'];
const categoryLabels: Record<ComponentCategory, string> = {
  passive: 'Passive',
  active: 'Active',
  power: 'Power',
  logic: 'Logic',
  microcontroller: 'Microcontrollers',
  display: 'Displays',
  electromechanical: 'Electromechanical',
  measurement: 'Measurement',
};

const categoryIcons: Record<ComponentCategory, string> = {
  passive: '⚡',
  active: '🔌',
  power: '🔋',
  logic: '⊼',
  microcontroller: '🤖',
  display: '📟',
  electromechanical: '⚙',
  measurement: '📊',
};

export function ComponentPanel() {
  const [searchQuery, setSearchQuery] = useState('');
  const { selectedTool, setSelectedTool, setPlacingComponentType, placingComponentType } = useCircuitStore();

  const allComponents = useMemo(() => Object.values(COMPONENT_LIBRARY), []);

  const filteredComponents = useMemo(() => {
    if (!searchQuery.trim()) return null;
    const q = searchQuery.toLowerCase();
    return allComponents.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        c.type.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q)
    );
  }, [searchQuery, allComponents]);

  const categories = useMemo(() => {
    if (filteredComponents) {
      return [{ category: '__search' as ComponentCategory, label: 'Search Results', icon: '🔍', components: filteredComponents }];
    }
    return categoryOrder.map((cat) => ({
      category: cat,
      label: categoryLabels[cat],
      icon: categoryIcons[cat],
      components: allComponents.filter((c) => c.category === cat),
    }));
  }, [filteredComponents, allComponents]);

  const handleComponentClick = (type: ComponentType) => {
    setSelectedTool('component');
    setPlacingComponentType(type);
  };

  return (
    <div style={styles.panel}>
      <div style={styles.header}>
        <span>Components</span>
        <span style={styles.count}>{allComponents.length}</span>
      </div>
      <div style={styles.searchBox}>
        <input
          style={styles.searchInput}
          placeholder="Search components..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {searchQuery && (
          <button style={styles.clearSearch} onClick={() => setSearchQuery('')}>
            ✕
          </button>
        )}
      </div>
      <div style={styles.list}>
        {categories.map(({ category, label, icon, components }) =>
          components.length > 0 ? (
            <div key={category}>
              <div style={styles.categoryLabel}>
                <span>{icon}</span>
                <span>{label}</span>
                <span style={styles.categoryCount}>{components.length}</span>
              </div>
              {components.map((comp) => (
                <div
                  key={comp.type}
                  style={{
                    ...styles.componentItem,
                    ...(placingComponentType === comp.type ? styles.componentItemActive : {}),
                  }}
                  onClick={() => handleComponentClick(comp.type)}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('componentType', comp.type);
                    setPlacingComponentType(comp.type);
                  }}
                >
                  <div style={styles.componentName}>
                    <span style={styles.componentTypeIcon}>{getTypeIcon(comp.category)}</span>
                    {comp.name}
                  </div>
                  <div style={styles.componentDesc}>{comp.description}</div>
                </div>
              ))}
            </div>
          ) : null
        )}
        {filteredComponents && filteredComponents.length === 0 && (
          <div style={styles.noResults}>
            No components matching "{searchQuery}"
          </div>
        )}
      </div>
    </div>
  );
}

function getTypeIcon(category: ComponentCategory): string {
  return categoryIcons[category] ?? '🔌';
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    width: 260,
    background: '#0f0f25',
    borderRight: '1px solid #1a1a3e',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    fontSize: 14,
    fontWeight: 600,
    color: '#00d2ff',
    borderBottom: '1px solid #1a1a3e',
  },
  count: {
    fontSize: 11,
    color: '#555588',
    background: '#1a1a3e',
    padding: '2px 8px',
    borderRadius: 10,
  },
  searchBox: {
    padding: '8px 12px',
    position: 'relative',
  },
  searchInput: {
    width: '100%',
    padding: '6px 10px',
    background: '#1a1a3e',
    border: '1px solid #2a2a5e',
    borderRadius: 6,
    color: '#e0e0e0',
    fontSize: 12,
    outline: 'none',
    boxSizing: 'border-box',
  },
  clearSearch: {
    position: 'absolute',
    right: 16,
    top: 11,
    background: 'transparent',
    color: '#6666aa',
    border: 'none',
    cursor: 'pointer',
    fontSize: 12,
    padding: '2px 4px',
  },
  list: {
    flex: 1,
    overflow: 'auto',
    padding: '4px 0',
  },
  categoryLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 16px',
    fontSize: 11,
    fontWeight: 600,
    color: '#6666aa',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  categoryCount: {
    marginLeft: 'auto',
    fontSize: 10,
    color: '#444477',
  },
  componentItem: {
    padding: '8px 16px 8px 24px',
    cursor: 'pointer',
    borderLeft: '3px solid transparent',
    transition: 'all 0.15s',
  },
  componentItemActive: {
    background: '#1a1a3e',
    borderLeft: '3px solid #00d2ff',
  },
  componentName: {
    fontSize: 13,
    fontWeight: 500,
    color: '#e0e0e0',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  componentTypeIcon: {
    fontSize: 14,
  },
  componentDesc: {
    fontSize: 11,
    color: '#6666aa',
    marginTop: 2,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  noResults: {
    padding: '24px 16px',
    color: '#555588',
    fontSize: 13,
    textAlign: 'center',
  },
};
