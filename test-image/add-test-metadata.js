const { ExifTool } = require('exiftool-vendored');
const path = require('path');
const fs = require('fs');

// Check for command line arguments
if (process.argv.length < 3) {
  console.log('Usage: node add-test-metadata.js <image-file>');
  process.exit(1);
}

const imagePath = process.argv[2];

// Make sure the file exists
if (!fs.existsSync(imagePath)) {
  console.error(`Error: File ${imagePath} does not exist`);
  process.exit(1);
}

// Make sure it's an image
const fileExt = path.extname(imagePath).toLowerCase();
const supportedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.tiff', '.webp'];
if (!supportedExtensions.includes(fileExt)) {
  console.error(`Error: File ${imagePath} is not a supported image format`);
  process.exit(1);
}

// Sample metadata to add for testing
const testMetadata = {
  // GPS coordinates (Central Park, NYC)
  GPSLatitude: 40.7812,
  GPSLatitudeRef: 'N',
  GPSLongitude: 73.9665,
  GPSLongitudeRef: 'W',
  
  // Camera info
  Make: 'Test Camera Brand',
  Model: 'Test Camera Model X100',
  LensModel: 'Test Lens 18-55mm',
  
  // Author and copyright
  Artist: 'Test Photographer',
  Copyright: '© 2024 Test Copyright',
  
  // Software
  Software: 'Adobe Photoshop 2024',
  
  // Custom metadata
  UserComment: 'This is a test comment with tracking info',
  
  // Date time
  DateTimeOriginal: '2024:05:01 10:30:00',
};

// Add the metadata
async function addMetadata() {
  const exiftool = new ExifTool();
  
  try {
    console.log(`Adding test metadata to ${imagePath}...`);
    
    // Add metadata
    await exiftool.write(imagePath, testMetadata);
    
    console.log('Metadata added successfully!');
    console.log('Metadata added:');
    console.log(JSON.stringify(testMetadata, null, 2));
    
    // Read back to verify
    const updatedMetadata = await exiftool.read(imagePath);
    console.log('\nVerify metadata now in file:');
    console.log(JSON.stringify(updatedMetadata, null, 2));
    
  } catch (error) {
    console.error('Error adding metadata:', error);
  } finally {
    await exiftool.end();
  }
}

addMetadata(); 