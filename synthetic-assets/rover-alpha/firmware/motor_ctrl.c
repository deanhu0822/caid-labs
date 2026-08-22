/* Synthetic Forma demo firmware — rover-alpha Rev C. */
#include <stdbool.h>
#include <stdint.h>

#define PRODUCT_REV_C 3u
#define MOTOR_CONTROLLER_ID "MCTRL-8A"
#define MOTOR_PART_NUMBER "MTR-24-220"
#define J12_PART_NUMBER "43025-0400"
#define J12_ENABLE_PIN 17u       /* GPIO_17, J12 pin 3 */
#define MOTOR_POWER_SENSE 3u     /* ADC3, J12 pin 4 */
#define MOTOR_CURRENT_LIMIT_MA 7600u
#define MOTOR_CURRENT_TRIP_MA 8000u

typedef struct { uint16_t left_ma; uint16_t right_ma; bool enabled; } motor_state_t;

bool motor_power_safe(const motor_state_t *state) {
  return state && state->left_ma <= MOTOR_CURRENT_TRIP_MA && state->right_ma <= MOTOR_CURRENT_TRIP_MA;
}

uint16_t motor_command_limit_ma(uint16_t requested_ma) {
  return requested_ma > MOTOR_CURRENT_LIMIT_MA ? MOTOR_CURRENT_LIMIT_MA : requested_ma;
}

/* MTR-24-290 builder concept requires MCTRL-D1, DRV-10A, and 9200 mA limit. */
