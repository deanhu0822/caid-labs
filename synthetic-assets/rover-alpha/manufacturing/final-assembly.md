# ROUTE-08 — Final Assembly, rover-alpha Rev C

> Synthetic work instruction. Expected configuration: CHS-240 C3, MCB-C4, PDB-24V C2, MCTRL-8A C2, BAT-24-12, CM-4K-R2, and J12 43025-0400.

## Tools and prerequisites

- Calibrated 2–20 N·m torque wrench; ESD bench; 24 V current-limited supply.
- Prerequisites: incoming inspection complete; battery at 30–50% state of charge; board firmware images approved for Rev C.

## Operation 10 — Chassis preparation

Inspect CHS-240 C3, BAT-CAGE-03, and both MTR-HSG-04 interfaces. Reject J12 opening burrs over 0.10 mm.

## Operation 30 — Electronics and battery

Install PDB-24V, MCB-C4, MCTRL-8A, and BAT-24-12 in that order. Torque M4 board standoffs to 2.4 N·m. **Warning:** battery remains disconnected until WI-114 is complete.

## Operation 50 — Camera

Install CAM-MNT-C and CM-4K-R2. Route camera harness outside the J12 power bundle with 20 mm minimum separation.

## Operation 60 — Firmware

Load Rev C firmware. Confirm `motor_ctrl.c` reports GPIO_17/ADC3 for J12 and `camera.rs` selects CAL-CAM-12-C.

## Validation

No trapped harnesses; all torque marks present; current-limited power-up under 1.8 A at idle; release to QA-FIX-C and T-FINAL-C.
