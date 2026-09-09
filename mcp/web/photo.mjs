import { App, applyHostStyleVariables } from "@modelcontextprotocol/ext-apps";

const $ = (id) => document.getElementById(id);
const embedded = window.parent !== window;
const app = embedded
  ? new App({ name: "Meta-Scraper", version: "0.1.0" })
  : null;
let current = null;
let originalId = null;
let downloadUrl = null;
let busy = true;
let connected = !embedded;
const selected = new Set();

// Optional ChatGPT extensions supplement the portable MCP Apps bridge.
function updateFileLibrary() {
  $("library").hidden = !(
    embedded && window.openai?.selectFiles && window.openai?.getFileDownloadUrl
  );
}
window.addEventListener("openai:set_globals", updateFileLibrary);
updateFileLibrary();
$("library").addEventListener("click", () =>
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
    render(result);
    await sharePhotoContext(result);
  }),
);

function status(message = "") {
  $("status").textContent = message;
}
function error(message = "") {
  $("error").textContent = message;
  $("error").hidden = !message;
}
function updateButtons() {
  $("panel").setAttribute("aria-busy", String(busy));
  for (const button of document.querySelectorAll("button"))
    button.disabled = busy;
  $("photo-file").disabled = busy || !connected;
  $("search").disabled = busy;
  for (const box of document.querySelectorAll("input[type=checkbox]"))
    box.disabled = busy;
  $("remove-all").disabled = busy || !current?.fields.length;
  $("remove-selected").disabled = busy || !selected.size;
  $("remove-selected").textContent = selected.size
    ? `Remove selected (${selected.size})`
    : "Remove selected";
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
    error(cause.message || "Something went wrong. Please try again.");
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
  if (result.isError || !result.structuredContent) {
    throw new Error(
      result.content?.find((item) => item.type === "text")?.text ||
        result.error ||
        "Could not complete the request.",
    );
  }
  return result.structuredContent;
}
function drawFields() {
  const query = $("search").value.toLowerCase();
  const visible = current.fields.filter((field) =>
    `${field.group} ${field.name} ${field.value}`.toLowerCase().includes(query),
  );
  $("fields").replaceChildren();
  for (const field of visible) {
    const row = document.createElement("label");
    row.className = "field";
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = selected.has(field.id);
    box.disabled = busy;
    box.setAttribute("aria-label", `Remove ${field.group}: ${field.name}`);
    box.addEventListener("change", () => {
      box.checked ? selected.add(field.id) : selected.delete(field.id);
      syncSelection();
      updateButtons();
    });
    const label = document.createElement("span");
    label.className = "field-name";
    label.textContent = field.name
      .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
      .replace(/([a-z])([A-Z])/g, "$1 $2");
    const group = document.createElement("span");
    group.className = "field-group";
    group.textContent = field.group;
    label.append(group);
    const value = document.createElement("span");
    value.className = "field-value";
    value.textContent = field.value;
    row.append(box, label, value);
    $("fields").append(row);
  }
  syncSelection();
  $("empty-fields").hidden = visible.length > 0;
  $("empty-fields").textContent = current.fields.length
    ? "No matching fields."
    : "No removable metadata found. Required image properties are listed below.";
  $("field-controls").hidden = !current.fields.length;
  $("fields").hidden = !visible.length;
}
function syncSelection() {
  const query = $("search").value.toLowerCase();
  const visible = current.fields.filter((field) =>
    `${field.group} ${field.name} ${field.value}`.toLowerCase().includes(query),
  );
  const checked = visible.filter((field) => selected.has(field.id)).length;
  $("select-all").checked = visible.length > 0 && checked === visible.length;
  $("select-all").indeterminate = checked > 0 && checked < visible.length;
}
function render(result) {
  if (!result?.photo) return;
  current = result.photo;
  downloadUrl = result.downloadUrl;
  if (!current.cleaning) originalId = current.photoId;
  selected.clear();
  $("search").value = "";
  $("upload-section").hidden = true;
  $("photo-section").hidden = false;
  $("file-name").textContent = current.fileName;
  $("file-summary").textContent =
    `${current.format} · ${(current.byteSize / 1024).toFixed(1)} KB · Expires ${new Date(current.expiresAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  $("field-count").textContent = current.fields.length;
  $("clean-result").hidden = !current.cleaning;
  $("clean-result").textContent = current.cleaning
    ? `${current.cleaning.removed.length} ${current.cleaning.removed.length === 1 ? "field" : "fields"} removed. ${current.cleaning.remainingCount} remain. Removal verified by reading the cleaned copy.`
    : "";
  $("warnings").hidden = !current.cleaning?.warnings.length;
  $("warnings").textContent = current.cleaning?.warnings.join("\n") || "";
  $("original").hidden = !originalId || originalId === current.photoId;
  $("download").hidden = !current.cleaning;
  $("properties").replaceChildren();
  for (const property of current.properties) {
    const term = document.createElement("dt");
    term.textContent = property.name;
    const value = document.createElement("dd");
    value.textContent = property.value;
    $("properties").append(term, value);
  }
  drawFields();
  updateButtons();
}
function reset() {
  current = null;
  originalId = null;
  downloadUrl = null;
  selected.clear();
  $("photo-file").value = "";
  $("photo-section").hidden = true;
  $("upload-section").hidden = false;
}
async function sharePhotoContext(result) {
  // Only a handle and summary are shared automatically; raw photo bytes are
  // uploaded in a component-initiated tools/call and are never put in context.
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
$("photo-file").addEventListener("change", () =>
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
    render(result);
    await sharePhotoContext(result);
  }),
);
$("search").addEventListener("input", drawFields);
$("select-all").addEventListener("change", () => {
  const query = $("search").value.toLowerCase();
  for (const field of current.fields.filter((field) =>
    `${field.group} ${field.name} ${field.value}`.toLowerCase().includes(query),
  )) {
    $("select-all").checked
      ? selected.add(field.id)
      : selected.delete(field.id);
  }
  drawFields();
  updateButtons();
});
async function clean(selection) {
  const result = await call("remove_metadata", {
    photoId: current.photoId,
    selection,
  });
  render(result);
  await sharePhotoContext(result);
}
$("remove-all").addEventListener("click", () =>
  action("Creating a clean copy…", () => clean("all")),
);
$("remove-selected").addEventListener("click", () =>
  action("Removing selected fields…", () => clean([...selected])),
);
$("original").addEventListener("click", () =>
  action("Reading original…", async () =>
    render(await call("view_metadata", { photoId: originalId })),
  ),
);
$("another").addEventListener("click", () => {
  reset();
  error();
  status();
});
$("delete").addEventListener("click", () =>
  action("Deleting stored photo…", async () => {
    await call("delete_photo", { photoId: current.photoId });
    reset();
  }),
);
$("download").addEventListener("click", () =>
  action("Opening download…", async () => {
    if (app) {
      const result = await app.openLink({ url: downloadUrl });
      if (result.isError)
        throw new Error(
          "The host could not open the download. Ask your assistant for the download link.",
        );
    } else {
      const anchor = document.createElement("a");
      anchor.href = downloadUrl;
      anchor.download = current.fileName;
      anchor.rel = "noreferrer";
      anchor.click();
    }
  }),
);
if (app) {
  app.ontoolresult = (result) => {
    if (result.isError)
      error(result.content?.find((item) => item.type === "text")?.text);
    else render(result.structuredContent);
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
      error(
        "Could not connect to the photo panel. Reopen Meta-Scraper or use the upload link from your assistant.",
      );
      busy = false;
      updateButtons();
    });
} else {
  busy = false;
  status();
  updateButtons();
}
