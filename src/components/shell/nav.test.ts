import { describe, expect, it } from "vitest";
import { activeNav, NAV } from "./nav";

describe("navegación única", () => {
  it("tiene exactamente 4 destinos con rutas distintas", () => {
    expect(NAV.map((n) => n.key)).toEqual(["inicio", "viaje", "pulso", "yo"]);
    expect(new Set(NAV.map((n) => n.href)).size).toBe(4);
  });
  it.each([
    ["/", "inicio"], ["/resultados", "inicio"], ["/destino/CUZ", "inicio"], ["/sorpresa", "inicio"], ["/ciudad", "inicio"],
    ["/dia", "viaje"], ["/trip-twin", "viaje"], ["/importar", "viaje"], ["/verificar", "viaje"],
    ["/radar", "pulso"], ["/live", "pulso"],
    ["/perfil", "yo"], ["/guardados", "yo"], ["/cuenta", "yo"],
  ])("%s pertenece a %s", (path, key) => expect(activeNav(path)).toBe(key));
  it("una ruta desconocida no deja la barra sin destino activo", () => expect(activeNav("/nada")).toBe("inicio"));
  it("no confunde prefijos parecidos", () => expect(activeNav("/diagnostico")).toBe("inicio"));
});
