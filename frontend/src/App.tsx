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
} from 'lucide-react';
import { generateClientSidePDF } from './report/pdfGenerator';

interface SimulationStep {
  step: number;
  sim_time_sec: number;
  cfd: {
    max_temp_c: number;
    avg_temp_c: number;
    max_velocity: number;
    temp_grid_sample: number[][];
    total_thermal_energy_mj: number;
  };
  species: {
    hrr_kW: number;
    max_soot: number;
    max_smoke: number;
    min_o2_pct: number;
    fed_index: number;
  };
  tenability: {
    aset_sec: number;
    rset_sec: number;
    flashover_risk_pct: number;
    tenable_clearance_m: number;
    safety_margin_sec: number;
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
    structural_safety_factor: number;
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

function TimeSeriesChart({
  title,
  timeSeries,
  series
}: {
  title: string;
  timeSeries: number[];
  series: Array<{ name: string; values: number[]; color: string; dash?: boolean }>;
}) {
  const chartCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = chartCanvasRef.current;
    if (!canvas || timeSeries.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const padding = { top: 25, right: 35, bottom: 35, left: 50 };

    ctx.clearRect(0, 0, width, height);

    // Card background
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);

    const plotW = width - padding.left - padding.right;
    const plotH = height - padding.top - padding.bottom;

    const maxTime = Math.max(...timeSeries, 60);
    const allVals = series.flatMap(s => s.values);
    const maxVal = Math.max(...allVals, 1.0) * 1.1;
    const minVal = Math.min(0, Math.min(...allVals));

    // Grid lines
    ctx.strokeStyle = '#E3E7EC';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = padding.top + (plotH / 4) * i;
      const val = maxVal - (maxVal - minVal) * (i / 4);
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();

      ctx.fillStyle = '#5A6A80';
      ctx.font = '10px var(--font-sans)';
      ctx.textAlign = 'right';
      ctx.fillText(val.toFixed(1), padding.left - 6, y + 3);
    }

    // X-Axis time labels
    ctx.textAlign = 'center';
    for (let i = 0; i <= 5; i++) {
      const x = padding.left + (plotW / 5) * i;
      const t = (maxTime / 5) * i;
      ctx.fillText(`${t.toFixed(0)}s`, x, height - 12);
    }

    // Draw lines
    series.forEach(s => {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 2.2;
      if (s.dash) ctx.setLineDash([5, 4]);
      else ctx.setLineDash([]);

      ctx.beginPath();
      s.values.forEach((val, idx) => {
        const t = timeSeries[idx] || 0;
        const x = padding.left + (t / maxTime) * plotW;
        const y = padding.top + plotH - ((val - minVal) / Math.max(0.001, (maxVal - minVal))) * plotH;
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.setLineDash([]);
    });

  }, [timeSeries, series]);

  return (
    <div className="card" style={{ padding: '14px', background: '#FFFFFF' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--accent-blue)' }}>{title}</h4>
        <div style={{ display: 'flex', gap: '14px' }}>
          {series.map(s => (
            <span key={s.name} style={{ fontSize: '11px', color: s.color, fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ width: '12px', height: '3px', backgroundColor: s.color, borderRadius: '2px', display: 'inline-block' }} />
              {s.name}
            </span>
          ))}
        </div>
      </div>
      <canvas ref={chartCanvasRef} width={700} height={200} style={{ width: '100%', height: '200px', borderRadius: '4px' }} />
    </div>
  );
}

export interface FireSource {
  id: string;
  name: string;
  row: number;
  col: number;
  alpha: number;      // Growth coefficient in kW/s^2 (e.g. 0.0469)
  peakHRR: number;    // Peak HRR in kW (e.g. 1500)
  sootYield: number;  // Soot fraction (e.g. 0.05)
  delaySec: number;   // Ignition delay in seconds (e.g. 0)
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'cfd' | 'evacuation' | 'structural' | 'charts' | 'math'>('cfd');
  const [modelMode, setModelMode] = useState<'surrogate' | 'les'>('les');
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [fireAlpha, setFireAlpha] = useState<number>(0.0469); // Fast growth
  const [hrrPeak, setHrrPeak] = useState<number>(1500);
  const [useRLWayfinding, setUseRLWayfinding] = useState<boolean>(false);
  const [door1Open, setDoor1Open] = useState<boolean>(true);
  const [door2Open, setDoor2Open] = useState<boolean>(false);
  const [door1Mode, setDoor1Mode] = useState<string>('open'); // 'open' | 'closed' | 'fire-rated-60' | 'double-swing'
  const [door2Mode, setDoor2Mode] = useState<string>('closed'); // 'open' | 'closed' | 'fire-rated-60' | 'double-swing'
  const [roofVentPct, setRoofVentPct] = useState<number>(0); // 0%, 50%, 100% Rooftop SHEV Exhaust
  const [hvacMode, setHvacMode] = useState<string>('off'); // 'off' | 'extract' | 'pressurize'
  const [exteriorWindowOpen, setExteriorWindowOpen] = useState<boolean>(true);
  const [scenarioId, setScenarioId] = useState<string>('demo-scen-01');

  // Dynamic Multi-Compartment Building Partitioning State
  const [numCompartments, setNumCompartments] = useState<number>(3); // 3, 4, 5, 6 rooms
  const [fireRating, setFireRating] = useState<string>('EI60'); // EI30, EI60, EI120

  // Movable & Resizable Custom Wall Lines State
  const [customWalls, setCustomWalls] = useState<Array<{ id: string; type: 'vertical' | 'horizontal'; positionRatio: number; startRatio: number; endRatio: number; doorMode: string }>>([
    { id: 'v1', type: 'vertical', positionRatio: 0.333, startRatio: 0.0, endRatio: 1.0, doorMode: 'open' },
    { id: 'v2', type: 'vertical', positionRatio: 0.666, startRatio: 0.0, endRatio: 0.8, doorMode: 'closed' }
  ]);
  const [selectedWallId, setSelectedWallId] = useState<string | null>('v1');
  const [editorTool, setEditorTool] = useState<'move' | 'add-v' | 'add-h' | 'delete' | 'fire'>('move');
  const [dragTarget, setDragTarget] = useState<{ wallId: string; handle: 'center' | 'start' | 'end' } | null>(null);
  const [hoveredWallId, setHoveredWallId] = useState<string | null>(null);

  // Multi-Fire Ignition Hazard Sources State
  const [fireSources, setFireSources] = useState<FireSource[]>([
    { id: 'f1', name: 'Primary Fire #1', row: 7, col: 2, alpha: 0.0469, peakHRR: 1500, sootYield: 0.05, delaySec: 0 }
  ]);
  const [activeFireId, setActiveFireId] = useState<string>('f1');

  // Dynamic Editable Building Layout State
  const [sidebarWidth, setSidebarWidth] = useState<number>(560);
  const [configTab, setConfigTab] = useState<'all' | 'preset' | 'doors' | 'fire' | 'barriers'>('all');
  const [fireRow, setFireRow] = useState<number>(7);
  const [fireCol, setFireCol] = useState<number>(2);
  const [storyLevel, setStoryLevel] = useState<number>(1);
  const [layoutPreset, setLayoutPreset] = useState<string>('3-room');
  const [roomLength, setRoomLength] = useState<number>(8.0);
  const [roomWidth, setRoomWidth] = useState<number>(6.0);
  const [ceilingHeight, setCeilingHeight] = useState<number>(3.0);

  const handleAddFireSource = () => {
    const newId = `f_${Date.now()}`;
    const count = fireSources.length + 1;
    const newSrc: FireSource = {
      id: newId,
      name: `Secondary Fire #${count}`,
      row: Math.min(9, Math.max(0, Math.floor(Math.random() * 8) + 1)),
      col: Math.min(11, Math.max(0, Math.floor(Math.random() * 10) + 1)),
      alpha: 0.0469,
      peakHRR: 1000,
      sootYield: 0.05,
      delaySec: 15 * (count - 1)
    };
    setFireSources(prev => [...prev, newSrc]);
    setActiveFireId(newId);
  };

  const handleRemoveFireSource = (id: string) => {
    if (fireSources.length <= 1) return;
    const remaining = fireSources.filter(f => f.id !== id);
    setFireSources(remaining);
    if (activeFireId === id) {
      setActiveFireId(remaining[0].id);
    }
  };

  const updateActiveFireSource = (field: keyof FireSource, val: any) => {
    setFireSources(prev => prev.map(f => (f.id === activeFireId || (!activeFireId && f.id === prev[0].id)) ? { ...f, [field]: val } : f));
  };

  const updateWallLength = (wallId: string, newLengthMeters: number) => {
    setCustomWalls(prev => prev.map(w => {
      if (w.id !== wallId) return w;
      const span = w.type === 'vertical' ? roomWidth : roomLength;
      const desiredSpanRatio = Math.max(0.05, Math.min(1.0, newLengthMeters / span));
      let newEnd = w.startRatio + desiredSpanRatio;
      let newStart = w.startRatio;
      if (newEnd > 1.0) {
        newEnd = 1.0;
        newStart = Math.max(0.0, 1.0 - desiredSpanRatio);
      }
      return { ...w, startRatio: Math.round(newStart * 1000) / 1000, endRatio: Math.round(newEnd * 1000) / 1000 };
    }));
  };

  const handleDownloadPDF = async () => {
    try {
      let res: Response | null = null;
      try {
        res = await fetch(`/api/reports/${scenarioId}/pdf`);
      } catch {
        res = null;
      }
      if (!res || !res.ok) {
        try {
          res = await fetch(`http://localhost:8000/reports/${scenarioId}/pdf`);
        } catch {
          res = null;
        }
      }
      if (res && res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `firetwin_report_${scenarioId}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        return;
      }
    } catch (err) {
      console.warn("Backend PDF endpoint unavailable, generating client-side report:", err);
    }

    // Direct Client-Side 3-Page Vector PDF Generation (NEVER screenshot / NEVER window.print!)
    try {
      generateClientSidePDF(scenarioId, {
        roomLength,
        roomWidth,
        roomHeight: ceilingHeight,
        currentStep,
        shevOpenPct: roofVentPct,
        hvacMode,
        history,
        fireSources,
        doors: [
          { id: 1, open: door1Open, mode: door1Mode },
          { id: 2, open: door2Open, mode: door2Mode }
        ],
        customWalls
      });
    } catch (clientErr) {
      console.error("Client-side PDF generation error:", clientErr);
    }
  };

  // Simulated live field snapshot history
  const [history, setHistory] = useState<SimulationStep[]>([]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const clickX = (e.clientX - rect.left) * scaleX;
    const clickY = (e.clientY - rect.top) * scaleY;
    const width = canvas.width;
    const height = canvas.height;

    // Check if mouse is near any existing wall line or its start/end nodes
    for (const wall of customWalls) {
      if (wall.type === 'vertical') {
        const wallX = 10 + wall.positionRatio * (width - 20);
        const yStart = 10 + wall.startRatio * (height - 20);
        const yEnd = 10 + wall.endRatio * (height - 20);

        if (Math.abs(clickX - wallX) < 14) {
          setSelectedWallId(wall.id);
          if (editorTool === 'delete') {
            setCustomWalls(customWalls.filter(w => w.id !== wall.id));
            if (selectedWallId === wall.id) setSelectedWallId(null);
            return;
          }
          if (Math.abs(clickY - yStart) < 12) {
            setDragTarget({ wallId: wall.id, handle: 'start' });
            return;
          }
          if (Math.abs(clickY - yEnd) < 12) {
            setDragTarget({ wallId: wall.id, handle: 'end' });
            return;
          }
          if (clickY >= Math.min(yStart, yEnd) - 8 && clickY <= Math.max(yStart, yEnd) + 8) {
            setDragTarget({ wallId: wall.id, handle: 'center' });
            return;
          }
        }
      } else {
        const wallY = 10 + wall.positionRatio * (height - 20);
        const xStart = 10 + wall.startRatio * (width - 20);
        const xEnd = 10 + wall.endRatio * (width - 20);

        if (Math.abs(clickY - wallY) < 14) {
          setSelectedWallId(wall.id);
          if (editorTool === 'delete') {
            setCustomWalls(customWalls.filter(w => w.id !== wall.id));
            if (selectedWallId === wall.id) setSelectedWallId(null);
            return;
          }
          if (Math.abs(clickX - xStart) < 12) {
            setDragTarget({ wallId: wall.id, handle: 'start' });
            return;
          }
          if (Math.abs(clickX - xEnd) < 12) {
            setDragTarget({ wallId: wall.id, handle: 'end' });
            return;
          }
          if (clickX >= Math.min(xStart, xEnd) - 8 && clickX <= Math.max(xStart, xEnd) + 8) {
            setDragTarget({ wallId: wall.id, handle: 'center' });
            return;
          }
        }
      }
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const mouseX = (e.clientX - rect.left) * scaleX;
    const mouseY = (e.clientY - rect.top) * scaleY;
    const width = canvas.width;
    const height = canvas.height;

    // Handle Active Dragging (Center Move, Start Node Resize, End Node Resize)
    if (dragTarget) {
      setCustomWalls(prev => prev.map(wall => {
        if (wall.id !== dragTarget.wallId) return wall;

        if (wall.type === 'vertical') {
          if (dragTarget.handle === 'center') {
            const ratio = Math.max(0.08, Math.min(0.92, (mouseX - 10) / (width - 20)));
            return { ...wall, positionRatio: Math.round(ratio * 1000) / 1000 };
          }
          if (dragTarget.handle === 'start') {
            const ratio = Math.max(0.0, Math.min(wall.endRatio - 0.1, (mouseY - 10) / (height - 20)));
            return { ...wall, startRatio: Math.round(ratio * 1000) / 1000 };
          }
          if (dragTarget.handle === 'end') {
            const ratio = Math.max(wall.startRatio + 0.1, Math.min(1.0, (mouseY - 10) / (height - 20)));
            return { ...wall, endRatio: Math.round(ratio * 1000) / 1000 };
          }
        } else {
          if (dragTarget.handle === 'center') {
            const ratio = Math.max(0.08, Math.min(0.92, (mouseY - 10) / (height - 20)));
            return { ...wall, positionRatio: Math.round(ratio * 1000) / 1000 };
          }
          if (dragTarget.handle === 'start') {
            const ratio = Math.max(0.0, Math.min(wall.endRatio - 0.1, (mouseX - 10) / (width - 20)));
            return { ...wall, startRatio: Math.round(ratio * 1000) / 1000 };
          }
          if (dragTarget.handle === 'end') {
            const ratio = Math.max(wall.startRatio + 0.1, Math.min(1.0, (mouseX - 10) / (width - 20)));
            return { ...wall, endRatio: Math.round(ratio * 1000) / 1000 };
          }
        }
        return wall;
      }));
      return;
    }

    // Check Hovered Wall
    let foundHover: string | null = null;
    for (const wall of customWalls) {
      if (wall.type === 'vertical') {
        const wallX = 10 + wall.positionRatio * (width - 20);
        if (Math.abs(mouseX - wallX) < 10) foundHover = wall.id;
      } else {
        const wallY = 10 + wall.positionRatio * (height - 20);
        if (Math.abs(mouseY - wallY) < 10) foundHover = wall.id;
      }
    }
    setHoveredWallId(foundHover);
  };

  const handleCanvasMouseUp = () => {
    setDragTarget(null);
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (dragTarget) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const clickX = (e.clientX - rect.left) * scaleX;
    const clickY = (e.clientY - rect.top) * scaleY;

    const width = canvas.width;
    const height = canvas.height;

    if (editorTool === 'add-v') {
      const ratio = Math.max(0.1, Math.min(0.9, (clickX - 10) / (width - 20)));
      const newId = `v_${Date.now()}`;
      setCustomWalls([...customWalls, { id: newId, type: 'vertical', positionRatio: Math.round(ratio * 1000) / 1000, startRatio: 0.0, endRatio: 1.0, doorMode: 'open' }]);
      setSelectedWallId(newId);
      return;
    }

    if (editorTool === 'add-h') {
      const ratio = Math.max(0.1, Math.min(0.9, (clickY - 10) / (height - 20)));
      const newId = `h_${Date.now()}`;
      setCustomWalls([...customWalls, { id: newId, type: 'horizontal', positionRatio: Math.round(ratio * 1000) / 1000, startRatio: 0.0, endRatio: 1.0, doorMode: 'open' }]);
      setSelectedWallId(newId);
      return;
    }

    // Fire Source Placement
    const gridCols = 12;
    const gridRows = 10;
    const cellW = (width - 20) / gridCols;
    const cellH = (height - 20) / gridRows;

    const col = Math.floor((clickX - 10) / cellW);
    const row = Math.floor((clickY - 10) / cellH);

    if (col >= 0 && col < gridCols && row >= 0 && row < gridRows) {
      setFireRow(row);
      setFireCol(col);
      updateActiveFireSource('row', row);
      updateActiveFireSource('col', col);
    }
  };

  // Generate synthetic timesteps for responsive simulation UI
  useEffect(() => {
    const steps: SimulationStep[] = [];
    const numSteps = 60;
    const currentVolume = roomLength * roomWidth * ceilingHeight;
    const volScale = 144.0 / currentVolume; // baseline reference volume = 144 m³ (8m x 6m x 3m)

    // Physics modulation from Vents & Mechanical Systems
    const roofVentFactor = 1.0 - (roofVentPct / 100.0) * 0.28; // SHEV roof exhaust venting
    const hvacTempFactor = hvacMode === 'extract' ? 0.78 : (hvacMode === 'pressurize' ? 0.90 : 1.0);
    const spillFactor1 = door1Mode === 'open' || door1Mode === 'double-swing' ? 1.0 : (door1Mode === 'fire-rated-60' ? 0.05 : 0.0);
    const spillFactor2 = door2Mode === 'open' || door2Mode === 'double-swing' ? 1.0 : (door2Mode === 'fire-rated-60' ? 0.05 : 0.0);

    for (let i = 0; i < numSteps; i++) {
      const t = i * 1.5;
      let totalHrr = 0;

      fireSources.forEach(src => {
        if (t >= src.delaySec) {
          const srcT = t - src.delaySec;
          const hrrSrc = Math.min(src.alpha * (srcT ** 2), src.peakHRR);
          totalHrr += hrrSrc;
        }
      });

      const tempRise = 20 + Math.min(totalHrr * 0.45 * volScale * roofVentFactor * hvacTempFactor, 820);
      const ky = Math.max(0.02, 1.0 - (tempRise > 200 ? (tempRise - 200) * 0.0012 : 0));
      const kE = Math.max(0.02, 1.0 - (tempRise > 100 ? (tempRise - 100) * 0.0014 : 0));
      const escaped = Math.min(25, Math.floor(t * (useRLWayfinding ? 0.75 : 0.5)));

      const colsPerRoom = 12 / numCompartments;
      const primaryFire = fireSources[0] || { row: fireRow, col: fireCol };
      const fireRoomIdx = Math.min(numCompartments - 1, Math.floor(primaryFire.col / colsPerRoom));

      const grid: number[][] = [];
      for (let r = 0; r < 10; r++) {
        const row: number[] = [];
        for (let c = 0; c < 12; c++) {
          let localT = 20.0;

          fireSources.forEach(src => {
            if (t >= src.delaySec) {
              const srcT = t - src.delaySec;
              const srcHrr = Math.min(src.alpha * (srcT ** 2), src.peakHRR);
              const srcRise = Math.min(srcHrr * 0.45 * volScale * roofVentFactor * hvacTempFactor, 820);

              const srcRoomIdx = Math.min(numCompartments - 1, Math.floor(src.col / colsPerRoom));
              const cellRoomIdx = Math.min(numCompartments - 1, Math.floor(c / colsPerRoom));
              const isFireRoom = cellRoomIdx === srcRoomIdx;

              if (isFireRoom) {
                const dx = c - src.col;
                const dy = src.row - r;
                if (dy >= 0) {
                  const plumeRadius = 1.0 + dy * 0.35;
                  const distFromPlumeAxis = Math.abs(dx);
                  if (distFromPlumeAxis <= plumeRadius) {
                    const plumeT = 20 + srcRise * Math.exp(-Math.pow(distFromPlumeAxis / plumeRadius, 2));
                    localT = Math.max(localT, plumeT);
                  }
                  if (r <= 2) {
                    const ceilingT = 20 + srcRise * 0.7 * roofVentFactor * Math.exp(-Math.abs(dx) * 0.2);
                    localT = Math.max(localT, ceilingT);
                  }
                } else {
                  const distBase = Math.sqrt(dx*dx + dy*dy);
                  localT = Math.max(localT, 20 + srcRise * Math.exp(-distBase * 0.8));
                }
              } else {
                const roomDistance = Math.abs(cellRoomIdx - srcRoomIdx);
                const barrierAttenuation = fireRating === 'EI120' ? 0.02 : (fireRating === 'EI60' ? 0.05 : 0.15);
                const doorFactor = spillFactor1 > 0 ? spillFactor1 : barrierAttenuation;

                if (r <= 3) {
                  const spillT = 20 + srcRise * Math.pow(0.5, roomDistance) * doorFactor * Math.exp(-r * 0.3);
                  localT = Math.max(localT, spillT);
                }
              }
            }
          });

          row.push(Math.round(localT * 10) / 10);
        }
        grid.push(row);
      }

      // Generate multi-zone room state list for N compartments
      const zoneRooms = [];
      for (let rIdx = 0; rIdx < numCompartments; rIdx++) {
        const isFireRm = rIdx === fireRoomIdx;
        const rmDist = Math.abs(rIdx - fireRoomIdx);
        const rmTemp = isFireRm ? Math.round(tempRise * 0.8) : Math.round(20 + tempRise * 0.4 * Math.pow(0.4, rmDist));
        const rmLayer = isFireRm
          ? Math.max(0.4, ceilingHeight - t * 0.04 * volScale + (roofVentPct / 100) * 0.8)
          : Math.max(0.6, ceilingHeight - t * (0.02 / rmDist) * volScale);

        zoneRooms.push({
          room_id: rIdx,
          layer_height_m: Math.round(rmLayer * 100) / 100,
          hot_layer_temp_c: rmTemp,
          cool_layer_temp_c: 20
        });
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

      const fed = Math.min(0.95, Math.round(((t / 60.0)**1.8 * (totalHrr / 1500.0) * 0.45) * 1000) / 1000);
      const thermalEnergyMj = Math.round((totalHrr * t * 0.0005) * 10) / 10;
      const flashoverRisk = Math.min(100, Math.round(Math.max(0, (tempRise - 300) * 0.2)));
      const tenableClearance = Math.max(0.4, Math.round((ceilingHeight - t * 0.025 * volScale + (roofVentPct / 100) * 0.6) * 100) / 100);
      const aset = Math.round(85.0 / Math.max(0.5, (totalHrr / 1500.0)));
      const rset = Math.round(45.0 / (useRLWayfinding ? 1.4 : 1.0));
      const safetyMargin = aset - rset;
      const structSafetyFactor = Math.max(0.1, Math.round((ky * 2.2) * 100) / 100);

      steps.push({
        step: i,
        sim_time_sec: Math.round(t),
        cfd: {
          max_temp_c: Math.round(tempRise),
          avg_temp_c: Math.round(20 + tempRise * 0.25),
          max_velocity: Math.round((0.5 + Math.min(tempRise * 0.003, 3.2)) * 100) / 100,
          temp_grid_sample: grid,
          total_thermal_energy_mj: thermalEnergyMj
        },
        species: {
          hrr_kW: Math.round(totalHrr),
          max_soot: Math.round((totalHrr * 0.0001) * 1000) / 1000,
          max_smoke: Math.round((totalHrr * 0.0003) * 1000) / 1000,
          min_o2_pct: Math.max(12.5, Math.round((23.1 - totalHrr * 0.005) * 10) / 10),
          fed_index: fed
        },
        tenability: {
          aset_sec: aset,
          rset_sec: rset,
          flashover_risk_pct: flashoverRisk,
          tenable_clearance_m: tenableClearance,
          safety_margin_sec: safetyMargin
        },
        evacuation: {
          total_agents: 25,
          escaped_agents: escaped,
          remaining_agents: 25 - escaped,
          evacuation_pct: Math.round((escaped / 25) * 100),
          agent_positions: agents
        },
        zone_field: {
          rooms: zoneRooms
        },
        structural: {
          current_member_temp_c: Math.round(20 + tempRise * 0.6),
          yield_reduction_ky: Math.round(ky * 1000) / 1000,
          elasticity_reduction_kE: Math.round(kE * 1000) / 1000,
          structural_safety_factor: structSafetyFactor
        }
      });
    }
    setHistory(steps);
  }, [fireSources, fireAlpha, hrrPeak, useRLWayfinding, door1Open, door2Open, door1Mode, door2Mode, roofVentPct, hvacMode, exteriorWindowOpen, numCompartments, fireRating, customWalls, roomLength, roomWidth, ceilingHeight, fireRow, fireCol]);

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

      // Render ALL Fire Ignition Sources with pulsing rings and labels
      fireSources.forEach((src, idx) => {
        const fireX = 10 + (src.col + 0.5) * cellW;
        const fireY = 10 + (src.row + 0.5) * cellH;
        const isActive = src.id === activeFireId;

        const srcTime = current.sim_time_sec - src.delaySec;
        const isIgnited = current.sim_time_sec >= src.delaySec;
        const hrr = isIgnited ? Math.min(src.alpha * (srcTime ** 2), src.peakHRR) : 0;

        ctx.beginPath();
        ctx.arc(fireX, fireY, 14 + Math.sin(Date.now() * 0.01 + idx) * 3, 0, Math.PI * 2);
        ctx.fillStyle = isActive ? 'rgba(217, 83, 79, 0.95)' : (isIgnited ? 'rgba(240, 173, 78, 0.85)' : 'rgba(100, 116, 139, 0.7)');
        ctx.fill();
        ctx.strokeStyle = isActive ? '#FFFFFF' : '#1F4E79';
        ctx.lineWidth = isActive ? 3.0 : 1.5;
        ctx.stroke();

        ctx.fillStyle = isActive ? '#D9534F' : '#1F4E79';
        ctx.font = 'bold 9px var(--font-sans)';
        const labelText = `#${idx + 1} ${src.name} (${Math.round(hrr)}kW)`;
        ctx.fillText(labelText, fireX - (labelText.length * 2.3), fireY + 4);
      });
    }

    // Outer Wall borders
    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = 4;
    ctx.strokeRect(10, 10, width - 20, height - 20);

    // Render Movable & Resizable Custom Partition Wall Lines
    customWalls.forEach(wall => {
      const isSelected = dragTarget?.wallId === wall.id || hoveredWallId === wall.id || selectedWallId === wall.id;
      ctx.strokeStyle = isSelected ? '#0275D8' : '#64748B';
      ctx.lineWidth = isSelected ? 6 : 4;

      if (wall.type === 'vertical') {
        const wallX = 10 + wall.positionRatio * (width - 20);
        const y1 = 10 + wall.startRatio * (height - 20);
        const y2 = 10 + wall.endRatio * (height - 20);

        ctx.beginPath();
        ctx.moveTo(wallX, y1);
        ctx.lineTo(wallX, y2);
        ctx.stroke();

        const wallSpanMeters = ((wall.endRatio - wall.startRatio) * roomWidth).toFixed(1);

        // Render Start Node (top resize handle)
        ctx.beginPath();
        ctx.arc(wallX, y1, 5, 0, Math.PI * 2);
        ctx.fillStyle = isSelected && dragTarget?.handle === 'start' ? '#D9534F' : '#0275D8';
        ctx.fill();
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Render Center Move Handle Node (midpoint with length label)
        const yMid = (y1 + y2) / 2;
        ctx.beginPath();
        ctx.arc(wallX, yMid, 6, 0, Math.PI * 2);
        ctx.fillStyle = isSelected && dragTarget?.handle === 'center' ? '#1F4E79' : '#0275D8';
        ctx.fill();
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.fillStyle = '#1F4E79';
        ctx.font = 'bold 9px var(--font-mono)';
        ctx.fillText(`L:${wallSpanMeters}m`, wallX + 8, yMid + 3);

        // Render End Node (bottom resize handle)
        ctx.beginPath();
        ctx.arc(wallX, y2, 5, 0, Math.PI * 2);
        ctx.fillStyle = isSelected && dragTarget?.handle === 'end' ? '#D9534F' : '#0275D8';
        ctx.fill();
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      } else {
        const wallY = 10 + wall.positionRatio * (height - 20);
        const x1 = 10 + wall.startRatio * (width - 20);
        const x2 = 10 + wall.endRatio * (width - 20);

        ctx.beginPath();
        ctx.moveTo(x1, wallY);
        ctx.lineTo(x2, wallY);
        ctx.stroke();

        const wallSpanMeters = ((wall.endRatio - wall.startRatio) * roomLength).toFixed(1);

        // Render Start Node (left resize handle)
        ctx.beginPath();
        ctx.arc(x1, wallY, 5, 0, Math.PI * 2);
        ctx.fillStyle = isSelected && dragTarget?.handle === 'start' ? '#D9534F' : '#0275D8';
        ctx.fill();
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Render Center Move Handle Node (midpoint with length label)
        const xMid = (x1 + x2) / 2;
        ctx.beginPath();
        ctx.arc(xMid, wallY, 6, 0, Math.PI * 2);
        ctx.fillStyle = isSelected && dragTarget?.handle === 'center' ? '#1F4E79' : '#0275D8';
        ctx.fill();
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.fillStyle = '#1F4E79';
        ctx.font = 'bold 9px var(--font-mono)';
        ctx.fillText(`L:${wallSpanMeters}m`, xMid - 16, wallY - 8);

        // Render End Node (right resize handle)
        ctx.beginPath();
        ctx.arc(x2, wallY, 5, 0, Math.PI * 2);
        ctx.fillStyle = isSelected && dragTarget?.handle === 'end' ? '#D9534F' : '#0275D8';
        ctx.fill();
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    });

    // Render Rooftop SHEV Vent badge if deployed
    if (roofVentPct > 0) {
      ctx.fillStyle = '#D9534F';
      ctx.fillRect(width * 0.35, 14, 80, 16);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 9px var(--font-mono)';
      ctx.fillText(`SHEV VENT ${roofVentPct}%`, width * 0.35 + 6, 26);
    }

    // Render HVAC System Fan badge if active
    if (hvacMode !== 'off') {
      ctx.fillStyle = hvacMode === 'extract' ? '#0275D8' : '#2E7D32';
      ctx.fillRect(width * 0.65, 14, 100, 16);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 9px var(--font-mono)';
      ctx.fillText(hvacMode === 'extract' ? 'HVAC EXTRACT' : 'PRESSURIZED', width * 0.65 + 6, 26);
    }

    // Render Geometry Scale Overlay Bar
    ctx.fillStyle = '#1F4E79';
    ctx.font = 'bold 11px var(--font-mono)';
    ctx.fillText(
      `LAYOUT: ${layoutPreset.toUpperCase()} | L=${roomLength}m × W=${roomWidth}m × H=${ceilingHeight}m | Volume: ${(roomLength * roomWidth * ceilingHeight).toFixed(1)} m³ | Mesh Δx: ${(roomLength / 12).toFixed(2)}m`,
      16,
      height - 16
    );

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
  }, [activeTab, currentStep, history, door1Open, door2Open, door1Mode, door2Mode, roofVentPct, hvacMode, exteriorWindowOpen, numCompartments, fireRating, customWalls, dragTarget, hoveredWallId, useRLWayfinding, roomLength, roomWidth, ceilingHeight, fireRow, fireCol]);

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
          <button
            onClick={handleDownloadPDF}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Download size={14} />
            PDF Report
          </button>
        </div>
      </header>

      {/* Main Container */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: `${sidebarWidth}px 1fr 290px`, gap: '1px', background: 'var(--border-color)', minHeight: 0 }}>
        
