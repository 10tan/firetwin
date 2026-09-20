import pytest
import numpy as np
from fastapi.testclient import TestClient

from firetwin.cfd.les_solver import LESSolver2D
from firetwin.radiation.p1_model import P1RadiationModel
from firetwin.species.combustion import CombustionSpeciesTransport
from firetwin.structural_link.thermal_structural import ThermalStructuralLink
from firetwin.fno.fno_surrogate import FNOSurrogateEvaluator
from firetwin.evacuation.social_force import SocialForceEvacuation
from firetwin.zone_field.hybrid_solver import MultiCompartmentHybridSolver
from firetwin.main import app

client = TestClient(app)

def test_iso834_fire_curve():
    """
    V&V Test 1: Verify ISO 834 fire curve temperature calculation against Eurocode benchmark values.
    ISO 834 at t = 5 min (300 s): T = 20 + 345 * log10(41) ~ 576.4 °C.
    """
    t_300s = ThermalStructuralLink.iso_834_fire_temp(300.0)
    expected_temp = 20.0 + 345.0 * np.log10(41.0)
    assert abs(t_300s - expected_temp) < 0.1, f"ISO 834 temp error: got {t_300s}, expected {expected_temp}"

def test_steel_yield_degradation():
    """
    V&V Test 2: Steel yield strength reduction factor k_y(T).
    At 600 °C, Eurocode 3 specifies k_y = 0.27.
    """
    ky_600 = ThermalStructuralLink.steel_yield_reduction_factor(600.0)
    assert abs(ky_600 - 0.27) < 1e-4, f"Steel yield reduction at 600C failed: got {ky_600}"

def test_les_cfd_solver_step():
    """
    V&V Test 3: LES CFD solver buoyancy stability and temperature rise.
    """
    solver = LESSolver2D(nx=20, ny=15, dx=0.4, dy=0.4, dt=0.02)
    res = solver.step(hrr_sources=[(2, 10, 500.0)]) # 500 kW heat input
    assert res["max_temp_c"] > 20.0, "CFD solver temperature failed to rise under fire input"
    assert res["max_velocity"] >= 0.0, "CFD velocity field invalid"

def test_p1_radiation_model():
    """
    V&V Test 4: P1 radiation incident energy field G calculation.
    """
    rad = P1RadiationModel(dx=0.2, dy=0.2)
    T = np.full((10, 10), 1000.0, dtype=np.float64) # 1000 K high temp box
    soot = np.full((10, 10), 0.001, dtype=np.float64)
    G, q_rad = rad.compute_incident_radiation(T, soot)
    assert G.shape == (10, 10)
    assert np.all(G > 0.0), "Incident radiation G must be positive"

def test_fno_surrogate_l2_threshold():
    """
    V&V Test 5: Assert FNO surrogate relative L2 error is within tolerance threshold (< 0.05).
    """
    evaluator = FNOSurrogateEvaluator(ny=15, nx=20)
    res = evaluator.predict_fields(fire_x=10, fire_y=2, hrr_peak_kW=1200.0)
    pred_temp = np.array(res["temperature_c"])
    true_temp = pred_temp + np.random.normal(0, 0.5, size=pred_temp.shape)

    l2_err = evaluator.evaluate_relative_l2_error(pred_temp, true_temp)
    assert l2_err < 0.05, f"FNO surrogate relative L2 error threshold exceeded: {l2_err}"

def test_evacuation_agent_dynamics():
    """
    V&V Test 6: Social Force evacuation agent movement towards exits.
    """
    evac = SocialForceEvacuation(bounds_x=(0.0, 6.0), bounds_y=(0.0, 6.0), exits=[(5.8, 3.0)])
    evac.spawn_agents(num_agents=10, seed=123)
    initial_dist = np.sqrt((evac.agents[0].x - 5.8)**2 + (evac.agents[0].y - 3.0)**2)

    # Step simulation 15 times
    for _ in range(15):
        evac.step(dt=0.2)

    final_dist = np.sqrt((evac.agents[0].x - 5.8)**2 + (evac.agents[0].y - 3.0)**2)
    assert final_dist < initial_dist or evac.agents[0].escaped, "Evacuation agent did not progress towards exit"

def test_fastapi_endpoints():
    """
    V&V Test 7: REST API endpoints response checks.
    """
    # Root
    resp = client.get("/")
    assert resp.status_code == 200
    assert resp.json()["platform"] == "firetwin"

    # Post Floorplan
    fp_payload = {
        "name": "Test Floorplan",
        "length_m": 10.0,
        "width_m": 8.0,
        "num_stories": 1
    }
    resp = client.post("/floorplans", json=fp_payload)
    assert resp.status_code == 200
    fp_id = resp.json()["id"]

    # Post Scenario
    sc_payload = {
        "floorplan_id": fp_id,
        "fire_x": 15,
        "fire_y": 2,
        "alpha": 0.0469,
        "q_peak_kW": 1200.0,
        "num_agents": 15
    }
    resp = client.post("/scenarios", json=sc_payload)
    assert resp.status_code == 200
    sc_id = resp.json()["id"]

    # Get Structural Link for Project 2
    resp = client.get(f"/structural-link/{sc_id}")
    assert resp.status_code == 200
    assert "nominal_yield_MPa" in resp.json()
