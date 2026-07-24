import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore.js';

export function LandingPage() {
  const navigate = useNavigate();
  const { user, login } = useAuthStore();

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div style={styles.logo}>
          <svg width="32" height="32" viewBox="0 0 100 100">
            <rect width="100" height="100" rx="15" fill="#00d2ff" />
            <circle cx="50" cy="40" r="20" fill="none" stroke="#fff" strokeWidth="3" />
            <path d="M35 65 L50 50 L65 65" fill="none" stroke="#fff" strokeWidth="3" />
            <line x1="30" y1="80" x2="70" y2="80" stroke="#fff" strokeWidth="2" />
          </svg>
          <span style={styles.logoText}>Circuit Lab</span>
        </div>
        <nav style={styles.nav}>
          {user ? (
            <div style={styles.userInfo}>
              <span>{user.name}</span>
              <button style={styles.primaryBtn} onClick={() => navigate('/editor')}>
                New Project
              </button>
            </div>
          ) : (
            <button style={styles.primaryBtn} onClick={login}>
              Sign in with Google
            </button>
          )}
        </nav>
      </header>

      <main style={styles.hero}>
        <h1 style={styles.title}>Build, Simulate & Program Circuits<br />in Your Browser</h1>
        <p style={styles.subtitle}>
          A 3D circuit simulator with SPICE analysis, Arduino emulation, and real-time collaboration.
          No installation required.
        </p>
        <div style={styles.actions}>
          {user ? (
            <button style={styles.startBtn} onClick={() => navigate('/editor')}>
              Start Building
            </button>
          ) : (
            <button style={styles.startBtn} onClick={login}>
              Get Started Free
            </button>
          )}
          <button style={styles.exploreBtn} onClick={() => window.open('/editor', '_blank')}>
            Explore Demos
          </button>
        </div>
      </main>

      <section style={styles.features}>
        {features.map((f) => (
          <div key={f.title} style={styles.feature}>
            <span style={styles.featureIcon}>{f.icon}</span>
            <h3 style={styles.featureTitle}>{f.title}</h3>
            <p style={styles.featureDesc}>{f.desc}</p>
          </div>
        ))}
      </section>

      <section style={styles.components}>
        <h2 style={styles.sectionTitle}>50+ Electronic Components</h2>
        <div style={styles.componentGrid}>
          {['Resistor', 'Capacitor', 'Inductor', 'LED', 'Diode', 'Transistor', 'MOSFET', '555 Timer',
            'Op-Amp', 'Arduino Uno', 'ESP32', 'Raspberry Pi', 'Logic Gates', '7-Segment', 'Motor', 'Buzzer'].map((c) => (
            <div key={c} style={styles.componentChip}>{c}</div>
          ))}
        </div>
      </section>

      <footer style={styles.footer}>
        <p>Circuit Lab &copy; {new Date().getFullYear()} &mdash; Open source 3D circuit simulator</p>
      </footer>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { minHeight: '100vh', background: '#0a0a1a', color: '#e0e0e0', fontFamily: 'system-ui, sans-serif' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 48px', borderBottom: '1px solid #1a1a3e' },
  logo: { display: 'flex', alignItems: 'center', gap: 12 },
  logoText: { fontSize: 22, fontWeight: 700, color: '#00d2ff' },
  nav: { display: 'flex', alignItems: 'center', gap: 16 },
  userInfo: { display: 'flex', alignItems: 'center', gap: 16 },
  primaryBtn: { padding: '8px 20px', background: '#00d2ff', color: '#0a0a1a', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer' },
  hero: { textAlign: 'center', padding: '100px 24px', maxWidth: 800, margin: '0 auto' },
  title: { fontSize: 48, fontWeight: 800, lineHeight: 1.2, margin: '0 0 20px', background: 'linear-gradient(135deg, #00d2ff, #ff6b6b)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' },
  subtitle: { fontSize: 18, color: '#8888aa', margin: '0 0 40px', lineHeight: 1.6 },
  actions: { display: 'flex', gap: 16, justifyContent: 'center' },
  startBtn: { padding: '14px 36px', background: '#00d2ff', color: '#0a0a1a', border: 'none', borderRadius: 12, fontSize: 18, fontWeight: 700, cursor: 'pointer' },
  exploreBtn: { padding: '14px 36px', background: 'transparent', color: '#00d2ff', border: '2px solid #00d2ff', borderRadius: 12, fontSize: 18, fontWeight: 600, cursor: 'pointer' },
  features: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 24, padding: '60px 48px', maxWidth: 1200, margin: '0 auto' },
  feature: { padding: 32, background: '#12122a', borderRadius: 16, border: '1px solid #1a1a3e' },
  featureIcon: { fontSize: 32 },
  featureTitle: { fontSize: 18, fontWeight: 600, margin: '12px 0 8px', color: '#fff' },
  featureDesc: { fontSize: 14, color: '#8888aa', lineHeight: 1.5, margin: 0 },
  components: { padding: '60px 48px', maxWidth: 1200, margin: '0 auto' },
  sectionTitle: { fontSize: 28, fontWeight: 700, textAlign: 'center', margin: '0 0 32px' },
  componentGrid: { display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center' },
  componentChip: { padding: '8px 20px', background: '#1a1a3e', borderRadius: 20, fontSize: 14, fontWeight: 500, border: '1px solid #2a2a5e' },
  footer: { textAlign: 'center', padding: 32, color: '#6666aa', fontSize: 14 },
};

const features = [
  { icon: '🎲', title: '3D Breadboard', desc: 'Realistic 3D breadboard with drag-and-drop components and physics-based wiring' },
  { icon: '⚡', title: 'SPICE Simulation', desc: 'Full Modified Nodal Analysis engine with DC, transient, and AC analysis' },
  { icon: '🤖', title: 'Arduino/ESP32 Emulation', desc: 'Cycle-accurate AVR emulation. Write code in the built-in editor and simulate' },
  { icon: '🍓', title: 'Raspberry Pi Support', desc: 'GPIO simulation with Python scripting via WebAssembly' },
  { icon: '👥', title: 'Real-time Collaboration', desc: 'Work together with teammates. Google login, sharing, and live sync' },
  { icon: '📊', title: 'Oscilloscope & Probes', desc: 'Drag voltage/current probes onto any wire. Live waveform viewer' },
];
