# WI-114 — Cable Routing, Rev C

## Required parts

- HAR-MAIN-C, HAR-J12-C, J12 Molex 43025-0400, MCB-C4, MCTRL-8A, and CHS-240 C3.

## Prerequisites and tools

ROUTE-08 operations 10–30 complete; battery isolated. Use ESD strap, flush cutters, 30 N pull gauge, and synthetic routing template RT-114-C.

## Procedure

1. Route HAR-MAIN-C along the right chassis rail; maintain 15 mm bend radius.
2. Separate camera/data wiring from VMOTOR_24V by at least 20 mm.
3. Verify HAR-J12-C has four populated circuits and the Rev C key.
4. Confirm pin 1 red = VMOTOR_24V; pin 2 black = MOTOR_RETURN.
5. Confirm pin 3 = MOTOR_PWR_EN/GPIO_17 and pin 4 = MOTOR_PWR_SENSE/ADC3.
6. Mate J12 43025-0400 until the latch is audible; apply 30 N pull for 5 s.
7. Add a green Rev C witness mark and record harness lot.

**Warnings:** HAR-J12-B is a two-circuit Rev B harness and is incompatible with MCB-C4. Do not force the NSI-MF4-LK alternate into CHS-240 C3; its latch needs 2 mm extra clearance and different PCB peg holes.

## Acceptance

Latch retained, no conductor exposure, continuity under 80 mΩ on power contacts, and pins 3/4 visible to QA-FIX-C.
