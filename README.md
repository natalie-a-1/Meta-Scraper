# <img src="./images/icon.png" alt="Meta-Scraper Logo" width="30" /> Meta-Scraper: Image Metadata Cleaner

[![Version](https://img.shields.io/visual-studio-marketplace/v/NatalieHill.metascraper)](https://marketplace.visualstudio.com/items?itemName=NatalieHill.metascraper)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

Meta-Scraper is a Visual Studio Code extension for inspecting and removing image metadata, helping you avoid leaking sensitive information when sharing images. It currently has **250+ installs** on the Visual Studio Code Marketplace.

## Demo

![Demo](images/output.gif)

## Features

- Strip metadata from **all media in a folder** in one action (Command Palette → _MetaScraper: Strip Metadata from All Media in Folder_, or right-click a folder)
- Strip or view metadata of a **single file** by right-clicking it
- **Automatically detect newly added media** and strip it (or ask first) — aimed at repos that get pushed online
- Supports images (`.jpg`, `.jpeg`, `.png`, `.gif`, `.tif`, `.tiff`, `.webp`, `.heic`, `.heif`, `.bmp`) and video (`.mp4`, `.mov`, `.m4v`)
- Fast processing with real-time feedback
- All processing is done locally; no data leaves your machine

<div align="center">
  <p><b>Right-click a file or folder in VS Code to access MetaScraper actions, or run the folder command from the Command Palette.</b></p>
</div>

## Commands & automatic protection

- **Strip Metadata from All Media in Folder** — batch-strips every supported media file in the folder/workspace, with a progress bar. The first time you run it, MetaScraper offers to watch for newly added media so nothing leaks on a later push.
- **Strip Media Metadata** / **View Media Metadata** — single-file actions in the right-click menu.

Automatic detection only arms in workspaces whose Git repository has a **remote** (i.e. repos that can be made public online). Manual commands always work anywhere.

## Settings

| Setting | Description |
|---------|-------------|
| `metascraper.autoDetectNewMedia` | Automatically detect newly added media in the folder. |
| `metascraper.onNewMedia` | What to do when new media is added: **Automatically strip metadata**, **Ask for permission**, or **Do nothing**. |

## Why Cleaning Image Metadata Matters

Modern image files can contain hidden metadata that exposes personal or sensitive details:

| Metadata Type      | Privacy Risk                                               |
|--------------------|------------------------------------------------------------|
| GPS location       | Reveals the exact place where the photo was taken         |
| Device information | Exposes camera/phone model and unique identifiers         |
| Creation time      | Shows precisely when the photo was taken                  |
| Software details   | Reveals which tools were used to edit the image           |
| Author information | Can include your name, email, or other personal details   |

Examples of potential issues:

- Revealing your home or workplace location
- Leaking details in screenshots or documents shared publicly
