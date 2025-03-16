# <img src="./images/icon.png" alt="Meta-Scraper Logo" width="30"/> Testing Guide for Meta-Scraper

<div align="center">
  
[![Version](https://img.shields.io/badge/version-0.0.1-blue.svg)](https://marketplace.visualstudio.com/items?itemName=natalie-a-1.metascraper)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

</div>

This comprehensive guide will help you effectively test the Meta-Scraper extension to ensure all features are working correctly.

---

## 📋 Table of Contents

- [Testing Installation Methods](#-testing-installation-methods)
- [Testing with Sample Images](#-testing-with-sample-images)
- [Feature Testing Checklist](#-feature-testing-checklist)
- [Troubleshooting](#-troubleshooting)
- [Advanced Testing](#-advanced-testing)
- [Reporting Issues](#-reporting-issues)

---

## 🚀 Testing Installation Methods

### Method 1: Install from VSIX package (Recommended for end-users)

<div style="display: flex; align-items: top;">
  <div style="flex: 2;">
    <ol>
      <li>Open VS Code</li>
      <li>Press <code>Ctrl+Shift+X</code> (or <code>Cmd+Shift+X</code> on Mac) to open Extensions</li>
      <li>Click the "..." menu in the top-right corner</li>
      <li>Select "Install from VSIX..."</li>
      <li>Navigate to and select <code>metascraper-0.0.1.vsix</code></li>
      <li>Restart VS Code after installation</li>
    </ol>
  </div>
  <div style="flex: 1;">
    <img src="https://via.placeholder.com/300x200?text=VSIX+Installation" alt="VSIX Installation" width="300"/>
  </div>
</div>

### Method 2: Run in Development Mode (For developers)

<div style="display: flex; align-items: top;">
  <div style="flex: 2;">
    <ol>
      <li>Open the project in VS Code:
        <pre><code>code --new-window .</code></pre>
      </li>
      <li>Press <code>F5</code> or go to <strong>Run > Start Debugging</strong></li>
      <li>This launches an "Extension Development Host" window</li>
      <li>Test your extension in this development window</li>
      <li>Changes to code require restarting the debugging session</li>
    </ol>
  </div>
  <div style="flex: 1;">
    <img src="https://via.placeholder.com/300x200?text=Development+Mode" alt="Development Mode" width="300"/>
  </div>
</div>

---

## 🖼️ Testing with Sample Images

### Option 1: Use Your Own Images

<div style="display: flex; align-items: center;">
  <div style="flex: 2;">
    <ol>
      <li>Copy images into the <code>test-image</code> directory</li>
      <li>Right-click on an image and select <strong>"View Image Metadata"</strong></li>
      <li>Check what metadata exists in the image</li>
      <li>Right-click again and select <strong>"Clean Image Metadata"</strong></li>
      <li>View metadata again to verify cleaning was successful</li>
    </ol>
  </div>
  <div style="flex: 1;">
    <img src="https://via.placeholder.com/300x200?text=Test+With+Own+Images" alt="Testing with Own Images" width="300"/>
  </div>
</div>

### Option 2: Create Test Images with Metadata

We've included a script that adds artificial test metadata to any image, perfect for testing the cleaning functionality:

```bash
# First install dependencies
npm install

# Then run the script on any image
node test-image/add-test-metadata.js test-image/your-image.jpg
```

The script adds:
- GPS coordinates
- Camera information
- Creation timestamps
- Copyright details
- Author information

<div align="center">
  <img src="https://via.placeholder.com/600x250?text=Before+and+After+Metadata+Cleaning" alt="Before and After Metadata Cleaning" width="600"/>
</div>

---

## ✅ Feature Testing Checklist

Use this checklist to verify all extension features are working properly:

| Feature | Test Steps | Expected Result | Status |
|---------|------------|-----------------|--------|
| **View Metadata** | Right-click image → "View Image Metadata" | JSON metadata displayed in new document | ⬜ |
| **Clean Metadata** | Right-click image → "Clean Image Metadata" | Progress notification → Success message | ⬜ |
| **Verify Cleaning** | View metadata after cleaning | Most/all metadata fields removed | ⬜ |
| **Image Integrity** | Open image after cleaning | Image appears identical to original | ⬜ |
| **Error: Non-Image** | Right-click non-image file → try commands | Proper error message shown | ⬜ |
| **Error: Read-Only** | Test with read-only image | Graceful error handling | ⬜ |
| **Large Images** | Test with high-resolution image | Successfully processes without timeout | ⬜ |

---

## 🔧 Troubleshooting

If you encounter issues during testing:

1. **Command not appearing in context menu**
   - Ensure the extension is properly installed
   - Verify you're right-clicking on a supported image format
   - Try reloading the VS Code window

2. **Metadata not fully removed**
   - Some specialized file formats may retain certain metadata
   - Check if the file is locked by another application
   - Try saving the image to a new location first

3. **Performance issues with large files**
   - Processing very large images may take longer
   - Ensure your system has sufficient resources available

---

## 🔬 Advanced Testing

For more thorough testing, try these advanced scenarios:

- Test with multiple image formats (JPG, PNG, GIF, TIFF, WebP)
- Test with unusually large image files (20MB+)
- Test with images containing extensive metadata
- Test the extension while other resource-intensive operations are running
- Test with images in read-only locations or with restricted permissions

---

## 📝 Reporting Issues

If you encounter bugs or have feature suggestions:

1. Check existing [issues on GitHub](https://github.com/natalie-a-1/Meta-Scraper/issues) to see if it's already reported
2. Create a new issue with:
   - A clear descriptive title
   - Detailed steps to reproduce
   - Expected vs. actual behavior
   - VS Code version and OS information
   - Screenshots or logs if available

---

<div align="center">
  <p>Thank you for helping test Meta-Scraper!</p>
  <p>
    <a href="https://github.com/natalie-a-1/Meta-Scraper">Back to Main Repository</a> •
    <a href="README.md">View README</a> •
    <a href="PUBLISHING.md">Publishing Guide</a>
  </p>
</div> 