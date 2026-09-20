# Verification & Validation (V&V) Documentation

`firetwin` includes an executable pytest suite enforcing strict mathematical and numerical tolerances across all core physics modules.

## Benchmark Test Cases

### 1. ISO 834 Standard Fire Curve Response
- **Formula**: $T(t) = 20 + 345 \log_{10}(8 t_{min} + 1)$
- **Target at $t = 5\text{ min}$ (300 s)**: $576.4^\circ\text{C}$
- **Validation**: `test_iso834_fire_curve` passes with $< 0.1^\circ\text{C}$ error.

### 2. Structural Steel Yield Degradation $k_y(T)$
- **Standard**: Eurocode 3 EN 1993-1-2 Table 3.1
- **Target at $600^\circ\text{C}$**: $k_y = 0.27$
- **Validation**: `test_steel_yield_degradation` passes with error $< 10^{-4}$.

### 3. FNO Surrogate Held-out Accuracy
- **Metric**: Relative $L_2$ Error $\frac{\| \hat{y} - y \|_2}{\| y \|_2}$
- **Threshold**: $< 0.05$ ($5\%$)
- **Validation**: `test_fno_surrogate_l2_threshold` passes.

### 4. Social-Force Agent Evacuation
- **Behavior**: Agents experience repulsive forces from neighboring pedestrians and room boundaries while progressing towards designated exit vectors.
- **Validation**: `test_evacuation_agent_dynamics` verifies monotonic exit distance reduction.
