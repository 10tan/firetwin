import matplotlib.pyplot as plt
import matplotlib.patches as patches
import numpy as np
import os

os.makedirs('docs/assets', exist_ok=True)

# -------------------------------------------------------------
# 1. Eurocode 3 EN 1993-1-2 Material Degradation Curves
# -------------------------------------------------------------
def generate_eurocode3_figure():
    fig, ax = plt.subplots(figsize=(8, 4.8), dpi=300)
    fig.patch.set_facecolor('#FFFFFF')
    ax.set_facecolor('#FAFBFC')

    temps = np.linspace(20, 1100, 500)

    # EN 1993-1-2 Table 3.1 reduction factors
    def get_ky(T):
        if T <= 400:
            return 1.0
        elif T <= 600:
            return 1.0 - (T - 400)/200.0 * 0.77
        elif T <= 800:
            return 0.23 - (T - 600)/200.0 * 0.17
        elif T <= 1000:
            return 0.06 - (T - 800)/200.0 * 0.06
        else:
            return 0.0

    def get_kE(T):
        if T <= 100:
            return 1.0
        elif T <= 500:
            return 1.0 - (T - 100)/400.0 * 0.40
        elif T <= 600:
            return 0.60 - (T - 500)/100.0 * 0.29
        elif T <= 800:
            return 0.31 - (T - 600)/200.0 * 0.22
        elif T <= 1000:
            return 0.09 - (T - 800)/200.0 * 0.09
        else:
            return 0.0

    def get_kp(T):
        if T <= 100:
            return 1.0
        elif T <= 400:
            return 1.0 - (T - 100)/300.0 * 0.58
        elif T <= 600:
            return 0.42 - (T - 400)/200.0 * 0.24
        elif T <= 800:
            return 0.18 - (T - 600)/200.0 * 0.11
        else:
            return max(0.0, 0.07 - (T - 800)/200.0 * 0.07)

    ky_vals = [get_ky(t) for t in temps]
    kE_vals = [get_kE(t) for t in temps]
    kp_vals = [get_kp(t) for t in temps]

    ax.plot(temps, ky_vals, label=r'Yield Strength Reduction $k_y(T)$ ($f_y / f_{y,20^\circ\mathrm{C}}$)', color='#D9534F', linewidth=2.8)
    ax.plot(temps, kE_vals, label=r'Elastic Stiffness Reduction $k_E(T)$ ($E_s / E_{s,20^\circ\mathrm{C}}$)', color='#1F4E79', linewidth=2.8, linestyle='--')
    ax.plot(temps, kp_vals, label=r'Proportional Limit Reduction $k_p(T)$ ($f_p / f_{y,20^\circ\mathrm{C}}$)', color='#E67E22', linewidth=2.0, linestyle=':')

    # Critical annotations
    ax.axvline(400, color='#8C9BAE', linestyle='-.', alpha=0.7)
    ax.axvline(600, color='#8C9BAE', linestyle='-.', alpha=0.7)
    ax.axhline(0.5, color='#CBD5E1', linestyle=':', alpha=0.6)

    ax.annotate(r'Critical Onset: $T = 400^\circ\mathrm{C}$' + '\n(Rapid Yield Degradation)',
                xy=(400, 1.0), xytext=(430, 0.85),
                arrowprops=dict(arrowstyle='->', color='#D9534F', lw=1.5),
                fontsize=9.5, fontweight='bold', color='#1A1A1A',
                bbox=dict(boxstyle='round,pad=0.4', facecolor='#FFF', edgecolor='#D9534F', alpha=0.9))

    ax.annotate(r'$T = 600^\circ\mathrm{C}$: 77% Strength Lost' + '\n' + r'($k_y = 0.23, k_E = 0.31$)',
                xy=(600, 0.23), xytext=(650, 0.42),
                arrowprops=dict(arrowstyle='->', color='#1F4E79', lw=1.5),
                fontsize=9.5, fontweight='bold', color='#1A1A1A',
                bbox=dict(boxstyle='round,pad=0.4', facecolor='#FFF', edgecolor='#1F4E79', alpha=0.9))

    ax.set_xlim(20, 1100)
    ax.set_ylim(-0.02, 1.08)
    ax.set_xlabel(r'Steel Member Temperature $T_s$ ($^\circ\mathrm{C}$)', fontsize=11, fontweight='bold', color='#1A1A1A')
    ax.set_ylabel(r'Normalized Reduction Factor ($k = X(T) / X_{20^\circ\mathrm{C}}$)', fontsize=11, fontweight='bold', color='#1A1A1A')
    ax.set_title('Eurocode 3 (EN 1993-1-2) Structural Steel Material Degradation Functions', fontsize=12.5, fontweight='bold', color='#1F4E79', pad=12)

    ax.grid(True, linestyle='--', alpha=0.45, color='#CBD5E1')
    ax.legend(frameon=True, facecolor='#FFFFFF', edgecolor='#CBD5E1', fontsize=9.5, loc='upper right')

    plt.tight_layout()
    plt.savefig('docs/assets/eurocode3_degradation.png', dpi=300)
    plt.close()
    print('Generated eurocode3_degradation.png')

