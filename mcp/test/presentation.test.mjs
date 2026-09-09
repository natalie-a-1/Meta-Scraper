import { test } from "node:test";
import assert from "node:assert/strict";
import {
  groupedFields,
  summaryRows,
  categoryOf,
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
  assert.equal(
    rows.find(({ id }) => id === "location").value,
    "Saved in this photo",
  );
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
