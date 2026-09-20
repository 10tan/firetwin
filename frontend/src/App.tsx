import React, { useState, useEffect, useRef } from 'react';
import {
  Flame,
  Wind,
  Users,
  Building,
  FileText,
  Play,
  Pause,
  RotateCcw,
  Zap,
  Activity,
  Download,
  Layers,
  CheckCircle,
  AlertTriangle,
  Compass
} from 'lucide-react';

interface SimulationStep {
  step: number;
  sim_time_sec: number;
  cfd: {
    max_temp_c: number;
    avg_temp_c: number;
    max_velocity: number;
    temp_grid_sample: number[][];
  };
  species: {
    hrr_kW: number;
    max_soot: number;
    max_smoke: number;
    min_o2_pct: number;
  };
  evacuation: {
    total_agents: number;
    escaped_agents: number;
    remaining_agents: number;
    evacuation_pct: number;
    agent_positions: Array<{ id: number; x: number; y: number; vx: number; vy: number; escaped: boolean }>;
  };
  zone_field: {
    rooms: Array<{ room_id: number; layer_height_m: number; hot_layer_temp_c: number; cool_layer_temp_c: number }>;
  };
  structural: {
    current_member_temp_c: number;
    yield_reduction_ky: number;
    elasticity_reduction_kE: number;
  };
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'cfd' | 'evacuation' | 'structural' | 'benchmark'>('cfd');
  const [modelMode, setModelMode] = useState<'surrogate' | 'les'>('les');
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [fireAlpha, setFireAlpha] = useState<number>(0.0469); // Fast growth
  const [hrrPeak, setHrrPeak] = useState<number>(1500);
  const [useRLWayfinding, setUseRLWayfinding] = useState<boolean>(false);
  const [doorOpen, setDoorOpen] = useState<boolean>(true);
  const [scenarioId, setScenarioId] = useState<string>('demo-scen-01');

