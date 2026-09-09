import { App, applyHostStyleVariables } from "@modelcontextprotocol/ext-apps";
import { groupedFields, readableName, summaryRows } from "./presentation.mjs";

const $ = (id) => document.getElementById(id);
const embedded = window.parent !== window;
const app = embedded
  ? new App({ name: "Meta-Scraper", version: "0.1.0" })
  : null;
let current = null,
  originalId = null,
  downloadUrl = null,
  previewUrl = null;
let busy = true,
  connected = !embedded,
  expandedHost = false;
const selected = new Set();
const paths = {
  photo:
    '<rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m3 17 5-5 4 4 3-3 6 6"/>',
  pin: '<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  camera: '<path d="M8 5h8l2 3h3v12H3V8h3Z"/><circle cx="12" cy="13" r="3"/>',
  text: '<path d="M5 5h14M5 10h14M5 15h9M5 20h6"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5Zm-9 10 9 5 9-5M3 18l9 5 9-5"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  more: '<circle cx="5" cy="12" r=".8"/><circle cx="12" cy="12" r=".8"/><circle cx="19" cy="12" r=".8"/>',
};
function icon(name) {
  const span = document.createElement("span");
  // Only static, locally authored icon markup goes through innerHTML.
  span.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.photo}</svg>`;
  return span.firstElementChild;
}
for (const el of document.querySelectorAll("[data-icon]"))
  el.append(icon(el.dataset.icon));
function status(message = "") {
  $("status").textContent = message;
}
function error(message = "") {
  for (const id of ["error", "inspector-error"]) {
    $(id).textContent = message;
    $(id).hidden = !message;
  }
}
function persistSelection() {
  window.openai?.setWidgetState?.({
    privateContent: { photoId: current?.photoId, selected: [...selected] },
  });
}
function updateButtons() {
  $("panel").setAttribute("aria-busy", String(busy));
  for (const button of document.querySelectorAll("button"))
    button.disabled = busy;
  $("close-inspector").disabled = false;
  $("photo-file").disabled = busy || !connected;
  $("choose").disabled = busy || !connected;
  for (const box of document.querySelectorAll("input[type=checkbox]"))
    box.disabled = busy;
  $("remove-all").disabled = busy || !current?.fields.length;
  $("remove-selected").disabled = busy || !selected.size;
  $("selection-count").textContent =
    `${selected.size} ${selected.size === 1 ? "detail" : "details"} selected`;
}
async function action(message, callback) {
  if (busy) return;
  busy = true;
  error();
  status(message);
  updateButtons();
  try {
    await callback();
    status();
  } catch (cause) {
    error(cause.message || "Something went wrong. Try again.");
    status();
  } finally {
    busy = false;
    updateButtons();
  }
}
async function call(name, args) {
  const result = app
    ? await app.callServerTool({ name, arguments: args })
    : await (
        await fetch(`/api/tools/${name}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(args),
        })
      ).json();
  if (result.isError || !result.structuredContent)
    throw new Error(
      result.content?.find((item) => item.type === "text")?.text ||
        result.error ||
        "Could not complete the request.",
    );
  return result.structuredContent;
}
function syncSelection() {
  for (const el of document.querySelectorAll("input[data-field]"))
    el.checked = selected.has(el.dataset.field);
  for (const el of document.querySelectorAll("input[data-category]")) {
    const group = groupedFields(current.fields).find(
      ({ id }) => id === el.dataset.category,
    );
    const count = group.fields.filter(({ id }) => selected.has(id)).length;
    el.checked = count === group.fields.length;
    el.indeterminate = count > 0 && count < group.fields.length;
  }
  updateButtons();
  persistSelection();
}
function drawInspector() {
  const empty = !current.fields.length;
  $("inspector-title").textContent = empty
    ? "Photo details"
    : "Choose what to remove";
  $("inspector-description").textContent = empty
    ? "Only properties needed to display this photo remain."
    : "Checked details will be removed from a new copy.";
  $("inspector-actions").hidden = empty;
  $("technical").open = empty;
  $("groups").replaceChildren();
  for (const group of groupedFields(current.fields)) {
    const section = document.createElement("section");
    section.className = "category";
    const label = document.createElement("label");
    label.className = "category-header";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.dataset.category = group.id;
    checkbox.setAttribute("aria-label", `Remove ${group.title.toLowerCase()}`);
    checkbox.onchange = () => {
      for (const field of group.fields)
        checkbox.checked ? selected.add(field.id) : selected.delete(field.id);
      syncSelection();
    };
    const copy = document.createElement("span");
    copy.className = "category-copy";
    const title = document.createElement("strong");
    title.textContent = group.title;
    const description = document.createElement("p");
    description.className = "caption";
    description.textContent = group.description;
    copy.append(title, description);
    label.append(checkbox, copy);
    const details = document.createElement("details");
    const summary = document.createElement("summary");
    summary.textContent = `View ${group.fields.length} ${group.fields.length === 1 ? "detail" : "details"}`;
    details.append(summary);
    for (const field of group.fields) {
      const row = document.createElement("label");
      row.className = "field";
      const box = document.createElement("input");
      box.type = "checkbox";
      box.dataset.field = field.id;
      box.setAttribute(
        "aria-label",
        `Remove ${readableName(field)} (${field.group})`,
      );
      box.onchange = () => {
        box.checked ? selected.add(field.id) : selected.delete(field.id);
        syncSelection();
      };
      const name = document.createElement("span");
      name.className = "field-name";
      name.textContent = readableName(field);
      const value = document.createElement("span");
      value.className = "field-value";
      value.textContent = field.value;
      const id = document.createElement("span");
      id.className = "field-id";
      id.textContent = field.id;
      name.append(value, id);
      row.append(box, name);
      details.append(row);
    }
    section.append(label, details);
    $("groups").append(section);
  }
  $("properties").replaceChildren();
  for (const property of current.properties) {
    const dt = document.createElement("dt");
    dt.textContent = readableName(property);
    const dd = document.createElement("dd");
    dd.textContent = property.value;
    $("properties").append(dt, dd);
  }
  syncSelection();
}
function render(result) {
  if (!result?.photo) return;
  const changed = current?.photoId !== result.photo.photoId;
  current = result.photo;
  downloadUrl = result.downloadUrl;
  if (!current.cleaning) originalId = current.photoId;
  if (changed) {
    selected.clear();
    const saved = window.openai?.widgetState?.privateContent;
    const valid = new Set(current.fields.map(({ id }) => id));
    for (const id of saved?.photoId === current.photoId &&
    Array.isArray(saved.selected)
      ? saved.selected
      : [])
      if (valid.has(id)) selected.add(id);
  }
  $("upload-section").hidden = true;
  $("photo-section").hidden = false;
  $("file-name").textContent = current.fileName;
  $("file-summary").textContent =
    `${current.format} · ${current.byteSize >= 1024 * 1024 ? `${(current.byteSize / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(current.byteSize / 1024))} KB`}`;
  const clean = Boolean(current.cleaning),
    empty = !current.fields.length;
  $("headline").textContent = clean
    ? empty
      ? "Hidden details removed"
      : "Selected details removed"
    : empty
      ? "No hidden details found"
      : "Details included with this photo";
  $("description").textContent = clean
    ? "A new copy, checked and ready to save."
    : empty
      ? "No removable metadata was detected in this file."
      : "These details are saved inside the file.";
  $("result-icon").hidden = !clean && !empty;
  $("overview").replaceChildren();
  for (const row of summaryRows(current.fields)) {
    const div = document.createElement("div");
    div.className = "overview-row";
    const dt = document.createElement("dt");
    dt.append(icon(row.icon), document.createTextNode(row.title));
    const dd = document.createElement("dd");
    dd.textContent = row.value;
    div.append(dt, dd);
    $("overview").append(div);
  }
  $("overview").hidden = empty;
  $("remove-all").hidden = clean || empty;
  $("download").hidden = !clean;
  $("customize").textContent = empty
    ? "View details"
    : clean
      ? "Review remaining details"
      : "Choose what to remove";
  $("original").hidden = !originalId || originalId === current.photoId;
  $("removal-note").textContent = clean
    ? "Your original is unchanged. This copy expires after 30 minutes."
    : empty
      ? "The picture itself may still contain personal information."
      : "Creates a separate copy. Rotation or colors may change.";
  $("warnings").hidden = !current.cleaning?.warnings.length;
  $("warnings").textContent = current.cleaning?.warnings.join(" ") || "";
  drawInspector();
  updateButtons();
}
function clearPreview() {
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = null;
  $("preview").hidden = true;
  $("preview").removeAttribute("src");
}
function reset() {
  current = null;
  originalId = null;
  downloadUrl = null;
  selected.clear();
  clearPreview();
  $("photo-file").value = "";
  $("photo-section").hidden = true;
  $("upload-section").hidden = false;
  $("photo-menu").open = false;
  persistSelection();
  $("choose").focus();
}
async function sharePhotoContext(result) {
  if (app)
    await app
      .updateModelContext({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              photoId: result.photo.photoId,
              fileName: result.photo.fileName,
              metadataFields: result.photo.fields.length,
              cleaning: result.photo.cleaning,
              downloadUrl: result.downloadUrl,
            }),
          },
        ],
      })
      .catch(() => {});
}
async function clean(selection) {
  const result = await call("remove_metadata", {
    photoId: current.photoId,
    selection,
  });
  await closeInspector();
  render(result);
  await sharePhotoContext(result);
  $("download").focus();
}
async function closeInspector() {
  $("inspector").close();
  document.body.classList.remove("inspecting");
  if (expandedHost) {
    expandedHost = false;
    await app.requestDisplayMode({ mode: "inline" }).catch(() => {});
  }
}
$("customize").onclick = async () => {
  if (app?.getHostContext()?.availableDisplayModes?.includes("fullscreen")) {
    try {
      expandedHost =
        (await app.requestDisplayMode({ mode: "fullscreen" })).mode ===
        "fullscreen";
    } catch {
      /* Use the bounded dialog when the host cannot expand. */
    }
  }
  document.body.classList.add("inspecting");
  drawInspector();
  $("inspector").showModal();
};
$("close-inspector").onclick = closeInspector;
$("inspector").addEventListener("cancel", (event) => {
  event.preventDefault();
  void closeInspector();
});
$("choose").onclick = () => $("photo-file").click();
$("photo-file").onchange = () =>
  action("Reading your photo…", async () => {
    const file = $("photo-file").files?.[0];
    if (!file) return;
    if (!file.size || file.size > 20 * 1024 * 1024)
      throw new Error("Choose a photo smaller than 20 MB.");
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Could not read this photo."));
      reader.onload = () => resolve(String(reader.result).split(",")[1]);
      reader.readAsDataURL(file);
    });
    const result = await call("upload_photo", { fileName: file.name, base64 });
    clearPreview();
    previewUrl = URL.createObjectURL(file);
    $("preview").onload = () => {
      $("preview").hidden = false;
    };
    $("preview").onerror = () => {
      $("preview").hidden = true;
    };
    $("preview").src = previewUrl;
    render(result);
    await sharePhotoContext(result);
    $("photo-file").value = "";
  });
