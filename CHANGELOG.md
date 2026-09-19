# Change Log

All notable changes to the "metascraper" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [0.1.0]

- Add **Strip Metadata from All Media in Folder** command (Command Palette and folder right-click) for batch stripping the whole workspace/folder.
- Add **automatic detection of newly added media**, gated to Git repositories with a remote; configurable via `metascraper.autoDetectNewMedia` and `metascraper.onNewMedia` (strip / ask / do nothing).
- First-run prompt to opt into automatic detection and choose its behavior.
- Extend supported media to GIFs, additional image formats (`.tif`, `.heic`, `.heif`, `.bmp`) and video (`.mp4`, `.mov`, `.m4v`).

## [0.0.2]

- Initial release