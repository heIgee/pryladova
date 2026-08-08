import { createHmac, timingSafeEqual } from "node:crypto";

const bearerPrefix = "Bearer ";

const secretsEqual = (provided: string, expected: string): boolean => {
  const digest = (value: string) => createHmac("sha256", expected).update(value).digest();
  return timingSafeEqual(digest(provided), digest(expected));
};

const readBearerToken = (authorization: string | undefined): string | undefined => {
  if (!authorization?.startsWith(bearerPrefix)) {
    return undefined;
  }
  const token = authorization.slice(bearerPrefix.length).trim();
  return token.length > 0 ? token : undefined;
};

export const isIngestAuthorized = (
  authorization: string | undefined,
  ingestSecret: string | undefined,
): boolean => {
  if (!ingestSecret) {
    return true;
  }

  const token = readBearerToken(authorization);
  return token !== undefined && secretsEqual(token, ingestSecret);
};