  // Simulated live field snapshot history
  const [history, setHistory] = useState<SimulationStep[]>([]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Generate synthetic timesteps for responsive simulation UI
  useEffect(() => {
    const steps: SimulationStep[] = [];
    const numSteps = 60;
    for (let i = 0; i < numSteps; i++) {
      const t = i * 1.5;
      const hrr = Math.min(fireAlpha * (t ** 2), hrrPeak);
      const tempRise = 20 + Math.min(hrr * 0.45, 820);
      const ky = Math.max(0.02, 1.0 - (tempRise > 200 ? (tempRise - 200) * 0.0012 : 0));
      const kE = Math.max(0.02, 1.0 - (tempRise > 100 ? (tempRise - 100) * 0.0014 : 0));
      const escaped = Math.min(25, Math.floor(t * (useRLWayfinding ? 0.75 : 0.5)));

      // Grid sample 10x12
      const grid: number[][] = [];
      for (let r = 0; r < 10; r++) {
        const row: number[] = [];
        for (let c = 0; c < 12; c++) {
          const dist = Math.sqrt((r - 2) ** 2 + (c - 5) ** 2);
          const localT = Math.max(20, tempRise * Math.exp(-dist * 0.35));
          row.push(Math.round(localT * 10) / 10);
        }
        grid.push(row);
      }

      // Agents positions
      const agents = [];
      for (let a = 0; a < 25; a++) {
        const isEscaped = a < escaped;
        agents.push({
          id: a,
          x: isEscaped ? 7.8 : 0.8 + (a % 5) * 0.6 + Math.sin(t * 0.5 + a) * 0.1,
          y: isEscaped ? 3.0 : 0.8 + Math.floor(a / 5) * 0.8 + Math.cos(t * 0.5 + a) * 0.1,
          vx: isEscaped ? 0 : 0.8,
          vy: isEscaped ? 0 : 0.2,
          escaped: isEscaped
        });
      }

      steps.push({
        step: i,
        sim_time_sec: Math.round(t),
        cfd: {
          max_temp_c: Math.round(tempRise),
          avg_temp_c: Math.round(20 + tempRise * 0.25),
          max_velocity: Math.round((0.5 + Math.min(tempRise * 0.003, 3.2)) * 100) / 100,
          temp_grid_sample: grid
        },
        species: {
          hrr_kW: Math.round(hrr),
          max_soot: Math.round((hrr * 0.0001) * 1000) / 1000,
          max_smoke: Math.round((hrr * 0.0003) * 1000) / 1000,
          min_o2_pct: Math.max(12.5, Math.round((23.1 - hrr * 0.005) * 10) / 10)
        },
        evacuation: {
          total_agents: 25,
          escaped_agents: escaped,
          remaining_agents: 25 - escaped,
          evacuation_pct: Math.round((escaped / 25) * 100),
          agent_positions: agents
        },
        zone_field: {
          rooms: [
            { room_id: 0, layer_height_m: Math.max(0.5, 3.0 - t * 0.04), hot_layer_temp_c: Math.round(tempRise * 0.8), cool_layer_temp_c: 24 },
            { room_id: 1, layer_height_m: doorOpen ? Math.max(0.8, 3.0 - t * 0.02) : 3.0, hot_layer_temp_c: doorOpen ? Math.round(tempRise * 0.4) : 20, cool_layer_temp_c: 20 },
            { room_id: 2, layer_height_m: 3.0, hot_layer_temp_c: 20, cool_layer_temp_c: 20 }
          ]
        },
        structural: {
          current_member_temp_c: Math.round(20 + tempRise * 0.6),
          yield_reduction_ky: Math.round(ky * 1000) / 1000,
          elasticity_reduction_kE: Math.round(kE * 1000) / 1000
        }
      });
    }
    setHistory(steps);
  }, [fireAlpha, hrrPeak, useRLWayfinding, doorOpen]);

  // Animation playback loop
  useEffect(() => {
    let interval: any = null;
    if (isPlaying && history.length > 0) {
      interval = setInterval(() => {
        setCurrentStep((prev) => (prev + 1) % history.length);
      }, 200);
    }
    return () => clearInterval(interval);
  }, [isPlaying, history]);

  // Canvas drawing effect for CFD / Heatmap / Smoke / Evacuation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || history.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const current = history[currentStep] || history[0];
    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    // Render floorplan walls and background
    ctx.fillStyle = '#FAFBFC';
    ctx.fillRect(0, 0, width, height);

    // Wall borders
    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = 4;
    ctx.strokeRect(10, 10, width - 20, height - 20);

    // Internal partition walls (Room 0, Room 1, Room 2)
    const roomWidth = (width - 20) / 3;
    ctx.beginPath();
    ctx.moveTo(10 + roomWidth, 10);
    ctx.lineTo(10 + roomWidth, doorOpen ? height * 0.4 : height - 10);
    ctx.moveTo(10 + roomWidth * 2, 10);
    ctx.lineTo(10 + roomWidth * 2, height - 10);
    ctx.stroke();

    // Mode-specific render
    if (activeTab === 'cfd') {
      // Temperature & Smoke Heatmap grid
      const grid = current.cfd.temp_grid_sample;
      const cellW = (width - 20) / grid[0].length;
      const cellH = (height - 20) / grid.length;

      for (let r = 0; r < grid.length; r++) {
        for (let c = 0; c < grid[r].length; c++) {
          const temp = grid[r][c];
          const normT = Math.min(1.0, (temp - 20) / 750);
          // Color map: 20C (light blue) -> 400C (orange) -> 800C (deep fire red)
          let color = `rgba(31, 78, 121, 0.08)`;
          if (normT > 0.05) {
            const red = Math.floor(255 * normT);
            const green = Math.floor(180 * (1 - normT));
            const blue = Math.floor(50 * (1 - normT));
            color = `rgba(${red}, ${green}, ${blue}, ${0.15 + normT * 0.7})`;
          }
          ctx.fillStyle = color;
          ctx.fillRect(10 + c * cellW, 10 + r * cellH, cellW, cellH);
        }
      }

      // Fire Source pulse indicator
      const fireX = 10 + 2 * cellW;
      const fireY = 10 + 5 * cellH;
      ctx.beginPath();
      ctx.arc(fireX, fireY, 12 + Math.sin(Date.now() * 0.008) * 3, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(217, 83, 79, 0.85)';
      ctx.fill();
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 10px var(--font-sans)';
      ctx.fillText('FIRE SOURCE', fireX - 32, fireY + 4);

    } else if (activeTab === 'evacuation') {
      // Draw Exit indicator
      ctx.fillStyle = '#2E7D32';
      ctx.fillRect(width - 14, height / 2 - 25, 8, 50);
      ctx.fillStyle = '#2E7D32';
      ctx.font = 'bold 11px var(--font-sans)';
      ctx.fillText('EXIT', width - 40, height / 2 - 30);

      // Render Flat-colored agent dots
      current.evacuation.agent_positions.forEach((agent) => {
        if (agent.escaped) return;
        const posX = 10 + (agent.x / 8.0) * (width - 20);
        const posY = 10 + (agent.y / 6.0) * (height - 20);

        ctx.beginPath();
        ctx.arc(posX, posY, 6, 0, Math.PI * 2);
        ctx.fillStyle = useRLWayfinding ? '#1F4E79' : '#F0AD4E';
        ctx.fill();
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      });
    }
  }, [activeTab, currentStep, history, doorOpen, useRLWayfinding]);

