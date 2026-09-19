// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const { ExifTool } = require('exiftool-vendored');
const path = require('path');
const { execFile } = require('child_process');

// Media formats exiftool can strip metadata from in place: images plus the
// QuickTime/MP4 video family (exiftool has full write support for these).
const MEDIA_EXTENSIONS = [
	'.jpg', '.jpeg', '.png', '.gif', '.tif', '.tiff', '.webp', '.heic', '.heif', '.bmp',
	'.mp4', '.mov', '.m4v'
];

// Glob brace body used for workspace.findFiles and the file-system watcher.
const MEDIA_GLOB = '**/*.{jpg,jpeg,png,gif,tif,tiff,webp,heic,heif,bmp,mp4,mov,m4v}';

// The single active media watcher (module-scoped so it can be disposed and
// recreated when settings or workspace folders change).
let mediaWatcher;

function isMediaFile(filePath) {
	return MEDIA_EXTENSIONS.includes(path.extname(filePath).toLowerCase());
}

function isIgnoredPath(filePath) {
	return /[/\\](node_modules|\.git)[/\\]/.test(filePath);
}

/**
 * Strip all metadata from a single media file, in place.
 * @param {string} filePath
 * @param {import('exiftool-vendored').ExifTool} exiftool
 * @returns {Promise<{ok: boolean, reason?: string}>}
 */
async function stripFile(filePath, exiftool) {
	try {
		// `-overwrite_original` writes back to the same file (no `_original` backup);
		// `-P` preserves the filesystem modification time.
		await exiftool.write(filePath, { all: '' }, ['-overwrite_original', '-P']);
		return { ok: true };
	} catch (err) {
		return { ok: false, reason: err.message };
	}
}

/**
 * True if the given folder is inside a Git repository that has at least one remote
 * (i.e. a repo that can be pushed online). Resolves false if git is unavailable or
 * the folder is not a repo.
 * @param {string} folderPath
 * @returns {Promise<boolean>}
 */
function hasRemoteOrigin(folderPath) {
	return new Promise((resolve) => {
		execFile('git', ['-C', folderPath, 'remote'], (err, stdout) => {
			resolve(!err && stdout.trim().length > 0);
		});
	});
}

// Handle a newly created media file according to the `onNewMedia` setting.
async function handleNewMedia(uri) {
	if (isIgnoredPath(uri.fsPath)) {
		return;
	}

	const action = vscode.workspace.getConfiguration('metascraper').get('onNewMedia', 'ask');
	if (action === 'nothing') {
		return;
	}

	const fileName = path.basename(uri.fsPath);
	if (action === 'ask') {
		const choice = await vscode.window.showInformationMessage(
			`New media added: "${fileName}". Strip its metadata before it could be pushed online?`,
			'Strip', 'Ignore'
		);
		if (choice !== 'Strip') {
			return;
		}
	}

	const exiftool = new ExifTool();
	try {
		const result = await stripFile(uri.fsPath, exiftool);
		if (result.ok) {
			vscode.window.setStatusBarMessage(`MetaScraper: stripped metadata from ${fileName}`, 4000);
		} else {
			vscode.window.showWarningMessage(`MetaScraper: could not strip "${fileName}": ${result.reason}`);
		}
	} finally {
		await exiftool.end();
	}
}

/**
 * (Re)create the media watcher. It is active only when `autoDetectNewMedia` is
 * enabled and at least one workspace folder is a Git repo with a remote, matching
 * the "repos made public online" use case.
 * @param {vscode.ExtensionContext} context
 */
