import numpy as np
from typing import Dict, Any, Tuple

class CombustionSpeciesTransport:
    """
    Combustion, Pyrolysis, HRR Fire Source, and Species Advection-Diffusion Solver.
    Tracks concentration of Oxygen (O2), Carbon Dioxide (CO2), Soot, and Toxic Smoke (CO/HCN).
    """
    def __init__(
        self,
        nx: int = 40,
        ny: int = 30,
        dx: float = 0.2,
        dy: float = 0.2,
        dt: float = 0.02,
        diffusivity: float = 2.0e-5  # Mass diffusivity (m^2/s)
    ):
        self.nx = nx
        self.ny = ny
        self.dx = dx
        self.dy = dy
        self.dt = dt
        self.diffusivity = diffusivity

        # Species mass fraction fields (0.0 to 1.0)
        self.Y_O2 = np.full((ny, nx), 0.231, dtype=np.float64)  # Ambient oxygen ~23.1% by mass
        self.Y_CO2 = np.full((ny, nx), 0.0004, dtype=np.float64)
        self.soot_density = np.zeros((ny, nx), dtype=np.float64) # kg/m^3
        self.smoke_density = np.zeros((ny, nx), dtype=np.float64) # kg/m^3

    def compute_hrr(self, time: float, alpha: float = 0.0469, q_peak: float = 1500.0) -> float:
        """
        t^2 Fire Growth Heat Release Rate HRR Q_dot(t) in kW:
        Q_dot = min(alpha * t^2, q_peak)
        alpha values: slow (0.0029), medium (0.0117), fast (0.0469), ultra-fast (0.1876)
        """
        return float(min(alpha * (time**2), q_peak))

    def advect_diffuse_field(
        self,
        field: np.ndarray,
        u: np.ndarray,
        v: np.ndarray,
        source: np.ndarray
    ) -> np.ndarray:
        """
        Advection-Diffusion step for a scalar mass fraction field:
        dC/dt + u dC/dx + v dC/dy = D (d2C/dx2 + d2C/dy2) + source
        """
        dx, dy, dt = self.dx, self.dy, self.dt
        D = self.diffusivity

        dCdx = np.gradient(field, dx, axis=1)
        dCdy = np.gradient(field, dy, axis=0)
        d2Cdx2 = np.gradient(dCdx, dx, axis=1)
        d2Cdy2 = np.gradient(dCdy, dy, axis=0)

        field_new = field + dt * (
            - (u * dCdx + v * dCdy) +
            D * (d2Cdx2 + d2Cdy2) +
            source
        )
        return np.clip(field_new, 0.0, 1.0)

    def step(
        self,
        time: float,
        u: np.ndarray,
        v: np.ndarray,
        fire_x: int = 20,
        fire_y: int = 2,
        alpha: float = 0.0469,
        q_peak: float = 1500.0
    ) -> Dict[str, Any]:
        """
        Advances species transport and combustion rates by one timestep dt.
        """
        hrr_kW = self.compute_hrr(time, alpha, q_peak)

        # Mass production rates at fire source
        # Stoichiometry: ~ 0.075 kg soot per MJ, ~0.15 kg smoke per MJ
        source_soot = np.zeros((self.ny, self.nx), dtype=np.float64)
        source_smoke = np.zeros((self.ny, self.nx), dtype=np.float64)
        source_o2_loss = np.zeros((self.ny, self.nx), dtype=np.float64)

        if 0 <= fire_y < self.ny and 0 <= fire_x < self.nx:
            # Local volumetric heat generation (kW/m^3)
            q_vol = hrr_kW / (self.dx * self.dy * 1.0)
            source_soot[fire_y, fire_x] = 1e-4 * q_vol
            source_smoke[fire_y, fire_x] = 3e-4 * q_vol
            source_o2_loss[fire_y, fire_x] = -2e-4 * q_vol

        # Update species fields
        self.soot_density = self.advect_diffuse_field(self.soot_density, u, v, source_soot)
        self.smoke_density = self.advect_diffuse_field(self.smoke_density, u, v, source_smoke)
        self.Y_O2 = self.advect_diffuse_field(self.Y_O2, u, v, source_o2_loss)

        return {
            "hrr_kW": hrr_kW,
            "max_soot": float(np.max(self.soot_density)),
            "max_smoke": float(np.max(self.smoke_density)),
            "min_o2_pct": float(np.min(self.Y_O2) * 100.0)
        }
