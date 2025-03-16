# Packaging and Publishing the Image Metadata Scraper Extension

This document provides instructions on how to package and publish the Image Metadata Scraper extension to the Visual Studio Code Marketplace.

## Prerequisites

1. Install the VS Code Extension Manager (vsce):
   ```bash
   npm install -g @vscode/vsce
   ```

2. Create a Personal Access Token (PAT) in Azure DevOps:
   - Go to https://dev.azure.com/
   - Create an account if you don't have one
   - Create a new Personal Access Token with the "Marketplace (publish)" scope

## Packaging the Extension

To create a `.vsix` package file for local installation or manual distribution:

```bash
cd metascraper
vsce package
```

This will create a `.vsix` file in the current directory.

## Installing the Extension Locally

To test the packaged extension locally:

1. In VS Code, open the Extensions view (Ctrl+Shift+X)
2. Click the "..." in the top right of the Extensions view
3. Select "Install from VSIX..."
4. Navigate to the `.vsix` file created in the previous step

## Publishing to the VS Code Marketplace

1. Create a publisher account:
   - Go to https://marketplace.visualstudio.com/
   - Sign in with your Azure DevOps account
   - Create a publisher if you don't have one

2. Login with your Personal Access Token:
   ```bash
   vsce login <publisher-name>
   ```

3. Publish the extension:
   ```bash
   vsce publish
   ```

4. For future updates, increment the version number in `package.json` before publishing:
   ```bash
   # For a patch update (1.0.0 -> 1.0.1)
   vsce publish patch
   
   # For a minor update (1.0.0 -> 1.1.0)
   vsce publish minor
   
   # For a major update (1.0.0 -> 2.0.0)
   vsce publish major
   ```

## Unpublishing

If needed, you can unpublish your extension:

```bash
vsce unpublish <publisher-name>.<extension-name>
```

## References

- [Publishing Extensions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
- [vsce CLI Reference](https://github.com/microsoft/vscode-vsce) 