function updateFileLibrary() {
  $("library").hidden = !(
    embedded &&
    window.openai?.selectFiles &&
    window.openai?.getFileDownloadUrl
  );
}
window.addEventListener("openai:set_globals", updateFileLibrary);
updateFileLibrary();
$("library").onclick = () =>
  action("Choosing a photo…", async () => {
    const files = await window.openai.selectFiles();
    if (!files?.length) return;
    if (files.length > 1) throw new Error("Choose one photo at a time.");
    const file = files[0];
    const { downloadUrl } = await window.openai.getFileDownloadUrl({
      fileId: file.fileId,
    });
    const result = await call("import_photo", {
      file: {
        file_id: file.fileId,
        download_url: downloadUrl,
        file_name: file.fileName,
        mime_type: file.mimeType,
      },
    });
    clearPreview();
    render(result);
    await sharePhotoContext(result);
  });
$("remove-all").onclick = () =>
  action("Removing hidden details…", () => clean("all"));
$("remove-selected").onclick = () =>
  action("Removing selected details…", () => clean([...selected]));
$("original").onclick = () =>
  action("Reading original…", async () => {
    $("photo-menu").open = false;
    render(await call("view_metadata", { photoId: originalId }));
  });
$("another").onclick = () => {
  reset();
  error();
  status();
};
$("delete").onclick = () =>
  action("Deleting stored copy…", async () => {
    await call("delete_photo", { photoId: current.photoId });
    reset();
  });
$("download").onclick = () =>
  action("Opening download…", async () => {
    if (app) {
      const result = await app.openLink({ url: downloadUrl });
      if (result.isError)
        throw new Error(
          "Could not open the download. Ask your assistant for the download link.",
        );
    } else {
      const anchor = document.createElement("a");
      anchor.href = downloadUrl;
      anchor.download = current.fileName;
      anchor.rel = "noreferrer";
      anchor.click();
    }
  });
if (app) {
  app.ontoolresult = (result) => {
    if (result.isError)
      error(result.content?.find((item) => item.type === "text")?.text);
    else {
      clearPreview();
      render(result.structuredContent);
    }
  };
  const applyContext = (context) => {
    if (context?.theme) document.documentElement.dataset.theme = context.theme;
    if (context?.styles?.variables)
      applyHostStyleVariables(context.styles.variables);
  };
  app.onhostcontextchanged = applyContext;
  app
    .connect()
    .then(() => {
      connected = true;
      busy = false;
      status();
      applyContext(app.getHostContext());
      updateFileLibrary();
      updateButtons();
    })
    .catch(() => {
      error("Could not connect. Reopen this photo panel and try again.");
      busy = false;
      updateButtons();
    });
} else {
  busy = false;
  status();
  updateButtons();
}
