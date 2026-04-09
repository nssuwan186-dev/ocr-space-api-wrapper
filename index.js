/**
 * OCR Space API Wrapper - Enhanced Version
 * 
 * A robust wrapper for the OCR.space API with improved error handling,
 * connection pooling, retry logic, and batch processing.
 * 
 * @version 3.0.0
 * @author Enhanced by AI
 * @license MIT
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');

// ──────────────────────────────────────────────────────────────────────────────
// Custom Error Classes
// ──────────────────────────────────────────────────────────────────────────────

class OCRSpaceError extends Error {
  constructor(message, code, response = null) {
    super(message);
    this.name = 'OCRSpaceError';
    this.code = code;
    this.response = response;
    Error.captureStackTrace(this, this.constructor);
  }
}

class OCRInvalidInputError extends OCRSpaceError {
  constructor(message) {
    super(message, 'INVALID_INPUT');
    this.name = 'OCRInvalidInputError';
  }
}

class OCRFileNotFoundError extends OCRSpaceError {
  constructor(filePath) {
    super(`File not found: ${filePath}`, 'FILE_NOT_FOUND');
    this.name = 'OCRFileNotFoundError';
    this.filePath = filePath;
  }
}

class OCRApiError extends OCRSpaceError {
  constructor(message, apiResponse) {
    super(message, 'API_ERROR', apiResponse);
    this.name = 'OCRApiError';
    this.isErroredOnProcessing = apiResponse?.IsErroredOnProcessing || false;
    this.errorDetails = apiResponse?.ErrorMessage || apiResponse?.ErrorDetails || [];
  }
}

class OCRProcessingError extends OCRSpaceError {
  constructor(message, apiResponse) {
    super(message, 'PROCESSING_ERROR', apiResponse);
    this.name = 'OCRProcessingError';
    this.exitCode = apiResponse?.OCRExitCode;
  }
}

class OCRRateLimitError extends OCRSpaceError {
  constructor(retryAfter = null) {
    super('Rate limit exceeded. Please wait before making more requests.', 'RATE_LIMIT');
    this.name = 'OCRRateLimitError';
    this.retryAfter = retryAfter;
  }
}

class OCRTimeoutError extends OCRSpaceError {
  constructor(timeout) {
    super(`Request timed out after ${timeout}ms`, 'TIMEOUT');
    this.name = 'OCRTimeoutError';
    this.timeout = timeout;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Input Detection (Improved)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Detects the type of input provided
 * @param {string} input - The input to detect
 * @returns {'url' | 'base64Image' | 'file'} - The detected input type
 */
function detectInput(input) {
  // Check for data URI (base64 image)
  if (input.startsWith('data:')) {
    return 'base64Image';
  }
  
  // Check for valid URL (http or https)
  try {
    const url = new URL(input);
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return 'url';
    }
  } catch {
    // Not a valid URL, fall through to file
  }
  
  // Default to file path
  return 'file';
}

// ──────────────────────────────────────────────────────────────────────────────
// Axios Instance with Keep-Alive
// ──────────────────────────────────────────────────────────────────────────────

const axiosInstance = axios.create({
  httpAgent: new (require('http').Agent)({
    keepAlive: true,
    maxSockets: 10,
    maxFreeSockets: 5,
    timeout: 60000,
  }),
  httpsAgent: new (require('https').Agent)({
    keepAlive: true,
    maxSockets: 10,
    maxFreeSockets: 5,
    timeout: 60000,
  }),
});

// ──────────────────────────────────────────────────────────────────────────────
// Retry Logic with Exponential Backoff
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Retry a function with exponential backoff
 * @param {Function} fn - The function to retry
 * @param {number} maxRetries - Maximum number of retries
 * @param {number} baseDelay - Base delay in milliseconds
 * @param {Function} shouldRetry - Function to determine if should retry
 * @returns {Promise<any>} - The result of the function
 */
async function withRetry(fn, { maxRetries = 3, baseDelay = 1000, shouldRetry } = {}) {
  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await fn();
      return result;
    } catch (error) {
      lastError = error;
      
      // Don't retry on certain errors
      if (!shouldRetry || !shouldRetry(error, attempt)) {
        throw error;
      }
      
      // Don't retry if we've reached max retries
      if (attempt === maxRetries) {
        break;
      }
      
      // Calculate delay with exponential backoff + jitter
      const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 100;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}

// ──────────────────────────────────────────────────────────────────────────────
// Default Options
// ──────────────────────────────────────────────────────────────────────────────

