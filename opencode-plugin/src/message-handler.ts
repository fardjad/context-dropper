type ParamType = "string" | "number";

type Params<P extends string> =
  P extends `${string}<${ParamType}:${infer Name}>${infer Rest}`
    ? { [K in Name | keyof Params<Rest>]: string | number }
    : Record<never, never>;

export type HandlerContext = {
  sessionId: string;
  messageId: string | undefined;
  input: any;
  output: any;
};

type Handler<P extends string> = (
  params: Params<P>,
  ctx: HandlerContext,
) => Promise<string | void> | string | void;

type Route = {
  regex: RegExp;
  paramNames: string[];
  paramTypes: ParamType[];
  handler: Handler<any>;
};

function compilePattern(pattern: string): {
  regex: RegExp;
  paramNames: string[];
  paramTypes: ParamType[];
} {
  const paramNames: string[] = [];
  const paramTypes: ParamType[] = [];

  const regexSource = pattern.replace(
    /<(string|number):([^>]+)>/g,
    (_, type: ParamType, name: string) => {
      paramNames.push(name);
      paramTypes.push(type);
      return type === "number" ? "(-?\\d+(?:\\.\\d+)?)" : "(.+?)";
    },
  );

  return {
    regex: new RegExp(`^${regexSource}$`, "is"),
    paramNames,
    paramTypes,
  };
}

export class MessageHandler {
  private routes: Route[] = [];

  use<P extends string>(pattern: P, handler: Handler<P>): this {
    const { regex, paramNames, paramTypes } = compilePattern(pattern);
    this.routes.push({ regex, paramNames, paramTypes, handler });
    return this;
  }

  get handle() {
    return async (input: any, output: any) => {
      const sessionId = input.sessionID;
      const messageId = output.message?.id;

      for (const part of output.parts) {
        if (part.type !== "text") continue;
        const text = part.text.trim();

        for (const route of this.routes) {
          const match = text.match(route.regex);
          if (!match) continue;

          const params: Record<string, string | number> = {};
          route.paramNames.forEach((name, i) => {
            const raw = match[i + 1];
            params[name] = route.paramTypes[i] === "number" ? Number(raw) : raw;
          });

          const result = await route.handler(params as any, {
            sessionId,
            messageId,
            input,
            output,
          });
          if (typeof result === "string") {
            part.text = result;
          }
          break;
        }
      }
    };
  }
}
