# Rover-alpha Rev C system specification

> Synthetic engineering specification for the Forma demo. Not certified product data.

| Requirement | Rev C value | Verification |
|---|---:|---|
| Base vehicle mass | 14.2 kg | T-FINAL-C |
| Rated payload | 8.0 kg | T-MTR-08 |
| Gross vehicle mass limit | 22.5 kg | Analysis + T-MTR-08 |
| Typical runtime | 2.67 h at 91.8 W | T-PWR-24 |
| Battery | BAT-24-12, 24 V, 12 Ah, 288 Wh | T-PWR-24 |
| Operating temperature | -10 °C to 45 °C | DVT environmental screen |
| Ingress target | IP54 design intent | T-FINAL-C visual/seal checks |
| Maximum slope at rated payload | 12° | T-MTR-08 |
| Maximum total battery current | 36 A | BMS limit |
| Camera | CM-4K-R2, 3840×2160 at 30 Hz | T-CAM-12 |

The rated payload is constrained by the MTR-24-220 torque margin and MCTRL-8A peak-current ceiling. The J12 43025-0400 power path is designed for 9.0 A per power contact in this synthetic application.

Artifact references: `rover`, `chassis`, `motor-bom`, `motor-controller`, `battery`, `camera-module`.
