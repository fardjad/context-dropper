import { expect, test } from "bun:test";
import { type DropperService } from "../../src/dropper/service";
import { SessionManager } from "./session";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const noop = (): any => Promise.resolve(undefined);
const stubDropperService: DropperService = {
  create: noop,
  remove: noop,
  show: noop,
  next: noop,
  previous: noop,
  tag: noop,
  removeTags: noop,
  listTags: noop,
  listFiles: noop,
  list: noop,
  dump: noop,
  isDone: noop,
};

test("SessionManager sets and gets sessions", async () => {
  const manager = new SessionManager("/fake/cwd", () => {}, stubDropperService);

  await manager.createSession(
    "test-session-id",
    "test-fileset-name",
    "Instructions",
  );

  const session = manager.getSession("test-session-id");
  expect(session).toBeDefined();
  expect(session?.dropperName).toBe(
    "opencode-test-fileset-name-test-session-id",
  );
  expect(session?.options.instructions).toBe("Instructions");
});

test("SessionManager deletes sessions", async () => {
  const manager = new SessionManager("/fake/cwd", () => {}, stubDropperService);

  await manager.createSession(
    "test-session-id",
    "test-fileset-name",
    "Instructions",
  );

  manager.deleteSession("test-session-id");
  expect(manager.getSession("test-session-id")).toBeUndefined();
});

test("SessionManager handles prune message IDs", async () => {
  const manager = new SessionManager("/fake/cwd", () => {}, stubDropperService);

  const session = await manager.createSession(
    "test-1",
    "session-test-1",
    "Hello",
  );
  session.pruneMessageId = "msg-123";
  expect(session.pruneMessageId).toBe("msg-123");

  manager.deleteSession("test-1");
  expect(manager.getSession("test-1")).toBeUndefined();
});
