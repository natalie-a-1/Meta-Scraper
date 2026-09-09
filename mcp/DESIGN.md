# Photo details: a quiet part of the conversation

The main task is deciding what accompanies a photo when it is shared. The previous card exposed the implementation: a second app header, 126 raw fields in a scrolling box, technical property lists, search, selection, deletion, and several competing actions. These made a simple privacy task feel like a metadata editor.

## Decisions grounded in the references

| Guidance | Applied design |
| --- | --- |
| [OpenAI UI guidelines](https://developers.openai.com/plugins/concepts/ui-guidelines): one primary action and at most one secondary action; avoid nested scrolling and duplicate branding. | The inline result has a photo identity, up to five plain-language summary rows, **Remove hidden details**, and **Choose what to remove**. There is no app logo/title, search box, or scrolling table. |
| OpenAI: system colors, fonts, consistent spacing, minimal decoration. | Host tokens, system typography, monochrome outlined icons, 44px controls, a quiet border, and no custom background patterns. |
| [Apple, Meet Liquid Glass](https://developer.apple.com/videos/play/wwdc2025/219/): content leads; glass is a selective control layer that preserves legibility. | Rounded secondary controls use a restrained translucent surface and fine edge. Content remains on a solid, readable surface. This is a web interpretation of the principles, not Apple's native material renderer. Blur cannot sample the surrounding ChatGPT interface across the iframe boundary. |
| [OpenAI UI reference](https://developers.openai.com/plugins/reference): standard MCP bridge first; feature-detect optional extensions. | Tool results remain authoritative. The inspector requests fullscreen when offered; a keyboard-contained dialog is the fallback. ChatGPT file-library selection and widget selection persistence remain optional. |

## Flow

1. **Add a photo.** A compact prompt opens the original-file chooser. When available, ChatGPT's authorized file library is another source. Local thumbnails identify the selected file; unsupported browser image codecs use the file icon.
2. **Understand what is included.** Location, dates and times, camera/device, names/notes, and other details summarize actual fields. Absent categories are omitted. The UI neither guesses values from the picture nor claims that an image is safe to share.
3. **Remove all or choose.** One action removes all removable metadata from a separate copy. The optional inspector offers whole-category selection and individual-field disclosure. Exact IDs and values remain available there; no raw values are interpreted as markup. The inline card never contains a scrolling metadata list.
4. **Save the result.** The primary action becomes Save cleaned photo. Partial removal shows the remaining categories. Verification failures retain an error and never expose a falsely clean download. Rotation/color warnings are shown when applicable.

Change-photo, view-original, and delete-copy controls live in Photo options. Storage information is a short disclosure. The original remains unchanged, expiration is still stated, and removal of embedded details is not represented as removal of visible information.

## Accessibility and limits

The design includes native checkboxes and dialog focus containment, keyboard focus indicators, system themes, text wrapping, reduced-motion and reduced-transparency treatments, and a solid high-contrast fallback. Inspectors scroll on their own detail surface; the inline card fits its contents. Category selections survive opening/closing the inspector and can persist through ChatGPT widget state without storing photo bytes.

Browser checks cover the real local MCP bridge, category selection, cleanup, and a 390px dark layout. Authenticated ChatGPT file selection, actual host fullscreen behavior, and platform assistive-technology testing still require host acceptance. The preview host labels itself as local and keeps connection diagnostics collapsed.
