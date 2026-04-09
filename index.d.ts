/**
 * TypeScript definitions for OCR Space API Wrapper - Enhanced Version
 * @version 3.0.0
 */

declare module 'ocr-space-api-wrapper' {
  // ────────────────────────────────────────────────────────────────────────
  // Language and File Type Definitions
  // ────────────────────────────────────────────────────────────────────────

  export type OcrSpaceLanguages =
    | 'eng' | 'ara' | 'bul' | 'chs' | 'cht' | 'hrv' | 'cze' | 'dan' | 'dut'
    | 'fin' | 'fre' | 'ger' | 'gre' | 'hun' | 'ita' | 'jpn' | 'kor' | 'lav'
    | 'lit' | 'nor' | 'pol' | 'por' | 'rum' | 'rus' | 'slo' | 'spa' | 'swe'
    | 'tur' | 'vie' | 'auto';

  export type OcrSpaceFileTypes = 'PDF' | 'GIF' | 'PNG' | 'JPG' | 'TIF' | 'BMP';

  export type OcrEngineType = '1' | '2' | '3';

  // ────────────────────────────────────────────────────────────────────────
  // Options Interface
  // ────────────────────────────────────────────────────────────────────────

  export interface OcrSpaceOptions {
    /** Your OCR.space API key (default: 'helloworld') */
    apiKey?: string;
    
    /** Custom OCR API URL (for PRO plan users) */
    ocrUrl?: string;
    
    /** OCR language code (default: 'eng' for engine 1, 'auto' for engine 2) */
    language?: OcrSpaceLanguages;
    
    /** OCR engine to use: '1', '2', or '3' */
    OCREngine?: OcrEngineType;
    
    /** Require overlay (default: false) */
    isOverlayRequired?: boolean;
    
    /** Detect text orientation (default: false) */
    detectOrientation?: boolean;
    
    /** Create searchable PDF (default: false) */
    isCreateSearchablePdf?: boolean;
    
    /** Hide text layer in searchable PDF (default: false) */
    isSearchablePdfHideTextLayer?: boolean;
    
    /** Enable scaling (default: false) */
    scale?: boolean;
    
    /** Enable table detection (default: false) */
    isTable?: boolean;
    
    /** File type hint */
    filetype?: OcrSpaceFileTypes | string;
    
    /** Request timeout in milliseconds (default: 30000) */
    timeout?: number;
    
    /** Maximum number of retries (default: 3) */
    maxRetries?: number;
    
    /** Progress callback for upload progress */
    onProgress?: (progressEvent: any) => void;
    
    /** AbortSignal for request cancellation */
    signal?: AbortSignal;
  }

  // ────────────────────────────────────────────────────────────────────────
  // Batch Options Interface
  // ────────────────────────────────────────────────────────────────────────

  export interface OcrSpaceBatchOptions {
    /** Number of concurrent requests (default: 3) */
    concurrency?: number;
    
    /** Delay between requests in milliseconds (default: 0) */
    delayBetween?: number;
  }

  // ────────────────────────────────────────────────────────────────────────
  // Response Interfaces
  // ────────────────────────────────────────────────────────────────────────

  export interface OcrSpaceWord {
    WordText: string;
    Left: number;
    Top: number;
    Height: number;
    Width: number;
  }

  export interface OcrSpaceLine {
    Words: OcrSpaceWord[];
    LineText: string;
    MaxHeight: number;
    MinTop: number;
    MaxTop: number;
  }

  export interface OcrSpaceTextOverlay {
    Lines: OcrSpaceLine[];
    HasOverlay: boolean;
    Message: string;
  }

  export interface OcrSpaceParsedResult {
    TextOverlay: OcrSpaceTextOverlay | null;
    FileParseExitCode: 0 | 1 | -10 | -20 | -30 | -99;
    FileName: string;
    FileSize: number;
    ErrorMessage: string[];
    ErrorDetails: string[];
    ParsedText: string;
    TextIsOverlay: boolean;
    ImageOrientation: number;
    ImageOrientationInDegrees: number;
    LatencyMs: number;
  }

  export interface OcrSpaceResponse {
    OCRExitCode: number;
    IsErroredOnProcessing: boolean;
    ProcessedTime: number;
    ErrorMessage: string[] | null;
    ErrorDetails: string[] | null;
    SearchablePDFURL: string;
    ParsedResults: OcrSpaceParsedResult[];
    IsTable?: boolean;
    OCREngineUsed: number;
  }

  // ────────────────────────────────────────────────────────────────────────
  // Error Classes
  // ────────────────────────────────────────────────────────────────────────

  export class OCRSpaceError extends Error {
    code: string;
    response: any | null;
    constructor(message: string, code: string, response?: any);
  }

  export class OCRInvalidInputError extends OCRSpaceError {
    code: 'INVALID_INPUT';
  }

  export class OCRFileNotFoundError extends OCRSpaceError {
    code: 'FILE_NOT_FOUND';
    filePath: string;
  }

  export class OCRApiError extends OCRSpaceError {
    code: 'API_ERROR';
    isErroredOnProcessing: boolean;
    errorDetails: string[];
  }

  export class OCRProcessingError extends OCRSpaceError {
    code: 'PROCESSING_ERROR';
    exitCode: number;
  }

  export class OCRRateLimitError extends OCRSpaceError {
    code: 'RATE_LIMIT';
    retryAfter: number | null;
  }

  export class OCRTimeoutError extends OCRSpaceError {
    code: 'TIMEOUT';
    timeout: number;
  }

  // ────────────────────────────────────────────────────────────────────────
  // Batch Result Interface
  // ────────────────────────────────────────────────────────────────────────

  export type OcrSpaceBatchResult = 
    | { status: 'fulfilled'; value: OcrSpaceResponse }
    | { status: 'rejected'; reason: Error };

  // ────────────────────────────────────────────────────────────────────────
  // Utility Functions
  // ────────────────────────────────────────────────────────────────────────

  /**
   * Detect input type (URL, base64, or file path)
   */
  export function detectInput(input: string): 'url' | 'base64Image' | 'file';

  /**
   * Extract parsed text from OCR result
   */
  export function getParsedText(result: OcrSpaceResponse): string;

  /**
   * Extract text overlay from OCR result
   */
  export function getTextOverlay(result: OcrSpaceResponse): OcrSpaceTextOverlay[];

  // ────────────────────────────────────────────────────────────────────────
  // Constants
  // ────────────────────────────────────────────────────────────────────────

  export const VALID_LANGUAGES: string[];
  export const VALID_OCR_ENGINES: string[];

  // ────────────────────────────────────────────────────────────────────────
  // Main Functions
  // ────────────────────────────────────────────────────────────────────────

  /**
   * Perform OCR on an image or PDF file
   * @param input - URL, local file path, or base64 data URI
   * @param options - OCR options
   * @returns OCR response
   */
  export function ocrSpace(
    input: string,
    options?: OcrSpaceOptions
  ): Promise<OcrSpaceResponse>;

  /**
   * Process multiple images/files in batch
   * @param inputs - Array of inputs (URLs, file paths, or base64)
   * @param options - OCR options
   * @param batchOptions - Batch processing options
   * @returns Array of batch results
   */
  export function ocrSpaceBatch(
    inputs: string[],
    options?: OcrSpaceOptions,
    batchOptions?: OcrSpaceBatchOptions
  ): Promise<OcrSpaceBatchResult[]>;
}
