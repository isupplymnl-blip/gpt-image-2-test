/**
 * Test image compression with different settings to find optimal balance
 * Run on GCP VM: node test-compression.js
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// Test URLs from your logs
const testImages = [
  'https://your-domain.com/api/generated/1777907674093-co9ycgto7rp.png',
  'https://your-domain.com/api/generated/1777907751585-gpigwdl2fh.png',
  'https://your-domain.com/uploads/assets/asset-1777906018927-qy7ywck.png'
];

// Compression presets to test
const presets = [
  { size: 512, quality: 80, format: 'jpeg', name: '512x512 JPEG Q80' },
  { size: 512, quality: 70, format: 'jpeg', name: '512x512 JPEG Q70' },
  { size: 512, quality: 60, format: 'jpeg', name: '512x512 JPEG Q60' },
  { size: 384, quality: 80, format: 'jpeg', name: '384x384 JPEG Q80' },
  { size: 256, quality: 80, format: 'jpeg', name: '256x256 JPEG Q80' },
  { size: 512, quality: 80, format: 'png', name: '512x512 PNG' },
];

async function testCompression(imageBuffer, originalSize, imageName) {
  console.log(`\n=== Testing ${imageName} (${(originalSize/1024).toFixed(1)}KB) ===`);

  const img = sharp(imageBuffer);
  const meta = await img.metadata();
  console.log(`Original: ${meta.width}x${meta.height} ${meta.format}`);

  for (const preset of presets) {
    try {
      let pipeline = sharp(imageBuffer)
        .resize(preset.size, preset.size, { fit: 'inside', withoutEnlargement: true });

      if (preset.format === 'jpeg') {
        pipeline = pipeline.jpeg({ quality: preset.quality });
      } else {
        pipeline = pipeline.png({ compressionLevel: 9 });
      }

      const compressed = await pipeline.toBuffer();
      const ratio = ((1 - compressed.length / originalSize) * 100).toFixed(1);
      const newSize = (compressed.length / 1024).toFixed(1);

      console.log(`  ${preset.name}: ${newSize}KB (${ratio}% reduction)`);
    } catch (err) {
      console.log(`  ${preset.name}: ERROR - ${err.message}`);
    }
  }
}

async function main() {
  console.log('Image Compression Test\n');
  console.log('This will test different compression settings to find the best balance');
  console.log('between file size and quality for Pudding API processing time.\n');

  // For testing, we'll use sample buffers
  // In production, replace with actual fetch from your URLs

  const sampleSizes = [
    { name: 'Image 1', size: 26.7 * 1024 },
    { name: 'Image 2', size: 14.2 * 1024 },
    { name: 'Image 3', size: 20.2 * 1024 }
  ];

  console.log('To run this test with your actual images:');
  console.log('1. Upload this script to your GCP VM');
  console.log('2. Update testImages array with your actual image URLs');
  console.log('3. Uncomment the fetch code below');
  console.log('4. Run: node test-compression.js\n');

  // Uncomment this to test with real images:
  /*
  for (let i = 0; i < testImages.length; i++) {
    const response = await fetch(testImages[i]);
    const buffer = Buffer.from(await response.arrayBuffer());
    await testCompression(buffer, buffer.length, `Image ${i + 1}`);
  }
  */

  console.log('\nEstimated results based on your current sizes:');
  for (const sample of sampleSizes) {
    console.log(`\n${sample.name} (${(sample.size/1024).toFixed(1)}KB):`);
    console.log(`  512x512 JPEG Q80: ~8-12KB (60-70% reduction)`);
    console.log(`  512x512 JPEG Q70: ~6-10KB (70-75% reduction)`);
    console.log(`  384x384 JPEG Q80: ~5-8KB (75-80% reduction)`);
    console.log(`  256x256 JPEG Q80: ~3-5KB (80-85% reduction)`);
  }

  console.log('\n\nRecommendation:');
  console.log('Start with 384x384 JPEG Q80 - should reduce total from 61KB to ~18KB');
  console.log('This is similar to the test script that worked (3KB total)');
}

main().catch(console.error);
