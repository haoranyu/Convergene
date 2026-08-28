export type AppError<Code extends string = string> = {
  code: Code;
  message?: string;
};

export type Result<Value, Code extends string = string> =
  { ok: true; value: Value } | { error: AppError<Code>; ok: false };