  const current = history[currentStep] || {
    step: 0,
    sim_time_sec: 0,
    cfd: { max_temp_c: 20, avg_temp_c: 20, max_velocity: 0, temp_grid_sample: [] },
    species: { hrr_kW: 0, max_soot: 0, max_smoke: 0, min_o2_pct: 23.1 },
    evacuation: { total_agents: 25, escaped_agents: 0, remaining_agents: 25, evacuation_pct: 0, agent_positions: [] },
    zone_field: { rooms: [] },
    structural: { current_member_temp_c: 20, yield_reduction_ky: 1.0, elasticity_reduction_kE: 1.0 }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-main)' }}>
      {/* Top Header */}
      <header style={{
        height: '60px',
        backgroundColor: 'var(--bg-card)',
        borderBottom: '1px solid var(--border-color)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '6px',
            backgroundColor: 'var(--accent-blue)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#FFF'
          }}>
            <Flame size={20} />
          </div>
          <div>
            <h1 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2 }}>firetwin</h1>
            <p style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Coupled Multiphysics Fire & Hazard Simulation Platform</p>
          </div>
        </div>

        {/* Model Mode Selector (Mandatory Design Spec) */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          background: 'var(--bg-subtle)',
          padding: '3px',
          borderRadius: '8px',
          border: '1px solid var(--border-color)'
        }}>
          <button
            onClick={() => setModelMode('surrogate')}
            style={{
              padding: '6px 14px',
              fontSize: '12px',
              fontWeight: 600,
              border: 'none',
              borderRadius: '6px',
              backgroundColor: modelMode === 'surrogate' ? 'var(--accent-blue)' : 'transparent',
              color: modelMode === 'surrogate' ? '#FFFFFF' : 'var(--text-secondary)'
            }}
          >
            <Zap size={14} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'text-bottom' }} />
            Surrogate (fast)
          </button>
          <button
            onClick={() => setModelMode('les')}
            style={{
              padding: '6px 14px',
              fontSize: '12px',
              fontWeight: 600,
              border: 'none',
              borderRadius: '6px',
              backgroundColor: modelMode === 'les' ? 'var(--accent-blue)' : 'transparent',
              color: modelMode === 'les' ? '#FFFFFF' : 'var(--text-secondary)'
            }}
          >
            <Activity size={14} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'text-bottom' }} />
            Full LES (accurate)
          </button>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            className="btn-primary"
            onClick={() => setIsPlaying(!isPlaying)}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            {isPlaying ? <Pause size={14} /> : <Play size={14} />}
            {isPlaying ? 'Pause Run' : 'Start Simulation'}
          </button>
          <a
            href={`http://localhost:8000/reports/${scenarioId}/pdf`}
            target="_blank"
            rel="noreferrer"
            style={{ textDecoration: 'none' }}
          >
            <button style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Download size={14} />
              PDF Report
            </button>
          </a>
        </div>
      </header>

      {/* Main Container */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '260px 1fr 340px', gap: '1px', background: 'var(--border-color)' }}>
        
        {/* Left Sidebar: Story & Floorplan Tree */}
        <aside style={{ background: 'var(--bg-card)', padding: '16px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <h3 style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '12px' }}>
              Building Layout Tree
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ padding: '8px 12px', borderRadius: '6px', background: 'var(--accent-blue-light)', color: 'var(--accent-blue)', fontWeight: 600, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Building size={16} /> Story 1 (Ground Level)
              </div>
              <div style={{ padding: '8px 12px 8px 28px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                • Room 01 (Fire Cell)
              </div>
              <div style={{ padding: '8px 12px 8px 28px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                • Room 02 (Corridor)
              </div>
              <div style={{ padding: '8px 12px 8px 28px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                • Room 03 (Stairwell)
              </div>
            </div>
          </div>

          <div>
            <h3 style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '12px' }}>
              Ventilation & Doors
            </h3>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
              <input
                type="checkbox"
                checked={doorOpen}
                onChange={(e) => setDoorOpen(e.target.checked)}
              />
              Inter-room Door Open
            </label>
          </div>

          <div>
            <h3 style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '12px' }}>
              Active Model Driving View
            </h3>
            <div className="card" style={{ padding: '10px', background: 'var(--bg-main)' }}>
              <div className="badge badge-blue">{modelMode === 'surrogate' ? 'FNO Neural Operator' : 'Boussinesq LES CFD'}</div>
              <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '6px' }}>
                {modelMode === 'surrogate'
                  ? 'Real-time spectral Fourier operator inference (~4ms latency per timestep).'
                  : 'High-fidelity Smagorinsky eddy-viscosity Navier-Stokes integration.'}
              </p>
            </div>
          </div>
        </aside>

        {/* Center Canvas & Timeline Controls */}
        <main style={{ background: 'var(--bg-main)', display: 'flex', flexDirection: 'column' }}>
          {/* Top Viewport Navigation Tabs */}
          <div style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border-color)', display: 'flex', padding: '0 16px' }}>
            <button
              onClick={() => setActiveTab('cfd')}
              style={{
                border: 'none',
                borderRadius: 0,
                borderBottom: activeTab === 'cfd' ? '2px solid var(--accent-blue)' : 'none',
                color: activeTab === 'cfd' ? 'var(--accent-blue)' : 'var(--text-secondary)',
                fontWeight: activeTab === 'cfd' ? 600 : 400,
                padding: '12px 16px'
              }}
            >
              <Wind size={15} style={{ display: 'inline', marginRight: '6px' }} />
              CFD & Heatmap
            </button>
            <button
              onClick={() => setActiveTab('evacuation')}
              style={{
                border: 'none',
                borderRadius: 0,
                borderBottom: activeTab === 'evacuation' ? '2px solid var(--accent-blue)' : 'none',
                color: activeTab === 'evacuation' ? 'var(--accent-blue)' : 'var(--text-secondary)',
                fontWeight: activeTab === 'evacuation' ? 600 : 400,
                padding: '12px 16px'
              }}
            >
              <Users size={15} style={{ display: 'inline', marginRight: '6px' }} />
              Evacuation View
            </button>
            <button
              onClick={() => setActiveTab('structural')}
              style={{
                border: 'none',
                borderRadius: 0,
                borderBottom: activeTab === 'structural' ? '2px solid var(--accent-blue)' : 'none',
                color: activeTab === 'structural' ? 'var(--accent-blue)' : 'var(--text-secondary)',
                fontWeight: activeTab === 'structural' ? 600 : 400,
                padding: '12px 16px'
              }}
            >
              <Layers size={15} style={{ display: 'inline', marginRight: '6px' }} />
              Structural Link (Project 2)
            </button>
          </div>

          {/* Viewport Canvas */}
          <div style={{ flex: 1, padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <div className="card" style={{ width: '100%', maxWidth: '780px', padding: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span className="mono" style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  Viewport: {activeTab.toUpperCase()} | Time: {current.sim_time_sec}s
                </span>
                <span className="badge badge-fire">Max Temp: {current.cfd.max_temp_c}°C</span>
              </div>
              <canvas
                ref={canvasRef}
                width={740}
                height={420}
                style={{
                  width: '100%',
                  height: '420px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color)',
                  backgroundColor: '#FAFBFC'
                }}
              />
            </div>
          </div>

          {/* Playback Scrub Control Bar */}
          <div style={{
            height: '64px',
            background: 'var(--bg-card)',
            borderTop: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            padding: '0 24px',
            gap: '16px'
          }}>
            <button onClick={() => setIsPlaying(!isPlaying)} style={{ width: '36px', height: '36px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {isPlaying ? <Pause size={16} /> : <Play size={16} />}
            </button>
            <button onClick={() => setCurrentStep(0)} style={{ width: '36px', height: '36px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <RotateCcw size={16} />
            </button>

            <span className="mono" style={{ width: '60px', fontSize: '12px', color: 'var(--text-secondary)' }}>
              {current.sim_time_sec}s
            </span>

            <input
              type="range"
              min={0}
              max={history.length - 1}
              value={currentStep}
              onChange={(e) => setCurrentStep(parseInt(e.target.value))}
              style={{ flex: 1, accentColor: 'var(--accent-blue)', cursor: 'pointer' }}
            />

            <span className="mono" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              Step {currentStep + 1} / {history.length}
            </span>
          </div>
        </main>

        {/* Right Inspector Panel */}
        <aside style={{ background: 'var(--bg-card)', padding: '16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <h3 style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '12px' }}>
              Fire Source Parameters
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                  Peak Heat Release Rate (HRR): <b>{hrrPeak} kW</b>
                </label>
                <input
                  type="range"
                  min={500}
                  max={3000}
                  step={100}
                  value={hrrPeak}
                  onChange={(e) => setHrrPeak(parseInt(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--accent-blue)' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                  $t^2$ Fire Growth Rate Alpha
                </label>
                <select
                  value={fireAlpha}
                  onChange={(e) => setFireAlpha(parseFloat(e.target.value))}
                  style={{ width: '100%', padding: '6px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12px' }}
                >
                  <option value={0.0029}>Slow (0.0029)</option>
                  <option value={0.0117}>Medium (0.0117)</option>
                  <option value={0.0469}>Fast (0.0469)</option>
                  <option value={0.1876}>Ultra-Fast (0.1876)</option>
                </select>
              </div>
            </div>
          </div>

          <div>
            <h3 style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '12px' }}>
              Evacuation Routing Strategy
            </h3>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px' }}>
              <input
                type="checkbox"
                checked={useRLWayfinding}
                onChange={(e) => setUseRLWayfinding(e.target.checked)}
              />
              Enable RL Dynamic Wayfinding
            </label>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
              {useRLWayfinding ? 'RL Agent actively avoids high-temperature/smoke hazard paths.' : 'Baseline Social Force model with standard exit vector.'}
            </p>
          </div>

          <div>
            <h3 style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '12px' }}>
              Live Telemetry & Metrics
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', background: 'var(--bg-main)', borderRadius: '6px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Current HRR:</span>
                <span className="mono" style={{ fontWeight: 600 }}>{current.species.hrr_kW} kW</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', background: 'var(--bg-main)', borderRadius: '6px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Min Oxygen Level:</span>
                <span className="mono" style={{ fontWeight: 600 }}>{current.species.min_o2_pct}%</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', background: 'var(--bg-main)', borderRadius: '6px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Evacuated Agents:</span>
                <span className="mono" style={{ fontWeight: 600 }}>{current.evacuation.escaped_agents} / {current.evacuation.total_agents} ({current.evacuation.evacuation_pct}%)</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', background: 'var(--bg-main)', borderRadius: '6px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Steel Temp:</span>
                <span className="mono" style={{ fontWeight: 600 }}>{current.structural.current_member_temp_c}°C</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', background: 'var(--bg-main)', borderRadius: '6px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Steel Yield Factor (ky):</span>
                <span className="mono" style={{ fontWeight: 600, color: current.structural.yield_reduction_ky < 0.5 ? 'var(--hazard-fire)' : 'var(--text-primary)' }}>
                  {current.structural.yield_reduction_ky}
                </span>
              </div>
            </div>
          </div>
        </aside>

      </div>
    </div>
  );
}
