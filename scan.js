#!/usr/bin/env node
/**
 * OCR Scanner - Comprehensive Edition
 * 
 * A fully-featured OCR scanning tool with:
 * - Interactive menu system
 * - Multi-file support
 * - Batch processing
 * - Export to TXT, JSON, CSV
 * - Image validation
 * - Progress tracking
 * - History log
 * - Configuration management
 * 
 * @version 3.0.0
 */

const {
  ocrSpace,
  ocrSpaceBatch,
  detectInput,
  getParsedText,
  getTextOverlay,
  OCRFileNotFoundError,
  OCRApiError,
  OCRProcessingError,
  OCRRateLimitError,
  OCRTimeoutError,
  OCRInvalidInputError,
} = require('./index.js');

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

// ──────────────────────────────────────────────────────────────────────────────
// Configuration
// ──────────────────────────────────────────────────────────────────────────────

const CONFIG_FILE = path.join(__dirname, '.ocr-config.json');
const HISTORY_FILE = path.join(__dirname, '.ocr-history.json');

const DEFAULT_CONFIG = {
  apiKey: 'helloworld',
  language: 'eng',
  ocrEngine: '1',
  timeout: 30000,
  maxRetries: 3,
  outputDir: './ocr-output',
  saveHistory: true,
  verbose: true,
};

const LANGUAGES = {
  'eng': 'English',
  'tha': 'ไทย (Thai)',
  'jpn': '日本語 (Japanese)',
  'kor': '한국어 (Korean)',
  'chs': '中文简体 (Chinese Simplified)',
  'cht': '中文繁體 (Chinese Traditional)',
  'ara': 'العربية (Arabic)',
  'fre': 'Français (French)',
  'ger': 'Deutsch (German)',
  'spa': 'Español (Spanish)',
  'ita': 'Italiano (Italian)',
  'por': 'Português (Portuguese)',
  'rus': 'Русский (Russian)',
  'vie': 'Tiếng Việt (Vietnamese)',
  'auto': 'Auto-detect (Engine 2+)',
};

// ──────────────────────────────────────────────────────────────────────────────
// Utility Functions
// ──────────────────────────────────────────────────────────────────────────────

class Utils {
  static clearScreen() {
    process.stdout.write('\x1Bc');
  }

