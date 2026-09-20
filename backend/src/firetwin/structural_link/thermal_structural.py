import numpy as np
from typing import Dict, Any, List

class ThermalStructuralLink:
    """
    Thermal-Structural Degradation Model & Project-2 Nonlinear FEM Interface Exporter.
    Calculates member temperature rise under fire exposure and computes yield strength &
    stiffness reduction factors according to ISO 834 / Eurocode standards.
    """
    def __init__(
        self,
        member_length: float = 6.0,   # Span length (m)
        cross_section_area: float = 0.015, # m^2
        perimeter_exposed: float = 1.2, # m
        material_type: str = "structural_steel_S355"
    ):
        self.member_length = member_length
        self.cross_section_area = cross_section_area
        self.perimeter_exposed = perimeter_exposed
        self.material_type = material_type

        # Material constants at 20 deg C (293.15 K)
        self.rho = 7850.0       # kg/m^3 (steel density)
        self.c_p = 600.0        # J/kg.K (steel specific heat)
        self.f_y0 = 355.0       # MPa (nominal yield strength)
        self.E0 = 210.0         # GPa (nominal Young's modulus)

    @staticmethod
    def iso_834_fire_temp(time_sec: float, t_ambient: float = 20.0) -> float:
        """
        ISO 834 Standard Fire Curve T_ISO(t) in Celsius:
        T(t) = 20 + 345 * log10(8 * t_minutes + 1)
        """
        t_min = time_sec / 60.0
        if t_min <= 0:
            return t_ambient
        return float(t_ambient + 345.0 * np.log10(8.0 * t_min + 1.0))

    @staticmethod
    def steel_yield_reduction_factor(temp_c: float) -> float:
        """
        Eurocode 3 / ISO reduction factor for steel yield strength k_y(T).
        """
        if temp_c <= 200.0:
            return 1.0
        elif temp_c <= 400.0:
            return 1.0 - 0.2 * (temp_c - 200.0) / 200.0
        elif temp_c <= 600.0:
            return 0.8 - 0.53 * (temp_c - 400.0) / 200.0
        elif temp_c <= 800.0:
            return 0.27 - 0.16 * (temp_c - 600.0) / 200.0
        elif temp_c <= 1000.0:
            return 0.11 - 0.07 * (temp_c - 800.0) / 200.0
        else:
            return 0.02

    @staticmethod
    def steel_elasticity_reduction_factor(temp_c: float) -> float:
        """
        Eurocode 3 reduction factor for steel elasticity modulus k_E(T).
        """
        if temp_c <= 100.0:
            return 1.0
        elif temp_c <= 500.0:
            return 1.0 - 0.4 * (temp_c - 100.0) / 400.0
        elif temp_c <= 700.0:
            return 0.6 - 0.47 * (temp_c - 500.0) / 200.0
        elif temp_c <= 900.0:
            return 0.13 - 0.09 * (temp_c - 700.0) / 200.0
        else:
            return 0.02

    def simulate_member_heating(
        self,
        gas_temp_history_c: List[float],
        time_steps_sec: List[float],
        h_conv: float = 25.0,  # Convective heat transfer coefficient (W/m^2.K)
        emissivity: float = 0.7
    ) -> Dict[str, Any]:
        """
        Simulates 0D/1D lumped heat capacity temperature response of the steel member:
        dT_s = [h_conv*(T_gas - T_s) + eps*sigma*(T_gas^4 - T_s^4)] * (Am/V) / (rho * Cp) * dt
        """
        sigma_sb = 5.670374e-8
        box_value = self.perimeter_exposed / self.cross_section_area # Am/V (1/m)

        t_member_c = 20.0
        member_temp_history = []
        k_y_history = []
        k_E_history = []
        iso_temp_history = []

        for i, dt in enumerate(np.diff([0.0] + time_steps_sec)):
            t_gas_c = gas_temp_history_c[i]
            t_gas_k = t_gas_c + 273.15
            t_s_k = t_member_c + 273.15

            # Heat flux q_total (W/m^2)
            q_conv = h_conv * (t_gas_k - t_s_k)
            q_rad = emissivity * sigma_sb * (t_gas_k**4 - t_s_k**4)
            q_total = q_conv + q_rad

            # Temperature rise
            dT_s = (q_total * box_value / (self.rho * self.c_p)) * dt
            t_member_c += dT_s

            ky = self.steel_yield_reduction_factor(t_member_c)
            kE = self.steel_elasticity_reduction_factor(t_member_c)
            t_iso = self.iso_834_fire_temp(time_steps_sec[i])

            member_temp_history.append(float(t_member_c))
            k_y_history.append(float(ky))
            k_E_history.append(float(kE))
            iso_temp_history.append(float(t_iso))

        return {
            "time_sec": time_steps_sec,
            "member_temp_c": member_temp_history,
            "iso_temp_c": iso_temp_history,
            "yield_reduction_ky": k_y_history,
            "elasticity_reduction_kE": k_E_history,
            "project2_export": self.format_for_project2(time_steps_sec, member_temp_history, k_y_history, k_E_history)
        }

    def format_for_project2(
        self,
        time_sec: List[float],
        temp_c: List[float],
        k_y: List[float],
        k_E: List[float]
    ) -> Dict[str, Any]:
        """
        Formats material degradation time series into Project 2 (nonlinear-fea-studio)
        compatible JSON payload.
        """
        return {
            "platform_origin": "firetwin_v0.1.0",
            "material_name": self.material_type,
            "nominal_yield_MPa": self.f_y0,
            "nominal_E_GPa": self.E0,
            "degradation_series": [
                {
                    "time_sec": round(t, 2),
                    "temp_c": round(T, 2),
                    "current_yield_MPa": round(self.f_y0 * ky, 2),
                    "current_E_GPa": round(self.E0 * kE, 2)
                }
                for t, T, ky, kE in zip(time_sec, temp_c, k_y, k_E)
            ]
        }
