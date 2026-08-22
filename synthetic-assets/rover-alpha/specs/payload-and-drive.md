# Payload and drive sizing — Rev C

## Current design point

- Rated payload: **8.0 kg**.
- Base rover mass: **14.2 kg**; gross mass at rated payload: **22.2 kg**.
- MTR-24-220 output torque: **22.0 N·m nominal** per geared motor.
- T-MTR-08 observed torque margin: **14%** at 8.0 kg payload and 12° grade.
- Peak controller current: **7.4 A** against the MCTRL-8A **8.0 A** limit.
- Firmware command limit in `motor_ctrl.c`: **7.6 A**.

## Builder objective: increase payload by 30%

Target payload is **10.4 kg**. The synthetic MTR-24-290 alternate provides **29.0 N·m** (+31.8%), draws **8.8 A peak**, consumes **142 W** at the sizing point (+18%), and adds **0.12 kg per motor**.

It fits MTR-HSG-04, but it is not a drop-in electrical change: MCTRL-8A/DRV-8A and 10 A branch protection require a D1 upgrade. J12 has only 0.2 A of nominal design headroom at 8.8 A, so the Builder should require thermal validation or include the J14 high-current connector concept. Expected affected artifacts: motor-bom, motor-controller, motor-driver, power-board, battery, battery-mgmt, motor-control, motor-housing, and BOM.
