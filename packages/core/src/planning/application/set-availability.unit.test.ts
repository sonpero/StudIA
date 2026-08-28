import { describe, expect, it } from "vitest";
import type { Availability } from "../domain/types.js";
import { fakePlanningRepository } from "./fakes.js";
import { setAvailability } from "./set-availability.js";

describe("setAvailability", () => {
  it("stores minutes per weekday for the user", async () => {
    const repo = fakePlanningRepository();
    const availability: Availability = { mon: 30, tue: 30, wed: 30, thu: 30, fri: 30, sat: 0, sun: 0 };
    await setAvailability({ repo }, "u1", availability);
    expect(await repo.getAvailability("u1")).toEqual(availability);
  });

  it("overwrites a previous value for the same user", async () => {
    const repo = fakePlanningRepository({ availability: { u1: { mon: 10, tue: 10, wed: 10, thu: 10, fri: 10, sat: 10, sun: 10 } } });
    const availability: Availability = { mon: 45, tue: 0, wed: 45, thu: 0, fri: 45, sat: 0, sun: 0 };
    await setAvailability({ repo }, "u1", availability);
    expect(await repo.getAvailability("u1")).toEqual(availability);
  });
});
