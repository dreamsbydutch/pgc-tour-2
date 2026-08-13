// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ToursToggle } from "./ToursToggle";

afterEach(cleanup);

describe("ToursToggle", () => {
  it("orders playoff brackets before PGA and renders their trophy logos", () => {
    render(
      <ToursToggle
        tours={[
          { _id: "pga", shortForm: "PGA", logoUrl: "/pga.png" },
          { _id: "gold", shortForm: "Gold", logoUrl: "/gold.png" },
          { _id: "silver", shortForm: "Silver", logoUrl: "/silver.png" },
        ]}
        activeTourId="gold"
        onChangeTourId={vi.fn()}
      />,
    );

    expect(
      screen.getAllByRole("button").map((button) => button.textContent),
    ).toEqual(["Gold", "Silver", "PGA"]);
    expect(screen.getByRole("img", { name: "Gold" }).getAttribute("src")).toBe(
      "/gold.png",
    );
    expect(
      screen.getByRole("img", { name: "Silver" }).getAttribute("src"),
    ).toBe("/silver.png");
  });
});
