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

function MathBlock({ formula, label, description, subFormula }: { formula: string; label: string; description?: string; subFormula?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const subContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const renderMath = () => {
      if ((window as any).katex) {
        if (containerRef.current) {
          try {
            (window as any).katex.render(formula, containerRef.current, {
              displayMode: true,
              throwOnError: false
            });
          } catch (err) {
            console.error(err);
          }
        }
        if (subContainerRef.current && subFormula) {
          try {
            (window as any).katex.render(subFormula, subContainerRef.current, {
              displayMode: true,
              throwOnError: false
            });
          } catch (err) {
            console.error(err);
          }
        }
      }
    };
    renderMath();
    const timer = setTimeout(renderMath, 250);
    return () => clearTimeout(timer);
  }, [formula, subFormula]);

  return (
    <div style={{ padding: '14px 16px', background: 'var(--bg-main)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
      <h4 style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)', marginBottom: '8px' }}>{label}</h4>
      <div
        ref={containerRef}
        style={{
          padding: '10px 14px',
          background: '#FFFFFF',
          borderRadius: '6px',
          border: '1px solid #E2E8F0',
          color: 'var(--accent-blue)',
          fontSize: '15px',
          overflowX: 'auto',
          minHeight: '44px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <span className="mono" style={{ fontSize: '12px', color: 'var(--accent-blue)' }}>{formula}</span>
      </div>
      {subFormula && (
        <div style={{ marginTop: '8px' }}>
          {description && (
            <p style={{ color: 'var(--text-secondary)', fontSize: '11px', marginBottom: '4px' }}>
              {description}
            </p>
          )}
          <div
            ref={subContainerRef}
            style={{
              padding: '8px 12px',
              background: '#FFFFFF',
              borderRadius: '6px',
              border: '1px solid #E2E8F0',
              color: 'var(--text-primary)',
              fontSize: '13px',
              overflowX: 'auto',
              minHeight: '36px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <span className="mono" style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{subFormula}</span>
          </div>
        </div>
      )}
      {!subFormula && description && (
        <p style={{ color: 'var(--text-secondary)', fontSize: '11px', marginTop: '8px', lineHeight: 1.4 }}>
          {description}
        </p>
      )}
    </div>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'cfd' | 'evacuation' | 'structural' | 'math'>('cfd');
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

      // Grid sample 10x12 (Room 0: cols 0..3, Room 1: cols 4..7, Room 2: cols 8..11)
      const fireRow = 7; // Fire at bottom of Room 0
      const fireCol = 2; // Center of Room 0

      const grid: number[][] = [];
      for (let r = 0; r < 10; r++) {
        const row: number[] = [];
        for (let c = 0; c < 12; c++) {
          let localT = 20.0;

          // Wall isolation check
          const isRoom0 = c <= 3;
          const isRoom1 = c >= 4 && c <= 7;
          const isRoom2 = c >= 8;

          if (isRoom0) {
            // Plume physics in Room 0: rising heat + ceiling layer accumulation
            const dx = c - fireCol;
            const dy = fireRow - r; // dy > 0 means above fire

            if (dy >= 0) {
              // Plume width widens with height
              const plumeRadius = 1.0 + dy * 0.35;
              const distFromPlumeAxis = Math.abs(dx);
              if (distFromPlumeAxis <= plumeRadius) {
                const plumeT = 20 + tempRise * Math.exp(-Math.pow(distFromPlumeAxis / plumeRadius, 2));
                localT = Math.max(localT, plumeT);
              }
              // Ceiling layer accumulation (r <= 2)
              if (r <= 2) {
                const ceilingT = 20 + tempRise * 0.7 * Math.exp(-Math.abs(dx) * 0.2);
                localT = Math.max(localT, ceilingT);
              }
            } else {
              // Conduction downwards near fire base
              const distBase = Math.sqrt(dx*dx + dy*dy);
              localT = Math.max(20, 20 + tempRise * Math.exp(-distBase * 0.8));
            }
          } else if (isRoom1 && doorOpen) {
            // Spillover into Room 1 only if door is open (spill across ceiling r <= 3)
            if (r <= 3) {
              const spillDist = c - 3;
              const spillT = 20 + tempRise * 0.45 * Math.exp(-spillDist * 0.4 - r * 0.3);
              localT = Math.max(localT, spillT);
            }
          }

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

    // Render floorplan background
    ctx.fillStyle = '#FAFBFC';
    ctx.fillRect(0, 0, width, height);

    // Mode-specific render (draw grid heatmap first)
    const grid = current.cfd.temp_grid_sample;
    const cellW = (width - 20) / grid[0].length;
    const cellH = (height - 20) / grid.length;

    if (activeTab === 'cfd' || activeTab === 'evacuation') {
      // Temperature & Smoke Heatmap grid
      for (let r = 0; r < grid.length; r++) {
        for (let c = 0; c < grid[r].length; c++) {
          const temp = grid[r][c];
          if (temp > 25.0) {
            const normT = Math.min(1.0, (temp - 20) / 750);
            let color = 'rgba(240, 173, 78, 0.2)';
            if (normT > 0.65) {
              color = `rgba(255, 230, 120, ${0.7 + normT * 0.25})`; // Intense fire core
            } else if (normT > 0.4) {
              color = `rgba(220, 50, 40, ${0.5 + normT * 0.35})`; // Deep flame red
            } else if (normT > 0.15) {
              color = `rgba(230, 120, 20, ${0.3 + normT * 0.4})`; // Thermal orange
            } else {
              color = `rgba(240, 173, 78, ${0.15 + normT * 0.25})`; // Warm yellow
            }
            ctx.fillStyle = color;
            ctx.fillRect(10 + c * cellW, 10 + r * cellH, cellW, cellH);

            // Translucent smoke layer on top in upper ceiling cells (r <= 2)
            if (r <= 2 && temp > 40.0) {
              ctx.fillStyle = `rgba(40, 45, 55, ${Math.min(0.6, (temp / 800) * 0.7)})`;
              ctx.fillRect(10 + c * cellW, 10 + r * cellH, cellW, cellH);
            }
          }
        }
      }

      // Fire Source pulse indicator at fireRow = 7, fireCol = 2
      const fireX = 10 + (2 + 0.5) * cellW;
      const fireY = 10 + (7 + 0.5) * cellH;

      ctx.beginPath();
      ctx.arc(fireX, fireY, 14 + Math.sin(Date.now() * 0.01) * 3, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(217, 83, 79, 0.9)';
      ctx.fill();
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 10px var(--font-sans)';
      ctx.fillText('FIRE SOURCE', fireX - 32, fireY + 4);
    }

    // Outer Wall borders
    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = 4;
    ctx.strokeRect(10, 10, width - 20, height - 20);

    // Internal partition walls (Room 0, Room 1, Room 2)
    const roomWidth = (width - 20) / 3;
    ctx.strokeStyle = '#64748B';
    ctx.lineWidth = 4;

    ctx.beginPath();
    // Wall between Room 0 and Room 1 with door opening at top if doorOpen is true
    ctx.moveTo(10 + roomWidth, 10);
    ctx.lineTo(10 + roomWidth, doorOpen ? height * 0.35 : height - 10);
    if (doorOpen) {
      // Draw door frame indicator
      ctx.strokeStyle = '#1F4E79';
      ctx.lineWidth = 2;
      ctx.strokeRect(10 + roomWidth - 3, height * 0.35, 6, 24);
      ctx.strokeStyle = '#64748B';
      ctx.lineWidth = 4;
    }
    // Solid wall between Room 1 and Room 2
    ctx.moveTo(10 + roomWidth * 2, 10);
    ctx.lineTo(10 + roomWidth * 2, height - 10);
    ctx.stroke();

    if (activeTab === 'evacuation') {
      // Draw Exit indicator at right wall
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
        ctx.arc(posX, posY, 6.5, 0, Math.PI * 2);
        ctx.fillStyle = useRLWayfinding ? '#1F4E79' : '#F0AD4E';
        ctx.fill();
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1.8;
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
            <button
              onClick={() => setActiveTab('math')}
              style={{
                border: 'none',
                borderRadius: 0,
                borderBottom: activeTab === 'math' ? '2px solid var(--accent-blue)' : 'none',
                color: activeTab === 'math' ? 'var(--accent-blue)' : 'var(--text-secondary)',
                fontWeight: activeTab === 'math' ? 600 : 400,
                padding: '12px 16px'
              }}
            >
              <FileText size={15} style={{ display: 'inline', marginRight: '6px' }} />
              Math & Physics Formulations
            </button>
          </div>

          {/* Viewport Canvas or Math View */}
          <div style={{ flex: 1, padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', overflowY: 'auto' }}>
            {activeTab === 'math' ? (
              <div className="card" style={{ width: '100%', maxWidth: '780px', padding: '20px', background: 'var(--bg-card)' }}>
                <h2 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--accent-blue)', marginBottom: '16px' }}>
                  Governing Partial Differential Equations & Mathematical Formulations
                </h2>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <MathBlock
                    label="1. Incompressible Boussinesq Navier-Stokes LES Solver"
                    formula="\frac{\partial \mathbf{u}}{\partial t} + (\mathbf{u} \cdot \nabla)\mathbf{u} = -\frac{1}{\rho_0}\nabla p + (\nu + \nu_{\text{sgs}})\nabla^2\mathbf{u} + g \beta (T - T_0)\hat{\mathbf{j}}"
                    description="Smagorinsky subgrid-scale turbulence closure formulation:"
                    subFormula="\nu_{\text{sgs}} = (C_s \Delta)^2 \sqrt{2 S_{ij} S_{ij}}, \quad S_{ij} = \frac{1}{2}\left(\nabla \mathbf{u} + (\nabla \mathbf{u})^T\right)"
                  />

                  <MathBlock
                    label="2. P1 Spherical Harmonics Radiative Heat Transfer"
                    formula="-\nabla \cdot \left[ \frac{1}{3(a + \sigma_s)} \nabla G \right] + a G = 4 a \sigma T^4"
                    description="Net radiative heat source/sink equation:"
                    subFormula="q_{\text{rad}} = a \left( G - 4 \sigma T^4 \right)"
                  />

                  <MathBlock
                    label="3. Combustion & t² Fire Growth Rate"
                    formula="\dot{Q}(t) = \min\left( \alpha t^2, \dot{Q}_{\text{peak}} \right)"
                    description="Species advection-diffusion-reaction field equation:"
                    subFormula="\frac{\partial Y_k}{\partial t} + \mathbf{u} \cdot \nabla Y_k = D_k \nabla^2 Y_k + \dot{\omega}_k"
                  />

                  <MathBlock
                    label="4. Thermal-Structural Degradation & Eurocode 3 Standards"
                    formula="T_{\text{ISO}}(t) = 20 + 345 \log_{10}(8 t_{\text{min}} + 1) \quad \text{and} \quad \frac{d T_s}{d t} = \frac{q''}{\rho c_p} \left( \frac{A_m}{V} \right)"
                    description="Eurocode 3 yield strength & stiffness reduction functions:"
                    subFormula="f_y(T) = k_y(T) f_{y,0}, \quad E(T) = k_E(T) E_0"
                  />

                  <MathBlock
                    label="5. Helbing Social Force Pedestrian Evacuation Model"
                    formula="m_i \frac{d \mathbf{v}_i}{d t} = \mathbf{f}_i^{\text{des}} + \sum_{j \neq i} \mathbf{f}_{ij}^{\text{soc}} + \sum_{w} \mathbf{f}_{iw}^{\text{wall}}"
                    description="Desired force & pedestrian walking speed attenuation in smoke:"
                    subFormula="\mathbf{f}_i^{\text{des}} = \frac{v_i^{\text{des}} \mathbf{e}_i^{\text{des}} - \mathbf{v}_i}{\tau}, \quad v_i^{\text{des}} = v_0 \max\left(0.2, 1 - 0.65 K_{\text{ext}}\right)"
                  />

                  <MathBlock
                    label="6. Fourier Neural Operator (FNO2d) Spectral Convolution"
                    formula="v_{l+1}(x) = \sigma \left( W v_l(x) + \mathcal{F}^{-1} \left( R_{\phi} \cdot \mathcal{F}(v_l) \right)(x) \right)"
                    description="Spectral domain weight tensor multiplication:"
                    subFormula="\left(R_{\phi} \cdot \hat{v}_l\right)(k) = \sum_{j=1}^{d} \hat{R}_{\phi}(k)_{ij} \hat{v}_l(k)_j"
                  />
                </div>
              </div>
            ) : (
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
            )}
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
                  Peak Heat Release Rate Q̇_peak: <b>{hrrPeak} kW</b>
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
                  t² Fire Growth Coefficient (α)
                </label>
                <select
                  value={fireAlpha}
                  onChange={(e) => setFireAlpha(parseFloat(e.target.value))}
                  style={{ width: '100%', padding: '6px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12px' }}
                >
                  <option value={0.0029}>Slow (α = 0.0029 kW/s²)</option>
                  <option value={0.0117}>Medium (α = 0.0117 kW/s²)</option>
                  <option value={0.0469}>Fast (α = 0.0469 kW/s²)</option>
                  <option value={0.1876}>Ultra-Fast (α = 0.1876 kW/s²)</option>
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
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Current HRR Q̇(t):</span>
                <span className="mono" style={{ fontWeight: 600 }}>{current.species.hrr_kW} kW</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', background: 'var(--bg-main)', borderRadius: '6px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>O₂ Concentration:</span>
                <span className="mono" style={{ fontWeight: 600 }}>{current.species.min_o2_pct}%</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', background: 'var(--bg-main)', borderRadius: '6px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Evacuated Agents:</span>
                <span className="mono" style={{ fontWeight: 600 }}>{current.evacuation.escaped_agents} / {current.evacuation.total_agents} ({current.evacuation.evacuation_pct}%)</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', background: 'var(--bg-main)', borderRadius: '6px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Steel Temp T_s:</span>
                <span className="mono" style={{ fontWeight: 600 }}>{current.structural.current_member_temp_c}°C</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', background: 'var(--bg-main)', borderRadius: '6px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Yield Factor k_y(T):</span>
                <span className="mono" style={{ fontWeight: 600, color: current.structural.yield_reduction_ky < 0.5 ? 'var(--hazard-fire)' : 'var(--text-primary)' }}>
                  {current.structural.yield_reduction_ky}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', background: 'var(--bg-main)', borderRadius: '6px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Stiffness Factor k_E(T):</span>
                <span className="mono" style={{ fontWeight: 600 }}>
                  {current.structural.elasticity_reduction_kE}
                </span>
              </div>
            </div>
          </div>
        </aside>

      </div>
    </div>
  );
}
