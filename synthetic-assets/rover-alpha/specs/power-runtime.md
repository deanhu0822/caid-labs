# Power and runtime budget — Rev C

| Mode | Average power |
|---|---:|
| Compute, sensing, and PDB losses | 31.8 W |
| Traction at level cruise | 48.0 W |
| Camera and illumination | 12.0 W |
| **Typical total** | **91.8 W** |

BAT-24-12 stores 288 Wh nominal. With the firmware/BMS 15% reserve, usable energy is 244.8 Wh, yielding **2.67 h** at 91.8 W.

For a 4.0 h objective at the same duty cycle, required nominal energy is 432 Wh. BAT-24-18 provides 432 Wh, but its 165 mm length exceeds BAT-CAGE-03's 155 mm envelope and adds 1.1 kg. A Rev D1 cage/chassis change or a reduction to 61.2 W average after reserve would be required.

The CM-4K-R2 allocation shortage does not directly change runtime, but replacing it with ALT-CAM-4K-L consumes 3.5 W more and reduces the 12 Ah estimate by approximately 0.10 h.
