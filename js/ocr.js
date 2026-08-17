/**
 * DP WORLD DJENDJEN - CONTAINER TALLYING PWA
 * OCR, Barcode Scanning & ISO 6346 Check-Digit Engine
 */

(function(window) {
    'use strict';

    // ISO 6346 Standard Character Value Mapping (multiples of 11 are intentionally excluded per ISO standard)
    const ISO_6346_CHAR_MAP = {
        'A': 10, 'B': 12, 'C': 13, 'D': 14, 'E': 15, 'F': 16, 'G': 17, 'H': 18, 'I': 19, 'J': 20,
        'K': 21, 'L': 23, 'M': 24, 'N': 25, 'O': 26, 'P': 27, 'Q': 28, 'R': 29, 'S': 30, 'T': 31,
        'U': 32, 'V': 34, 'W': 35, 'X': 36, 'Y': 37, 'Z': 38
    };

    class OCREngine {
        constructor() {
            this.zxingReader = null;
            this._initZXing();
        }

        _initZXing() {
            try {
                if (typeof ZXing !== 'undefined' && ZXing.BrowserMultiFormatReader) {
                    this.zxingReader = new ZXing.BrowserMultiFormatReader();
                }
            } catch (e) {
                console.warn('ZXing initialization warning:', e);
            }
        }

        /**
         * Validates a container code according to ISO 6346 standard check-digit formula
         * @param {string} containerNo 11-character container number (e.g. MSCU1234567)
         * @returns {{ isValid: boolean, expectedCheckDigit: number|null, actualCheckDigit: number|null, message: string }}
         */
        validateISO6346(containerNo) {
            if (!containerNo) {
                return { isValid: false, expectedCheckDigit: null, actualCheckDigit: null, message: 'Empty container number' };
            }

            const clean = containerNo.toUpperCase().trim().replace(/[\s-]/g, '');
            if (clean.length !== 11) {
                return { isValid: false, expectedCheckDigit: null, actualCheckDigit: null, message: 'Length must be exactly 11 characters' };
            }

            let sum = 0;
            for (let i = 0; i < 10; i++) {
                const char = clean[i];
                let val;

                if (/[0-9]/.test(char)) {
                    val = parseInt(char, 10);
                } else if (ISO_6346_CHAR_MAP[char] !== undefined) {
                    val = ISO_6346_CHAR_MAP[char];
                } else {
                    return { isValid: false, expectedCheckDigit: null, actualCheckDigit: null, message: `Invalid character: ${char}` };
                }

                // Weighted sum: val * 2^i
                sum += val * Math.pow(2, i);
            }

            const remainder = sum % 11;
            const expectedCheckDigit = remainder % 10; // If remainder is 10, check digit is 0
            const actualCheckDigit = parseInt(clean[10], 10);

            const isValid = (expectedCheckDigit === actualCheckDigit);

            return {
                isValid,
                expectedCheckDigit,
                actualCheckDigit,
                cleanCode: clean,
                message: isValid ? 'Valid ISO 6346 check digit' : `Mismatch: expected ${expectedCheckDigit}, got ${actualCheckDigit}`
            };
        }

        /**
         * Recognizes container number from image file using Tesseract OCR + ZXing Barcode scanner
         * @param {File|Blob} file Image file
         * @param {function} onProgress Progress callback
         * @returns {Promise<{ containerId: string|null, rawText: string, method: 'barcode'|'ocr'|'none' }>}
         */
        async processImage(file, onProgress) {
            // 1. Try ZXing Barcode Scanning first (ultra-fast if barcode / QR is present)
            if (this.zxingReader) {
                try {
                    const imgUrl = URL.createObjectURL(file);
                    const barcodeResult = await this.zxingReader.decodeFromImageUrl(imgUrl);
                    URL.revokeObjectURL(imgUrl);

                    if (barcodeResult && barcodeResult.getText()) {
                        const rawText = barcodeResult.getText().toUpperCase().trim();
                        const match = rawText.match(/[A-Z]{4}\d{7}/);
                        if (match) {
                            return { containerId: match[0], rawText, method: 'barcode' };
                        } else if (rawText.length >= 7) {
                            return { containerId: rawText.substring(0, 11), rawText, method: 'barcode' };
                        }
                    }
                } catch (zxErr) {
                    // No barcode found, fall through to OCR
                }
            }

            // 2. Perform Tesseract OCR recognition
            if (typeof Tesseract === 'undefined') {
                throw new Error('Tesseract.js library not loaded');
            }

            if (onProgress) onProgress({ status: 'loading', progress: 0.2 });

            const result = await Tesseract.recognize(file, 'eng', {
                logger: (m) => {
                    if (onProgress && m.status === 'recognizing text') {
                        onProgress({ status: 'recognizing', progress: 0.2 + (m.progress || 0) * 0.75 });
                    }
                }
            });

            const rawText = result.data.text || '';
            const cleanText = rawText.replace(/[^A-Z0-9]/gi, '').toUpperCase();

            // Match exact 4 letters + 7 digits (standard ISO container code)
            const match = cleanText.match(/[A-Z]{4}\d{7}/);

            if (match) {
                return { containerId: match[0], rawText, method: 'ocr' };
            } else if (cleanText.length >= 7) {
                return { containerId: cleanText.substring(0, 11), rawText, method: 'ocr' };
            } else {
                return { containerId: null, rawText, method: 'none' };
            }
        }

        /**
         * Resizes and compresses image to optimized JPEG Base64
         * @param {File|Blob} file Image file
         * @param {number} maxWidth Maximum width (default: 640)
         * @param {number} maxHeight Maximum height (default: 480)
         * @param {number} quality JPEG quality (default: 0.65)
         * @returns {Promise<string>} Base64 Data URL
         */
        compressImage(file, maxWidth = 640, maxHeight = 480, quality = 0.65) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (e) => {
                    const img = new Image();
                    img.onload = () => {
                        let width = img.width;
                        let height = img.height;

                        if (width > height) {
                            if (width > maxWidth) {
                                height = Math.round(height * (maxWidth / width));
                                width = maxWidth;
                            }
                        } else {
                            if (height > maxHeight) {
                                width = Math.round(width * (maxHeight / height));
                                height = maxHeight;
                            }
                        }

                        const canvas = document.createElement('canvas');
                        canvas.width = width;
                        canvas.height = height;

                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0, width, height);

                        const base64Data = canvas.toDataURL('image/jpeg', quality);
                        resolve(base64Data);
                    };
                    img.onerror = reject;
                    img.src = e.target.result;
                };
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
        }
    }

    // Expose global singleton instance
    window.DPW_OCR = new OCREngine();

})(window);
