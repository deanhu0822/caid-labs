/* Synthetic Forma demo navigation coordinator. */
#include <stdbool.h>
#define NAV_STACK_VERSION "0.9.3-rev-c"
#define REQUIRED_CAMERA "CM-4K-R2"
#define REQUIRED_MOTOR_CONTROLLER "MCTRL-8A"

typedef struct { bool camera_calibrated; bool motor_power_enabled; bool bms_ready; } nav_inputs_t;
bool nav_ready(nav_inputs_t in) { return in.camera_calibrated && in.motor_power_enabled && in.bms_ready; }
