# <img src="./images/icon.png" alt="Meta-Scraper Logo" width="30"/> Meta-Scraper: Image Metadata Cleaner

[![Version](https://img.shields.io/badge/version-0.0.1-blue.svg)](https://marketplace.visualstudio.com/items?itemName=natalie-a-1.metascraper)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Downloads](https://img.shields.io/badge/downloads-0-orange.svg)](https://marketplace.visualstudio.com/items?itemName=natalie-a-1.metascraper)

A powerful Visual Studio Code extension that protects your privacy by viewing and removing metadata from image files. Keep your sensitive information secure when sharing images!

---

## 🎬 Demo Video

<div align="center">
  <p><i>A video demonstration will be available here.</i></p>
  <p>
    <img src="https://via.placeholder.com/640x360?text=Video+Demo+Coming+Soon" alt="Video Demo Placeholder" width="600"/>
  </p>
</div>

---

## ✨ Features

- **🔍 View Image Metadata** - Inspect all metadata embedded in your images
- **🧹 Clean Image Metadata** - One-click removal of all sensitive information
- **🖼️ Format Support** - Works with `.jpg`, `.jpeg`, `.png`, `.gif`, `.tiff`, `.webp`
- **🚀 Fast Processing** - Efficient cleaning with real-time progress indicators
- **🔒 Local Processing** - All operations happen locally, no data is sent to external servers

<div align="center">
  <p><b>Right-click on any image file to access Meta-Scraper functions</b></p>
  <img src="https://via.placeholder.com/400x250?text=Right-Click+Menu+Screenshot" alt="Right-click Menu" width="400"/>
</div>

## 🛡️ Why Cleaning Image Metadata Is Critical

Modern digital images contain a surprising amount of hidden metadata that could compromise your privacy:

| Metadata Type | Privacy Risk |
|---------------|--------------|
| **GPS Location** | Reveals exact coordinates where the photo was taken |
| **Device Information** | Exposes your camera/phone model and unique identifiers |
| **Creation Time** | Shows precisely when the photo was taken |
| **Software Details** | Reveals what apps you use to edit photos |
| **Author Info** | Can include your name, email, or other personal details |

**Real-world consequences of uncleaned metadata:**
- 🌎 Accidentally revealing your home location
- 🔍 Leaking information during sensitive document sharing
- 🔐 Exposing organizational details in professional contexts
- ⏱️ Revealing timeline information that should remain private

Meta-Scraper protects you by completely removing this hidden data while preserving image quality.

---

## 📋 Usage

### Viewing Metadata

<div style="display: flex; align-items: center;">
  <div>
    <ol>
      <li>Right-click on an image file in VS Code Explorer</li>
      <li>Select <b>"View Image Metadata"</b> from the context menu</li>
      <li>A new document will open showing all metadata in JSON format</li>
    </ol>
  </div>
  <img src="https://via.placeholder.com/300x200?text=View+Metadata+Screenshot" alt="View Metadata Screenshot" width="300"/>
</div>

### Cleaning Metadata

<div style="display: flex; align-items: center;">
  <div>
    <ol>
      <li>Right-click on an image file in VS Code Explorer</li>
      <li>Select <b>"Clean Image Metadata"</b> from the context menu</li>
      <li>Wait for the cleaning process to complete</li>
      <li>The image will be replaced with a metadata-free version</li>
    </ol>
  </div>
  <img src="https://via.placeholder.com/300x200?text=Clean+Metadata+Screenshot" alt="Clean Metadata Screenshot" width="300"/>
</div>

---

## 🔧 Requirements

This extension uses ExifTool, which is automatically installed as a dependency. No additional software installation is required.

---

## 📊 Extension Settings

This extension is designed to be simple and does not require any configuration. Just install and use!

---

## 🔄 Future Improvements

- Option to save cleaned images as new files
- Batch processing for multiple images
- Selective metadata cleaning
- Custom metadata templates

---

## 🔒 Privacy Statement

Meta-Scraper processes all images locally on your machine. No data is transmitted to external servers, maintaining complete privacy of your information.

---

## 🤝 Contributing

Contributions are welcome! Feel free to submit issues or pull requests on the [GitHub repository](https://github.com/natalie-a-1/Meta-Scraper).

---

## 📜 License

This extension is released under the [MIT License](LICENSE).

---

<div align="center">
  <p>Made with ❤️ by <a href="https://github.com/natalie-a-1">natalie-a-1</a></p>
  <p>
    <a href="https://github.com/natalie-a-1/Meta-Scraper/issues">Report Bug</a> •
    <a href="https://github.com/natalie-a-1/Meta-Scraper/issues">Request Feature</a>
  </p>
</div>
