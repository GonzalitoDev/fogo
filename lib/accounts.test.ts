import { describe, expect, it } from "vitest";
import { emailTypo, maskEmail } from "./accounts";

describe("emails mal escritos", () => {
  it("detecta gmail.con y otros errores típicos", () => {
    expect(emailTypo("cleo@gmail.con")).toBe("cleo@gmail.com");
    expect(emailTypo("cleo@gmial.com")).toBe("cleo@gmail.com");
    expect(emailTypo("Cleo@Hotmial.com")).toBe("cleo@hotmail.com");
    expect(emailTypo("x@miempresa.con")).toBe("x@miempresa.com");
  });
  it("no molesta con emails correctos", () => {
    expect(emailTypo("cleo@gmail.com")).toBeNull();
    expect(emailTypo("cleo@yahoo.com.ar")).toBeNull();
    expect(emailTypo("cleo@fi.uba.ar")).toBeNull();
    expect(emailTypo("cleo")).toBeNull();
  });
  it("oculta el email en la lista de cuentas", () => {
    expect(maskEmail("cleopatra@gmail.com")).toBe("cl••••••@gmail.com");
  });
});
