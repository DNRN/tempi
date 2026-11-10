import { expect, test } from "vitest";
import { tempiVersion } from "./version.js";

test("tempiVersion returns the package.json version", () => {
  expect(tempiVersion()).toMatch(/^\d+\.\d+\.\d+/);
});
