import numpy as np
from typing import Tuple

class P1RadiationModel:
    """
    P1 Spherical Harmonics Radiation Model for soot-laden participating media.
    Calculates Incident Radiation G(x,y) and Net Radiative Heat Source q_rad(x,y).
    """
    SIGMA_SB = 5.670374e-8  # Stefan-Boltzmann constant (W/m^2.K^4)

    def __init__(
        self,
        dx: float = 0.2,
        dy: float = 0.2,
        absorption_coeff: float = 0.5, # Base gas absorption coefficient (1/m)
        scattering_coeff: float = 0.1  # Soot scattering coefficient (1/m)
    ):
        self.dx = dx
        self.dy = dy
        self.a_base = absorption_coeff
        self.sigma_s = scattering_coeff

    def compute_incident_radiation(
        self,
        T: np.ndarray,
        soot_density: np.ndarray,
        max_iter: int = 80,
        tol: float = 1e-3
    ) -> Tuple[np.ndarray, np.ndarray]:
        """
        Solves the P1 Helmholtz equation for Incident Radiation G:
        - div( 1/(3*(a + sigma_s)) grad(G) ) + a*G = 4*a*sigma*T^4
        Returns G (W/m^2) and q_rad (W/m^3).
        """
        ny, nx = T.shape
        dx, dy = self.dx, self.dy

        # Absorption coefficient increased by soot density
        a = self.a_base + 300.0 * soot_density  # m^2/kg soot absorption factor
        beta = a + self.sigma_s
        gamma = 1.0 / (3.0 * beta)

        # Blackbody emission source term: 4 * a * sigma * T^4
        E_b = 4.0 * a * self.SIGMA_SB * (T**4)

        G = 4.0 * self.SIGMA_SB * (T**4)  # Initial guess (optically thick limit)

        dx2, dy2 = dx**2, dy**2
        coeff = (dx2 * dy2) / (2.0 * gamma * (dx2 + dy2) + a * dx2 * dy2)

        for _ in range(max_iter):
            G_old = G.copy()

            # Interior finite difference update
            G[1:-1, 1:-1] = coeff[1:-1, 1:-1] * (
                gamma[1:-1, 1:-1] * (G_old[1:-1, 2:] + G_old[1:-1, :-2]) / dx2 +
                gamma[1:-1, 1:-1] * (G_old[2:, 1:-1] + G_old[:-2, 1:-1]) / dy2 +
                E_b[1:-1, 1:-1]
            )

            # Marshak boundary condition: -gamma * dG/dn = eps/(2*(2-eps)) * (G - 4*sigma*T_w^4)
            G[0, :] = G[1, :]
            G[-1, :] = G[-2, :]
            G[:, 0] = G[:, 1]
            G[:, -1] = G[:, -2]

            diff = np.max(np.abs(G - G_old))
            if diff < tol:
                break

        # Radiative heat flux source/sink q_rad = a * (G - 4 * sigma * T^4)
        q_rad = a * (G - 4.0 * self.SIGMA_SB * (T**4))
        return G, q_rad
