# `firetwin` — Coupled Multiphysics Fire, Smoke, and Structural-Thermal Hazard Simulation Platform

![CI Status](https://github.com/DNV/firetwin/actions/workflows/ci.yml/badge.svg)
![Version](https://img.shields.io/badge/version-v0.1.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

`firetwin` is a research-grade computational engineering software platform for modeling fire dynamics, smoke propagation, thermal-structural degradation, and agent-based evacuation routing.

---

## Key Features

1. **Incompressible Boussinesq Navier-Stokes LES Solver**:
   - Structured grid CFD integration with Smagorinsky subgrid-scale turbulence closure.
2. **P1 Radiation & Species Transport**:
   - Radiative heat transfer in participating soot media coupled with $t^2$ fire growth rate curves.
3. **Thermal-Structural Coupling & Project 2 Export**:
   - Eurocode 3 material strength degradation ($k_y(T)$, $k_E(T)$) with direct JSON export for **Project 2** (`nonlinear-fea-studio`).
4. **Fourier Neural Operator (FNO) Surrogate**:
   - PyTorch 2D spectral neural operator providing $< 5\text{ms}$ instant field predictions.
5. **Social-Force & RL Evacuation Dynamics**:
   - Helbing agent dynamics combined with reinforcement learning dynamic hazard re-routing.
6. **Minimalist Light-Theme UI**:
   - Forced light theme (`#FAFBFC`, `#1F4E79`), Three.js / Canvas 2D viewport, play/pause scrub controls, and model mode toggle between `'Surrogate (fast)'` and `'Full LES (accurate)'`.

---

## Repository Layout

```
firetwin/
├── backend/
│   ├── src/firetwin/{cfd,radiation,species,structural_link,fno,evacuation,zone_field,report}
│   ├── tests/
│   ├── pyproject.toml
│   └── requirements.txt
├── frontend/
│   ├── src/{components,routes,viewer,App.tsx,main.tsx}
│   ├── package.json
│   └── vite.config.ts
├── infra/
│   ├── Dockerfile.backend
│   ├── Dockerfile.frontend
│   └── docker-compose.yml
├── docs/
│   ├── architecture.md
│   └── verification.md
└── .github/workflows/
    ├── ci.yml
    └── deploy.yml
```

---

## Quick Start (Docker)

```bash
cd infra
docker compose up --build
```
- **Frontend Dashboard**: `http://localhost:3000`
- **FastAPI Documentation**: `http://localhost:8000/docs`

---

## Local Development & Testing

### Backend V&V Pytest Suite
```bash
cd backend
PYTHONPATH=src pytest tests/ -v
```

### Frontend Development Server
```bash
cd frontend
npm run dev
```

---

## License

MIT License - Copyright (5) 2026 DNV Research Labs
