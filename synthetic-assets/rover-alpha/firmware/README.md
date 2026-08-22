# Rover-alpha firmware fixtures

Small, valid synthetic source files used for cross-domain retrieval. They model the Rev C pin map and limits; they are not production firmware.

| File | Graph artifact | Key hardware link |
|---|---|---|
| `motor_ctrl.c` | `motor-control` | J12 `43025-0400`, GPIO_17, ADC3, MCTRL-8A |
| `camera.rs` | `camera-service` | CM-4K-R2 calibration profile |
| `bms.c` | `battery-mgmt` | BAT-24-12 and PDB-24V |
| `nav_stack.c` | `navigation` | motor and camera service readiness |

Rev B used `HAR-J12-B` and GPIO_13; Rev C uses the four-circuit J12 `43025-0400` and GPIO_17.
