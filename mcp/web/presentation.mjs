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
export function summaryRows(fields) {
  return groupedFields(fields).map((group) => ({
    ...group,
    value:
      group.id === "location"
        ? "Saved in this photo"
        : group.id === "device"
          ? fields.find((field) => field.name === "Model")?.value ||
            "Saved in this photo"
          : group.id === "date"
            ? "Capture or edit times saved"
            : group.id === "author"
              ? "Names or notes saved"
              : `${group.fields.length} embedded ${group.fields.length === 1 ? "detail" : "details"}`,
  }));
}
