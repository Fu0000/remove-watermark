import test from "node:test";
import assert from "node:assert/strict";
import type { HttpException } from "@nestjs/common";
import { ensureAuthorization } from "../src/common/auth";
import { issueAccessToken } from "../src/common/jwt";

function withEnv<T>(env: Record<string, string | undefined>, run: () => T): T {
  const previous: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(env)) {
    previous[key] = process.env[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

function assertUnauthorized(run: () => unknown) {
  let caught: unknown;
  try {
    run();
  } catch (error) {
    caught = error;
  }

  assert(caught, "expected unauthorized error");
  const exception = caught as HttpException;
  assert.equal(typeof exception.getStatus, "function");
  assert.equal(exception.getStatus(), 401);
}

test("ensureAuthorization should reject legacy bearer by default", () => {
  withEnv(
    {
      NODE_ENV: "test",
      AUTH_ALLOW_LEGACY_BEARER: undefined,
      AUTH_LEGACY_DEFAULT_USER_ID: undefined,
      AUTH_LEGACY_DEFAULT_TENANT_ID: undefined
    },
    () => {
      assertUnauthorized(() => ensureAuthorization("Bearer test-token", "req_auth_legacy_default"));
    }
  );
});

test("ensureAuthorization should accept legacy bearer when explicitly enabled", () => {
  withEnv(
    {
      AUTH_ALLOW_LEGACY_BEARER: "true",
      AUTH_LEGACY_DEFAULT_USER_ID: undefined,
      AUTH_LEGACY_DEFAULT_TENANT_ID: undefined
    },
    () => {
      const auth = ensureAuthorization("Bearer user:u_test_legacy", "req_auth_legacy_enabled");
      assert.equal(auth.userId, "u_test_legacy");
      assert.equal(auth.tenantId, "u_test_legacy");
    }
  );
});

test("ensureAuthorization should validate issued HS256 JWT token", () => {
  withEnv(
    {
      NODE_ENV: "test",
      AUTH_JWT_SECRET: "jwt-test-secret",
      AUTH_ALLOW_LEGACY_BEARER: "false",
      AUTH_ALLOW_UNSIGNED_JWT: "false"
    },
    () => {
      const token = issueAccessToken({ userId: "u_auth_jwt", tenantId: "t_auth_jwt", expiresInSeconds: 600 });
      const auth = ensureAuthorization(`Bearer ${token}`, "req_auth_jwt");
      assert.equal(auth.userId, "u_auth_jwt");
      assert.equal(auth.tenantId, "t_auth_jwt");
    }
  );
});
