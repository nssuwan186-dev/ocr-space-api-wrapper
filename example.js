/**
 * OCR Space API Wrapper - Comprehensive Example
 * 
 * Demonstrates all features of the enhanced OCR wrapper:
 * - Basic OCR (URL, file, base64)
 * - Thai language support
 * - Error handling
 * - Batch processing
 * - Progress callback
 * - Timeout configuration
 */

const path = require('path');
const {
  ocrSpace,
  ocrSpaceBatch,
  detectInput,
  getParsedText,
  getTextOverlay,
  // Error classes
  OCRSpaceError,
  OCRInvalidInputError,
  OCRFileNotFoundError,
  OCRApiError,
  OCRProcessingError,
  OCRRateLimitError,
  OCRTimeoutError,
} = require('./index.js');

// ──────────────────────────────────────────────────────────────────────────────
// Helper Functions
// ──────────────────────────────────────────────────────────────────────────────

function printDivider(title) {
  console.log('\n' + '='.repeat(60));
  console.log(`  ${title}`);
  console.log('='.repeat(60));
}

function printSuccess(text, result) {
  console.log('\n✅ SUCCESS:', text);
  console.log('─'.repeat(40));
  console.log(getParsedText(result));
  console.log('─'.repeat(40));
  console.log(`⏱️  ProcessedTime: ${result.ProcessedTime || 'N/A'}ms`);
  console.log(`🔧 OCREngine Used: ${result.OCREngineUsed || 'N/A'}`);
}

