import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  PASSWORD_RESET_MAX_DURATION_MS,
  PASSWORD_RESET_MIN_DURATION_MS,
  passwordResetTargetDuration,
  withPasswordResetTiming,
} from "@/modules/customers/presentation/password-reset-timing";

describe("password reset timing mitigation", () => {
  it("en producción espera solamente el tiempo restante hasta el objetivo", async () => {
    let currentTime = 100;
    const wait = vi.fn(async (milliseconds: number) => {
      currentTime += milliseconds;
    });

    const result = await withPasswordResetTiming(async () => {
      currentTime += 275;
      return "ok";
    }, {
      environment: "production",
      now: () => currentTime,
      randomTarget: () => 1_200,
      wait,
    });

    expect(result).toBe("ok");
    expect(wait).toHaveBeenCalledOnce();
    expect(wait).toHaveBeenCalledWith(925);
  });

  it("no agrega espera si la operación supera el objetivo ni fuera de producción", async () => {
    let currentTime = 0;
    const productionWait = vi.fn(async () => undefined);
    await withPasswordResetTiming(async () => {
      currentTime = 1_601;
    }, {
      environment: "production",
      now: () => currentTime,
      randomTarget: () => 1_600,
      wait: productionWait,
    });
    expect(productionWait).not.toHaveBeenCalled();

    const developmentWait = vi.fn(async () => undefined);
    const developmentRandomTarget = vi.fn(() => 1_200);
    await withPasswordResetTiming(async () => undefined, {
      environment: "development",
      randomTarget: developmentRandomTarget,
      wait: developmentWait,
    });
    expect(developmentRandomTarget).not.toHaveBeenCalled();
    expect(developmentWait).not.toHaveBeenCalled();
  });

  it("genera jitter criptográfico dentro del rango inclusivo configurado", () => {
    const randomInteger = vi.fn()
      .mockReturnValueOnce(PASSWORD_RESET_MIN_DURATION_MS)
      .mockReturnValueOnce(PASSWORD_RESET_MAX_DURATION_MS);

    expect(passwordResetTargetDuration(randomInteger)).toBe(PASSWORD_RESET_MIN_DURATION_MS);
    expect(passwordResetTargetDuration(randomInteger)).toBe(PASSWORD_RESET_MAX_DURATION_MS);
    expect(randomInteger).toHaveBeenCalledWith(
      PASSWORD_RESET_MIN_DURATION_MS,
      PASSWORD_RESET_MAX_DURATION_MS + 1,
    );
  });
});
