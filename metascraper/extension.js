// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const { ExifTool } = require('exiftool-vendored');
const path = require('path');
const fs = require('fs');

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Metadata Scraper extension is now active');

	// Register the command to clean metadata from an image
	const cleanMetadataDisposable = vscode.commands.registerCommand('metascraper.cleanMetadata', async function (fileUri) {
		if (!fileUri) {
			// If command was triggered from command palette without a file
			vscode.window.showErrorMessage('Please right-click on an image file to clean its metadata.');
			return;
		}

		const filePath = fileUri.fsPath;
		const fileName = path.basename(filePath);
		const fileExt = path.extname(filePath).toLowerCase();
		
		// Check if the file is an image
		const supportedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.tiff', '.webp'];
		if (!supportedExtensions.includes(fileExt)) {
			vscode.window.showErrorMessage(`File "${fileName}" is not a supported image format.`);
			return;
		}

		try {
			// Show progress notification
			await vscode.window.withProgress({
				location: vscode.ProgressLocation.Notification,
				title: `Cleaning metadata from ${fileName}`,
				cancellable: false
			}, async (progress) => {
				// Initialize ExifTool
				const exiftool = new ExifTool();
				
				try {
					progress.report({ message: 'Reading metadata...' });
					
					// Read the current metadata (for informational purposes)
					const metadata = await exiftool.read(filePath);
					console.log('Original metadata:', metadata);
					
					progress.report({ message: 'Cleaning metadata...' });
					
					// Generate a temporary file path in the same directory
					const dirPath = path.dirname(filePath);
					const baseName = path.basename(filePath, fileExt);
					const tempFilePath = path.join(dirPath, `${baseName}-temp${fileExt}`);
					
					// Remove all metadata and write to the temp file
					await exiftool.write(
						filePath, 
						{ all: '' }, 
						['-P', '-o', tempFilePath]
					);
					
					// Check if both files exist
					if (fs.existsSync(tempFilePath)) {
						// If original file exists, delete it first
						if (fs.existsSync(filePath)) {
							fs.unlinkSync(filePath);
						}
						
						// Then rename the temp file to the original name
						fs.renameSync(tempFilePath, filePath);
						
						vscode.window.showInformationMessage(`Successfully cleaned metadata from "${fileName}".`);
					} else {
						throw new Error('Failed to create cleaned image file');
					}
					
					// Close exiftool process
					await exiftool.end();
				} catch (err) {
					console.error('Error:', err);
					// Make sure to close exiftool process on error
					await exiftool.end();
					throw err;
				}
			});
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to clean metadata: ${error.message}`);
		}
	});

	// Register the command to view metadata from an image
	const viewMetadataDisposable = vscode.commands.registerCommand('metascraper.viewMetadata', async function (fileUri) {
		if (!fileUri) {
			vscode.window.showErrorMessage('Please right-click on an image file to view its metadata.');
			return;
		}

		const filePath = fileUri.fsPath;
		const fileName = path.basename(filePath);
		const fileExt = path.extname(filePath).toLowerCase();
		
		// Check if the file is an image
		const supportedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.tiff', '.webp'];
		if (!supportedExtensions.includes(fileExt)) {
			vscode.window.showErrorMessage(`File "${fileName}" is not a supported image format.`);
			return;
		}

		try {
			// Show progress notification
			await vscode.window.withProgress({
				location: vscode.ProgressLocation.Notification,
				title: `Reading metadata from ${fileName}`,
				cancellable: false
			}, async (progress) => {
				// Initialize ExifTool
				const exiftool = new ExifTool();
				
				try {
					// Read the current metadata
					const metadata = await exiftool.read(filePath);
					
					// Create a virtual document to display metadata
					const metadataJson = JSON.stringify(metadata, null, 2);
					const metadataDoc = await vscode.workspace.openTextDocument({
						content: metadataJson,
						language: 'json'
					});
					
					// Show the document
					await vscode.window.showTextDocument(metadataDoc, { preview: true });
					
					// Close exiftool process
					await exiftool.end();
				} catch (err) {
					console.error('Error:', err);
					// Make sure to close exiftool process on error
					await exiftool.end();
					throw err;
				}
			});
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to read metadata: ${error.message}`);
		}
	});

	context.subscriptions.push(cleanMetadataDisposable, viewMetadataDisposable);
}

// This method is called when your extension is deactivated
function deactivate() {}

module.exports = {
	activate,
	deactivate
}
