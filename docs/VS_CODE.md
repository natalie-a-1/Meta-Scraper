> This page describes the original VS Code extension. For the MCP app, see [Meta-Scraper](../README.md).

# <img src="../images/icon.png" alt="Meta-Scraper Logo" width="30" /> Meta-Scraper: Image Metadata Cleaner

[![Version](https://img.shields.io/visual-studio-marketplace/v/NatalieHill.metascraper)](https://marketplace.visualstudio.com/items?itemName=NatalieHill.metascraper)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](../LICENSE)

Meta-Scraper is a Visual Studio Code extension for inspecting and removing image metadata, helping you avoid leaking sensitive information when sharing images. It currently has **250+ installs** on the Visual Studio Code Marketplace.

## Demo

![Demo](../images/output.gif)

## Features

- View metadata embedded in an image
- Remove metadata in a single action
- Supports `.jpg`, `.jpeg`, `.png`, `.gif`, `.tiff`, `.webp`
- Fast processing with real-time feedback
- All processing is done locally; no data leaves your machine

<div align="center">
  <p><b>Right-click any image file in VS Code to access Meta-Scraper actions.</b></p>
</div>

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