function printError(error) {
  console.log('\n❌ ERROR:', error.name);
  console.log('📝 Message:', error.message);
  if (error.code) console.log('🔢 Code:', error.code);
  if (error.filePath) console.log('📁 File:', error.filePath);
  if (error.retryAfter) console.log('⏰ Retry After:', error.retryAfter, 'seconds');
  if (error.timeout) console.log('⏱️  Timeout:', error.timeout, 'ms');
  if (error.errorDetails?.length > 0) {
    console.log('📋 Details:', error.errorDetails);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Main Example
// ──────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🚀 OCR Space API Wrapper v3.0.0 - Enhanced Example');
  console.log('═'.repeat(60));

  try {
    // ──────────────────────────────────────────────────────────────────────────
    // ตัวอย่างที่ 1: Input Detection
    // ──────────────────────────────────────────────────────────────────────────
    printDivider('ตัวอย่างที่ 1: Input Detection');
    
    const testInputs = [
      'https://example.com/image.png',
      'data:image/png;base64,abc123',
      './test/eng.png',
      'http://example.com/file.pdf',
    ];
    
    for (const input of testInputs) {
      const type = detectInput(input);
      console.log(`📥 "${input.substring(0, 40)}..." → ${type}`);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // ตัวอย่างที่ 2: OCR จากไฟล์ในเครื่อง
    // ──────────────────────────────────────────────────────────────────────────
    printDivider('ตัวอย่างที่ 2: OCR จากไฟล์ในเครื่อง');
    
    const testFile = path.join(__dirname, 'test', 'eng.png');
    console.log('📄 File:', testFile);
    
    const result1 = await ocrSpace(testFile);
    printSuccess('อ่านไฟล์ในเครื่องสำเร็จ', result1);

    // ──────────────────────────────────────────────────────────────────────────
    // ตัวอย่างที่ 3: OCR จาก URL
    // ──────────────────────────────────────────────────────────────────────────
    printDivider('ตัวอย่างที่ 3: OCR จาก URL');
    
    const imageUrl = 'http://dl.a9t9.com/ocrbenchmark/eng.png';
    console.log('🌐 URL:', imageUrl);
    
    const result2 = await ocrSpace(imageUrl);
    printSuccess('อ่านจาก URL สำเร็จ', result2);

    // ──────────────────────────────────────────────────────────────────────────
    // ตัวอย่างที่ 4: OCR ภาษาไทย
    // ──────────────────────────────────────────────────────────────────────────
    printDivider('ตัวอย่างที่ 4: OCR ภาษาไทย');
    console.log('🇹🇭 ภาษา: ไทย (tha)');
    console.log('💡 ใส่ไฟล์ภาพภาษาไทยใน test/ เพื่อทดสอบ');
    console.log('📝 ตัวอย่างโค้ด:');
    console.log(`
  const thaiResult = await ocrSpace('./test/thai.png', {
    apiKey: 'YOUR_API_KEY',  // ใช้ API key ของคุณ
    language: 'tha',
    OCREngine: '2',  // ใช้ engine 2 เพื่อ auto-detect
  });
    `);

    // ──────────────────────────────────────────────────────────────────────────
    // ตัวอย่างที่ 5: ตัวเลือกเพิ่มเติม
    // ──────────────────────────────────────────────────────────────────────────
    printDivider('ตัวอย่างที่ 5: ตัวเลือกเพิ่มเติม');
    console.log('📋 ตัวเลือกทั้งหมดที่ใช้งานได้:');
    console.log(`
  {
    apiKey: 'YOUR_API_KEY',           // API key
    language: 'tha',                   // ภาษา (tha, eng, jpn, ฯลฯ)
    OCREngine: '2',                    // Engine (1, 2, 3)
    isOverlayRequired: true,           // ต้องการ overlay
    detectOrientation: true,           // ตรวจจับ orientation
    isCreateSearchablePdf: true,       // สร้าง searchable PDF
    isTable: true,                     // ตรวจจับตาราง
    scale: true,                       // เปิด scaling
    timeout: 60000,                    // timeout 60 วินาที
    maxRetries: 3,                     // retry สูงสุด 3 ครั้ง
    onProgress: (e) => console.log(e), // progress callback
  }
    `);

    // ──────────────────────────────────────────────────────────────────────────
    // ตัวอย่างที่ 6: Batch Processing
    // ──────────────────────────────────────────────────────────────────────────
    printDivider('ตัวอย่างที่ 6: Batch Processing');
    console.log('📦 ประมวลผลหลายไฟล์พร้อมกัน');
    console.log('📝 ตัวอย่างโค้ด:');
    console.log(`
  const inputs = [
    './test/image1.png',
    './test/image2.png',
    'https://example.com/image3.png',
  ];
  
  const results = await ocrSpaceBatch(inputs, {
    apiKey: 'YOUR_API_KEY',
    language: 'eng',
  }, {
    concurrency: 3,        // ประมวลผลพร้อมกัน 3 ไฟล์
    delayBetween: 1000,    // รอ 1 วินาทีระหว่าง request
  });
  
  // ตรวจสอบผลลัพธ์
  for (const result of results) {
    if (result.status === 'fulfilled') {
      console.log('✅', getParsedText(result.value));
    } else {
      console.log('❌', result.reason.message);
    }
  }
    `);

    // ──────────────────────────────────────────────────────────────────────────
    // ตัวอย่างที่ 7: Error Handling
    // ──────────────────────────────────────────────────────────────────────────
    printDivider('ตัวอย่างที่ 7: Error Handling');
    console.log('🛡️ จัดการ error แบบละเอียด');
    console.log('📝 ตัวอย่างโค้ด:');
    console.log(`
  try {
    await ocrSpace('./nonexistent.png');
  } catch (error) {
    if (error instanceof OCRFileNotFoundError) {
      console.error('File not found:', error.filePath);
    } else if (error instanceof OCRApiError) {
      console.error('API error:', error.errorDetails);
    } else if (error instanceof OCRRateLimitError) {
      console.error('Rate limited. Retry after:', error.retryAfter);
    } else if (error instanceof OCRTimeoutError) {
      console.error('Timeout after:', error.timeout, 'ms');
    } else if (error instanceof OCRInvalidInputError) {
      console.error('Invalid input:', error.message);
    }
  }
    `);

    // ──────────────────────────────────────────────────────────────────────────
    // ตัวอย่างที่ 8: Text Overlay
    // ──────────────────────────────────────────────────────────────────────────
    printDivider('ตัวอย่างที่ 8: Text Overlay');
    console.log('📐 รับข้อมูลตำแหน่งข้อความ');
    console.log('📝 ตัวอย่างโค้ด:');
    console.log(`
  const result = await ocrSpace('./test/eng.png', {
    isOverlayRequired: true,
  });
  
  const overlays = getTextOverlay(result);
  for (const overlay of overlays) {
    console.log('Has Overlay:', overlay.HasOverlay);
    for (const line of overlay.Lines) {
      console.log('Line:', line.LineText);
      console.log('Position:', { 
        left: line.MinLeft, 
        top: line.MinTop,
        width: line.MaxWidth,
        height: line.MaxHeight 
      });
    }
  }
    `);

    // ──────────────────────────────────────────────────────────────────────────
    // ตัวอย่างที่ 9: PDF OCR
    // ──────────────────────────────────────────────────────────────────────────
    printDivider('ตัวอย่างที่ 9: PDF OCR');
    console.log('📄 อ่านข้อความจากไฟล์ PDF');
    console.log('📝 ตัวอย่างโค้ด:');
    console.log(`
  const pdfResult = await ocrSpace('./document.pdf', {
    apiKey: 'YOUR_API_KEY',
    language: 'eng',
    OCREngine: '2',
    isCreateSearchablePdf: true,
    isTable: true,
  });
  
  console.log('Parsed Text:', getParsedText(pdfResult));
  console.log('Searchable PDF URL:', pdfResult.SearchablePDFURL);
  console.log('Is Table:', pdfResult.IsTable);
    `);

    // ──────────────────────────────────────────────────────────────────────────
    // ตัวอย่างที่ 10: Progress Callback
    // ──────────────────────────────────────────────────────────────────────────
    printDivider('ตัวอย่างที่ 10: Progress Callback');
    console.log('📊 แสดงความคืบหน้าการอัปโหลด');
    console.log('📝 ตัวอย่างโค้ด:');
    console.log(`
  const result = await ocrSpace('./large-file.pdf', {
    apiKey: 'YOUR_API_KEY',
    onProgress: (progressEvent) => {
      const percent = Math.round((progressEvent.loaded / progressEvent.total) * 100);
      process.stdout.write(\`\\rUploading: \${percent}%\`);
    },
  });
    `);

    // ──────────────────────────────────────────────────────────────────────────
    // สรุป
    // ──────────────────────────────────────────────────────────────────────────
    printDivider('✨ สรุปฟีเจอร์ทั้งหมด');
    console.log(`
✅ Input Detection - ตรวจประเภทรูปแบบ input อัตโนมัติ
✅ File Validation - ตรวจสอบว่าไฟล์มีอยู่จริงก่อนอ่าน
✅ Better Error Handling - จัดการ error แบบละเอียดด้วย custom error classes
✅ Retry Logic - retry อัตโนมัติเมื่อเกิด network error หรือ rate limit
✅ Connection Pooling - reuse connection เพื่อเพิ่มประสิทธิภาพ
✅ Timeout Support - ตั้ง timeout ได้ (default 30s)
✅ Batch Processing - ประมวลผลหลายไฟล์พร้อมกัน
✅ Progress Callback - แสดงความคืบหน้าการอัปโหลด
✅ Text Overlay - รับข้อมูลตำแหน่งข้อความ
✅ TypeScript Support - type definitions ครบถ้วน
✅ Thai Language Support - รองรับภาษาไทย (language: 'tha')
    `);

    console.log('\n🎉 ตัวอย่างทั้งหมดเสร็จสิ้น!');
    console.log('💡 ดูรายละเอียดเพิ่มเติมได้ที่: https://ocr.space/ocrapi');

  } catch (error) {
    printError(error);
    process.exit(1);
  }
}

main();
