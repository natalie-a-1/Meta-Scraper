import { test } from "node:test";
import assert from "node:assert/strict";
import {
  groupedFields,
  summaryRows,
  categoryOf,
  photoInsight,
} from "../web/presentation.mjs";

test("plain-language groups cover every exact field once, including GPS across formats", () => {
  const fields = [
    { id: "GPS:GPSLatitude", group: "GPS", name: "GPSLatitude", value: "40" },
    {
      id: "XMP-iptcCore:Location",
      group: "XMP-iptcCore",
      name: "Location",
      value: "Private",
    },
    {
      id: "ExifIFD:DateTimeOriginal",
      group: "ExifIFD",
      name: "DateTimeOriginal",
      value: "2026:01:01",
    },
    { id: "IFD0:Model", group: "IFD0", name: "Model", value: "Test camera" },
    { id: "IFD0:Artist", group: "IFD0", name: "Artist", value: "Test name" },
    { id: "Apple:Unknown", group: "Apple", name: "Unknown", value: "123" },
  ];
  const groups = groupedFields(fields);
  assert.deepEqual(
    groups.flatMap(({ fields }) => fields.map(({ id }) => id)),
    fields.map(({ id }) => id),
  );
  assert.equal(groups.find(({ id }) => id === "location").fields.length, 2);
  assert.equal(categoryOf(fields[5]), "other");
  const rows = summaryRows(fields);
  assert.equal(rows.find(({ id }) => id === "device").value, "Test camera");
  assert.equal(rows.find(({ id }) => id === "location").value, "Private");
  assert.equal(
    summaryRows(
      fields.filter(
        ({ group, name }) => group !== "GPS" && name !== "Location",
      ),
    ).some(({ id }) => id === "location"),
    false,
  );
  assert.deepEqual(summaryRows([]), []);
});

test("photo insights reveal only recorded facts and handle invalid dates", () => {
  const field = (name, value, group = "ExifIFD") => ({
    id: `${group}:${name}`,
    name,
    value,
    group,
  });
  const capture = [field("DateTimeOriginal", "2024:02:29 23:59:10")];
  assert.match(summaryRows(capture)[0].value, /Feb 29, 2024/);
  assert.match(photoInsight(capture), /shutter/);
  assert.equal(
    summaryRows([field("DateTimeOriginal", "2024:02:31 12:00:00")])[0].value,
    "Dates or times included",
  );
  assert.doesNotMatch(
    photoInsight([field("GPSLatitude", "40", "GPS")]),
    /coordinates/,
  );
  assert.match(
    photoInsight([
      field("GPSLatitude", "40", "GPS"),
      field("GPSLongitude", "-89", "GPS"),
    ]),
    /coordinates/,
  );
  assert.equal(
    summaryRows([field("Software", "Photo Editor")])[0].value,
    "Photo Editor",
  );
  assert.equal(summaryRows([field("Artist", "Alex")])[0].value, "Alex");
  assert.doesNotMatch(photoInsight([]), /location|device|name|shutter/);
});