# -------------------------------------------------------------
# 2. 2-Zone Smoke Layer Descent & Volumetric Filling
# -------------------------------------------------------------
def generate_two_zone_figure():
    fig, ax = plt.subplots(figsize=(8.5, 5.0), dpi=300)
    fig.patch.set_facecolor('#FFFFFF')
    ax.set_facecolor('#FFFFFF')

    # Compartment boundaries
    room_w = 10.0
    room_h = 6.0
    layer_h = 3.8 # current interface height z_layer

    # Draw compartment walls
    ax.plot([0, 0], [0, room_h], color='#1F4E79', linewidth=4.5) # Left Wall
    ax.plot([room_w, room_w], [2.2, room_h], color='#1F4E79', linewidth=4.5) # Right Wall above door
    ax.plot([0, 4.0], [room_h, room_h], color='#1F4E79', linewidth=4.5) # Ceiling left
    ax.plot([6.0, room_w], [room_h, room_h], color='#1F4E79', linewidth=4.5) # Ceiling right
    ax.plot([0, room_w], [0, 0], color='#1F4E79', linewidth=4.5) # Floor

    # Rooftop SHEV Vent Opening (4.0 to 6.0 at y = room_h)
    ax.fill_between([4.0, 6.0], [room_h, room_h], [room_h + 0.6, room_h + 0.6], color='#F0F4F8', edgecolor='#1F4E79', linestyle='--', linewidth=1.5)
    ax.text(5.0, room_h + 0.28, r'Rooftop SHEV Smoke Vent $\dot{m}_{vent}$', ha='center', va='center', fontsize=9, fontweight='bold', color='#1F4E79')

    # Vent exhaust flow arrows
    ax.annotate('', xy=(4.6, room_h + 1.0), xytext=(4.6, room_h + 0.1), arrowprops=dict(arrowstyle='->', lw=2.5, color='#D9534F'))
    ax.annotate('', xy=(5.4, room_h + 1.0), xytext=(5.4, room_h + 0.1), arrowprops=dict(arrowstyle='->', lw=2.5, color='#D9534F'))

    # Doorway opening on right (x=room_w, y=0 to 2.2)
    ax.plot([room_w, room_w], [0, 2.2], color='#94A3B8', linestyle=':', linewidth=2)
    ax.text(room_w + 0.2, 1.1, 'Egress Door\nPassage', ha='left', va='center', fontsize=8.5, color='#5A6A80', fontweight='bold')

    # Upper Hot Smoke Layer
    upper_box = patches.Rectangle((0, layer_h), room_w, room_h - layer_h, facecolor='#FADBD8', alpha=0.75, edgecolor='none')
    ax.add_patch(upper_box)

    # Lower Cold Ambient Air Layer
    lower_box = patches.Rectangle((0, 0), room_w, layer_h, facecolor='#EBF5FB', alpha=0.55, edgecolor='none')
    ax.add_patch(lower_box)

    # Smoke layer interface line
    ax.plot([0, room_w], [layer_h, layer_h], color='#C0392B', linestyle='--', linewidth=2.5)

    # Fire Plume (Conical entrainment zone)
    fire_x = 2.5
    fire_y = 0.0
    plume_poly = patches.Polygon([[fire_x - 0.4, 0], [fire_x + 0.4, 0], [fire_x + 1.8, room_h], [fire_x - 1.8, room_h]],
                                  facecolor='#F39C12', alpha=0.45, edgecolor='none')
    ax.add_patch(plume_poly)

    # Fire Core
    flame_poly = patches.Polygon([[fire_x - 0.5, 0], [fire_x, 1.2], [fire_x + 0.5, 0]], facecolor='#E74C3C', alpha=0.9, edgecolor='#C0392B')
    ax.add_patch(flame_poly)
    ax.text(fire_x, 0.4, r'$\dot{Q}(t)$', ha='center', va='center', color='#FFF', fontweight='bold', fontsize=10)

    # Ceiling Jet arrows
    ax.annotate('', xy=(1.0, room_h - 0.3), xytext=(fire_x - 1.5, room_h - 0.3), arrowprops=dict(arrowstyle='->', lw=2.2, color='#C0392B'))
    ax.annotate('', xy=(8.5, room_h - 0.3), xytext=(fire_x + 1.5, room_h - 0.3), arrowprops=dict(arrowstyle='->', lw=2.2, color='#C0392B'))
    ax.text(5.0, room_h - 0.6, 'Radial Ceiling Jet Flow', ha='center', color='#922B21', fontsize=9.5, fontweight='bold')

    # Plume Air Entrainment Arrows
    ax.annotate('', xy=(fire_x - 0.5, 2.0), xytext=(fire_x - 1.6, 1.5), arrowprops=dict(arrowstyle='->', lw=2.0, color='#2980B9'))
    ax.annotate('', xy=(fire_x + 0.5, 2.0), xytext=(fire_x + 1.6, 1.5), arrowprops=dict(arrowstyle='->', lw=2.0, color='#2980B9'))
    ax.text(fire_x - 2.0, 1.3, r'Air Entrainment $\dot{m}_{plume}$', color='#1F4E79', fontsize=9, fontweight='bold', ha='right')

    # Layer Text Annotations
    ax.text(7.2, 4.8, 'UPPER HOT SMOKE LAYER\n' + r'$T_u(t), \rho_u(t), Y_{soot}, Y_{CO}$' + '\n' + r'$M_u(t) = \int \dot{m}_{plume} dt$',
            ha='center', va='center', fontsize=9.5, fontweight='bold', color='#922B21',
            bbox=dict(boxstyle='round,pad=0.4', facecolor='#FFF', edgecolor='#C0392B', alpha=0.9))

    ax.text(7.2, 1.8, 'LOWER AMBIENT COLD LAYER\n' + r'$T_l \approx T_0 = 20^\circ\mathrm{C}, \rho_0 = 1.204\,\mathrm{kg/m}^3$' + '\nClear Tenable Air Zone',
            ha='center', va='center', fontsize=9.5, fontweight='bold', color='#1F4E79',
            bbox=dict(boxstyle='round,pad=0.4', facecolor='#FFF', edgecolor='#2980B9', alpha=0.9))

    # Height Indicators (Interface Descent)
    ax.annotate('', xy=(-0.3, layer_h), xytext=(-0.3, 0), arrowprops=dict(arrowstyle='<->', color='#1A1A1A', lw=1.5))
    ax.text(-0.5, layer_h / 2.0, r'Interface Height $z_{layer}(t)$', rotation=90, va='center', ha='right', fontsize=9.5, fontweight='bold', color='#1A1A1A')

    ax.annotate('', xy=(room_w + 1.2, room_h), xytext=(room_w + 1.2, 0), arrowprops=dict(arrowstyle='<->', color='#1A1A1A', lw=1.5))
    ax.text(room_w + 1.4, room_h / 2.0, r'Ceiling Height $H$', rotation=90, va='center', ha='left', fontsize=9.5, fontweight='bold', color='#1A1A1A')

    # Descent arrow on interface
    ax.annotate('', xy=(1.5, layer_h - 0.7), xytext=(1.5, layer_h + 0.1), arrowprops=dict(arrowstyle='->', lw=2.5, color='#922B21'))
    ax.text(1.7, layer_h - 0.4, r'Descent Rate $\frac{dz_{layer}}{dt} = -\frac{\dot{m}_{plume} - \dot{m}_{vent}}{\rho_u A_{floor}}$', fontsize=9, fontweight='bold', color='#922B21')

    ax.set_xlim(-1.8, room_w + 2.2)
    ax.set_ylim(-0.3, room_h + 1.3)
    ax.axis('off')
    ax.set_title('Two-Zone Fire Dynamics & Smoke Layer Volumetric Filling Model', fontsize=12.5, fontweight='bold', color='#1F4E79', pad=14)

    plt.tight_layout()
    plt.savefig('docs/assets/two_zone_smoke_model.png', dpi=300)
    plt.close()
    print('Generated two_zone_smoke_model.png')

