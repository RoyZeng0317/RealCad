import { useState, useCallback } from 'react';
import Editor from '@monaco-editor/react';

const ARDUINO_CODE = `// Arduino Blink Example
// LED connected to pin 13

void setup() {
  pinMode(13, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  digitalWrite(13, HIGH);
  delay(1000);
  digitalWrite(13, LOW);
  delay(1000);
}
`;

const RASPBERRY_PI_CODE = `# Raspberry Pi GPIO Example
# LED on GPIO pin 17

import RPi.GPIO as GPIO
import time

# Use BCM pin numbering
GPIO.setmode(GPIO.BCM)
GPIO.setwarnings(False)

# Set up pin 17 as output
LED_PIN = 17
GPIO.setup(LED_PIN, GPIO.OUT)

try:
    while True:
        GPIO.output(LED_PIN, GPIO.HIGH)
        time.sleep(1)
        GPIO.output(LED_PIN, GPIO.LOW)
        time.sleep(1)

except KeyboardInterrupt:
    GPIO.cleanup()
`;

type EditorTab = 'arduino' | 'raspberry_pi';

export function CodeEditor() {
  const [activeTab, setActiveTab] = useState<EditorTab>('arduino');
  const [arduinoCode, setArduinoCode] = useState(ARDUINO_CODE);
  const [piCode, setPiCode] = useState(RASPBERRY_PI_CODE);

  const isArduino = activeTab === 'arduino';
  const currentCode = isArduino ? arduinoCode : piCode;

  const handleChange = useCallback((value: string | undefined) => {
    if (value === undefined) return;
    if (isArduino) {
      setArduinoCode(value);
    } else {
      setPiCode(value);
    }
  }, [isArduino]);

  const switchTab = useCallback((tab: EditorTab) => {
    setActiveTab(tab);
  }, []);

  return (
    <div style={styles.container}>
      <div style={styles.toolbar}>
        <div style={styles.langSwitch}>
          <button
            style={{
              ...styles.langBtn,
              ...(isArduino ? styles.langBtnActive : {}),
            }}
            onClick={() => switchTab('arduino')}
          >
            Arduino (C++)
          </button>
          <button
            style={{
              ...styles.langBtn,
              ...(!isArduino ? styles.langBtnActive : {}),
            }}
            onClick={() => switchTab('raspberry_pi')}
          >
            Raspberry Pi (Python)
          </button>
        </div>
        <div style={styles.actionBar}>
          <span style={styles.platformLabel}>
            {isArduino ? 'ATmega328P' : 'BCM2711 / RP2040'}
          </span>
          <button style={styles.compileBtn}>
            {isArduino ? '▶ Compile & Upload' : '▶ Run on Pi'}
          </button>
        </div>
      </div>
      <div style={styles.editor}>
        <Editor
          height="100%"
          language={isArduino ? 'cpp' : 'python'}
          value={currentCode}
          onChange={handleChange}
          theme="vs-dark"
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            padding: { top: 8 },
            automaticLayout: true,
          }}
        />
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  toolbar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '4px 12px',
    background: '#0a0a1a',
  },
  langSwitch: {
    display: 'flex',
    gap: 4,
  },
  langBtn: {
    padding: '4px 12px',
    background: 'transparent',
    color: '#8888aa',
    border: 'none',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 500,
  },
  langBtnActive: {
    background: '#1a1a3e',
    color: '#00d2ff',
  },
  actionBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  platformLabel: {
    fontSize: 11,
    color: '#555588',
    fontFamily: 'monospace',
  },
  compileBtn: {
    padding: '4px 14px',
    background: '#00d2ff',
    color: '#0a0a1a',
    border: 'none',
    borderRadius: 4,
    fontWeight: 600,
    cursor: 'pointer',
    fontSize: 12,
  },
  editor: {
    flex: 1,
    overflow: 'hidden',
  },
};
