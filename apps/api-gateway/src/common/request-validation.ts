import { ZodTypeAny } from "zod";
import { badRequest } from "./http-errors";

export function parseRequestBody<TSchema extends ZodTypeAny>(
  schema: TSchema,
  payload: unknown,
  requestId?: string
) {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    badRequest(40001, "参数非法", requestId);
  }
  return parsed.data;
}
