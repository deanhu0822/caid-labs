# QA-FIX-C — Final QA Fixture

## Purpose

Synthetic bench fixture for T-FINAL-C, T-PWR-24, and J12 interlock verification on rover-alpha Rev C.

## Required configuration

Fixture adapter J12-ADAPT-C mates with J12 43025-0400 and monitors VMOTOR_24V, MOTOR_RETURN, GPIO_17 enable, and ADC3 sense. Fixture software profile must be `qa_fixture_c_1.4`.

## Validation criteria

- J12 power continuity below 80 mΩ per contact.
- J12 retention force at least 30 N.
- GPIO_17 enable transitions within 20 ms.
- ADC3 current telemetry within ±3% of fixture shunt.
- Idle system current below 1.8 A; emergency stop removes motor power within 50 ms.

NSI-MF4-LK requires a new adapter nose and cannot be accepted with J12-ADAPT-C.
