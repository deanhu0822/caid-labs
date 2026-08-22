/* Synthetic Forma demo BMS logic — rover-alpha Rev C. */
#include <stdbool.h>
#include <stdint.h>

#define BATTERY_PART_NUMBER "BAT-24-12"
#define POWER_BOARD_ID "PDB-24V"
#define BATTERY_CAPACITY_MAH 12000u
#define PACK_NOMINAL_MV 24000u
#define PACK_UNDERVOLTAGE_MV 19800u
#define PACK_CURRENT_LIMIT_MA 36000u
#define ENERGY_RESERVE_PERCENT 15u

bool bms_voltage_ok(uint32_t pack_mv) { return pack_mv >= PACK_UNDERVOLTAGE_MV; }
uint32_t usable_energy_wh(void) { return (24u * 12u * (100u - ENERGY_RESERVE_PERCENT)) / 100u; }
/* Rev B BAT-24-10 was 10000 mAh and used a different PDB harness. */
