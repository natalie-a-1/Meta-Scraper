export const expiredMessage =
  "This photo’s temporary copy has expired. Add the original photo again to continue.";

export function photoExpired(photo, now = Date.now()) {
  const expiry = Date.parse(photo?.expiresAt);
  return Number.isFinite(expiry) && expiry <= now;
}

export function photoError(cause) {
  const message = typeof cause === "string" ? cause : cause?.message || "";
  if (/photo has expired|photo.*unavailable/i.test(message))
    return { expired: true, message: expiredMessage };
  if (/MCP error|RuntimeException|INVALID_ARGUMENT|fetch failed|failed to fetch/i.test(message))
    return {
      expired: false,
      message: "Could not complete that request. Try again, or add the photo again if its temporary copy is no longer available.",
    };
  return { expired: false, message: message || "Something went wrong. Try again." };
}
