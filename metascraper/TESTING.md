# Testing Guide for the Image Metadata Scraper Extension

This guide provides comprehensive instructions for testing the Image Metadata Scraper extension.

## Testing Methods

### Method 1: Install from VSIX package (Recommended for normal testing)

1. Install the extension from the VSIX file:
   - Open VS Code
   - Press `Ctrl+Shift+X` (or `Cmd+Shift+X` on Mac) to open the Extensions view
   - Click the "..." menu in the top-right corner
   - Select "Install from VSIX..."
   - Navigate to the `.vsix` file in this directory
   - VS Code will install the extension

2. Restart VS Code after installation

### Method 2: Run in development mode (Recommended for development)

1. Open this project in VS Code:
   ```bash
   code --new-window .
   ```

2. Press F5 or go to Run > Start Debugging
   - This will launch a new "Extension Development Host" window
   - The extension will be active in this window

3. In the Extension Development Host window, you can test your extension
   - Changes made to the extension code will require restarting the debugging session

## Testing with Images

### Option 1: Use your own images

1. Copy some images into the `test-image` directory
2. Right-click on an image
3. Select "View Image Metadata" to see what metadata exists
4. Select "Clean Image Metadata" to clean the metadata
5. Use "View Image Metadata" again to verify the cleaning worked

### Option 2: Add test metadata to images

For testing purposes, we've provided a script to add artificial metadata to any image:

1. Install the necessary dependencies:
   ```bash
   npm install
   ```

2. Run the script with an image path:
   ```bash
   node test-image/add-test-metadata.js test-image/your-image.jpg
   ```

3. The script will add GPS coordinates, camera info, copyright details, and other metadata

4. Test the extension with this modified image by right-clicking and using the context menu options

## What to Test

When testing the extension, verify that:

1. **Viewing Metadata**:
   - The "View Image Metadata" command works from the context menu
   - Metadata is displayed in a JSON format
   - The display is readable and properly formatted

2. **Cleaning Metadata**:
   - The "Clean Image Metadata" command works from the context menu
   - A progress notification appears during the cleaning process
   - After cleaning, viewing the metadata again shows that sensitive fields have been removed
   - The image still opens properly and looks the same visually

3. **Error Handling**:
   - The extension properly handles non-image files
   - The extension handles read-only files gracefully
   - Error messages are clear and helpful

## Reporting Issues

If you find any issues during testing, please report them by:

1. Opening an issue on the GitHub repository
2. Including steps to reproduce the issue
3. Describing the expected vs. actual behavior
4. Including any error messages or logs

## Advanced Testing

For more advanced testing scenarios:

1. Test with very large image files
2. Test with images that have unusual metadata
3. Test with different image formats (JPG, PNG, GIF, TIFF, WebP) 