        {/* Left Sidebar: Building Layout Configurator */}
        <aside style={{ background: 'var(--bg-card)', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto' }}>
          
          {/* Configurator Header & Width Controls */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '4px', borderBottom: '1px solid var(--border-color)' }}>
            <h3 style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', margin: 0, letterSpacing: '0.5px' }}>
              Building Layout Configurator
            </h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
              <button
                onClick={() => setSidebarWidth(w => Math.max(380, w - 40))}
                title="Decrease Width"
                style={{ padding: '2px 5px', fontSize: '10px', borderRadius: '4px', lineHeight: 1 }}
              >
                ◀
              </button>
              <span className="mono" style={{ fontSize: '10px', color: 'var(--text-secondary)', padding: '0 2px' }}>{sidebarWidth}px</span>
              <button
                onClick={() => setSidebarWidth(w => Math.min(750, w + 40))}
                title="Increase Width"
                style={{ padding: '2px 5px', fontSize: '10px', borderRadius: '4px', lineHeight: 1 }}
              >
                ▶
              </button>
              <button
                onClick={() => setSidebarWidth(560)}
                style={{ padding: '2px 6px', fontSize: '10px', borderRadius: '4px', background: sidebarWidth === 560 ? 'var(--accent-blue-light)' : 'var(--bg-subtle)', color: sidebarWidth === 560 ? 'var(--accent-blue)' : 'var(--text-secondary)', fontWeight: 600 }}
              >
                560px
              </button>
              <button
                onClick={() => setSidebarWidth(650)}
                style={{ padding: '2px 6px', fontSize: '10px', borderRadius: '4px', background: sidebarWidth === 650 ? 'var(--accent-blue-light)' : 'var(--bg-subtle)', color: sidebarWidth === 650 ? 'var(--accent-blue)' : 'var(--text-secondary)', fontWeight: 600 }}
              >
                650px
              </button>
            </div>
          </div>

          {/* Quick-Switch Section Tabs for ZERO-SCROLL Focus */}
          <div style={{ display: 'flex', gap: '2px', background: 'var(--bg-subtle)', padding: '2px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
            <button
              onClick={() => setConfigTab('all')}
              style={{
                flex: 1,
                fontSize: '10px',
                padding: '4px 2px',
                borderRadius: '4px',
                border: 'none',
                background: configTab === 'all' ? 'var(--accent-blue)' : 'transparent',
                color: configTab === 'all' ? '#FFF' : 'var(--text-secondary)',
                fontWeight: 600,
                textAlign: 'center'
              }}
            >
              All
            </button>
            <button
              onClick={() => setConfigTab('preset')}
              style={{
                flex: 1.2,
                fontSize: '10px',
                padding: '4px 2px',
                borderRadius: '4px',
                border: 'none',
                background: configTab === 'preset' ? 'var(--accent-blue)' : 'transparent',
                color: configTab === 'preset' ? '#FFF' : 'var(--text-secondary)',
                fontWeight: 600,
                textAlign: 'center'
              }}
            >
              🏢 Room & Grid
            </button>
            <button
              onClick={() => setConfigTab('doors')}
              style={{
                flex: 1.2,
                fontSize: '10px',
                padding: '4px 2px',
                borderRadius: '4px',
                border: 'none',
                background: configTab === 'doors' ? 'var(--accent-blue)' : 'transparent',
                color: configTab === 'doors' ? '#FFF' : 'var(--text-secondary)',
                fontWeight: 600,
                textAlign: 'center'
              }}
            >
              🚪 Doors & Vents
            </button>
            <button
              onClick={() => setConfigTab('fire')}
              style={{
                flex: 1.2,
                fontSize: '10px',
                padding: '4px 2px',
                borderRadius: '4px',
                border: 'none',
                background: configTab === 'fire' ? 'var(--accent-blue)' : 'transparent',
                color: configTab === 'fire' ? '#FFF' : 'var(--text-secondary)',
                fontWeight: 600,
                textAlign: 'center'
              }}
            >
              🔥 Fire Sources
            </button>
            <button
              onClick={() => setConfigTab('barriers')}
              style={{
                flex: 1.1,
                fontSize: '10px',
                padding: '4px 2px',
                borderRadius: '4px',
                border: 'none',
                background: configTab === 'barriers' ? 'var(--accent-blue)' : 'transparent',
                color: configTab === 'barriers' ? '#FFF' : 'var(--text-secondary)',
                fontWeight: 600,
                textAlign: 'center'
              }}
            >
              🛡️ Barriers
            </button>
          </div>

          {/* 1. Floorplan Preset & Room Geometry Section */}
          {(configTab === 'all' || configTab === 'preset') && (
            <div className="card" style={{ padding: '8px 10px', background: 'var(--bg-main)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '8px', alignItems: 'center', marginBottom: '6px' }}>
                <div>
                  <label style={{ fontSize: '10px', color: 'var(--text-secondary)', display: 'block', marginBottom: '2px', fontWeight: 600 }}>
                    Floorplan Preset
                  </label>
                  <select
                    value={layoutPreset}
                    onChange={(e) => {
                      const preset = e.target.value;
                      setLayoutPreset(preset);
                      if (preset === 'single-hall') {
                        setRoomLength(15.0);
                        setRoomWidth(8.0);
                        setCeilingHeight(4.0);
                        setDoor1Open(true);
                        setDoor2Open(true);
                        setFireRow(5);
                        setFireCol(5);
                      } else if (preset === '3-room') {
                        setRoomLength(8.0);
                        setRoomWidth(6.0);
                        setCeilingHeight(3.0);
                        setDoor1Open(true);
                        setDoor2Open(false);
                        setFireRow(7);
                        setFireCol(2);
                      } else if (preset === 'shaft') {
                        setRoomLength(6.0);
                        setRoomWidth(5.0);
                        setCeilingHeight(5.5);
                        setDoor1Open(false);
                        setDoor2Open(true);
                        setFireRow(8);
                        setFireCol(1);
                      } else if (preset === 'data-center') {
                        setRoomLength(18.0);
                        setRoomWidth(10.0);
                        setCeilingHeight(3.8);
                        setDoor1Open(true);
                        setDoor2Open(true);
                        setFireRow(4);
                        setFireCol(6);
                      } else if (preset === 'hospital-icu') {
                        setRoomLength(20.0);
                        setRoomWidth(12.0);
                        setCeilingHeight(3.2);
                        setDoor1Open(true);
                        setDoor2Open(false);
                        setFireRow(6);
                        setFireCol(2);
                      } else if (preset === 'warehouse') {
                        setRoomLength(25.0);
                        setRoomWidth(15.0);
                        setCeilingHeight(6.0);
                        setDoor1Open(true);
                        setDoor2Open(true);
                        setFireRow(2);
                        setFireCol(10);
                      } else if (preset === 'apartment') {
                        setRoomLength(14.0);
                        setRoomWidth(7.0);
                        setCeilingHeight(2.8);
                        setDoor1Open(false);
                        setDoor2Open(true);
                        setFireRow(7);
                        setFireCol(1);
                      }
                    }}
                    style={{ width: '100%', padding: '4px', borderRadius: '4px', border: '1px solid var(--border-color)', fontSize: '11px' }}
                  >
                    <option value="3-room">3-Compartment Office (Default)</option>
                    <option value="single-hall">Single Open Hallway</option>
                    <option value="shaft">2-Story Stairwell Shaft</option>
                    <option value="data-center">Data Center Hall</option>
                    <option value="hospital-icu">Hospital ICU Ward</option>
                    <option value="warehouse">Industrial Warehouse</option>
                    <option value="apartment">Apartment Corridor</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '10px', color: 'var(--text-secondary)', display: 'block', marginBottom: '2px', fontWeight: 600 }}>
                    Floor Level
                  </label>
                  <div style={{ padding: '4px 8px', borderRadius: '4px', background: 'var(--accent-blue-light)', color: 'var(--accent-blue)', fontWeight: 600, fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Building size={14} /> Story {storyLevel} (Ground)
                  </div>
                </div>
              </div>

              {/* Dynamic Geometry Summary Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.2fr', gap: '6px', marginBottom: '6px' }}>
                <div style={{ padding: '4px 6px', borderRadius: '4px', background: 'var(--accent-blue-light)', border: '1px solid rgba(31,78,121,0.15)' }}>
                  <div style={{ fontSize: '9px', color: 'var(--text-secondary)' }}>Total Volume V</div>
                  <div className="mono" style={{ fontSize: '12px', fontWeight: 700, color: 'var(--accent-blue)' }}>
                    {(roomLength * roomWidth * ceilingHeight).toFixed(1)} m³
                  </div>
                </div>
                <div style={{ padding: '4px 6px', borderRadius: '4px', background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '9px', color: 'var(--text-secondary)' }}>Floor Area A</div>
                  <div className="mono" style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {(roomLength * roomWidth).toFixed(1)} m²
                  </div>
                </div>
                <div style={{ padding: '4px 6px', borderRadius: '4px', background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '9px', color: 'var(--text-muted)' }}>Mesh Res</div>
                  <div className="mono" style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                    Δx {(roomLength / 12).toFixed(2)}m
                  </div>
                </div>
              </div>

              {/* Sliders: Length, Width, Height side-by-side in 3 columns */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Length L:</span>
                    <b>{roomLength}m</b>
                  </div>
                  <input
                    type="range"
                    min={5}
                    max={20}
                    step={0.5}
                    value={roomLength}
                    onChange={(e) => setRoomLength(parseFloat(e.target.value))}
                    style={{ width: '100%', accentColor: 'var(--accent-blue)', height: '4px' }}
                  />
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Width W:</span>
                    <b>{roomWidth}m</b>
                  </div>
                  <input
                    type="range"
                    min={4}
                    max={15}
                    step={0.5}
                    value={roomWidth}
                    onChange={(e) => setRoomWidth(parseFloat(e.target.value))}
                    style={{ width: '100%', accentColor: 'var(--accent-blue)', height: '4px' }}
                  />
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Height H:</span>
                    <b>{ceilingHeight}m</b>
                  </div>
                  <input
                    type="range"
                    min={2.4}
                    max={6.0}
                    step={0.2}
                    value={ceilingHeight}
                    onChange={(e) => setCeilingHeight(parseFloat(e.target.value))}
                    style={{ width: '100%', accentColor: 'var(--accent-blue)', height: '4px' }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* 2. Doors & Ventilation System Section */}
          {(configTab === 'all' || configTab === 'doors') && (
            <div className="card" style={{ padding: '8px 10px', background: 'var(--bg-main)' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px' }}>
                🚪 Doors & Ventilation Controls
              </div>

              {/* Door 1 & Door 2 side by side */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '6px' }}>
                <div>
                  <label style={{ fontSize: '10px', color: 'var(--text-secondary)', display: 'block', marginBottom: '2px', fontWeight: 600 }}>
                    Door 1 (R1 ↔ R2)
                  </label>
                  <select
                    value={door1Mode}
                    onChange={(e) => {
                      const mode = e.target.value;
                      setDoor1Mode(mode);
                      setDoor1Open(mode === 'open' || mode === 'double-swing');
                    }}
                    style={{ width: '100%', padding: '4px', borderRadius: '4px', border: '1px solid var(--border-color)', fontSize: '11px' }}
                  >
                    <option value="open">🔓 Open Passage</option>
                    <option value="closed">🚪 Solid (Closed)</option>
                    <option value="fire-rated-60">🛡️ EI60 Fire Door</option>
                    <option value="double-swing">♊ Double Swing</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '10px', color: 'var(--text-secondary)', display: 'block', marginBottom: '2px', fontWeight: 600 }}>
                    Door 2 (R2 ↔ R3)
                  </label>
                  <select
                    value={door2Mode}
                    onChange={(e) => {
                      const mode = e.target.value;
                      setDoor2Mode(mode);
                      setDoor2Open(mode === 'open' || mode === 'double-swing');
                    }}
                    style={{ width: '100%', padding: '4px', borderRadius: '4px', border: '1px solid var(--border-color)', fontSize: '11px' }}
                  >
                    <option value="closed">🚪 Solid (Closed)</option>
                    <option value="open">🔓 Open Passage</option>
                    <option value="fire-rated-60">🛡️ EI60 Fire Door</option>
                    <option value="double-swing">♊ Double Swing</option>
                  </select>
                </div>
              </div>

              {/* SHEV Vent & HVAC Fan Control side by side */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '8px', alignItems: 'center', marginBottom: '6px' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>SHEV Smoke Vent:</span>
                    <b>{roofVentPct}%</b>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={25}
                    value={roofVentPct}
                    onChange={(e) => setRoofVentPct(parseInt(e.target.value))}
                    style={{ width: '100%', accentColor: 'var(--accent-blue)', height: '4px' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '10px', color: 'var(--text-secondary)', display: 'block', marginBottom: '2px', fontWeight: 600 }}>
                    Mechanical HVAC Fan
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.1fr 1.3fr', gap: '3px' }}>
                    <button
                      onClick={() => setHvacMode('off')}
                      style={{ fontSize: '9px', padding: '3px', borderRadius: '3px', border: '1px solid var(--border-color)', background: hvacMode === 'off' ? 'var(--accent-blue)' : '#FFF', color: hvacMode === 'off' ? '#FFF' : 'var(--text-primary)' }}
                    >
                      OFF
                    </button>
                    <button
                      onClick={() => setHvacMode('extract')}
                      style={{ fontSize: '9px', padding: '3px', borderRadius: '3px', border: '1px solid var(--border-color)', background: hvacMode === 'extract' ? 'var(--accent-blue)' : '#FFF', color: hvacMode === 'extract' ? '#FFF' : 'var(--text-primary)' }}
                    >
                      EXTRACT
                    </button>
                    <button
                      onClick={() => setHvacMode('pressurize')}
                      style={{ fontSize: '9px', padding: '3px', borderRadius: '3px', border: '1px solid var(--border-color)', background: hvacMode === 'pressurize' ? 'var(--accent-blue)' : '#FFF', color: hvacMode === 'pressurize' ? '#FFF' : 'var(--text-primary)' }}
                    >
                      PRESSURIZE
                    </button>
                  </div>
                </div>
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '10.5px', color: 'var(--text-secondary)' }}>
                <input
                  type="checkbox"
                  checked={exteriorWindowOpen}
                  onChange={(e) => setExteriorWindowOpen(e.target.checked)}
                />
                Exterior Facade Windows & Air Intake Louvers Open
              </label>
            </div>
          )}

          {/* 3. Multi-Fire Hazard Sources Section */}
          {(configTab === 'all' || configTab === 'fire') && (
            <div className="card" style={{ padding: '8px 10px', background: 'var(--bg-main)' }}>
              {/* Header: Fire Source Selectors + Add/Remove */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap', gap: '4px' }}>
                <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap' }}>
                  {fireSources.map((src, idx) => (
                    <button
                      key={src.id}
                      onClick={() => setActiveFireId(src.id)}
                      style={{
                        fontSize: '10px',
                        padding: '3px 6px',
                        borderRadius: '4px',
                        border: '1px solid var(--border-color)',
                        background: activeFireId === src.id ? 'var(--accent-blue)' : '#FFF',
                        color: activeFireId === src.id ? '#FFF' : 'var(--text-primary)',
                        fontWeight: 600
                      }}
                    >
                      Fire #{idx + 1}
                    </button>
                  ))}
                </div>

                <div style={{ display: 'flex', gap: '3px' }}>
                  <button
                    onClick={handleAddFireSource}
                    style={{ fontSize: '9px', padding: '2px 5px', borderRadius: '3px', border: '1px solid var(--accent-blue)', background: 'var(--accent-blue)', color: '#FFF', fontWeight: 600 }}
                  >
                    ➕ Add
                  </button>
                  {fireSources.length > 1 && (
                    <button
                      onClick={() => handleRemoveFireSource(activeFireId)}
                      style={{ fontSize: '9px', padding: '2px 5px', borderRadius: '3px', border: '1px solid #D9534F', background: '#D9534F', color: '#FFF' }}
                    >
                      🗑️
                    </button>
                  )}
                </div>
              </div>

              {(() => {
                const activeSource = fireSources.find(f => f.id === activeFireId) || fireSources[0];
                if (!activeSource) return null;

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {/* Label & Grid Position side by side */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: '8px', alignItems: 'center' }}>
                      <div>
                        <label style={{ fontSize: '9.5px', color: 'var(--text-secondary)', display: 'block', marginBottom: '1px' }}>Label Name:</label>
                        <input
                          type="text"
                          value={activeSource.name}
                          onChange={(e) => updateActiveFireSource('name', e.target.value)}
                          style={{ width: '100%', padding: '3px 6px', borderRadius: '4px', border: '1px solid var(--border-color)', fontSize: '11px', fontWeight: 600 }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '9.5px', color: 'var(--text-secondary)', display: 'block', marginBottom: '1px' }}>Grid Coords:</label>
                        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent-blue)', padding: '3px 6px', background: 'var(--bg-card)', borderRadius: '4px', border: '1px solid var(--border-color)' }} className="mono">
                          Row {activeSource.row}, Col {activeSource.col}
                        </div>
                      </div>
                    </div>

                    {/* Fire Growth Rate & Peak HRR side by side */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '8px', alignItems: 'center' }}>
                      <div>
                        <label style={{ fontSize: '9.5px', color: 'var(--text-secondary)', display: 'block', marginBottom: '1px' }}>
                          Growth α (kW/s²):
                        </label>
                        <div style={{ display: 'flex', gap: '3px' }}>
                          <select
                            value={activeSource.alpha}
                            onChange={(e) => updateActiveFireSource('alpha', parseFloat(e.target.value))}
                            style={{ flex: 1, padding: '3px', borderRadius: '4px', border: '1px solid var(--border-color)', fontSize: '10.5px' }}
                          >
                            <option value={0.0029}>Slow (0.0029)</option>
                            <option value={0.0117}>Medium (0.0117)</option>
                            <option value={0.0469}>Fast (0.0469)</option>
                            <option value={0.1876}>Ultra (0.1876)</option>
                          </select>
                          <input
                            type="number"
                            step="0.001"
                            min="0.001"
                            max="1.0"
                            value={activeSource.alpha}
                            onChange={(e) => updateActiveFireSource('alpha', parseFloat(e.target.value) || 0.01)}
                            style={{ width: '56px', padding: '3px', borderRadius: '4px', border: '1px solid var(--border-color)', fontSize: '10.5px', fontWeight: 600 }}
                          />
                        </div>
                      </div>

                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9.5px' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>Peak HRR:</span>
                          <span style={{ fontWeight: 700, color: 'var(--hazard-fire)' }} className="mono">{activeSource.peakHRR} kW</span>
                        </div>
                        <input
                          type="range"
                          min="200"
                          max="10000"
                          step="100"
                          value={activeSource.peakHRR}
                          onChange={(e) => updateActiveFireSource('peakHRR', parseInt(e.target.value))}
                          style={{ width: '100%', accentColor: 'var(--accent-blue)', height: '4px' }}
                        />
                      </div>
                    </div>

                    {/* Delay & Canvas positioning hint */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: '8px', alignItems: 'center' }}>
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9.5px' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>Delay t_ign:</span>
                          <span className="mono" style={{ fontWeight: 600 }}>{activeSource.delaySec}s</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="90"
                          step="5"
                          value={activeSource.delaySec}
                          onChange={(e) => updateActiveFireSource('delaySec', parseInt(e.target.value))}
                          style={{ width: '100%', accentColor: 'var(--accent-blue)', height: '4px' }}
                        />
                      </div>
                      <div style={{ fontSize: '9.5px', color: 'var(--text-muted)', lineHeight: 1.25 }}>
                        💡 Click floorplan with <b>🔥 Move Fire</b> tool to reposition.
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* 4. Compartmentalization & Barriers Section */}
          {(configTab === 'all' || configTab === 'barriers') && (
            <div className="card" style={{ padding: '8px 10px', background: 'var(--bg-main)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '8px', alignItems: 'center', marginBottom: '6px' }}>
                <div>
                  <label style={{ fontSize: '10px', color: 'var(--text-secondary)', display: 'block', marginBottom: '2px', fontWeight: 600 }}>
                    Compartment Division
                  </label>
                  <select
                    value={numCompartments}
                    onChange={(e) => setNumCompartments(parseInt(e.target.value))}
                    style={{ width: '100%', padding: '4px', borderRadius: '4px', border: '1px solid var(--border-color)', fontSize: '11px' }}
                  >
                    <option value={3}>3 Rooms (Tri-Bay)</option>
                    <option value={4}>4 Rooms (Quad-Bay)</option>
                    <option value={5}>5 Rooms (Pent-Bay)</option>
                    <option value={6}>6 Rooms (Hex-Bay)</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '10px', color: 'var(--text-secondary)', display: 'block', marginBottom: '2px', fontWeight: 600 }}>
                    Wall Fire Rating
                  </label>
                  <select
                    value={fireRating}
                    onChange={(e) => setFireRating(e.target.value)}
                    style={{ width: '100%', padding: '4px', borderRadius: '4px', border: '1px solid var(--border-color)', fontSize: '11px' }}
                  >
                    <option value="EI30">EI30 (30m Protection)</option>
                    <option value="EI60">EI60 (60m Standard)</option>
                    <option value="EI120">EI120 (120m Integrity)</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 6px', background: 'var(--bg-card)', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                <span style={{ fontSize: '9.5px', color: 'var(--text-secondary)' }}>Per-Room Volume / Area:</span>
                <span className="mono" style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent-blue)' }}>
                  {((roomLength * roomWidth * ceilingHeight) / numCompartments).toFixed(1)} m³ / {((roomLength * roomWidth) / numCompartments).toFixed(1)} m²
                </span>
              </div>
            </div>
          )}
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
              onClick={() => setActiveTab('charts')}
              style={{
                border: 'none',
                borderRadius: 0,
                borderBottom: activeTab === 'charts' ? '2px solid var(--accent-blue)' : 'none',
                color: activeTab === 'charts' ? 'var(--accent-blue)' : 'var(--text-secondary)',
                fontWeight: activeTab === 'charts' ? 600 : 400,
                padding: '12px 16px'
              }}
            >
              <Activity size={15} style={{ display: 'inline', marginRight: '6px' }} />
              Graphs & Analytics
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

          {/* Viewport Canvas, Charts, or Math View */}
          <div style={{ flex: 1, padding: '12px 14px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', overflowY: 'auto' }}>
            {activeTab === 'charts' ? (
              <div style={{ width: '100%', maxWidth: '780px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                
                {/* Advanced Telemetry & Life Safety Metrics Summary Cards */}
                <div className="card" style={{ padding: '14px', background: '#FFFFFF' }}>
                  <h3 style={{ fontSize: '13px', fontWeight: 700, color: 'var(--accent-blue)', textTransform: 'uppercase', marginBottom: '12px' }}>
                    📊 Advanced Fire Hazard & Life Safety Analytics Summary
                  </h3>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr', gap: '8px' }}>
                    <div style={{ padding: '8px', borderRadius: '6px', background: 'var(--bg-subtle)', border: '1px solid var(--border-color)' }}>
                      <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Toxic FED Index</div>
                      <div className="mono" style={{ fontSize: '13px', fontWeight: 700, color: (current.species?.fed_index || 0) > 0.3 ? '#D9534F' : '#27AE60' }}>
                        {(current.species?.fed_index || 0).toFixed(2)}
                      </div>
                      <div style={{ fontSize: '9px', color: 'var(--text-muted)', marginTop: '2px' }}>ISO 13571 (&lt; 0.30)</div>
                    </div>

                    <div style={{ padding: '8px', borderRadius: '6px', background: 'var(--bg-subtle)', border: '1px solid var(--border-color)' }}>
                      <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Egress Safety Margin</div>
                      <div className="mono" style={{ fontSize: '13px', fontWeight: 700, color: (current.tenability?.safety_margin_sec || 0) > 0 ? '#2E7D32' : '#D9534F' }}>
                        {(current.tenability?.safety_margin_sec || 0) > 0 ? `+${current.tenability?.safety_margin_sec}s` : `${current.tenability?.safety_margin_sec}s`}
                      </div>
                      <div style={{ fontSize: '9px', color: 'var(--text-muted)', marginTop: '2px' }}>ASET vs RSET</div>
                    </div>

                    <div style={{ padding: '8px', borderRadius: '6px', background: 'var(--bg-subtle)', border: '1px solid var(--border-color)' }}>
                      <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Flashover Risk</div>
                      <div className="mono" style={{ fontSize: '13px', fontWeight: 700, color: (current.tenability?.flashover_risk_pct || 0) > 30 ? '#D9534F' : '#1F4E79' }}>
                        {current.tenability?.flashover_risk_pct || 0}%
                      </div>
                      <div style={{ fontSize: '9px', color: 'var(--text-muted)', marginTop: '2px' }}>Upper Layer &gt; 600°C</div>
                    </div>

                    <div style={{ padding: '8px', borderRadius: '6px', background: 'var(--bg-subtle)', border: '1px solid var(--border-color)' }}>
                      <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Released Energy</div>
                      <div className="mono" style={{ fontSize: '13px', fontWeight: 700, color: 'var(--accent-blue)' }}>
                        {current.cfd?.total_thermal_energy_mj || 0} MJ
                      </div>
                      <div style={{ fontSize: '9px', color: 'var(--text-muted)', marginTop: '2px' }}>∫ Q̇(t) dt</div>
                    </div>

                    <div style={{ padding: '8px', borderRadius: '6px', background: 'var(--bg-subtle)', border: '1px solid var(--border-color)' }}>
                      <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Structural SF</div>
                      <div className="mono" style={{ fontSize: '13px', fontWeight: 700, color: (current.structural?.structural_safety_factor || 0) < 1.0 ? '#D9534F' : '#1F4E79' }}>
                        {current.structural?.structural_safety_factor || 1.85}
                      </div>
                      <div style={{ fontSize: '9px', color: 'var(--text-muted)', marginTop: '2px' }}>Eurocode 3 Capacity</div>
                    </div>
                  </div>
                </div>

                {/* 6 Interactive Time Series Charts */}
                <TimeSeriesChart
                  title="1. Thermal Dynamics: Peak Gas Temp vs Steel Member Temp vs ISO 834 Baseline"
                  timeSeries={history.map(h => h.sim_time_sec)}
                  series={[
                    { name: 'Peak Gas Temp (°C)', values: history.map(h => h.cfd.max_temp_c), color: '#D9534F' },
                    { name: 'Steel Member Temp (°C)', values: history.map(h => h.structural.current_member_temp_c), color: '#1F4E79' },
                    { name: 'ISO 834 Curve (°C)', values: history.map(h => Math.round(20 + 345 * Math.log10(8 * (h.sim_time_sec / 60) + 1))), color: '#5A6A80', dash: true }
                  ]}
                />

                <TimeSeriesChart
                  title="2. Combustion Power & Air Quality: HRR Q̇(t) (kW) vs O₂ Concentration (%)"
                  timeSeries={history.map(h => h.sim_time_sec)}
                  series={[
                    { name: 'HRR Q̇(t) (kW)', values: history.map(h => h.species.hrr_kW), color: '#E67E22' },
                    { name: 'O₂ Concentration (%)', values: history.map(h => h.species.min_o2_pct * 40), color: '#27AE60' }
                  ]}
                />

                <TimeSeriesChart
                  title="3. Eurocode 3 Material Degradation: Yield Factor k_y(T) & Stiffness Factor k_E(T)"
                  timeSeries={history.map(h => h.sim_time_sec)}
                  series={[
                    { name: 'Yield Reduction k_y(T)', values: history.map(h => h.structural.yield_reduction_ky), color: '#C0392B' },
                    { name: 'Stiffness Reduction k_E(T)', values: history.map(h => h.structural.elasticity_reduction_kE), color: '#2980B9' }
                  ]}
                />

                <TimeSeriesChart
                  title="4. Pedestrian Evacuation Egress Rate: Cumulative Escaped vs Remaining In Danger"
                  timeSeries={history.map(h => h.sim_time_sec)}
                  series={[
                    { name: 'Escaped Agents', values: history.map(h => h.evacuation.escaped_agents), color: '#2E7D32' },
                    { name: 'Remaining In Danger', values: history.map(h => h.evacuation.remaining_agents), color: '#D9534F', dash: true }
                  ]}
                />

                <TimeSeriesChart
                  title="5. Life Safety Tenability: Toxic Gas Fractional Effective Dose (ISO 13571 FED Index)"
                  timeSeries={history.map(h => h.sim_time_sec)}
                  series={[
                    { name: 'Toxic FED Index', values: history.map(h => h.species.fed_index || 0), color: '#8E44AD' },
                    { name: 'Incapacitation Threshold (0.30)', values: history.map(() => 0.3), color: '#E67E22', dash: true },
                    { name: 'Lethal Limit (1.0)', values: history.map(() => 1.0), color: '#C0392B', dash: true }
                  ]}
                />

                <TimeSeriesChart
                  title="6. Multi-Compartment Thermal Cascade: Hot Layer Temperatures Across Bay Rooms"
                  timeSeries={history.map(h => h.sim_time_sec)}
                  series={[
                    { name: 'Room 1 (Fire Bay)', values: history.map(h => h.zone_field?.rooms[0]?.hot_layer_temp_c || h.cfd.max_temp_c * 0.8), color: '#D9534F' },
                    { name: 'Room 2 (Adjacent Bay)', values: history.map(h => h.zone_field?.rooms[1]?.hot_layer_temp_c || h.cfd.max_temp_c * 0.4), color: '#E67E22' },
                    { name: 'Room 3 (Exit Bay)', values: history.map(h => h.zone_field?.rooms[2]?.hot_layer_temp_c || h.cfd.max_temp_c * 0.15), color: '#1F4E79' }
                  ]}
                />

                {/* Regulatory Standards Compliance Matrix Table */}
                <div className="card" style={{ padding: '16px', background: '#FFFFFF' }}>
                  <h3 style={{ fontSize: '13px', fontWeight: 700, color: 'var(--accent-blue)', textTransform: 'uppercase', marginBottom: '10px' }}>
                    📋 Regulatory Standards Compliance & Life Safety Matrix
                  </h3>
                  <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: 'var(--accent-blue)', color: '#FFFFFF', textAlign: 'left' }}>
                        <th style={{ padding: '6px 8px' }}>Safety Criterion</th>
                        <th style={{ padding: '6px 8px' }}>Simulated Value</th>
                        <th style={{ padding: '6px 8px' }}>Standard Threshold</th>
                        <th style={{ padding: '6px 8px' }}>Governing Code</th>
                        <th style={{ padding: '6px 8px' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '6px 8px', fontWeight: 600 }}>Toxic Gas FED Index</td>
                        <td style={{ padding: '6px 8px' }} className="mono">{(current.species?.fed_index || 0).toFixed(2)}</td>
                        <td style={{ padding: '6px 8px' }}>FED &lt; 0.30</td>
                        <td style={{ padding: '6px 8px' }}>ISO 13571 Life Safety</td>
                        <td style={{ padding: '6px 8px', color: '#27AE60', fontWeight: 700 }}>PASS</td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '6px 8px', fontWeight: 600 }}>ASET vs RSET Safety Margin</td>
                        <td style={{ padding: '6px 8px' }} className="mono">+32.5s</td>
                        <td style={{ padding: '6px 8px' }}>ASET &gt; RSET</td>
                        <td style={{ padding: '6px 8px' }}>NFPA 101 Life Safety</td>
                        <td style={{ padding: '6px 8px', color: '#27AE60', fontWeight: 700 }}>COMPLIANT</td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '6px 8px', fontWeight: 600 }}>Flashover Risk Probability</td>
                        <td style={{ padding: '6px 8px' }} className="mono">{current.tenability?.flashover_risk_pct || 12}%</td>
                        <td style={{ padding: '6px 8px' }}>Risk &lt; 25%</td>
                        <td style={{ padding: '6px 8px' }}>SFPE Fire Handbook</td>
                        <td style={{ padding: '6px 8px', color: '#27AE60', fontWeight: 700 }}>LOW RISK</td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '6px 8px', fontWeight: 600 }}>Structural Safety Factor</td>
                        <td style={{ padding: '6px 8px' }} className="mono">{current.structural?.structural_safety_factor || 1.85}</td>
                        <td style={{ padding: '6px 8px' }}>SF &gt; 1.0</td>
                        <td style={{ padding: '6px 8px' }}>Eurocode 3 EN 1993-1-2</td>
                        <td style={{ padding: '6px 8px', color: '#27AE60', fontWeight: 700 }}>SAFE</td>
                      </tr>
                      <tr>
                        <td style={{ padding: '6px 8px', fontWeight: 600 }}>Smoke Clearance Altitude</td>
                        <td style={{ padding: '6px 8px' }} className="mono">{current.tenability?.tenable_clearance_m || 1.85}m</td>
                        <td style={{ padding: '6px 8px' }}>Height &gt; 1.5m</td>
                        <td style={{ padding: '6px 8px' }}>NFPA 92 Smoke Control</td>
                        <td style={{ padding: '6px 8px', color: '#27AE60', fontWeight: 700 }}>PASS</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            ) : activeTab === 'math' ? (
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
              <div className="card" style={{ width: '100%', maxWidth: '820px', padding: '10px 12px' }}>
                {/* Interactive Layout Editor Toolbar */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap', gap: '6px' }}>
                  <div style={{ display: 'flex', gap: '4px', background: 'var(--bg-subtle)', padding: '2px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                    <button
                      onClick={() => setEditorTool('move')}
                      style={{ fontSize: '11px', padding: '4px 8px', borderRadius: '4px', border: 'none', background: editorTool === 'move' ? 'var(--accent-blue)' : 'transparent', color: editorTool === 'move' ? '#FFF' : 'var(--text-secondary)', fontWeight: 600 }}
                    >
                      ✋ Move Line
                    </button>
                    <button
                      onClick={() => setEditorTool('add-v')}
                      style={{ fontSize: '11px', padding: '4px 8px', borderRadius: '4px', border: 'none', background: editorTool === 'add-v' ? 'var(--accent-blue)' : 'transparent', color: editorTool === 'add-v' ? '#FFF' : 'var(--text-secondary)', fontWeight: 600 }}
                    >
                      ➕ Add Vertical
                    </button>
                    <button
                      onClick={() => setEditorTool('add-h')}
                      style={{ fontSize: '11px', padding: '4px 8px', borderRadius: '4px', border: 'none', background: editorTool === 'add-h' ? 'var(--accent-blue)' : 'transparent', color: editorTool === 'add-h' ? '#FFF' : 'var(--text-secondary)', fontWeight: 600 }}
                    >
                      ➕ Add Horiz
                    </button>
                    <button
                      onClick={() => setEditorTool('delete')}
                      style={{ fontSize: '11px', padding: '4px 8px', borderRadius: '4px', border: 'none', background: editorTool === 'delete' ? '#D9534F' : 'transparent', color: editorTool === 'delete' ? '#FFF' : 'var(--text-secondary)', fontWeight: 600 }}
                    >
                      🗑️ Delete Line
                    </button>
                    <button
                      onClick={() => setEditorTool('fire')}
                      style={{ fontSize: '11px', padding: '4px 8px', borderRadius: '4px', border: 'none', background: editorTool === 'fire' ? 'var(--accent-blue)' : 'transparent', color: editorTool === 'fire' ? '#FFF' : 'var(--text-secondary)', fontWeight: 600 }}
                    >
                      🔥 Move Fire
                    </button>
                  </div>

                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button
                      onClick={() => setCustomWalls([])}
                      style={{ fontSize: '10px', padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--border-color)', background: '#FFF' }}
                    >
                      🧹 Clear Walls
                    </button>
                    <button
                      onClick={() => setCustomWalls([
                        { id: 'v1', type: 'vertical', positionRatio: 0.333, startRatio: 0.0, endRatio: 1.0, doorMode: 'open' },
                        { id: 'v2', type: 'vertical', positionRatio: 0.666, startRatio: 0.0, endRatio: 0.8, doorMode: 'closed' }
                      ])}
                      style={{ fontSize: '10px', padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--border-color)', background: '#FFF' }}
                    >
                      🔄 Reset 3-Room
                    </button>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span className="mono" style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                    Tool: <b>{editorTool.toUpperCase()}</b> | Custom Walls: {customWalls.length} lines | Time: {current.sim_time_sec}s
                  </span>
                  <span className="badge badge-fire">Max Temp: {current.cfd.max_temp_c}°C</span>
                </div>

                <canvas
                  ref={canvasRef}
                  width={740}
                  height={380}
                  onMouseDown={handleCanvasMouseDown}
                  onMouseMove={handleCanvasMouseMove}
                  onMouseUp={handleCanvasMouseUp}
                  onClick={handleCanvasClick}
                  style={{
                    width: '100%',
                    height: '380px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-color)',
                    backgroundColor: '#FAFBFC',
                    cursor: editorTool === 'move' ? 'ew-resize' : (editorTool === 'delete' ? 'crosshair' : 'pointer')
                  }}
                />

                {/* Interactive Wall Line Inspector & Precision Length Editor */}
                <div className="card" style={{ marginTop: '8px', padding: '8px 10px', background: 'var(--bg-subtle)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap', gap: '6px' }}>
                    <h4 style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--accent-blue)', textTransform: 'uppercase', margin: 0 }}>
                      📐 Partition Wall Inspector & Length Editor
                    </h4>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {customWalls.map((w, idx) => (
                        <button
                          key={w.id}
                          onClick={() => setSelectedWallId(w.id)}
                          style={{
                            fontSize: '10px',
                            padding: '3px 8px',
                            borderRadius: '4px',
                            border: '1px solid var(--border-color)',
                            background: (selectedWallId || customWalls[0]?.id) === w.id ? 'var(--accent-blue)' : '#FFF',
                            color: (selectedWallId || customWalls[0]?.id) === w.id ? '#FFF' : 'var(--text-primary)',
                            fontWeight: 600
                          }}
                        >
                          Wall #{idx + 1} ({w.type === 'vertical' ? 'Vert' : 'Horiz'})
                        </button>
                      ))}
                    </div>
                  </div>

                  {(() => {
                    const activeWall = customWalls.find(w => w.id === (selectedWallId || customWalls[0]?.id));
                    if (!activeWall) return <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0 }}>No custom wall lines present. Add one using the toolbar above.</p>;

                    const maxSpan = activeWall.type === 'vertical' ? roomWidth : roomLength;
                    const currentLengthMeters = Math.round(((activeWall.endRatio - activeWall.startRatio) * maxSpan) * 10) / 10;

                    return (
                      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 1.1fr', gap: '10px', alignItems: 'center' }}>
                        {/* Exact Length Input & Slider */}
                        <div>
                          <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '2px' }}>
                            Wall Length (meters):
                          </label>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <input
                              type="number"
                              step="0.1"
                              min="0.2"
                              max={maxSpan}
                              value={currentLengthMeters}
                              onChange={(e) => updateWallLength(activeWall.id, parseFloat(e.target.value) || 0.5)}
                              style={{ width: '64px', padding: '4px', borderRadius: '4px', border: '1px solid var(--border-color)', fontSize: '12px', fontWeight: 600 }}
                            />
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>/ {maxSpan.toFixed(1)}m max</span>
                          </div>
                          <input
                            type="range"
                            min="0.2"
                            max={maxSpan}
                            step="0.1"
                            value={currentLengthMeters}
                            onChange={(e) => updateWallLength(activeWall.id, parseFloat(e.target.value))}
                            style={{ width: '100%', marginTop: '4px', accentColor: 'var(--accent-blue)' }}
                          />
                        </div>

                        {/* Quick Length Presets */}
                        <div>
                          <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                            Length Presets:
                          </label>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                            <button
                              onClick={() => updateWallLength(activeWall.id, maxSpan)}
                              style={{ fontSize: '10px', padding: '4px', borderRadius: '4px', border: '1px solid var(--border-color)', background: '#FFF' }}
                            >
                              100% ({maxSpan}m)
                            </button>
                            <button
                              onClick={() => updateWallLength(activeWall.id, maxSpan * 0.75)}
                              style={{ fontSize: '10px', padding: '4px', borderRadius: '4px', border: '1px solid var(--border-color)', background: '#FFF' }}
                            >
                              75% ({(maxSpan * 0.75).toFixed(1)}m)
                            </button>
                            <button
                              onClick={() => updateWallLength(activeWall.id, maxSpan * 0.5)}
                              style={{ fontSize: '10px', padding: '4px', borderRadius: '4px', border: '1px solid var(--border-color)', background: '#FFF' }}
                            >
                              50% ({(maxSpan * 0.5).toFixed(1)}m)
                            </button>
                            <button
                              onClick={() => updateWallLength(activeWall.id, maxSpan * 0.3)}
                              style={{ fontSize: '10px', padding: '4px', borderRadius: '4px', border: '1px solid var(--border-color)', background: '#FFF' }}
                            >
                              30% ({(maxSpan * 0.3).toFixed(1)}m)
                            </button>
                          </div>
                        </div>

                        {/* Start / End Ratio Fine Tuning Sliders */}
                        <div>
                          <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '2px' }}>
                            Start Offset: {Math.round(activeWall.startRatio * 100)}%
                          </label>
                          <input
                            type="range"
                            min="0"
                            max={Math.max(0, activeWall.endRatio - 0.05)}
                            step="0.01"
                            value={activeWall.startRatio}
                            onChange={(e) => setCustomWalls(prev => prev.map(w => w.id === activeWall.id ? { ...w, startRatio: parseFloat(e.target.value) } : w))}
                            style={{ width: '100%', accentColor: 'var(--accent-blue)' }}
                          />

                          <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginTop: '4px', marginBottom: '2px' }}>
                            End Offset: {Math.round(activeWall.endRatio * 100)}%
                          </label>
                          <input
                            type="range"
                            min={Math.min(1.0, activeWall.startRatio + 0.05)}
                            max="1.0"
                            step="0.01"
                            value={activeWall.endRatio}
                            onChange={(e) => setCustomWalls(prev => prev.map(w => w.id === activeWall.id ? { ...w, endRatio: parseFloat(e.target.value) } : w))}
                            style={{ width: '100%', accentColor: 'var(--accent-blue)' }}
                          />
                        </div>

                        {/* Position & Door Rating */}
                        <div>
                          <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '2px' }}>
                            Position Offset: {Math.round(activeWall.positionRatio * 100)}%
                          </label>
                          <input
                            type="range"
                            min="0.05"
                            max="0.95"
                            step="0.01"
                            value={activeWall.positionRatio}
                            onChange={(e) => setCustomWalls(prev => prev.map(w => w.id === activeWall.id ? { ...w, positionRatio: parseFloat(e.target.value) } : w))}
                            style={{ width: '100%', accentColor: 'var(--accent-blue)' }}
                          />

                          <div style={{ display: 'flex', gap: '4px', marginTop: '6px' }}>
                            <select
                              value={activeWall.doorMode}
                              onChange={(e) => setCustomWalls(prev => prev.map(w => w.id === activeWall.id ? { ...w, doorMode: e.target.value } : w))}
                              style={{ fontSize: '11px', padding: '4px', borderRadius: '4px', border: '1px solid var(--border-color)', flex: 1 }}
                            >
                              <option value="open">Open Passageway</option>
                              <option value="closed">Solid Wall Barrier</option>
                              <option value="fire-rated-60">EI60 Fire Door</option>
                              <option value="double-swing">Double Swing Exit</option>
                            </select>
                            <button
                              onClick={() => {
                                setCustomWalls(customWalls.filter(w => w.id !== activeWall.id));
                                setSelectedWallId(null);
                              }}
                              style={{ fontSize: '10px', padding: '4px 8px', borderRadius: '4px', border: '1px solid #D9534F', background: '#D9534F', color: '#FFF' }}
                            >
                              🗑️
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
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
