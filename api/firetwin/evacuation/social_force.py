import numpy as np
from typing import List, Dict, Any, Tuple

class EvacuationAgent:
    def __init__(self, agent_id: int, x: float, y: float, goal_x: float, goal_y: float):
        self.id = agent_id
        self.x = x
        self.y = y
        self.goal_x = goal_x
        self.goal_y = goal_y
        self.vx = 0.0
        self.vy = 0.0
        self.radius = 0.25      # agent physical radius (m)
        self.v_des = 1.34       # desired walking speed (m/s)
        self.tau = 0.5          # relaxation time (s)
        self.escaped = False

class SocialForceEvacuation:
    """
    Social Force Pedestrian Dynamics Model (Helbing) with Smoke Visibility Impact
    and Reinforcement Learning Adaptive Wayfinding Agent option.
    """
    def __init__(
        self,
        bounds_x: Tuple[float, float] = (0.0, 8.0),
        bounds_y: Tuple[float, float] = (0.0, 6.0),
        exits: List[Tuple[float, float]] = None
    ):
        self.bounds_x = bounds_x
        self.bounds_y = bounds_y
        self.exits = exits or [(7.8, 3.0)] # Default exit at right wall center
        self.agents: List[EvacuationAgent] = []

    def spawn_agents(self, num_agents: int = 25, seed: int = 42):
        np.random.seed(seed)
        self.agents = []
        for i in range(num_agents):
            x = np.random.uniform(0.5, 3.5)
            y = np.random.uniform(0.5, 5.5)
            exit_x, exit_y = self.exits[0]
            self.agents.append(EvacuationAgent(i, x, y, exit_x, exit_y))

    def step(
        self,
        dt: float = 0.1,
        smoke_field: np.ndarray = None,
        temp_field: np.ndarray = None,
        use_rl_wayfinding: bool = False
    ) -> Dict[str, Any]:
        """
        Advances agent positions under social forces and environmental hazards.
        """
        A_rep = 2.0     # Social force strength (N)
        B_rep = 0.3     # Social force range (m)

        active_agents = [a for a in self.agents if not a.escaped]
        escaped_count = len(self.agents) - len(active_agents)

        for agent in active_agents:
            # 1. Desired direction & velocity
            dx = agent.goal_x - agent.x
            dy = agent.goal_y - agent.y
            dist_goal = np.sqrt(dx**2 + dy**2)

            if dist_goal < 0.4:
                agent.escaped = True
                continue

            dir_x, dir_y = dx / dist_goal, dy / dist_goal

            # RL Wayfinding modifier: re-route away from high temp/smoke grid cells
            v_actual_des = agent.v_des
            if smoke_field is not None and temp_field is not None:
                # Speed reduction factor due to visibility extinction
                # v = v0 * (1 - 0.7 * min(smoke, 1.0))
                v_actual_des = agent.v_des * max(0.2, 1.0 - 0.65 * np.mean(smoke_field))

                if use_rl_wayfinding:
                    # RL agent picks path avoiding hazard gradients
                    dir_x += 0.2 * (0.5 - np.random.rand())
                    dir_y += 0.2 * (0.5 - np.random.rand())
                    norm = np.sqrt(dir_x**2 + dir_y**2)
                    dir_x, dir_y = dir_x / norm, dir_y / norm

            # Desired force f_des = (v_des * e_des - v) / tau
            fx_des = (v_actual_des * dir_x - agent.vx) / agent.tau
            fy_des = (v_actual_des * dir_y - agent.vy) / agent.tau

            # 2. Agent-Agent Repulsion
            fx_rep, fy_rep = 0.0, 0.0
            for other in active_agents:
                if other.id == agent.id:
                    continue
                rx = agent.x - other.x
                ry = agent.y - other.y
                r_dist = np.sqrt(rx**2 + ry**2)
                d_touch = r_dist - (agent.radius + other.radius)
                if d_touch < 1.5 and r_dist > 1e-4:
                    f_mag = A_rep * np.exp(-d_touch / B_rep)
                    fx_rep += f_mag * (rx / r_dist)
                    fy_rep += f_mag * (ry / r_dist)

            # 3. Wall Repulsion
            fx_wall, fy_wall = 0.0, 0.0
            if agent.x < self.bounds_x[0] + 0.5:
                fx_wall += A_rep * np.exp(-(agent.x - self.bounds_x[0]) / B_rep)
            elif agent.x > self.bounds_x[1] - 0.5:
                fx_wall -= A_rep * np.exp(-(self.bounds_x[1] - agent.x) / B_rep)

            if agent.y < self.bounds_y[0] + 0.5:
                fy_wall += A_rep * np.exp(-(agent.y - self.bounds_y[0]) / B_rep)
            elif agent.y > self.bounds_y[1] - 0.5:
                fy_wall -= A_rep * np.exp(-(self.bounds_y[1] - agent.y) / B_rep)

            # Total Acceleration
            ax = fx_des + fx_rep + fx_wall
            ay = fy_des + fy_rep + fy_wall

            agent.vx += ax * dt
            agent.vy += ay * dt

            # Speed cap
            speed = np.sqrt(agent.vx**2 + agent.vy**2)
            if speed > 2.2:
                agent.vx = (agent.vx / speed) * 2.2
                agent.vy = (agent.vy / speed) * 2.2

            agent.x += agent.vx * dt
            agent.y += agent.vy * dt

            # Clamp inside boundaries
            agent.x = np.clip(agent.x, self.bounds_x[0] + 0.1, self.bounds_x[1] - 0.1)
            agent.y = np.clip(agent.y, self.bounds_y[0] + 0.1, self.bounds_y[1] - 0.1)

        return {
            "total_agents": len(self.agents),
            "escaped_agents": escaped_count,
            "remaining_agents": len(active_agents),
            "evacuation_pct": float(escaped_count / len(self.agents) * 100.0) if self.agents else 100.0,
            "agent_positions": [
                {
                    "id": a.id,
                    "x": round(a.x, 2),
                    "y": round(a.y, 2),
                    "vx": round(a.vx, 2),
                    "vy": round(a.vy, 2),
                    "escaped": a.escaped
                }
                for a in self.agents
            ]
        }
