import numpy as np
from typing import Dict, Any, Tuple, Optional

class LESSolver2D:
    """
    2D Incompressible Navier-Stokes Solver with Boussinesq Buoyancy Approximation
    and Smagorinsky Subgrid-Scale (LES) Closure on a Structured Grid.
    """
    def __init__(
        self,
        nx: int = 40,
        ny: int = 30,
        dx: float = 0.2,
        dy: float = 0.2,
        dt: float = 0.02,
        nu: float = 1.5e-5,          # Kinematic viscosity (m^2/s)
        beta: float = 3.4e-3,        # Thermal expansion coefficient (1/K)
        g: float = 9.81,             # Gravitational acceleration (m/s^2)
        cs: float = 0.17,            # Smagorinsky constant
        t_ambient: float = 293.15    # Ambient temperature (K)
    ):
        self.nx = nx
        self.ny = ny
        self.dx = dx
        self.dy = dy
        self.dt = dt
        self.nu = nu
        self.beta = beta
        self.g = g
        self.cs = cs
        self.t_ambient = t_ambient

        # Velocity fields (u: x-dir, v: y-dir)
        self.u = np.zeros((ny, nx), dtype=np.float64)
        self.v = np.zeros((ny, nx), dtype=np.float64)

        # Pressure and Temperature fields
        self.p = np.zeros((ny, nx), dtype=np.float64)
        self.T = np.full((ny, nx), t_ambient, dtype=np.float64)

        # Obstacle mask (True = solid wall/obstacle, False = fluid)
        self.obstacle = np.zeros((ny, nx), dtype=bool)
        # Apply default outer boundary walls except for top/vent openings
        self.obstacle[0, :] = True   # Floor
        self.obstacle[:, 0] = True   # Left wall
        self.obstacle[:, -1] = True  # Right wall

    def compute_smagorinsky_viscosity(self, u: np.ndarray, v: np.ndarray) -> np.ndarray:
        """
        Calculates eddy viscosity nu_sgs = (Cs * delta)^2 * |S|
        where |S| = sqrt(2 S_ij S_ij).
        """
        dx, dy = self.dx, self.dy
        delta = np.sqrt(dx * dy)

        # Strain rate tensor components
        dudx = np.gradient(u, dx, axis=1)
        dudy = np.gradient(u, dy, axis=0)
        dvdx = np.gradient(v, dx, axis=1)
        dvdy = np.gradient(v, dy, axis=0)

        s11 = dudx
        s22 = dvdy
        s12 = 0.5 * (dudy + dvdx)

        s_mag = np.sqrt(2.0 * (s11**2 + s22**2 + 2.0 * s12**2))
        nu_sgs = (self.cs * delta)**2 * s_mag
        return nu_sgs

    def solve_pressure_poisson(
        self,
        rhs: np.ndarray,
        max_iter: int = 150,
        tol: float = 1e-4
    ) -> np.ndarray:
        """
        Solves Laplace/Poisson equation for pressure correction: del^2 p = rhs
        using Red-Black Gauss-Seidel or Jacobi iteration.
        """
        p = self.p.copy()
        dx2, dy2 = self.dx**2, self.dy**2
        coeff = 0.5 * (dx2 * dy2) / (dx2 + dy2)

        for _ in range(max_iter):
            p_old = p.copy()
            # Central difference for interior points
            p[1:-1, 1:-1] = coeff * (
                (p_old[1:-1, 2:] + p_old[1:-1, :-2]) / dx2 +
                (p_old[2:, 1:-1] + p_old[:-2, 1:-1]) / dy2 -
                rhs[1:-1, 1:-1]
            )

            # Neumann boundary conditions on obstacles (dp/dn = 0)
            p[self.obstacle] = 0.0
            p[0, :] = p[1, :]
            p[-1, :] = p[-2, :]
            p[:, 0] = p[:, 1]
            p[:, -1] = p[:, -2]

            diff = np.max(np.abs(p - p_old))
            if diff < tol:
                break

        return p

    def step(self, hrr_sources: Optional[list] = None) -> Dict[str, Any]:
        """
        Advances the CFD simulation by one time step dt.
        """
        nx, ny = self.nx, self.ny
        dx, dy, dt = self.dx, self.dy, self.dt
        u, v, T = self.u, self.v, self.T

        # 1. Effective viscosity (laminar + SGS eddy viscosity)
        nu_eff = self.nu + self.compute_smagorinsky_viscosity(u, v)

        # 2. Temperature advection-diffusion + Fire Heat Input
        dTdx = np.gradient(T, dx, axis=1)
        dTdy = np.gradient(T, dy, axis=0)
        d2Tdx2 = np.gradient(dTdx, dx, axis=1)
        d2Tdy2 = np.gradient(dTdy, dy, axis=0)

        # Thermal diffusivity alpha ~ nu / Pr (Prandtl number ~ 0.71 for air)
        alpha = nu_eff / 0.71

        T_new = T + dt * (
            - (u * dTdx + v * dTdy) +
            alpha * (d2Tdx2 + d2Tdy2)
        )

        # Add fire heat sources if specified [(iy, ix, heat_rate_kW)]
        if hrr_sources:
            for iy, ix, q_dot in hrr_sources:
                if 0 <= iy < ny and 0 <= ix < nx:
                    # delta T = Q_dot / (rho * Cp * V)
                    # Air density ~ 1.2 kg/m^3, Cp ~ 1.005 kJ/kg.K
                    dT_source = (q_dot / (1.2 * 1.005 * dx * dy * 1.0)) * dt
                    T_new[iy, ix] += dT_source

        # Enforce ambient temperature on boundaries
        T_new[self.obstacle] = self.t_ambient
        self.T = np.clip(T_new, self.t_ambient, 2500.0)

        # 3. Predictor step for u and v (Advection + Diffusion + Buoyancy)
        dudx = np.gradient(u, dx, axis=1)
        dudy = np.gradient(u, dy, axis=0)
        d2udx2 = np.gradient(dudx, dx, axis=1)
        d2udy2 = np.gradient(dudy, dy, axis=0)

        dvdx = np.gradient(v, dx, axis=1)
        dvdy = np.gradient(v, dy, axis=0)
        d2vdx2 = np.gradient(dvdx, dx, axis=1)
        d2vdy2 = np.gradient(dvdy, dy, axis=0)

        # Boussinesq buoyancy force in y-direction (upward acceleration)
        buoyancy = self.g * self.beta * (self.T - self.t_ambient)

        u_star = u + dt * (- (u * dudx + v * dudy) + nu_eff * (d2udx2 + d2udy2))
        v_star = v + dt * (- (u * dvdx + v * dvdy) + nu_eff * (d2vdx2 + d2vdy2) + buoyancy)

        # Zero out velocity on obstacles
        u_star[self.obstacle] = 0.0
        v_star[self.obstacle] = 0.0

        # 4. Compute Velocity Divergence RHS for Pressure Poisson
        du_stardx = np.gradient(u_star, dx, axis=1)
        dv_stardy = np.gradient(v_star, dy, axis=0)
        rhs = (1.0 / dt) * (du_stardx + dv_stardy)

        # 5. Solve Pressure Poisson Equation
        self.p = self.solve_pressure_poisson(rhs)

        # 6. Correct Velocities with Pressure Gradient
        dpdx = np.gradient(self.p, dx, axis=1)
        dpdy = np.gradient(self.p, dy, axis=0)

        self.u = u_star - dt * dpdx
        self.v = v_star - dt * dpdy

        # Apply no-slip on obstacles
        self.u[self.obstacle] = 0.0
        self.v[self.obstacle] = 0.0

        return {
            "max_velocity": float(np.max(np.sqrt(self.u**2 + self.v**2))),
            "max_temp_c": float(np.max(self.T) - 273.15),
            "avg_temp_c": float(np.mean(self.T) - 273.15)
        }
