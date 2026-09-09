export class UserError extends Error {}

export function publicError(error) {
  return error instanceof UserError
    ? error.message
    : "The photo could not be processed. Try another original JPEG, PNG, WebP, GIF, TIFF, HEIC, or HEIF file.";
}