const DEFAULT_OPTIONS = {
  apiKey: 'helloworld',
  ocrUrl: 'https://api.ocr.space/parse/image',
  language: undefined,
  OCREngine: '1',
  isOverlayRequired: false,
  detectOrientation: false,
  isCreateSearchablePdf: false,
  isSearchablePdfHideTextLayer: false,
  scale: false,
  isTable: false,
  filetype: undefined,
  timeout: 30000, // 30 seconds default timeout
  maxRetries: 3,
  onProgress: undefined,
  signal: undefined,
};

// ──────────────────────────────────────────────────────────────────────────────
// Validation Functions
// ──────────────────────────────────────────────────────────────────────────────

const VALID_LANGUAGES = new Set([
  'eng', 'ara', 'bul', 'chs', 'cht', 'hrv', 'cze', 'dan', 'dut',
  'fin', 'fre', 'ger', 'gre', 'hun', 'ita', 'jpn', 'kor', 'lav',
  'lit', 'nor', 'pol', 'por', 'rum', 'rus', 'slo', 'spa', 'swe',
  'tur', 'vie', // OCREngine 3 additional languages
  'auto', // For OCREngine 2+
]);

const VALID_OCR_ENGINES = new Set(['1', '2', '3']);

function validateInput(input) {
  if (!input || typeof input !== 'string') {
    throw new OCRInvalidInputError(
      `Invalid input: expected a non-empty string, got ${typeof input} (${JSON.stringify(input)})`
    );
  }
  
  if (input.trim().length === 0) {
    throw new OCRInvalidInputError('Input cannot be an empty or whitespace-only string');
  }
}

