export function parseForwardedIp(forwardedFor: string | undefined): string | undefined {
  if (!forwardedFor) {
    return undefined;
  }

  const first = forwardedFor.split(",")[0]?.trim();
  return first && first.length > 0 ? first : undefined;
}
