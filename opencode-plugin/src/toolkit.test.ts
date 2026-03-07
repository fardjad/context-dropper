import { expect, test } from "bun:test";
import { Toolkit } from "./toolkit";
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

test("Toolkit createDropper wraps DropperService correctly", async () => {
  const mock = new MockDropperService({} as any);
  const toolkit = new Toolkit(process.cwd(), mock, {} as any);

  await toolkit.createDropper("my-fileset", "test-session");

  expect(mock.creates.length).toBe(1);
  expect(mock.creates[0].filesetName).toBe("my-fileset");
  expect(mock.creates[0].dropperName).toBe("test-session");
});

test("Toolkit isDone wraps DropperService correctly", async () => {
  const mock = new MockDropperService({} as any);
  const toolkit = new Toolkit(process.cwd(), mock, {} as any);

  const done = await toolkit.isDone("done-session");
  expect(done).toBe(true);

  const notDone = await toolkit.isDone("not-done-session");
  expect(notDone).toBe(false);
});
