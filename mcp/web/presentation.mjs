// Presentation only: exact server field IDs remain the source of truth for removal.
export const categories = [
  {
    id: "location",
    title: "Location",
    description: "Where the photo was taken",
    icon: "pin",
  },
  {
    id: "date",
    title: "Dates & times",
    description: "When it was taken or edited",
    icon: "clock",
  },
  {
    id: "device",
    title: "Camera & device",
    description: "Camera, lens and device information",
    icon: "camera",
  },
  {
    id: "author",
    title: "Names & notes",
    description: "Names, captions and descriptions",
    icon: "text",
  },
  {
    id: "other",
    title: "Other hidden details",
    description: "Editing history, previews and other embedded data",
    icon: "layers",
  },
];
export function categoryOf(field) {
  const key = `${field.group}:${field.name}`;
  if (["Software", "CreatorTool"].includes(field.name)) return "other";
  if (
    field.group === "GPS" ||
    /GPS|Location|Latitude|Longitude|Altitude|Sublocation/i.test(key) ||
    /^(City|Country|CountryCode|Province|ProvinceState|State)$/.test(field.name)
  )
    return "location";
  if (/Date|Time|OffsetTime/i.test(field.name)) return "date";
  if (
    /Make$|Model|Lens|Serial|Camera|Device|Exposure|Shutter|Aperture|FNumber|ISO$|Flash|Focal|Metering|WhiteBalance|Brightness|Scene|Sensing/i.test(
      field.name,
    )
  )
    return "device";
  if (
    /Artist|Author|Creator|Owner|Copyright|Rights|Title|Description|Comment|Subject|Keywords|Person/i.test(
      field.name,
    )
  )
    return "author";
  return "other";
}
export function groupedFields(fields) {
  return categories
    .map((category) => ({
      ...category,
      fields: fields.filter((field) => categoryOf(field) === category.id),
    }))
    .filter(({ fields }) => fields.length);
}
export function readableName(field) {
  const known = {
    GPSLatitude: "Latitude",
    GPSLongitude: "Longitude",
    DateTimeOriginal: "Date taken",
    CreateDate: "Date created",
    ModifyDate: "Date edited",
    Make: "Camera maker",
    Model: "Camera model",
    Artist: "Author",
    Software: "Editing software",
    SerialNumber: "Device serial number",
  };
  return (
    known[field.name] ||
    field.name
      .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
  );
}
function first(fields, names) {
  for (const name of names) {
    const value = fields.find((field) => field.name === name)?.value;
    if (value && value.trim() && value.length < 160) return value.trim();
  }
}
function dateLabel(value, locale) {
  const match = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(
    value || "",
  );
  if (!match) return null;
  const [, y, m, d, h, minute, second] = match.map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, h, minute, second));
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== m - 1 ||
    date.getUTCDate() !== d ||
    h > 23 ||
    minute > 59 ||
    second > 59
  )
    return null;
  // Format the recorded clock time without inventing a timezone conversion.
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}
export function summaryRows(fields, locale = "en-US") {
  return groupedFields(fields).map((group) => {
    const taken = first(group.fields, ["DateTimeOriginal"]);
    let value;
    if (group.id === "location")
      value =
        fields.some(({ name }) => name === "GPSLatitude") &&
        fields.some(({ name }) => name === "GPSLongitude")
          ? "GPS coordinates included"
          : first(group.fields, ["City", "Country", "Location"]) ||
            "Location details included";
    if (group.id === "date")
      value =
        dateLabel(
          taken || first(group.fields, ["CreateDate", "ModifyDate"]),
          locale,
        ) || "Dates or times included";
    if (group.id === "device")
      value =
        first(group.fields, [
          "Model",
          "CameraModelName",
          "LensModel",
          "Make",
        ]) ||
        (group.fields.some(({ name }) => /SerialNumber|DeviceID/.test(name))
          ? "Device identifier included"
          : "Camera settings included");
    if (group.id === "author")
      value =
        first(group.fields, [
          "Artist",
          "Author",
          "OwnerName",
          "Copyright",
          "Title",
        ]) || "Names or notes included";
    if (group.id === "other")
      value =
        first(group.fields, ["Software", "CreatorTool"]) ||
        `${group.fields.length} embedded ${group.fields.length === 1 ? "detail" : "details"}`;
    return {
      ...group,
      title: group.id === "date" && taken ? "Date taken" : group.title,
      value,
    };
  });
}
export function photoInsight(fields) {
  const has = (name) => fields.some((field) => field.name === name);
  if (has("GPSLatitude") && has("GPSLongitude"))
    return "Saved coordinates can reveal where this photo was taken.";
  if (fields.some(({ name }) => /SerialNumber|DeviceID/.test(name)))
    return "A saved identifier may link this photo to a specific device.";
  if (has("DateTimeOriginal"))
    return "The file remembers when the shutter was pressed.";
  if (has("Artist") || has("OwnerName") || has("Author"))
    return "A name travels with this photo, even when it isn’t visible.";
  if (has("Software") || has("CreatorTool"))
    return "Your editing software left a signature in this file.";
  return "These details travel with the file when you share it.";
}
