#!/usr/bin/env node
/**
 * Hotel Check-in Form OCR Scanner
 * 
 * ระบบสแกนแบบฟอร์มผู้เข้าพักโรงแรม
 * รองรับ: บัตรประชาชน, พาสปอร์ต, ฟอร์มผู้เข้าพัก
 * 
 * @version 1.0.0
 */

const {
  ocrSpace,
  getParsedText,
  getTextOverlay,
} = require('./index.js');

const fs = require('fs').promises;
const path = require('path');

// ──────────────────────────────────────────────────────────────────────────────
// Configuration
// ──────────────────────────────────────────────────────────────────────────────

const CONFIG = {
  apiKey: 'helloworld',
  language: 'tha',
  engine: '2',
  timeout: 60000,
  maxRetries: 3,
};

// ──────────────────────────────────────────────────────────────────────────────
// Data Extraction Patterns
// ──────────────────────────────────────────────────────────────────────────────

class FormDataExtractor {
  constructor(text) {
    this.text = text;
    this.lines = text.split('\n').map(line => line.trim()).filter(line => line);
    this.data = {};
  }

  extract() {
    this.extractFullName();
    this.extractIDCard();
    this.extractPassport();
    this.extractDate();
    this.extractRoomNumber();
    this.extractGuestCount();
    this.extractNationality();
    this.extractPhoneNumber();
    this.extractEmail();
    this.extractAddress();
    this.extractSignature();

    return this.data;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Full Name Extraction
  // ──────────────────────────────────────────────────────────────────────────

  extractFullName() {
    const patterns = [
      /(?:ชื่อ|ชื่อ-สกุล|Name|ชื่อผู้เข้าพัก)[:\s]+([^\n]+)/i,
      /(?:นาย|นาง|นางสาว|Miss|Mr|Ms|Mrs)[^\n]*/i,
      /(?:fullname|guestname|guest_name)[:\s]+([^\n]+)/i,
    ];

    for (const pattern of patterns) {
      const match = this.text.match(pattern);
      if (match) {
        this.data.fullName = match[1]?.trim() || match[0].trim();
        return;
      }
    }

    // Fallback: Find lines with Thai title words
    const thaiTitleMatch = this.lines.find(line => 
      /^(นาย|นาง|นางสาว|Miss|Mr|Ms|Mrs)\b/i.test(line)
    );
    if (thaiTitleMatch) {
      this.data.fullName = thaiTitleMatch;
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // ID Card Extraction (Thai)
  // ──────────────────────────────────────────────────────────────────────────

  extractIDCard() {
    // Thai ID: 13 digits with optional dashes/spaces
    const patterns = [
      /(?:เลขบัตร|บัตรประชาชน|ID\s*Card|ID\s*No)[:\s]*([0-9]{1,3}[-\s]?[0-9]{4,5}[-\s]?[0-9]{4,5}[-\s]?[0-9]{4,5}[-\s]?[0-9])/i,
      /\b([0-9]{13})\b/,
      /\b([0-9]{1,3}[-\s][0-9]{4,5}[-\s][0-9]{4,5}[-\s][0-9]{4,5}[-\s][0-9])\b/,
    ];

    for (const pattern of patterns) {
      const match = this.text.match(pattern);
      if (match) {
        this.data.idCard = match[1]?.replace(/[-\s]/g, '') || match[0].replace(/[-\s]/g, '');
        return;
      }
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Passport Number Extraction
  // ──────────────────────────────────────────────────────────────────────────

  extractPassport() {
    const patterns = [
      /(?:หนังสือเดินทาง|พาสปอร์ต|Passport\s*No|Passport\s*Number)[:\s]*([A-Z0-9]{6,12})/i,
      /\b([A-Z][0-9]{8})\b/,  // Common passport format
      /\b([A-Z]{2}[0-9]{7})\b/,  // Another common format
    ];

    for (const pattern of patterns) {
      const match = this.text.match(pattern);
      if (match) {
        this.data.passportNumber = match[1]?.trim();
        return;
      }
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Date Extraction
  // ──────────────────────────────────────────────────────────────────────────

  extractDate() {
    // Check-in date
    const checkinPatterns = [
      /(?:วันที่เข้าพัก|Check-?in|วันที่เข้า)[:\s]*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i,
      /(?:Check-?in\s*Date)[:\s]*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i,
    ];

    for (const pattern of checkinPatterns) {
      const match = this.text.match(pattern);
      if (match) {
        this.data.checkInDate = match[1]?.trim();
        break;
      }
    }

    // Check-out date
    const checkoutPatterns = [
      /(?:วันที่ออก|Check-?out|วันที่ออก)[:\s]*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i,
      /(?:Check-?out\s*Date)[:\s]*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i,
    ];

    for (const pattern of checkoutPatterns) {
      const match = this.text.match(pattern);
      if (match) {
        this.data.checkOutDate = match[1]?.trim();
        break;
      }
    }

    // Date of form
    const datePatterns = [
      /(?:วันที่|Date)[:\s]*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i,
    ];

    for (const pattern of datePatterns) {
      const match = this.text.match(pattern);
      if (match && !this.data.checkInDate) {
        this.data.formDate = match[1]?.trim();
        break;
      }
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Room Number Extraction
  // ──────────────────────────────────────────────────────────────────────────

  extractRoomNumber() {
    const patterns = [
      /(?:หมายเลขห้อง|เลขห้อง|Room\s*No|Room\s*Number)[:\s]*([A-Z0-9-]+)/i,
      /(?:ห้อง)[:\s]*([A-Z0-9-]+)/i,
    ];

    for (const pattern of patterns) {
      const match = this.text.match(pattern);
      if (match) {
        this.data.roomNumber = match[1]?.trim();
        return;
      }
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Guest Count Extraction
  // ──────────────────────────────────────────────────────────────────────────

  extractGuestCount() {
    const patterns = [
      /(?:จำนวน|จำนวนผู้เข้าพัก|Guests?|Number\s*of\s*Guests)[:\s]*(\d+)/i,
      /(?:ผู้ใหญ่)[:\s]*(\d+)/i,
      /(?:เด็ก)[:\s]*(\d+)/i,
    ];

    for (const pattern of patterns) {
      const match = this.text.match(pattern);
      if (match) {
        const key = pattern.source.includes('ผู้ใหญ่') ? 'adults' :
                    pattern.source.includes('เด็ก') ? 'children' : 'guestCount';
        this.data[key] = parseInt(match[1]);
      }
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Nationality Extraction
  // ──────────────────────────────────────────────────────────────────────────

  extractNationality() {
    const patterns = [
      /(?:สัญชาติ|Nationality)[:\s]*([^\n]+)/i,
    ];

    for (const pattern of patterns) {
      const match = this.text.match(pattern);
      if (match) {
        this.data.nationality = match[1]?.trim();
        return;
      }
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Phone Number Extraction
  // ──────────────────────────────────────────────────────────────────────────

  extractPhoneNumber() {
    const patterns = [
      /(?:โทรศัพท์|โทร|Phone|Tel|Mobile|มือถือ)[:\s]*([\d\s\-+()]{7,15})/i,
      /\b(\d{3}[-\s]?\d{3}[-\s]?\d{4})\b/,
      /\b(\d{10})\b/,
      /\b(\d{9})\b/,
    ];

    for (const pattern of patterns) {
      const match = this.text.match(pattern);
      if (match) {
        this.data.phoneNumber = match[1]?.trim();
        return;
      }
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Email Extraction
  // ──────────────────────────────────────────────────────────────────────────

  extractEmail() {
    const pattern = /\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/;
    const match = this.text.match(pattern);
    if (match) {
      this.data.email = match[1];
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Address Extraction
  // ──────────────────────────────────────────────────────────────────────────

  extractAddress() {
    const patterns = [
      /(?:ที่อยู่|Address)[:\s]*([^\n]+)/i,
    ];

    for (const pattern of patterns) {
      const match = this.text.match(pattern);
      if (match) {
        this.data.address = match[1]?.trim();
        return;
      }
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Signature Detection
  // ──────────────────────────────────────────────────────────────────────────

  extractSignature() {
    const patterns = [
      /(?:ลายเซ็น|ลายมือชื่อ|Signature|ลงชื่อ)[:\s]*(.+)?/i,
    ];

    for (const pattern of patterns) {
      const match = this.text.match(pattern);
      if (match) {
        this.data.hasSignature = true;
        if (match[1]) {
          this.data.signatureName = match[1].trim();
        }
        return;
      }
    }
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Hotel Check-in Form Scanner
// ──────────────────────────────────────────────────────────────────────────────

class HotelCheckInScanner {
  constructor() {
    this.config = { ...CONFIG };
  }

  async scanForm(input, options = {}) {
    const scanOptions = { ...this.config, ...options };

    console.log('\n' + '╔═══════════════════════════════════════════════════╗');
    console.log('║     🏨 Hotel Check-in Form OCR Scanner v1.0.0          ║');
    console.log('╚═══════════════════════════════════════════════════╝');
    console.log('\n📄 กำลังสแกนแบบฟอร์มผู้เข้าพัก...');
    console.log(`📁 ไฟล์: ${input}`);
    console.log(`🌐 ภาษา: ${scanOptions.language}`);
    console.log('⏳ กรุณารอสักครู่...\n');

    try {
      // Perform OCR
      const startTime = Date.now();
      const ocrResult = await ocrSpace(input, {
        apiKey: scanOptions.apiKey,
        language: scanOptions.language,
        OCREngine: scanOptions.engine,
        timeout: scanOptions.timeout,
        maxRetries: scanOptions.maxRetries,
        isOverlayRequired: true,
      });
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);

      const rawText = getParsedText(ocrResult);

      console.log('✅ OCR สำเร็จ!');
      console.log(`⏱️  ใช้เวลา: ${duration} วินาที`);

      // Extract data
      const extractor = new FormDataExtractor(rawText);
      const extractedData = extractor.extract();

      // Display results
      this.displayResults(extractedData, rawText);

      return {
        success: true,
        data: extractedData,
        rawText,
        ocrResult,
        duration,
      };

    } catch (error) {
      console.log('\n❌ เกิดข้อผิดพลาด!');
      console.error(error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  displayResults(data, rawText) {
    console.log('\n' + '═'.repeat(60));
    console.log('  📋 ผลการสแกนแบบฟอร์มผู้เข้าพัก');
    console.log('═'.repeat(60));

    const fields = [
      { key: 'fullName', label: '👤 ชื่อผู้เข้าพัก', icon: '👤' },
      { key: 'idCard', label: '🆔 เลขบัตรประชาชน', icon: '🆔' },
      { key: 'passportNumber', label: '🛂 หมายเลขพาสปอร์ต', icon: '🛂' },
      { key: 'nationality', label: '🌍 สัญชาติ', icon: '🌍' },
      { key: 'checkInDate', label: '📅 วันที่เข้าพัก', icon: '📅' },
      { key: 'checkOutDate', label: '📅 วันที่ออก', icon: '📅' },
      { key: 'formDate', label: '📅 วันที่บันทึก', icon: '📅' },
      { key: 'roomNumber', label: '🚪 หมายเลขห้อง', icon: '🚪' },
      { key: 'guestCount', label: '👥 จำนวนผู้เข้าพัก', icon: '👥' },
      { key: 'adults', label: '👨 ผู้ใหญ่', icon: '👨' },
      { key: 'children', label: '👶 เด็ก', icon: '👶' },
      { key: 'phoneNumber', label: '📞 โทรศัพท์', icon: '📞' },
      { key: 'email', label: '📧 อีเมล', icon: '📧' },
      { key: 'address', label: '🏠 ที่อยู่', icon: '🏠' },
      { key: 'hasSignature', label: '✍️ ลายเซ็น', icon: '✍️' },
    ];

    let foundCount = 0;

    for (const field of fields) {
      const value = data[field.key];
      if (value !== undefined && value !== null) {
        foundCount++;
        const displayValue = typeof value === 'boolean' ? (value ? '✅ มี' : '❌ ไม่มี') : value;
        console.log(`  ${field.icon} ${field.label}: ${displayValue}`);
      }
    }

    console.log('─'.repeat(60));
    console.log(`  📊 ตรวจพบข้อมูล: ${foundCount}/${fields.length} ฟิลด์`);
    console.log('═'.repeat(60));

    // Show raw text if needed
    if (foundCount === 0) {
      console.log('\n📝 ข้อความดิบที่อ่านได้:');
      console.log('─'.repeat(60));
      console.log(rawText);
      console.log('─'.repeat(60));
      console.log('\n💡 แนะนำ:');
      console.log('   - ตรวจสอบความชัดเจนของรูป');
        console.log('   - ใช้ Engine 2 หรือ 3 สำหรับความแม่นยำสูงกว่า');
      console.log('   - เพิ่มขนาดรูปภาพก่อนสแกน');
    }
  }

  async exportToJSON(result, outputPath = null) {
    const output = {
      scannedAt: new Date().toISOString(),
      type: 'hotel_checkin_form',
      data: result.data,
      rawText: result.rawText,
      duration: result.duration,
      success: result.success,
    };

    const fileName = outputPath || `./ocr-output/hotel-checkin-${Date.now()}.json`;
    await fs.mkdir(path.dirname(fileName), { recursive: true }).catch(() => {});
    await fs.writeFile(fileName, JSON.stringify(output, null, 2), 'utf-8');

    console.log(`\n💾 บันทึก JSON ที่: ${fileName}`);
    return fileName;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Demo Mode (with sample data)
// ──────────────────────────────────────────────────────────────────────────────

function demoMode() {
  console.log('\n' + '═'.repeat(60));
  console.log('  🏨 Hotel Check-in Form OCR - Demo Mode');
  console.log('═'.repeat(60));

  const sampleText = `
แบบฟอร์มผู้เข้าพักโรงแรม

วันที่: 15/03/2025

ชื่อ: นายสมชาย ใจดี
เลขบัตรประชาชน: 1-2345-67890-12-3
สัญชาติ: ไทย

วันที่เข้าพัก: 15/03/2025
วันที่ออก: 18/03/2025

หมายเลขห้อง: 305
จำนวนผู้เข้าพัก: 2
ผู้ใหญ่: 2
เด็ก: 0

โทรศัพท์: 081-234-5678
อีเมล: somchai@email.com

ที่อยู่: 123 ถ.สุขุมวิท แขวงคลองเตย เขตคลองเตย กรุงเทพฯ 10110

ลายเซ็น: นายสมชาย ใจดี
  `;

  console.log('\n📝 ตัวอย่างข้อความที่จะอ่านได้:');
  console.log('─'.repeat(60));
  console.log(sampleText);
  console.log('─'.repeat(60));

  console.log('\n🔍 กำลังแยกข้อมูล...\n');

  const extractor = new FormDataExtractor(sampleText);
  const extracted = extractor.extract();

  const scanner = new HotelCheckInScanner();
  scanner.displayResults(extracted, sampleText);

  return extracted;
}

// ──────────────────────────────────────────────────────────────────────────────
// Main Entry Point
// ──────────────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    // Show usage
    console.log('\n' + '╔═══════════════════════════════════════════════════╗');
    console.log('║     🏨 Hotel Check-in Form OCR Scanner v1.0.0          ║');
    console.log('╚═══════════════════════════════════════════════════╝');
    console.log(`
วิธีใช้งาน:
  node hotel-checkin.js <image_path> [options]

ตัวเลือก:
  <input>              พาธไฟล์รูปภาพของแบบฟอร์ม
  --lang <language>    ภาษา (tha, eng, auto) - ค่าเริ่มต้น: tha
  --engine <1|2|3>     OCR engine - ค่าเริ่มต้น: 2
  --key <api_key>      API key
  --output <file>      บันทึกผลลัพธ์เป็น JSON
  --demo               แสดงตัวอย่าง

ตัวอย่าง:
  node hotel-checkin.js ./checkin-form.png
  node hotel-checkin.js ./form.jpg --lang tha --engine 2
  node hotel-checkin.js ./passport.png --output result.json
  node hotel-checkin.js --demo
    `);

    // Run demo
    console.log('\n🎬 กำลังแสดงตัวอย่าง...\n');
    demoMode();
    return;
  }

  const scanner = new HotelCheckInScanner();

  // Parse arguments
  let input = null;
  let output = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--lang':
      case '-l':
        scanner.config.language = args[++i];
        break;
      case '--engine':
      case '-e':
        scanner.config.engine = args[++i];
        break;
      case '--key':
      case '-k':
        scanner.config.apiKey = args[++i];
        break;
      case '--output':
      case '-o':
        output = args[++i];
        break;
      case '--demo':
        demoMode();
        return;
      default:
        if (!arg.startsWith('--')) {
          input = arg;
        }
    }
  }

  if (!input) {
    console.log('❌ ต้องระบุไฟล์รูปภาพ');
    process.exit(1);
  }

  // Scan
  const result = await scanner.scanForm(input);

  if (result.success && output) {
    await scanner.exportToJSON(result, output);
  }

  if (!result.success) {
    process.exit(1);
  }
}

main().catch(console.error);

// ──────────────────────────────────────────────────────────────────────────────
// Exports
// ──────────────────────────────────────────────────────────────────────────────

module.exports = {
  HotelCheckInScanner,
  FormDataExtractor,
  demoMode,
};
