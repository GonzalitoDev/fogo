import { describe, expect, it } from "vitest";
import { deviceName, passwordStrength } from "./security";

describe("passwordStrength", () => {
  it("rechaza cortas, comunes y con el email", () => {
    expect(passwordStrength("abc").problem).toMatch(/8 caracteres/);
    expect(passwordStrength("12345678").problem).toMatch(/común/);
    expect(passwordStrength("juanperez99", "juanperez@gmail.com").problem).toMatch(/email/);
    expect(passwordStrength("aaaaaaaaa").problem).toMatch(/repitas/);
  });
  it("puntúa mejor las largas y variadas", () => {
    expect(passwordStrength("mateconfacturas").problem).toBeNull();
    expect(passwordStrength("mate").score).toBe(1);
    expect(passwordStrength("Mate-con-Facturas-2026").score).toBe(4);
    expect(passwordStrength("").score).toBe(0);
  });
});

describe("deviceName", () => {
  it("reconoce navegador y sistema", () => {
    expect(deviceName("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36")).toBe("Chrome en Windows");
    expect(deviceName("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile Safari/604.1")).toBe("Safari en iOS");
    expect(deviceName(null)).toBe("Dispositivo desconocido");
  });
});
