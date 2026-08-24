/** Bicycle steering model in road-frame.
 *
 * Keeps the car mostly controllable at high speed:
 * - yawOffset integrates from steering input
 * - forward progress uses cos(yawOffset)
 * - lateral drift uses sin(yawOffset)
 * - when steer is released, yawOffset relaxes back toward road heading
 *   (lateral lane position is kept — a lane change sticks)
 * - road-wheel angle is a critically damped 2nd-order filter so keyboard
 *   input has weight instead of snapping to full lock
 */

import { clamp, damp } from '../core/util.js';

const STEER_IN = 20.0; // rad/s, turning in (~195 ms to 90%)
const STEER_BACK = 31.0; // rad/s, centering (self-aligns faster)

export function updateDrive(state, input, dt, spec) {
  const speed = state.speed;
  const absSpeed = Math.abs(speed);

  // Steering input is -1..1 (left=-1, right=+1).
  const steerIn = clamp(input.steer, -1, 1);

  // Speed-scaled steer authority: quadratic falloff keeps high-speed turns tame.
  const speedRatio = spec && spec.top ? clamp(absSpeed / spec.top, 0, 1) : 0;
  const maxSteer = spec ? spec.steer / (1 + 12 * speedRatio * speedRatio) : 0.3;

  // Critically damped 2nd-order filter toward the requested road-wheel angle.
  if (state.steerVel == null) state.steerVel = 0;
  if (state.steerAngle == null) state.steerAngle = 0;

  const targetAngle = steerIn * maxSteer;
  const centering =
    Math.abs(targetAngle) < Math.abs(state.steerAngle) || targetAngle * state.steerAngle < 0;
  const w = centering ? STEER_BACK : STEER_IN;

  const d = state.steerAngle - targetAngle;
  const b = state.steerVel + w * d;
  const ex = Math.exp(-w * dt);
  const dd = d + b * dt;
  state.steerAngle = targetAngle + dd * ex;
  state.steerVel = (b - w * dd) * ex;

  const steerAngle = state.steerAngle;
  const wheelbase = spec?.wheelbase ?? 2.5;

  // Bicycle yaw rate in road frame.
  const yawRate = -absSpeed * Math.tan(steerAngle) / wheelbase * Math.sign(speed || 1);
  state.yawOffset = clamp(state.yawOffset + yawRate * dt, -0.2, 0.2);

  // Advance along the road frame.
  state.s = state.s + speed * Math.cos(state.yawOffset) * dt;

  // Drift laterally in the road frame.
  state.lateral = state.lateral + speed * Math.sin(state.yawOffset) * dt;

  // Heading correction only: keep lane position when steer is released.
  if (Math.abs(steerIn) < 0.02) {
    state.yawOffset = damp(state.yawOffset, 0, 8.0, dt);
  }

  return { steerAngle };
}
