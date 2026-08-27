import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const en = JSON.parse(readFileSync("messages/en.json", "utf8"));
const fr = JSON.parse(readFileSync("messages/fr.json", "utf8"));

const runtimePaths = [
  "prejoin.title", "prejoin.description", "actions.join", "actions.joinObserver", "actions.retry",
  "permissions.ready", "permissions.denied", "permissions.unsupported", "observer.title", "observer.controlsNote",
  "classroom.waiting", "connection.reconnecting", "connection.failedTitle", "errors.tooEarly", "errors.cancelled",
  "errors.ended", "errors.denied", "errors.unavailable", "leave.title", "entry.tooEarly.title",
  "entry.cancelled.title", "entry.ended.title", "entry.unavailable.title", "postCall.title",
  // VIDEO-2A
  "controls.startShare", "controls.stopShare", "controls.othersSharing", "controls.fullscreen", "controls.exitFullscreen",
  "classroom.roleLabel.tutor", "classroom.roleLabel.student", "classroom.roleLabel.observer",
  "classroom.waitingShort.tutor", "classroom.waitingShort.student", "classroom.sharingStatus",
  "errors.screenShareError", "timer.remaining",
];

function resolve(messages: Record<string, unknown>, path: string) {
  return path.split(".").reduce<unknown>((value, key) => (value as Record<string, unknown>)?.[key], messages.videoClassroom);
}

describe("VIDEO-1C localization contract", () => {
  it.each([en, fr])("resolves every representative runtime key inside the videoClassroom namespace", (messages) => {
    for (const path of runtimePaths) {
      const value = resolve(messages, path);
      expect(typeof value, path).toBe("string");
      expect(value, path).not.toBe(path);
      expect(value, path).not.toMatch(/^videoClassroom\./);
    }
  });

  it("keeps EN and FR classroom namespace shapes identical", () => {
    const flatten = (value: Record<string, unknown>, prefix = ""): string[] => Object.entries(value).flatMap(([key, child]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      return typeof child === "object" && child ? flatten(child as Record<string, unknown>, path) : [path];
    }).sort();
    expect(flatten(fr.videoClassroom)).toEqual(flatten(en.videoClassroom));
  });
});
