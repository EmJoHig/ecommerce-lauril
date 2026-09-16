import "server-only";

import { randomInt } from "node:crypto";
import { performance } from "node:perf_hooks";
import { setTimeout as sleep } from "node:timers/promises";

export const PASSWORD_RESET_MIN_DURATION_MS = 1_200;
export const PASSWORD_RESET_MAX_DURATION_MS = 1_600;

type PasswordResetTimingDependencies = Readonly<{
  environment?: string;
  now?: () => number;
  randomTarget?: () => number;
  wait?: (milliseconds: number) => Promise<unknown>;
}>;

export function passwordResetTargetDuration(
  randomInteger: (minimum: number, maximum: number) => number = randomInt,
): number {
  return randomInteger(
    PASSWORD_RESET_MIN_DURATION_MS,
    PASSWORD_RESET_MAX_DURATION_MS + 1,
  );
}

export async function withPasswordResetTiming<T>(
  operation: () => Promise<T>,
  dependencies: PasswordResetTimingDependencies = {},
): Promise<T> {
  const environment = dependencies.environment ?? process.env.NODE_ENV;
  if (environment !== "production") return operation();

  const now = dependencies.now ?? (() => performance.now());
  const wait = dependencies.wait ?? sleep;
  const startedAt = now();
  const targetDuration = (dependencies.randomTarget ?? passwordResetTargetDuration)();

  try {
    return await operation();
  } finally {
    const remaining = targetDuration - (now() - startedAt);
    if (remaining > 0) await wait(remaining);
  }
}
