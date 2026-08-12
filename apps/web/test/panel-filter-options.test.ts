import { describe, expect, it } from "vitest";
import { panelFilterOptionValues } from "@/lib/data/panel";

describe("panel filter option values", () => {
  it("splits imported multi-select text into unique individual choices", () => {
    expect(panelFilterOptionValues(
      ["Elbil", "Hybridbil"],
      ["Elbil,Benzin- eller dieselbil", "Hybridbil; Plug-in Hybridbil"],
      [" elbil ", "Ingen bil"],
    )).toEqual([
      "Elbil",
      "Hybridbil",
      "Benzin- eller dieselbil",
      "Plug-in Hybridbil",
      "Ingen bil",
    ]);
  });
});
