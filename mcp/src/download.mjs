import https from "node:https";
import { lookup } from "node:dns/promises";
import { BlockList, isIPv4 } from "node:net";
import { MAX_BYTES } from "./store.mjs";
import { UserError } from "./errors.mjs";

const blocked = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
]) {
  blocked.addSubnet(network, prefix);
}

export function validateUploadUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new UserError(
      "The attachment link is invalid. Upload the photo in the panel.",
    );
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    !(
      url.hostname === "oaiusercontent.com" ||
      url.hostname.endsWith(".oaiusercontent.com")
    )
  ) {
    throw new UserError(
      "Only ChatGPT attachment links are accepted. In other clients, upload the original photo in the Meta-Scraper panel.",
    );
  }
  return url;
}

export function isPublicIPv4(address) {
  return (
    isIPv4(address) && !blocked.check(address, "ipv4")
  );
}

export async function downloadAttachment(value) {
  const url = validateUploadUrl(value);
  // Pin a validated IPv4 address for this request; HTTPS still validates the
  // original hostname. No redirects or arbitrary hosts, even through DNS rebinding.
  const addresses = await lookup(url.hostname, { family: 4, all: true });
  if (
    !addresses.length ||
    addresses.some(({ address }) => !isPublicIPv4(address))
  ) {
    throw new UserError(
      "The attachment link is unavailable. Upload the photo in the panel.",
    );
  }
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      {
        signal: AbortSignal.timeout(30_000),
        lookup: (_hostname, options, callback) =>
          options.all
            ? callback(null, [addresses[0]])
            : callback(null, addresses[0].address, 4),
        headers: { Accept: "image/*", "Accept-Encoding": "identity" },
      },
      (response) => {
        if (
          response.statusCode !== 200 ||
          Number(response.headers["content-length"] || 0) > MAX_BYTES
        ) {
          reject(
            new UserError(
              "The attachment expired or exceeds 20 MB. Upload it again in the panel.",
            ),
          );
          response.destroy();
          return;
        }
        const chunks = [];
        let length = 0;
        response.on("data", (chunk) => {
          length += chunk.length;
          if (length > MAX_BYTES) {
            reject(new UserError("Choose a photo smaller than 20 MB."));
            request.destroy();
          } else chunks.push(chunk);
        });
        response.on("end", () => resolve(Buffer.concat(chunks)));
        response.on("error", reject);
      },
    );
    request.on("error", reject);
  });
}
