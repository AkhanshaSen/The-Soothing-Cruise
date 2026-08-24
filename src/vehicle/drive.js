/** Bicycle steering model in road-frame.
 *
 * Keeps the car mostly controllable at high speed:
 * - yawOffset integrates from steering input
 * - forward progress uses cos(yawOffset)
 * - lateral drift uses sin(yawOffset)
 * - when steer is released, yawOffset + lateral relax back toward center
 */

import { clamp, damp } from '../core/util.js';

export function updateDrive(state, input, dt, spec) {
  const speed = state.speed;
  const absSpeed = Math.abs(speed);

  // Steering input is -1..1 (left=-1, right=+1).
  const steerIn = clamp(input.steer, -1, 1);

  // Speed-scaled steer authority: less steering at high speed.
  const speedRatio = spec && spec.top ? clamp(absSpeed / spec.top, 0, 1) : 0;
  const maxSteer = spec ? spec.steer * (1 - clamp(speedRatio, 0, 0.72) * 0.55) : 0.3;

  // Convert driver input to steer angle.
  // Note: we apply a minus sign so "steerIn=+1 (right)" moves toward negative lateral,
  // matching our road-frame lateral definition.
  const steerAngle = steerIn * maxSteer;
  const wheelbase = spec?.wheelbase ?? 2.5;

  // Bicycle yaw rate in road frame.
  const yawRate = -absSpeed * Math.tan(steerAngle) / wheelbase * Math.sign(speed || 1);
  state.yawOffset = clamp(state.yawOffset + yawRate * dt, -0.85, 0.85);

  // Advance along the road frame.
  state.s = state.s + speed * Math.cos(state.yawOffset) * dt;

  // Drift laterally in the road frame.
  state.lateral = state.lateral + speed * Math.sin(state.yawOffset) * dt;

  // Lane centering: only when the player isn't actively steering.
  if (Math.abs(steerIn) < 0.02) {
    state.yawOffset = damp(state.yawOffset, 0, 5.0, dt);
    state.lateral = damp(state.lateral, 0, 3.8, dt);
  }

  return { steerAngle };
}

