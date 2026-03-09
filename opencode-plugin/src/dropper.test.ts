import { expect, test } from "bun:test";
import { Dropper } from "./dropper";
import { DefaultDropperService } from "../../src/dropper/service";

// simple mock object
class MockDropperService extends DefaultDropperService {
  public creates: any[] = [];
  public removes: any[] = [];
  public tags: any[] = [];
  public isDones: any[] = [];

  // mock methods
  override async create(input: any) {
    this.creates.push(input);
  }
  override async remove(input: any) {
    this.removes.push(input);
  }
  override async tag(input: any) {
    this.tags.push(input);
  }
  override async isDone(input: any): Promise<boolean> {
    this.isDones.push(input);
    if (input.dropperName === "done-session") return true;
    throw new Error("Untagged items remain");
  }
}

test("Dropper create wraps DropperService correctly", async () => {
  const mock = new MockDropperService({} as any);
  const dropper = new Dropper(
    process.cwd(),
    "my-fileset",
    "test-session",
    () => {},
    mock,
  );

  await dropper.create();

  expect(mock.creates.length).toBe(1);
  expect(mock.creates[0].filesetName).toBe("my-fileset");
  expect(mock.creates[0].dropperName).toBe("test-session");
});

test("Dropper isDone wraps DropperService correctly", async () => {
  const mock = new MockDropperService({} as any);

  const doneDropper = new Dropper(
    process.cwd(),
    "my-fileset",
    "done-session",
    () => {},
    mock,
  );
  const done = await doneDropper.isDone();
  expect(done).toBe(true);

  const notDoneDropper = new Dropper(
    process.cwd(),
    "my-fileset",
    "not-done-session",
    () => {},
    mock,
  );
  const notDone = await notDoneDropper.isDone();
  expect(notDone).toBe(false);
});