function validateOptions(options) {
  if (options.language && !VALID_LANGUAGES.has(options.language)) {
    console.warn(`[OCR Warning] Unknown language: '${options.language}'. Proceeding anyway.`);
  }
  
  if (options.OCREngine && !VALID_OCR_ENGINES.has(String(options.OCREngine))) {
    throw new OCRInvalidInputError(
      `Invalid OCREngine: '${options.OCREngine}'. Must be one of: ${Array.from(VALID_OCR_ENGINES).join(', ')}`
    );
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Main OCR Function
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Perform OCR on an image or PDF file
 * @param {string} input - URL, local file path, or base64 data URI
 * @param {Object} [options={}] - OCR options
 * @returns {Promise<Object>} - OCR response
 */
async function ocrSpace(input, options = {}) {
  // Validate input
  validateInput(input);
  
  // Merge options with defaults
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  // Validate options
  validateOptions(opts);
  
  // Detect input type
  const detectedInput = detectInput(input);
  
  // For file input, verify file exists
  if (detectedInput === 'file') {
    try {
      await fs.access(input);
    } catch (err) {
      throw new OCRFileNotFoundError(input);
    }
    
    // Get file stats for size warning
    const stats = await fs.stat(input);
    const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
    if (stats.size > 5 * 1024 * 1024) { // 5MB warning threshold
      console.warn(`[OCR Warning] File size is ${fileSizeMB}MB. OCR.space has a 5MB limit.`);
    }
  }
  
  // Create form data
  const formData = new FormData();
  
  switch (detectedInput) {
    case 'file':
      formData.append('file', fsSync.createReadStream(input));
      break;
    case 'url':
      formData.append('url', input);
      break;
    case 'base64Image':
      formData.append('base64Image', input);
      break;
  }
  
  // Set default language based on OCREngine
  let defaultLanguage = opts.language;
  if (!defaultLanguage) {
    defaultLanguage = String(opts.OCREngine) === '2' ? 'auto' : 'eng';
  }
  
  // Append options
  formData.append('language', defaultLanguage);
  formData.append('isOverlayRequired', String(opts.isOverlayRequired));
  formData.append('detectOrientation', String(opts.detectOrientation));
  formData.append('isCreateSearchablePdf', String(opts.isCreateSearchablePdf));
  formData.append('isSearchablePdfHideTextLayer', String(opts.isSearchablePdfHideTextLayer));
  formData.append('scale', String(opts.scale));
  formData.append('isTable', String(opts.isTable));
  formData.append('OCREngine', String(opts.OCREngine));
  
  if (opts.filetype) {
    formData.append('filetype', opts.filetype);
  }
  
  // Create request
  const request = {
    method: 'POST',
    url: opts.ocrUrl,
    headers: {
      apikey: String(opts.apiKey),
      ...formData.getHeaders(),
    },
    data: formData,
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
    timeout: opts.timeout,
    signal: opts.signal,
  };
  
  // Add progress callback if provided
  if (typeof opts.onProgress === 'function') {
    request.onUploadProgress = opts.onProgress;
  }
  
  // Execute with retry
  const shouldRetry = (error, attempt) => {
    // Retry on network errors, timeouts, and rate limits
    if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
      return true;
    }
    if (error.response?.status === 429 || error.response?.status === 503) {
      return true;
    }
    if (error.name === 'OCRRateLimitError') {
      return true;
    }
    return false;
  };
  
  const result = await withRetry(async () => {
    let response;
    try {
      response = await axiosInstance(request);
    } catch (axiosError) {
      // Handle timeout
      if (axiosError.code === 'ECONNABORTED' || axiosError.message?.includes('timeout')) {
        throw new OCRTimeoutError(opts.timeout);
      }
      
      // Handle rate limiting
      if (axiosError.response?.status === 429) {
        const retryAfter = axiosError.response.headers['retry-after'];
        throw new OCRRateLimitError(retryAfter ? parseInt(retryAfter) : null);
      }
      
      // Handle network errors
      if (axiosError.code === 'ECONNRESET' || axiosError.code === 'ETIMEDOUT' || !axiosError.response) {
        throw axiosError; // Will be retried
      }
      
      throw axiosError;
    }
    
    const data = response.data;
    
    // Check for API-level errors
    if (data.IsErroredOnProcessing === true) {
      const errorMsg = Array.isArray(data.ErrorMessage) 
        ? data.ErrorMessage.join('; ') 
        : data.ErrorMessage || 'OCR processing failed';
      throw new OCRApiError(errorMsg, data);
    }
    
    // Check for processing errors
    if (data.OCRExitCode && data.OCRExitCode < 0) {
      throw new OCRProcessingError(`OCR processing failed with exit code: ${data.OCRExitCode}`, data);
    }
    
    return data;
  }, { maxRetries: opts.maxRetries, shouldRetry });
  
  return result;
}

// ──────────────────────────────────────────────────────────────────────────────
// Batch Processing
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Process multiple images/files in batch
 * @param {string[]} inputs - Array of inputs (URLs, file paths, or base64)
 * @param {Object} [options={}] - OCR options
 * @param {Object} [batchOptions={}] - Batch options
 * @returns {Promise<Object[]>} - Array of OCR responses
 */
async function ocrSpaceBatch(inputs, options = {}, batchOptions = {}) {
  if (!Array.isArray(inputs) || inputs.length === 0) {
    throw new OCRInvalidInputError('Inputs must be a non-empty array');
  }
  
  const { concurrency = 3, delayBetween = 0 } = batchOptions;
  const results = [];
  
  // Process in batches with concurrency limit
  for (let i = 0; i < inputs.length; i += concurrency) {
    const batch = inputs.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(
      batch.map((input, index) => {
        // Add delay between requests if specified
        if (delayBetween > 0 && (i + index) > 0) {
          return new Promise(resolve => {
            setTimeout(async () => {
              try {
                const result = await ocrSpace(input, options);
                resolve(result);
              } catch (error) {
                reject(error);
              }
            }, delayBetween * (i + index));
          });
        }
        return ocrSpace(input, options);
      })
    );
    
    results.push(...batchResults);
    
    // Add delay between batches if specified
    if (delayBetween > 0 && i + concurrency < inputs.length) {
      await new Promise(resolve => setTimeout(resolve, delayBetween));
    }
  }
  
  return results;
}

// ──────────────────────────────────────────────────────────────────────────────
// Utility Functions
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Get parsed text from OCR result
 * @param {Object} result - OCR response
 * @returns {string} - Parsed text
 */
function getParsedText(result) {
  if (!result.ParsedResults || result.ParsedResults.length === 0) {
    return '';
  }
  return result.ParsedResults.map(r => r.ParsedText).join('\n');
}

/**
 * Get text overlay from OCR result
 * @param {Object} result - OCR response
 * @returns {Array} - Text overlay lines
 */
function getTextOverlay(result) {
  if (!result.ParsedResults || result.ParsedResults.length === 0) {
    return [];
  }
  return result.ParsedResults.map(r => r.TextOverlay).filter(Boolean);
}

// ──────────────────────────────────────────────────────────────────────────────
// Exports
// ──────────────────────────────────────────────────────────────────────────────

module.exports = {
  // Main function
  ocrSpace,
  
  // Batch processing
  ocrSpaceBatch,
  
  // Utility functions
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
  
  // Constants
  VALID_LANGUAGES: Array.from(VALID_LANGUAGES),
  VALID_OCR_ENGINES: Array.from(VALID_OCR_ENGINES),
};
