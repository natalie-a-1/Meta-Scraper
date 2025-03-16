# <img src="./images/icon.png" alt="Meta-Scraper Logo" width="30"/> Publishing Guide for Meta-Scraper

<div align="center">
  
[![Version](https://img.shields.io/badge/version-0.0.1-blue.svg)](https://marketplace.visualstudio.com/items?itemName=natalie-a-1.metascraper)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

</div>

This guide provides detailed instructions for packaging and publishing the Meta-Scraper extension to the Visual Studio Code Marketplace.

---

## 📋 Table of Contents

- [Prerequisites](#-prerequisites)
- [Packaging the Extension](#-packaging-the-extension)
- [Testing Before Publishing](#-testing-before-publishing)
- [Publishing to VS Code Marketplace](#-publishing-to-vs-code-marketplace)
- [Managing Published Extensions](#-managing-published-extensions)
- [Automating Publishing](#-automating-publishing)
- [Resources](#-resources)

---

## 🔧 Prerequisites

Before you can publish the extension, you'll need to set up a few things:

<div style="display: flex; align-items: top;">
  <div style="flex: 2;">
    <ol>
      <li>Install the VS Code Extension Manager globally:
        <pre><code>npm install -g @vscode/vsce</code></pre>
      </li>
      <li>Create a Microsoft account if you don't have one</li>
      <li>Create a Personal Access Token (PAT):
        <ul>
          <li>Go to <a href="https://dev.azure.com/">Azure DevOps</a></li>
          <li>Sign in with your Microsoft account</li>
          <li>Select your profile icon → Personal access tokens</li>
          <li>Create a new token with "Marketplace (publish)" scope</li>
          <li>⚠️ <strong>Save this token securely</strong> - you'll need it for publishing</li>
        </ul>
      </li>
    </ol>
  </div>
  <div style="flex: 1;">
    <img src="https://via.placeholder.com/300x200?text=PAT+Creation" alt="Creating PAT Token" width="300"/>
  </div>
</div>

---

## 📦 Packaging the Extension

Creating a `.vsix` package file is the first step for distribution:

```bash
# Navigate to your extension directory if needed
cd meta-scraper

# Create the package
vsce package
```

This will generate a file named `metascraper-0.0.1.vsix` (or similar with your version number) in the current directory.

<div align="center">
  <img src="https://via.placeholder.com/600x100?text=VSIX+Package+Created" alt="VSIX Package Created" width="600"/>
</div>

---

## 🧪 Testing Before Publishing

Always test your packaged extension before publishing:

<div style="display: flex; align-items: top;">
  <div style="flex: 2;">
    <ol>
      <li>In VS Code, open the Extensions view (<code>Ctrl+Shift+X</code>)</li>
      <li>Click the "..." menu in the top-right corner</li>
      <li>Select "Install from VSIX..."</li>
      <li>Choose your newly created .vsix file</li>
      <li>Verify all functionality works as expected</li>
      <li>Check that the extension icon displays correctly</li>
      <li>Ensure the README is formatted properly</li>
    </ol>
  </div>
  <div style="flex: 1;">
    <img src="https://via.placeholder.com/300x200?text=Testing+VSIX" alt="Testing VSIX" width="300"/>
  </div>
</div>

See the [TESTING.md](TESTING.md) file for detailed testing procedures.

---

## 🚀 Publishing to VS Code Marketplace

When you're ready to publish:

### Step 1: Create a Publisher Account

<div style="display: flex; align-items: top;">
  <div style="flex: 2;">
    <ol>
      <li>Go to the <a href="https://marketplace.visualstudio.com/manage/publishers/">VS Code Marketplace Publishers</a> page</li>
      <li>Sign in with your Microsoft account</li>
      <li>Click "New Publisher"</li>
      <li>Fill in the details:
        <ul>
          <li><strong>Publisher ID:</strong> "natalie-a-1" (must match package.json)</li>
          <li><strong>Display Name:</strong> Your preferred display name</li>
          <li><strong>Description:</strong> Brief bio or description</li>
        </ul>
      </li>
    </ol>
  </div>
  <div style="flex: 1;">
    <img src="https://via.placeholder.com/300x200?text=Create+Publisher" alt="Create Publisher" width="300"/>
  </div>
</div>

### Step 2: Login and Publish

```bash
# Login with your publisher name and PAT
vsce login natalie-a-1
# You'll be prompted for your Personal Access Token

# Publish the extension
vsce publish
```

If successful, your extension will be available on the marketplace within a few minutes!

<div align="center">
  <img src="https://via.placeholder.com/600x150?text=Publication+Successful" alt="Publication Successful" width="600"/>
</div>

### For Future Updates

When you make changes and want to publish a new version:

```bash
# Increment version (choose one)
vsce publish patch  # 0.0.1 -> 0.0.2 (bug fixes)
vsce publish minor  # 0.0.1 -> 0.1.0 (new features)
vsce publish major  # 0.0.1 -> 1.0.0 (breaking changes)
```

---

## 🔄 Managing Published Extensions

### Updating Extension Details

You can update your extension's marketplace page information:

1. Update your `README.md` with new information
2. Change the `package.json` for metadata updates
3. Re-publish using the steps above

### Unpublishing an Extension

If needed, you can remove your extension from the marketplace:

```bash
vsce unpublish natalie-a-1.metascraper
```

⚠️ **Warning**: Unpublishing an extension can be disruptive to users. Consider updating instead of removing.

---

## ⚙️ Automating Publishing

For more efficient workflows, consider setting up GitHub Actions to automatically publish your extension when you create a new release:

<details>
<summary>Click to view GitHub Actions workflow file example</summary>

```yaml
name: Publish Extension

on:
  release:
    types: [created]

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v1
        with:
          node-version: 16
      - run: npm ci
      - name: Publish to Visual Studio Marketplace
        uses: HaaLeo/publish-vscode-extension@v1
        with:
          pat: ${{ secrets.VS_MARKETPLACE_TOKEN }}
          registryUrl: https://marketplace.visualstudio.com
```

</details>

---

## 📚 Resources

- [VS Code Publishing Extensions Guide](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
- [vsce Command Line Tool Documentation](https://github.com/microsoft/vscode-vsce)
- [VS Code Marketplace](https://marketplace.visualstudio.com/)
- [Extension Guidelines](https://code.visualstudio.com/api/references/extension-guidelines)

---

<div align="center">
  <p>Good luck publishing your extension!</p>
  <p>
    <a href="https://github.com/natalie-a-1/Meta-Scraper">Back to Main Repository</a> •
    <a href="README.md">View README</a> •
    <a href="TESTING.md">Testing Guide</a>
  </p>
</div> 