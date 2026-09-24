import { getPasscodeRetryDelay } from "../passcode";

describe("getPasscodeRetryDelay()", () => {
  it("increases the retry delay after repeated failures", () => {
    expect(getPasscodeRetryDelay(4)).toBe(0);
    expect(getPasscodeRetryDelay(5)).toBe(60_000);
    expect(getPasscodeRetryDelay(6)).toBe(300_000);
    expect(getPasscodeRetryDelay(7)).toBe(900_000);
    expect(getPasscodeRetryDelay(8)).toBe(3_600_000);
    expect(getPasscodeRetryDelay(20)).toBe(3_600_000);
  });
});
