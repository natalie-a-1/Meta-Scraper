/**
 * Example script demonstrating how to use ExifTool directly to view and clean metadata
 * This shows the core functionality that powers the VS Code extension
 */

const { ExifTool } = require('exiftool-vendored');
const fs = require('fs');
const path = require('path');

// Check for command line arguments
if (process.argv.length < 3) {
  console.log('Usage: node example-usage.js <image-file>');
  process.exit(1);
}

const imagePath = process.argv[2];

// Demo the metadata operations
async function demoMetadataOperations() {
  // Initialize ExifTool
  const exiftool = new ExifTool();
  
  try {
    console.log(`\n--- DEMONSTRATING METADATA OPERATIONS ON: ${imagePath} ---\n`);
    
    // Step 1: Read and display the current metadata
    console.log('STEP 1: VIEWING METADATA');
    console.log('------------------------');
    
    const metadata = await exiftool.read(imagePath);
    console.log(JSON.stringify(metadata, null, 2));
    
    // Step 2: Clean the metadata by creating a copy
    console.log('\nSTEP 2: CLEANING METADATA');
    console.log('------------------------');
    
    // Create a temp file path for the clean image
    const fileExt = path.extname(imagePath);
    const baseFilename = path.basename(imagePath, fileExt);
    const outputPath = path.join(
      path.dirname(imagePath), 
      `${baseFilename}-clean${fileExt}`
    );
    
    console.log(`Creating clean version at: ${outputPath}`);
    
    // Keep only basic metadata, remove all others
    await exiftool.write(
      imagePath, 
      { all: '' }, 
      ['-P', '-o', outputPath]
    );
    
    console.log('Metadata cleaning completed!');
    
    // Step 3: Verify the cleaned metadata
    console.log('\nSTEP 3: VERIFYING CLEANED METADATA');
    console.log('-------------------------------');
    
    const cleanedMetadata = await exiftool.read(outputPath);
    console.log(JSON.stringify(cleanedMetadata, null, 2));
    
    console.log('\nCOMPARISON:');
    console.log(`- Original metadata had ${Object.keys(metadata).length} properties`);
    console.log(`- Cleaned metadata has ${Object.keys(cleanedMetadata).length} properties`);
    
    console.log('\nDONE! Check the cleaned image file.');
    
  } catch (error) {
    console.error('Error during metadata operations:', error);
  } finally {
    // Make sure to close exiftool process
    await exiftool.end();
  }
}

// Run the demo
demoMetadataOperations(); 