async function setupWatcher(context) {
	if (mediaWatcher) {
		mediaWatcher.dispose();
		mediaWatcher = undefined;
	}

	const enabled = vscode.workspace.getConfiguration('metascraper').get('autoDetectNewMedia', false);
	if (!enabled) {
		return;
	}

	const folders = vscode.workspace.workspaceFolders || [];
	if (folders.length === 0) {
		return;
	}

	const remotes = await Promise.all(folders.map((f) => hasRemoteOrigin(f.uri.fsPath)));
	if (!remotes.some(Boolean)) {
		return;
	}

	mediaWatcher = vscode.workspace.createFileSystemWatcher(MEDIA_GLOB);
	mediaWatcher.onDidCreate(handleNewMedia);
	context.subscriptions.push(mediaWatcher);
}

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {

	console.log('MetaScraper extension is now active');

	// One-time setup, offered the first time the folder command is run in a workspace.
	async function maybeRunFirstTimeSetup() {
		if (context.workspaceState.get('metascraper.firstRunPrompted')) {
			return;
		}
		await context.workspaceState.update('metascraper.firstRunPrompted', true);

		const config = vscode.workspace.getConfiguration('metascraper');
		const enable = await vscode.window.showInformationMessage(
			'Automatically detect newly added media in this folder and protect it before pushing online?',
			'Yes', 'No'
		);
		if (enable !== 'Yes') {
			await config.update('autoDetectNewMedia', false, vscode.ConfigurationTarget.Workspace);
			return;
		}
		await config.update('autoDetectNewMedia', true, vscode.ConfigurationTarget.Workspace);

		const choice = await vscode.window.showQuickPick(
			[
				{ label: 'Automatically strip metadata', value: 'strip' },
				{ label: 'Ask for permission', value: 'ask' },
				{ label: 'Do nothing', value: 'nothing' }
			],
			{ placeHolder: 'When new media is added:' }
		);
		if (choice) {
			await config.update('onNewMedia', choice.value, vscode.ConfigurationTarget.Workspace);
		}

		await setupWatcher(context);
	}

	// Command: strip metadata from every media file in the folder / workspace.
	const stripFolderDisposable = vscode.commands.registerCommand('metascraper.stripFolder', async function (folderUri) {
		let searchPattern;
		if (folderUri && folderUri.fsPath) {
			// Invoked from the explorer context menu on a specific folder.
			searchPattern = new vscode.RelativePattern(folderUri, MEDIA_GLOB);
		} else if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
			// Invoked from the command palette: search all workspace folders.
			searchPattern = MEDIA_GLOB;
		} else {
			vscode.window.showErrorMessage('Open a folder to strip media metadata.');
			return;
		}

		await maybeRunFirstTimeSetup();

		const files = await vscode.workspace.findFiles(searchPattern, '**/{node_modules,.git}/**');
		if (files.length === 0) {
			vscode.window.showInformationMessage('No media files found to strip.');
			return;
		}

		await vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: 'Stripping metadata from media',
			cancellable: true
		}, async (progress, token) => {
			const exiftool = new ExifTool();
			let stripped = 0;
			let skipped = 0;
			try {
				for (let i = 0; i < files.length; i++) {
					if (token.isCancellationRequested) {
						break;
					}
					const fileName = path.basename(files[i].fsPath);
					progress.report({
						message: `(${i + 1}/${files.length}) ${fileName}`,
						increment: 100 / files.length
					});
					const result = await stripFile(files[i].fsPath, exiftool);
					if (result.ok) {
						stripped++;
					} else {
						skipped++;
						console.warn(`MetaScraper: skipped ${fileName}: ${result.reason}`);
					}
				}
			} finally {
				await exiftool.end();
			}
			const summary = `MetaScraper: stripped ${stripped} file(s)` + (skipped ? `, skipped ${skipped} (unsupported)` : '');
			vscode.window.showInformationMessage(summary);
		});
	});

	// Command: strip metadata from a single media file (explorer right-click).
	const cleanMetadataDisposable = vscode.commands.registerCommand('metascraper.cleanMetadata', async function (fileUri) {
		if (!fileUri) {
			vscode.window.showErrorMessage('Please right-click on a media file to strip its metadata.');
			return;
		}

		const filePath = fileUri.fsPath;
		const fileName = path.basename(filePath);
		if (!isMediaFile(filePath)) {
			vscode.window.showErrorMessage(`File "${fileName}" is not a supported media format.`);
			return;
		}

		try {
			await vscode.window.withProgress({
				location: vscode.ProgressLocation.Notification,
				title: `Stripping metadata from ${fileName}`,
				cancellable: false
			}, async () => {
				const exiftool = new ExifTool();
				try {
					const result = await stripFile(filePath, exiftool);
					if (result.ok) {
						vscode.window.showInformationMessage(`Successfully stripped metadata from "${fileName}".`);
					} else {
						vscode.window.showErrorMessage(`Failed to strip metadata from "${fileName}": ${result.reason}`);
					}
				} finally {
					await exiftool.end();
				}
			});
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to strip metadata: ${error.message}`);
		}
	});

	// Command: view a media file's metadata as JSON (explorer right-click).
	const viewMetadataDisposable = vscode.commands.registerCommand('metascraper.viewMetadata', async function (fileUri) {
		if (!fileUri) {
			vscode.window.showErrorMessage('Please right-click on a media file to view its metadata.');
			return;
		}

		const filePath = fileUri.fsPath;
		const fileName = path.basename(filePath);
		if (!isMediaFile(filePath)) {
			vscode.window.showErrorMessage(`File "${fileName}" is not a supported media format.`);
			return;
		}

		try {
			await vscode.window.withProgress({
				location: vscode.ProgressLocation.Notification,
				title: `Reading metadata from ${fileName}`,
				cancellable: false
			}, async () => {
				const exiftool = new ExifTool();
				try {
					const metadata = await exiftool.read(filePath);
					const metadataDoc = await vscode.workspace.openTextDocument({
						content: JSON.stringify(metadata, null, 2),
						language: 'json'
					});
					await vscode.window.showTextDocument(metadataDoc, { preview: true });
				} finally {
					await exiftool.end();
				}
			});
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to read metadata: ${error.message}`);
		}
	});

	context.subscriptions.push(stripFolderDisposable, cleanMetadataDisposable, viewMetadataDisposable);

	// Arm the watcher at startup, and re-evaluate when settings or folders change.
	setupWatcher(context);
	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration('metascraper.autoDetectNewMedia') ||
				e.affectsConfiguration('metascraper.onNewMedia')) {
				setupWatcher(context);
			}
		}),
		vscode.workspace.onDidChangeWorkspaceFolders(() => setupWatcher(context))
	);
}

// This method is called when your extension is deactivated
function deactivate() {
	if (mediaWatcher) {
		mediaWatcher.dispose();
		mediaWatcher = undefined;
	}
}

module.exports = {
	activate,
	deactivate
}
