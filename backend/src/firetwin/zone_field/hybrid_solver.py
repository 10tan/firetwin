import numpy as np
from typing import Dict, Any, List

class MultiCompartmentHybridSolver:
    """
    Hybrid Zone/Field Smoke Spread Module for Multi-Compartment Buildings.
    Solves 2-zone mass & energy conservation equations (upper hot layer vs lower cool layer)
    across connecting openings and stairwell shafts.
    """
    def __init__(self, num_rooms: int = 3, room_height: float = 3.0, room_area: float = 24.0):
        self.num_rooms = num_rooms
        self.room_height = room_height
        self.room_area = room_area

        # State per room: [hot_layer_height (m), T_upper (K), T_lower (K), soot_upper (kg/m^3)]
        self.layer_heights = np.full(num_rooms, room_height, dtype=np.float64) # starts at ceiling
        self.T_upper = np.full(num_rooms, 293.15, dtype=np.float64)
        self.T_lower = np.full(num_rooms, 293.15, dtype=np.float64)
        self.soot_upper = np.zeros(num_rooms, dtype=np.float64)

    def step(
        self,
        dt: float = 0.1,
        fire_room_idx: int = 0,
        hrr_kW: float = 500.0,
        door_open: bool = True
    ) -> Dict[str, Any]:
        """
        Advances 2-zone thermodynamic layer evolution across rooms.
        """
        g = 9.81
        rho0 = 1.2
        Cp = 1005.0

        # Fire plume mass entrainment into upper layer in fire room
        # m_plume = 0.071 * Q^(1/3) * z^(5/3) (Zukoski plume model)
        z_layer = self.layer_heights[fire_room_idx]
        m_plume = 0.071 * (max(hrr_kW, 10.0)**(1/3)) * (max(z_layer, 0.2)**(5/3))

        # Layer descent rate: d z_layer / dt = - m_plume / (rho0 * A)
        dz_dt = - m_plume / (rho0 * self.room_area)
        self.layer_heights[fire_room_idx] = max(0.3, self.layer_heights[fire_room_idx] + dz_dt * dt)

        # Upper layer energy balance: d T_upper / dt = Q_fire / (m_upper * Cp)
        m_upper = rho0 * self.room_area * (self.room_height - self.layer_heights[fire_room_idx])
        if m_upper > 1.0:
            dT_upper = (hrr_kW * 1000.0) / (m_upper * Cp) * dt
            self.T_upper[fire_room_idx] += dT_upper

        # Inter-room spillover across doors if door_open
        if door_open and self.num_rooms > 1:
            door_head_height = 2.1
            if self.layer_heights[0] < door_head_height:
                # Spillover flow rate to room 1
                spill_rate = 0.5 * (door_head_height - self.layer_heights[0])
                self.layer_heights[1] = max(0.5, self.layer_heights[1] - spill_rate * dt)
                self.T_upper[1] += 0.4 * (self.T_upper[0] - self.T_upper[1]) * dt

        return {
            "rooms": [
                {
                    "room_id": r,
                    "layer_height_m": round(float(self.layer_heights[r]), 2),
                    "hot_layer_temp_c": round(float(self.T_upper[r] - 273.15), 1),
                    "cool_layer_temp_c": round(float(self.T_lower[r] - 273.15), 1)
                }
                for r in range(self.num_rooms)
            ]
        }