# -------------------------------------------------------------
# 3. Fourier Neural Operator (FNO 2D) Architecture
# -------------------------------------------------------------
def generate_fno_architecture_figure():
    fig, ax = plt.subplots(figsize=(9.2, 4.8), dpi=300)
    fig.patch.set_facecolor('#FFFFFF')
    ax.set_facecolor('#FAFBFC')

    # Block coordinates
    # Input -> Lift -> Fourier Block (Spectral + Conv) -> Project -> Output
    boxes = [
        {'x': 0.4, 'y': 2.0, 'w': 1.2, 'h': 1.4, 'title': 'Input Field\n$a(\mathbf{x})$\n$(B, C_{in}, H, W)$', 'bg': '#EBF5FB', 'border': '#2980B9'},
        {'x': 2.0, 'y': 2.0, 'w': 1.1, 'h': 1.4, 'title': 'Lifting Layer\n$\mathcal{P}$\n(Linear $C_{in} \\to d_v$)', 'bg': '#E8F8F5', 'border': '#16A085'},
        {'x': 3.6, 'y': 0.6, 'w': 4.3, 'h': 3.8, 'title': '', 'bg': '#FFFFFF', 'border': '#1F4E79'}, # Outer container
        {'x': 8.3, 'y': 2.0, 'w': 1.1, 'h': 1.4, 'title': 'Projection $\mathcal{Q}$\n(Linear $d_v \\to C_{out}$)', 'bg': '#E8F8F5', 'border': '#16A085'},
        {'x': 9.8, 'y': 2.0, 'w': 1.2, 'h': 1.4, 'title': 'Solution Field\n$u(\mathbf{x})$\n$(B, C_{out}, H, W)$', 'bg': '#FADBD8', 'border': '#C0392B'}
    ]

    for b in boxes:
        rect = patches.FancyBboxPatch((b['x'], b['y']), b['w'], b['h'],
                                      boxstyle='round,pad=0.08', facecolor=b['bg'], edgecolor=b['border'], linewidth=1.8)
        ax.add_patch(rect)
        if b['title']:
            ax.text(b['x'] + b['w']/2.0, b['y'] + b['h']/2.0, b['title'],
                    ha='center', va='center', fontsize=8.5, fontweight='bold', color='#1A1A1A')

    # Inside Fourier Block:
    ax.text(5.75, 4.15, r'Fourier Spectral Layer Block $v_l \to v_{l+1}$ (Repeated $\times 4$)',
            ha='center', va='center', fontsize=9.5, fontweight='bold', color='#1F4E79')

    # Upper branch: 2D FFT -> R_phi -> 2D IFFT
    fourier_sub = [
        {'x': 3.9, 'y': 2.7, 'w': 0.9, 'h': 1.0, 'title': '2D FFT\n$\mathcal{F}(v_l)$', 'bg': '#FEF9E7', 'border': '#F39C12'},
        {'x': 5.2, 'y': 2.7, 'w': 1.2, 'h': 1.0, 'title': 'Frequency Filter\n$R_\\phi(k) \\cdot \\hat{v}_l(k)$', 'bg': '#FDEDEC', 'border': '#E74C3C'},
        {'x': 6.8, 'y': 2.7, 'w': 0.9, 'h': 1.0, 'title': '2D IFFT\n$\mathcal{F}^{-1}(\\dots)$', 'bg': '#FEF9E7', 'border': '#F39C12'}
    ]
    for b in fourier_sub:
        rect = patches.FancyBboxPatch((b['x'], b['y']), b['w'], b['h'],
                                      boxstyle='round,pad=0.05', facecolor=b['bg'], edgecolor=b['border'], linewidth=1.5)
        ax.add_patch(rect)
        ax.text(b['x'] + b['w']/2.0, b['y'] + b['h']/2.0, b['title'],
                ha='center', va='center', fontsize=8.0, fontweight='bold', color='#1A1A1A')

    # Lower branch: Local Linear W
    rect_w = patches.FancyBboxPatch((4.7, 1.0), 2.2, 0.9,
                                    boxstyle='round,pad=0.05', facecolor='#F4ECF7', edgecolor='#8E44AD', linewidth=1.5)
    ax.add_patch(rect_w)
    ax.text(5.8, 1.45, r'Local Linear Transform $W \cdot v_l$', ha='center', va='center', fontsize=8.5, fontweight='bold', color='#1A1A1A')

    # Addition Circle and Activation
    circle = patches.Circle((7.5, 2.0), 0.22, facecolor='#EAECEE', edgecolor='#1F4E79', linewidth=1.8)
    ax.add_patch(circle)
    ax.text(7.5, 2.0, '+', ha='center', va='center', fontsize=12, fontweight='bold', color='#1A1A1A')

    # Activation Rect
    rect_act = patches.FancyBboxPatch((7.1, 1.0), 0.8, 0.5, boxstyle='round,pad=0.04', facecolor='#E8F6F3', edgecolor='#16A085', linewidth=1.2)
    ax.add_patch(rect_act)
    ax.text(7.5, 1.25, r'$\sigma(\mathrm{GELU})$', ha='center', va='center', fontsize=8, fontweight='bold', color='#16A085')

    # Connecting Arrows
    arrow_kw = dict(arrowstyle='->', lw=1.8, color='#1F4E79')
    ax.annotate('', xy=(2.0, 2.7), xytext=(1.6, 2.7), arrowprops=arrow_kw)
    ax.annotate('', xy=(3.6, 2.7), xytext=(3.1, 2.7), arrowprops=arrow_kw)

    # Split to upper / lower
    ax.annotate('', xy=(3.9, 3.2), xytext=(3.7, 2.7), arrowprops=arrow_kw)
    ax.annotate('', xy=(4.7, 1.45), xytext=(3.7, 2.7), arrowprops=arrow_kw)

    # Upper branch connections
    ax.annotate('', xy=(5.2, 3.2), xytext=(4.8, 3.2), arrowprops=arrow_kw)
    ax.annotate('', xy=(6.8, 3.2), xytext=(6.4, 3.2), arrowprops=arrow_kw)

    # Converge to addition
    ax.annotate('', xy=(7.4, 2.2), xytext=(7.25, 2.7), arrowprops=arrow_kw)
    ax.annotate('', xy=(7.4, 1.8), xytext=(6.9, 1.45), arrowprops=arrow_kw)

    # Through activation to exit
    ax.annotate('', xy=(7.5, 1.5), xytext=(7.5, 1.78), arrowprops=arrow_kw)
    ax.annotate('', xy=(8.3, 2.7), xytext=(7.5, 1.0), arrowprops=arrow_kw)
    ax.annotate('', xy=(9.8, 2.7), xytext=(9.4, 2.7), arrowprops=arrow_kw)

    ax.set_xlim(0.0, 11.4)
    ax.set_ylim(0.2, 4.6)
    ax.axis('off')
    ax.set_title('Fourier Neural Operator (FNO 2D) Spectral Convolution Architecture', fontsize=12.5, fontweight='bold', color='#1F4E79', pad=12)

    plt.tight_layout()
    plt.savefig('docs/assets/fno_architecture.png', dpi=300)
    plt.close()
    print('Generated fno_architecture.png')

generate_eurocode3_figure()
generate_two_zone_figure()
generate_fno_architecture_figure()
