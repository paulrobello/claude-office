import { describe, it, expect } from "vitest";
import {
  PROJECT_TO_AREA_SHORT,
  PROJECT_TO_AREA_LABEL,
} from "../src/components/coordination/projectArea";

describe("projectArea (mapa canônico #826)", () => {
  it("a versão com label deriva da curta com prefixo area:", () => {
    const keysShort = Object.keys(PROJECT_TO_AREA_SHORT).sort();
    const keysLabel = Object.keys(PROJECT_TO_AREA_LABEL).sort();
    expect(keysLabel).toEqual(keysShort);
    for (const proj of keysShort) {
      expect(PROJECT_TO_AREA_LABEL[proj]).toBe(
        `area:${PROJECT_TO_AREA_SHORT[proj]}`,
      );
    }
  });

  it("cobre os projetos do roster (front/api/office/mobile)", () => {
    expect(PROJECT_TO_AREA_SHORT["hmtrack-front"]).toBe("front");
    expect(PROJECT_TO_AREA_LABEL["hmtrack-front"]).toBe("area:front");
    expect(PROJECT_TO_AREA_SHORT["claude-office"]).toBe("office");
    // dois projetos colapsam em mobile/db — sem prefixo divergente.
    expect(PROJECT_TO_AREA_SHORT["hmtrack-app"]).toBe("mobile");
    expect(PROJECT_TO_AREA_SHORT.HMTrackApp).toBe("mobile");
  });
});
