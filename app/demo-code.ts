export type DemoCodePreview = {
  filename: string;
  language: string;
  description: string;
  code: string;
};

export const DEMO_CODE_PREVIEWS: Record<string, DemoCodePreview> = {
  'motor-control': {
    filename: 'motor_ctrl.c',
    language: 'C',
    description: 'Motor current limiting and commanded torque output.',
    code: `#include "motor_ctrl.h"

static const float CURRENT_LIMIT_A = 8.0f;

void motor_tick(const drive_cmd_t *cmd) {
  float demand = clampf(cmd->torque, -1.0f, 1.0f);
  float current = adc_read_amps(ADC3);

  if (current > CURRENT_LIMIT_A) {
    demand *= CURRENT_LIMIT_A / current;
  }

  pwm_write(GPIO_17, demand);
}`,
  },
  'camera-service': {
    filename: 'camera.rs',
    language: 'Rust',
    description: 'Captures an inspection frame and publishes its metadata.',
    code: `pub async fn capture_frame(camera: &Camera) -> Result<Frame> {
    let settings = CaptureSettings {
        exposure_us: 8_000,
        gain_db: 4.5,
        format: PixelFormat::Rgb8,
    };

    let frame = camera.capture(settings).await?;
    telemetry::publish("camera/frame", frame.metadata()).await;
    Ok(frame)
}`,
  },
  'battery-mgmt': {
    filename: 'bms.c',
    language: 'C',
    description: 'Checks pack limits before enabling the rover power bus.',
    code: `#define CELL_MIN_V 3.10f
#define PACK_MAX_TEMP_C 58.0f

bool bms_allow_discharge(const pack_t *pack) {
  if (pack->min_cell_v < CELL_MIN_V) return false;
  if (pack->max_temp_c > PACK_MAX_TEMP_C) return false;

  contactor_set(true);
  log_event("BMS_DISCHARGE_ENABLED");
  return true;
}`,
  },
  navigation: {
    filename: 'navigation.py',
    language: 'Python',
    description: 'Converts a planned path into bounded rover velocity commands.',
    code: `def follow_path(path, pose, drivetrain):
    target = path.closest_ahead(pose, lookahead_m=0.8)
    heading_error = wrap_angle(target.heading - pose.heading)

    command = DriveCommand(
        linear_mps=min(target.speed_mps, 1.2),
        angular_rps=clamp(heading_error * 1.6, -0.9, 0.9),
    )

    drivetrain.send(command)
    return command`,
  },
  'scratch-motor-fw': {
    filename: 'motor_control.c',
    language: 'C',
    description: 'Hypothetical Rev A motor-control loop for the generated rover concept.',
    code: `#include "drive.h"

static const float PROTOTYPE_CURRENT_LIMIT_A = 9.0f;

void drive_step(const command_t *command) {
  float left = clampf(command->speed - command->turn, -1.0f, 1.0f);
  float right = clampf(command->speed + command->turn, -1.0f, 1.0f);

  motor_set_current_limit(PROTOTYPE_CURRENT_LIMIT_A);
  motor_write(LEFT_CHANNEL, left);
  motor_write(RIGHT_CHANNEL, right);
}`,
  },
  'scratch-nav-fw': {
    filename: 'navigation.py',
    language: 'Python',
    description: 'Hypothetical navigation state machine for the generated rover concept.',
    code: `def inspection_tick(state, sensors, drive):
    if sensors.obstacle_distance_m < 0.45:
        drive.stop()
        return "blocked"

    target = state.route.next_waypoint()
    command = state.controller.command_to(target, sensors.pose)
    drive.send(command.limit(speed_mps=0.8))
    return "driving"`,
  },
  'product-agent': {
    filename: 'product-agent.ts',
    language: 'TypeScript',
    description: 'Finds graph dependencies for a requested engineering change.',
    code: `export function traceChange(artifactId: string, graph: ProductGraph) {
  const direct = graph.neighbors(artifactId);
  const affected = graph.walk(direct, {
    edgeTypes: ['depends', 'routes', 'validated'],
    maxDepth: 3,
  });

  return {
    affected,
    revisions: graph.revisionsFor(affected),
  };
}`,
  },
  'supply-agent': {
    filename: 'supply-agent.ts',
    language: 'TypeScript',
    description: 'Ranks approved alternatives using stock, lead time, and fit.',
    code: `export function rankAlternates(part: Part, offers: Offer[]) {
  return offers
    .filter((offer) => offer.approved && offer.formFitFunction)
    .map((offer) => ({
      ...offer,
      score: offer.stock * 0.5 - offer.leadDays * 0.3 - offer.cost * 0.2,
    }))
    .sort((a, b) => b.score - a.score);
}`,
  },
  'build-agent': {
    filename: 'build-agent.ts',
    language: 'TypeScript',
    description: 'Builds a change proposal and keeps unrelated artifacts unchanged.',
    code: `export function proposeBuild(goal: BuildGoal, state: EngineeringState) {
  const constraints = collectConstraints(goal, state);
  const candidate = solveSmallestChange(constraints);
  const checks = validate(candidate, state.testPlan);

  return {
    candidate,
    checks,
    preserved: state.artifacts.except(candidate.changedIds),
  };
}`,
  },
};