  static sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  static formatDate(date = new Date()) {
    return date.toLocaleString('th-TH', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }

  static formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  static getTimestamp() {
    const now = new Date();
    return now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  }

  static async ensureDir(dirPath) {
    try {
      await fs.mkdir(dirPath, { recursive: true });
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
    }
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Configuration Manager
// ──────────────────────────────────────────────────────────────────────────────

class ConfigManager {
  static async load() {
    try {
      const data = await fs.readFile(CONFIG_FILE, 'utf-8');
      return { ...DEFAULT_CONFIG, ...JSON.parse(data) };
    } catch {
      return { ...DEFAULT_CONFIG };
    }
  }

  static async save(config) {
    await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
  }

  static async update(key, value) {
    const config = await this.load();
    config[key] = value;
    await this.save(config);
    return config;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// History Manager
// ──────────────────────────────────────────────────────────────────────────────

class HistoryManager {
  static async add(entry) {
    const config = await ConfigManager.load();
    if (!config.saveHistory) return;

    try {
      const data = await fs.readFile(HISTORY_FILE, 'utf-8');
      const history = JSON.parse(data);
      history.unshift(entry);
      // Keep only last 50 entries
      if (history.length > 50) history.length = 50;
      await fs.writeFile(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf-8');
    } catch {
      await fs.writeFile(HISTORY_FILE, JSON.stringify([entry], null, 2), 'utf-8');
    }
  }

  static async view() {
    try {
      const data = await fs.readFile(HISTORY_FILE, 'utf-8');
      const history = JSON.parse(data);
      
      if (history.length === 0) {
        console.log('\n📋 ไม่มีประวัติการใช้งาน');
        return [];
      }

      console.log('\n📋 ประวัติการใช้งาน (ล่าสุด 50 รายการ)');
      console.log('═'.repeat(70));
      
      history.forEach((item, index) => {
        const status = item.success ? '✅' : '❌';
        console.log(`${status} [${item.timestamp}] ${item.input}`);
        if (item.language) console.log(`   🌐 ภาษา: ${item.language}`);
        if (item.success && item.textLength !== undefined) {
          console.log(`   📝 อ่านได้ ${item.textLength} ตัวอักษร`);
        }
        if (item.error) console.log(`   ❌ Error: ${item.error}`);
        console.log('─'.repeat(70));
      });

      return history;
    } catch {
      console.log('\n📋 ไม่มีประวัติการใช้งาน');
      return [];
    }
  }

  static async clear() {
    try {
      await fs.unlink(HISTORY_FILE);
      console.log('\n✅ ลบประวัติการใช้งานแล้ว');
    } catch {
      console.log('\nℹ️  ไม่มีประวัติที่จะลบ');
    }
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Output Manager
// ──────────────────────────────────────────────────────────────────────────────

class OutputManager {
  static async exportResults(results, format, outputPath = null) {
    const config = await ConfigManager.load();
    await Utils.ensureDir(config.outputDir);

    const timestamp = Utils.getTimestamp();
    const fileName = outputPath || path.join(config.outputDir, `ocr-result-${timestamp}.${format}`);

    switch (format.toLowerCase()) {
      case 'txt':
        await this.exportTXT(results, fileName);
        break;
      case 'json':
        await this.export_JSON(results, fileName);
        break;
      case 'csv':
        await this.exportCSV(results, fileName);
        break;
      default:
        throw new Error(`Unsupported format: ${format}`);
    }

    console.log(`\n💾 บันทึกผลลัพธ์ที่: ${fileName}`);
    return fileName;
  }

  static async exportTXT(results, fileName) {
    let content = `OCR Scan Results - ${Utils.formatDate()}\n`;
    content += '='.repeat(50) + '\n\n';

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        content += `📄 File ${index + 1}: ${result.input}\n`;
        content += '-'.repeat(50) + '\n';
        content += getParsedText(result.value) + '\n\n';
      } else {
        content += `❌ File ${index + 1}: ${result.input} - ${result.reason.message}\n\n`;
      }
    });

    await fs.writeFile(fileName, content, 'utf-8');
  }

  static async export_JSON(results, fileName) {
    const output = {
      scannedAt: Utils.formatDate(),
      totalFiles: results.length,
      successful: results.filter(r => r.status === 'fulfilled').length,
      failed: results.filter(r => r.status === 'rejected').length,
      results: results.map((r, i) => ({
        file: r.input,
        status: r.status,
        text: r.status === 'fulfilled' ? getParsedText(r.value) : null,
        error: r.status === 'rejected' ? r.reason.message : null,
        rawData: r.status === 'fulfilled' ? r.value : null,
      })),
    };

    await fs.writeFile(fileName, JSON.stringify(output, null, 2), 'utf-8');
  }

  static async exportCSV(results, fileName) {
    let csv = 'File,Status,Text,Error\n';

    results.forEach((r) => {
      const file = `"${r.input.replace(/"/g, '""')}"`;
      const status = r.status;
      const text = r.status === 'fulfilled' 
        ? `"${getParsedText(r.value).replace(/"/g, '""').replace(/\n/g, '\\n')}"` 
        : '';
      const error = r.status === 'rejected' 
        ? `"${r.reason.message.replace(/"/g, '""')}"` 
        : '';

      csv += `${file},${status},${text},${error}\n`;
    });

    await fs.writeFile(fileName, csv, 'utf-8');
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Scanner
// ──────────────────────────────────────────────────────────────────────────────

class OCRScanner {
  constructor() {
    this.config = null;
    this.results = [];
  }

  async init() {
    this.config = await ConfigManager.load();
  }

  async scanSingle(input, options = {}) {
    const scanOptions = { ...this.config, ...options };
    const startTime = Date.now();

    console.log(`\n📷 กำลังสแกน: ${input}`);
    if (scanOptions.language) console.log(`🌐 ภาษา: ${scanOptions.language} (${LANGUAGES[scanOptions.language] || scanOptions.language})`);
    console.log(`🔧 Engine: ${scanOptions.ocrEngine}`);
    console.log('⏳ กรุณารอสักครู่...\n');

    // Show progress
    const progressBar = new ProgressBar();
    
    try {
      const result = await ocrSpace(input, {
        apiKey: scanOptions.apiKey,
        language: scanOptions.language,
        OCREngine: scanOptions.ocrEngine,
        timeout: scanOptions.timeout,
        maxRetries: scanOptions.maxRetries,
        onProgress: (e) => progressBar.update(e.loaded, e.total),
      });

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      const text = getParsedText(result);

      console.log('\n✅ สแกนสำเร็จ!');
      console.log(`⏱️  ใช้เวลา: ${duration} วินาที`);
      console.log(`📝 อ่านได้ ${text.length} ตัวอักษร`);

      // Save to history
      await HistoryManager.add({
        timestamp: Utils.formatDate(),
        input,
        language: scanOptions.language,
        success: true,
        textLength: text.length,
        duration,
      });

      return { status: 'fulfilled', input, value: result };

    } catch (error) {
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);

      console.log('\n❌ เกิดข้อผิดพลาด!');
      this.handleError(error);

      // Save to history
      await HistoryManager.add({
        timestamp: Utils.formatDate(),
        input,
        language: scanOptions.language,
        success: false,
        error: error.message,
        duration,
      });

      return { status: 'rejected', input, reason: error };
    }
  }

  async scanMultiple(inputs, options = {}, batchOptions = {}) {
    const scanOptions = { ...this.config, ...options };

    console.log(`\n📦 กำลังสแกน ${inputs.length} ไฟล์...`);
    console.log(`📁 ไฟล์:`);
    inputs.forEach((input, i) => console.log(`   ${i + 1}. ${input}`));
    console.log('');

    const startTime = Date.now();
    const results = await ocrSpaceBatch(inputs, scanOptions, batchOptions);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    const successCount = results.filter(r => r.status === 'fulfilled').length;
    const failCount = results.filter(r => r.status === 'rejected').length;

    console.log('\n📊 สรุปผล:');
    console.log(`✅ สำเร็จ: ${successCount} ไฟล์`);
    console.log(`❌ ล้มเหลว: ${failCount} ไฟล์`);
    console.log(`⏱️  ใช้เวลา: ${duration} วินาที`);

    return results;
  }

  handleError(error) {
    if (error instanceof OCRFileNotFoundError) {
      console.log('📁 ไฟล์ไม่พบ:', error.filePath);
    } else if (error instanceof OCRApiError) {
      console.log('🔌 API Error:', error.message);
      if (error.errorDetails.length > 0) {
        console.log('📋 รายละเอียด:', error.errorDetails);
      }
    } else if (error instanceof OCRRateLimitError) {
      console.log('⏰ Rate limit exceeded');
      if (error.retryAfter) {
        console.log(`⏳ ลองอีกครั้งใน ${error.retryAfter} วินาที`);
      }
    } else if (error instanceof OCRTimeoutError) {
      console.log(`⏱️  หมดเวลาหลังจาก ${error.timeout}ms`);
    } else if (error instanceof OCRInvalidInputError) {
      console.log('🚫 Input ไม่ถูกต้อง:', error.message);
    } else {
      console.log('❌ Error:', error.message);
    }
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Progress Bar
// ──────────────────────────────────────────────────────────────────────────────

class ProgressBar {
  constructor(width = 30) {
    this.width = width;
    this.current = 0;
    this.total = 0;
  }

  update(loaded, total) {
    if (total === 0) return;
    this.current = loaded;
    this.total = total;
    const percent = Math.min(100, Math.round((loaded / total) * 100));
    const filled = Math.round((this.width * percent) / 100);
    const empty = this.width - filled;
    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    process.stdout.write(`\r📊 [${bar}] ${percent}% (${Utils.formatFileSize(loaded)}/${Utils.formatFileSize(total)})`);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Interactive Menu
// ──────────────────────────────────────────────────────────────────────────────

class InteractiveMenu {
  constructor() {
    this.scanner = new OCRScanner();
    this.running = true;
  }

  async start() {
    await this.scanner.init();
    
    Utils.clearScreen();
    this.showBanner();
    
    while (this.running) {
      console.log('\n' + '═'.repeat(50));
      console.log('  📷 OCR Scanner - Main Menu');
      console.log('═'.repeat(50));
      console.log('  1. 📷 สแกนรูปภาพ');
      console.log('  2. 📦 สแกนหลายรูป (Batch)');
      console.log('  3. ⚙️  ตั้งค่า');
      console.log('  4. 📋 ดูประวัติ');
      console.log('  5. 🗑️  ลบประวัติ');
      console.log('  6. ❓ วิธีใช้งาน');
      console.log('  0. 🚪 ออก');
      console.log('═'.repeat(50));

      const choice = await this.ask('\n👉 เลือก: ');

      switch (choice) {
        case '1':
          await this.scanSingle();
          break;
        case '2':
          await this.scanBatch();
          break;
        case '3':
          await this.settings();
          break;
        case '4':
          await HistoryManager.view();
          break;
        case '5':
          await HistoryManager.clear();
          break;
        case '6':
          this.showHelp();
          break;
        case '0':
          this.running = false;
          console.log('\n👋 ขอบคุณที่ใช้ OCR Scanner!');
          break;
        default:
          console.log('\n❌ เลือกไม่ถูกต้อง');
      }

      if (this.running) {
        await Utils.sleep(500);
        Utils.clearScreen();
        this.showBanner();
      }
    }
  }

  showBanner() {
    console.log('\n' + '╔═══════════════════════════════════════════════════╗');
    console.log('║         📷  OCR Scanner v3.0.0 Enhanced  📷           ║');
    console.log('║                                                       ║');
    console.log('║   รองรับ: รูปภาพ, PDF, URL, Base64                    ║');
    console.log('║   ภาษา: อังกฤษ, ไทย, ญี่ปุ่น, จีน และอื่นๆ           ║');
    console.log('╚═══════════════════════════════════════════════════╝');
  }

  async scanSingle() {
    console.log('\n' + '─'.repeat(50));
    console.log('  📷 สแกนรูปภาพ');
    console.log('─'.repeat(50));

    const input = await this.ask('\n📁 พาธรูปภาพหรือ URL: ');
    if (!input) {
      console.log('❌ ต้องระบุ input');
      return;
    }

    const langChoice = await this.ask('\n🌐 ภาษา (กด Enter ใช้ค่าเริ่มต้น: ' + this.scanner.config.language + '): ');
    const language = langChoice || this.scanner.config.language;

    const result = await this.scanner.scanSingle(input, { language });

    if (result.status === 'fulfilled') {
      const text = getParsedText(result.value);
      
      console.log('\n' + '═'.repeat(50));
      console.log('  📝 ผลลัพธ์:');
      console.log('═'.repeat(50));
      console.log(text);
      console.log('═'.repeat(50));

      // Ask to save
      const saveChoice = await this.ask('\n💾 บันทึกผลลัพธ์? (txt/json/csv/ไม่): ');
      if (['txt', 'json', 'csv'].includes(saveChoice.toLowerCase())) {
        const outputPath = await this.ask('📁 ชื่อไฟล์ (กด Enter ใช้ค่าเริ่มต้น): ');
        await OutputManager.exportResults([result], saveChoice, outputPath || undefined);
      }
    }
  }

  async scanBatch() {
    console.log('\n' + '─'.repeat(50));
    console.log('  📦 สแกนหลายรูป (Batch)');
    console.log('─'.repeat(50));
    console.log('\n💡 คั่นแต่ละไฟล์ด้วยเครื่องหมายจุลภาค (,)');
    console.log('   หรือขึ้นบรรทัดใหม่แต่ละไฟล์');

    const input = await this.ask('\n📁 รายการไฟล์: ');
    if (!input) {
      console.log('❌ ต้องระบุไฟล์');
      return;
    }

    // Parse inputs (support both comma and newline separated)
    const inputs = input
      .split(/[\n,]+/)
      .map(s => s.trim())
      .filter(s => s.length > 0);

    if (inputs.length === 0) {
      console.log('❌ ไม่พบไฟล์ที่ถูกต้อง');
      return;
    }

    const langChoice = await this.ask('\n🌐 ภาษา (Enter = ' + this.scanner.config.language + '): ');
    const language = langChoice || this.scanner.config.language;

    const concurrency = parseInt(await this.ask('🔢 จำนวนพร้อมกัน (Enter = 3): ') || '3');

    const results = await this.scanner.scanMultiple(inputs, { language }, { concurrency });

    // Show results
    console.log('\n' + '═'.repeat(50));
    console.log('  📝 ผลลัพธ์:');
    console.log('═'.repeat(50));

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        console.log(`\n✅ [${index + 1}] ${result.input}`);
        console.log('─'.repeat(50));
        console.log(getParsedText(result.value));
      } else {
        console.log(`\n❌ [${index + 1}] ${result.input}: ${result.reason.message}`);
      }
    });

    // Ask to save
    const saveChoice = await this.ask('\n\n💾 บันทึกผลลัพธ์? (txt/json/csv/ไม่): ');
    if (['txt', 'json', 'csv'].includes(saveChoice.toLowerCase())) {
      await OutputManager.exportResults(results, saveChoice);
    }
  }

  async settings() {
    console.log('\n' + '─'.repeat(50));
    console.log('  ⚙️  ตั้งค่า');
    console.log('─'.repeat(50));

    const config = await ConfigManager.load();

    console.log('\n📋 การตั้งค่าปัจจุบัน:');
    console.log(`  API Key: ${config.apiKey === 'helloworld' ? 'helloworld (default)' : '********'}`);
    console.log(`  ภาษา: ${config.language} (${LANGUAGES[config.language] || config.language})`);
    console.log(`  Engine: ${config.ocrEngine}`);
    console.log(`  Timeout: ${config.timeout}ms`);
    console.log(`  Max Retries: ${config.maxRetries}`);
    console.log(`  Output Dir: ${config.outputDir}`);
    console.log(`  Save History: ${config.saveHistory ? '✅' : '❌'}`);

    console.log('\n\n1. เปลี่ยน API Key');
    console.log('2. เปลี่ยนภาษา');
    console.log('3. เปลี่ยน OCR Engine');
    console.log('4. เปลี่ยน Timeout');
    console.log('5. เปลี่ยน Output Directory');
    console.log('6. เปิด/ปิด Save History');
    console.log('0. กลับ');

    const choice = await this.ask('\n👉 เลือก: ');

    switch (choice) {
      case '1': {
        const apiKey = await this.ask('🔑 API Key ใหม่: ');
        if (apiKey) await ConfigManager.update('apiKey', apiKey);
        break;
      }
      case '2': {
        console.log('\n📋 ภาษาที่รองรับ:');
        Object.entries(LANGUAGES).forEach(([code, name]) => {
          console.log(`  ${code.padEnd(5)} - ${name}${code === config.language ? ' ✅' : ''}`);
        });
        const lang = await this.ask('\n🌐 เลือกภาษา: ');
        if (lang) await ConfigManager.update('language', lang);
        break;
      }
      case '3': {
        const engine = await this.ask('🔧 OCR Engine (1/2/3): ');
        if (['1', '2', '3'].includes(engine)) await ConfigManager.update('ocrEngine', engine);
        break;
      }
      case '4': {
        const timeout = parseInt(await this.ask('⏱️  Timeout (ms): '));
        if (timeout > 0) await ConfigManager.update('timeout', timeout);
        break;
      }
      case '5': {
        const outputDir = await this.ask('📁 Output Directory: ');
        if (outputDir) await ConfigManager.update('outputDir', outputDir);
        break;
      }
      case '6': {
        const current = config.saveHistory;
        await ConfigManager.update('saveHistory', !current);
        console.log(`\n✅ Save History: ${!current ? 'เปิด' : 'ปิด'}`);
        break;
      }
    }

    console.log('\n✅ บันทึกการตั้งค่าแล้ว');
  }

  showHelp() {
    console.log('\n' + '─'.repeat(50));
    console.log('  ❓ วิธีใช้งาน');
    console.log('─'.repeat(50));
    console.log(`
📷 สแกนรูปภาพ:
  - ใส่พาธไฟล์ (เช่น ./image.png)
  - หรือ URL (เช่น https://example.com/image.jpg)
  - รองรับการสแกนจาก Base64 data URI

📦 สแกนหลายรูป:
  - คั่นไฟล์ด้วยเครื่องหมายจุลภาค (,)
  - หรือขึ้นบรรทัดใหม่แต่ละไฟล์
  - ตั้งค่าจำนวนที่ประมวลผลพร้อมกันได้

⚙️ ตั้งค่า:
  - API Key: สมัครฟรีที่ https://ocr.space/ocrapi
  - ภาษา: tha (ไทย), eng (อังกฤษ), jpn (ญี่ปุ่น) ฯลฯ
  - Engine 1: รวดเร็ว, Engine 2: แม่นยำกว่า, Engine 3: ล่าสุด

📋 ผลลัพธ์:
  - TXT: ข้อความล้วน
  - JSON: ข้อมูลครบถ้วน (รวม raw data)
  - CSV: สำหรับนำไปใช้ใน Excel

💡 เคล็ดลับ:
  - ใช้ Engine 2 พร้อม language: 'auto' เพื่อตรวจจับภาษาอัตโนมัติ
  - สำหรับเอกสารภาษาไทย ใช้ language: 'tha' และ OCREngine: '2'
  - API key 'helloworld' จำกัด 10 requests/10 นาที
    `);
  }

  ask(question) {
    return new Promise((resolve) => {
      process.stdout.write(question);
      process.stdin.once('data', (data) => {
        resolve(data.toString().trim());
      });
    });
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Command Line Interface
// ──────────────────────────────────────────────────────────────────────────────

class CLI {
  static async run(args) {
    const scanner = new OCRScanner();
    await scanner.init();

    // Check for interactive mode
    if (args.length === 0) {
      const menu = new InteractiveMenu();
      await menu.start();
      return;
    }

    // Command-line mode
    const options = {
      input: null,
      language: scanner.config.language,
      engine: scanner.config.ocrEngine,
      apiKey: scanner.config.apiKey,
      output: null,
      format: 'txt',
      batch: false,
      concurrency: 3,
      verbose: scanner.config.verbose,
    };

    // Parse arguments
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      switch (arg) {
        case '--lang':
        case '-l':
          options.language = args[++i];
          break;
        case '--engine':
        case '-e':
          options.engine = args[++i];
          break;
        case '--key':
        case '-k':
          options.apiKey = args[++i];
          break;
        case '--output':
        case '-o':
          options.output = args[++i];
          break;
        case '--format':
        case '-f':
          options.format = args[++i];
          break;
        case '--batch':
        case '-b':
          options.batch = true;
          break;
        case '--concurrency':
        case '-c':
          options.concurrency = parseInt(args[++i]);
          break;
        case '--help':
        case '-h':
          CLI.showHelp();
          process.exit(0);
        default:
          if (!arg.startsWith('--')) {
            options.input = arg;
          }
      }
    }

    if (!options.input) {
      console.log('❌ ต้องระบุ input');
      console.log('   ใช้ --help เพื่อดูวิธีใช้งาน');
      process.exit(1);
    }

    if (options.batch) {
      // Batch mode
      const inputs = options.input.split(/[\n,]+/).map(s => s.trim()).filter(s => s);
      const results = await scanner.scanMultiple(inputs, {
        language: options.language,
        OCREngine: options.engine,
        apiKey: options.apiKey,
      }, {
        concurrency: options.concurrency,
      });

      if (options.output) {
        await OutputManager.exportResults(results, options.format, options.output);
      }

      // Print results
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          console.log(`\n✅ [${index + 1}] ${result.input}`);
          console.log(getParsedText(result.value));
        } else {
          console.error(`\n❌ [${index + 1}] ${result.input}: ${result.reason.message}`);
        }
      });

    } else {
      // Single mode
      const result = await scanner.scanSingle(options.input, {
        language: options.language,
        OCREngine: options.engine,
        apiKey: options.apiKey,
      });

      if (result.status === 'fulfilled') {
        console.log(getParsedText(result.value));

        if (options.output) {
          await OutputManager.exportResults([result], options.format, options.output);
        }
      } else {
        console.error('❌', result.reason.message);
        process.exit(1);
      }
    }
  }

  static showHelp() {
    console.log(`
📷 OCR Scanner v3.0.0 - Comprehensive OCR Tool

วิธีใช้งาน:
  node scan.js [options] <input>
  node scan.js  (interactive mode)

ตัวเลือก:
  <input>                  พาธไฟล์หรือ URL
  --lang, -l <language>    ระบุภาษา (tha, eng, jpn, ฯลฯ)
  --engine, -e <1|2|3>     ระบุ OCR engine
  --key, -k <api_key>      ระบุ API key
  --output, -o <file>      บันทึกผลลัพธ์
  --format, -f <txt|json|csv> รูปแบบผลลัพธ์
  --batch, -b              สแกนหลายไฟล์ (คั่นด้วย , หรือ newline)
  --concurrency, -c <n>    จำนวนที่ประมวลผลพร้อมกัน
  --help, -h               แสดงวิธีใช้งาน

ตัวอย่าง:
  node scan.js ./image.png
  node scan.js https://example.com/image.jpg
  node scan.js ./doc.pdf --lang tha --engine 2
  node scan.js --batch "img1.png,img2.png,img3.png" -o result.txt
  node scan.js ./image.png -o output.json -f json

ภาษาที่รองรับ:
  eng - English
  tha - ภาษาไทย
  jpn - 日本語 (Japanese)
  kor - 한국어 (Korean)
  chs - 中文简体 (Chinese Simplified)
  cht - 中文繁體 (Chinese Traditional)
  auto - Auto-detect (Engine 2+)

สมัคร API key ฟรี: https://ocr.space/ocrapi
    `);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Main Entry Point
// ──────────────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
CLI.run(args).catch((error) => {
  console.error('❌ Fatal error:', error.message);
  process.exit(1);
});
