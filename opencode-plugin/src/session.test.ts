import { expect, test } from "bun:test";
import { SessionManager } from "./session";

test("SessionManager sets and gets sessions", () => {
  const manager = new SessionManager(() => {});

  manager.setSession("test-1", {
    dropperName: "session-test-1",
    instructions: "Hello World",
  });

  const session = manager.getSession("test-1");
  expect(session).toBeDefined();
  expect(session?.dropperName).toBe("session-test-1");
  expect(session?.instructions).toBe("Hello World");
});

test("SessionManager deletes sessions", () => {
  const manager = new SessionManager(() => {});

  manager.setSession("test-1", {
    dropperName: "session-test-1",
    instructions: "Hello",
  });

  manager.deleteSession("test-1");
  expect(manager.getSession("test-1")).toBeUndefined();
});

test("SessionManager handles prune message IDs", () => {
  const manager = new SessionManager(() => {});

  manager.setPruneMessageId("test-1", "msg-123");
  expect(manager.getPruneMessageId("test-1")).toBe("msg-123");

  manager.deleteSession("test-1");
  expect(manager.getPruneMessageId("test-1")).toBeUndefined(); // Should be deleted with the session
});
