/**
 * Phone Number Normalization Utility
 * 
 * Handles phone number normalization for different countries.
 * Removes country codes and standardizes format for database storage and comparison.
 */

export interface PhoneNormalizationResult {
  normalized: string;      // Phone without country code (e.g., "27998385883")
  full: string;           // Full phone with country code (e.g., "5527998385883")
  countryCode: string;    // Detected country code (e.g., "55")
  isValid: boolean;       // Whether the phone number is valid
}

/**
 * Country code configurations
 */
const COUNTRY_CODES = {
  BRAZIL: "55",
  USA: "1",
  ARGENTINA: "54",
  CHILE: "56",
  COLOMBIA: "57",
  MEXICO: "52",
  PERU: "51",
  URUGUAY: "598",
  PARAGUAY: "595",
  BOLIVIA: "591",
  ECUADOR: "593",
  VENEZUELA: "58",
} as const;

/**
 * Phone number length configurations by country
 */
const PHONE_LENGTH_CONFIG = {
  "55": { min: 10, max: 11 },  // Brazil: 10-11 digits (with area code)
  "1": { min: 10, max: 10 },   // USA/Canada: 10 digits
  "54": { min: 10, max: 11 },  // Argentina: 10-11 digits
  "56": { min: 9, max: 9 },    // Chile: 9 digits
  "57": { min: 10, max: 10 },  // Colombia: 10 digits
  "52": { min: 10, max: 10 },  // Mexico: 10 digits
  "51": { min: 9, max: 9 },    // Peru: 9 digits
  "598": { min: 8, max: 9 },   // Uruguay: 8-9 digits
  "595": { min: 9, max: 9 },   // Paraguay: 9 digits
  "591": { min: 8, max: 8 },   // Bolivia: 8 digits
  "593": { min: 9, max: 9 },   // Ecuador: 9 digits
  "58": { min: 10, max: 10 },  // Venezuela: 10 digits
} as const;

/**
 * Normalize a phone number by removing country code
 * 
 * @param phone - Raw phone number (may include country code)
 * @param defaultCountryCode - Default country code if none detected (default: "55" for Brazil)
 * @returns Normalized phone number result
 */
export function normalizePhoneNumber(
  phone: string,
  defaultCountryCode: string = COUNTRY_CODES.BRAZIL
): PhoneNormalizationResult {
  // Remove all non-digit characters
  const digitsOnly = phone.replace(/\D/g, "");

  if (!digitsOnly) {
    return {
      normalized: "",
      full: "",
      countryCode: defaultCountryCode,
      isValid: false,
    };
  }

  // Try to detect country code
  let detectedCountryCode = defaultCountryCode;
  let phoneWithoutCountryCode = digitsOnly;

  // Check for known country codes (sorted by length, longest first)
  const sortedCountryCodes = Object.values(COUNTRY_CODES).sort((a, b) => b.length - a.length);

  for (const code of sortedCountryCodes) {
    if (digitsOnly.startsWith(code)) {
      const remainingDigits = digitsOnly.substring(code.length);
      const lengthConfig = PHONE_LENGTH_CONFIG[code as keyof typeof PHONE_LENGTH_CONFIG];

      // Validate remaining digits length
      if (lengthConfig && remainingDigits.length >= lengthConfig.min && remainingDigits.length <= lengthConfig.max) {
        detectedCountryCode = code;
        phoneWithoutCountryCode = remainingDigits;
        break;
      }
    }
  }

  // If no country code detected, assume the number is already without country code
  if (detectedCountryCode === defaultCountryCode && digitsOnly === phoneWithoutCountryCode) {
    // Check if the length matches the default country's phone length
    const lengthConfig = PHONE_LENGTH_CONFIG[defaultCountryCode as keyof typeof PHONE_LENGTH_CONFIG];
    if (lengthConfig && digitsOnly.length >= lengthConfig.min && digitsOnly.length <= lengthConfig.max) {
      phoneWithoutCountryCode = digitsOnly;
    }
  }

  // Validate phone number length
  const lengthConfig = PHONE_LENGTH_CONFIG[detectedCountryCode as keyof typeof PHONE_LENGTH_CONFIG];
  const isValid = lengthConfig
    ? phoneWithoutCountryCode.length >= lengthConfig.min && phoneWithoutCountryCode.length <= lengthConfig.max
    : phoneWithoutCountryCode.length >= 8 && phoneWithoutCountryCode.length <= 15; // Generic validation

  return {
    normalized: phoneWithoutCountryCode,
    full: detectedCountryCode + phoneWithoutCountryCode,
    countryCode: detectedCountryCode,
    isValid,
  };
}

/**
 * Compare two phone numbers for equality (ignoring country codes)
 * 
 * @param phone1 - First phone number
 * @param phone2 - Second phone number
 * @param defaultCountryCode - Default country code
 * @returns True if phones match
 */
export function comparePhoneNumbers(
  phone1: string,
  phone2: string,
  defaultCountryCode: string = COUNTRY_CODES.BRAZIL
): boolean {
  const normalized1 = normalizePhoneNumber(phone1, defaultCountryCode);
  const normalized2 = normalizePhoneNumber(phone2, defaultCountryCode);

  return normalized1.normalized === normalized2.normalized;
}

/**
 * Format phone number for display
 * 
 * @param phone - Phone number to format
 * @param includeCountryCode - Whether to include country code
 * @param defaultCountryCode - Default country code
 * @returns Formatted phone number
 */
export function formatPhoneNumber(
  phone: string,
  includeCountryCode: boolean = true,
  defaultCountryCode: string = COUNTRY_CODES.BRAZIL
): string {
  const normalized = normalizePhoneNumber(phone, defaultCountryCode);

  if (!normalized.isValid) {
    return phone; // Return original if invalid
  }

  const phoneNumber = normalized.normalized;

  // Format based on country code
  if (normalized.countryCode === COUNTRY_CODES.BRAZIL) {
    // Brazil format: (XX) XXXXX-XXXX or (XX) XXXX-XXXX
    if (phoneNumber.length === 11) {
      const formatted = `(${phoneNumber.substring(0, 2)}) ${phoneNumber.substring(2, 7)}-${phoneNumber.substring(7)}`;
      return includeCountryCode ? `+${normalized.countryCode} ${formatted}` : formatted;
    } else if (phoneNumber.length === 10) {
      const formatted = `(${phoneNumber.substring(0, 2)}) ${phoneNumber.substring(2, 6)}-${phoneNumber.substring(6)}`;
      return includeCountryCode ? `+${normalized.countryCode} ${formatted}` : formatted;
    }
  }

  // Generic format for other countries
  const formatted = phoneNumber;
  return includeCountryCode ? `+${normalized.countryCode} ${formatted}` : formatted;
}

/**
 * Get all possible phone number variations for database search
 * Returns array of possible formats to search in database
 * 
 * IMPORTANT: For Brazil, includes variations with and without the 9th digit
 * to handle old phone numbers (8 digits) and new ones (9 digits)
 * 
 * @param phone - Phone number to get variations for
 * @param defaultCountryCode - Default country code
 * @returns Array of phone number variations
 */
export function getPhoneNumberVariations(
  phone: string,
  defaultCountryCode: string = COUNTRY_CODES.BRAZIL
): string[] {
  const normalized = normalizePhoneNumber(phone, defaultCountryCode);
  
  if (!normalized.isValid) {
    return [phone.replace(/\D/g, "")];
  }

  const variations = [
    normalized.normalized,           // Without country code: "27998385883"
    normalized.full,                 // With country code: "5527998385883"
  ];

  // Add variations with different formatting
  const digitsOnly = phone.replace(/\D/g, "");
  if (!variations.includes(digitsOnly)) {
    variations.push(digitsOnly);
  }

  // ── BRAZIL SPECIFIC: Handle 9th digit variations ──────────────────────────
  // Brazilian mobile numbers changed from 8 to 9 digits in 2015-2017
  // Old format: (27) 9838-5883 → 2798385883 (10 digits total)
  // New format: (27) 99838-5883 → 27998385883 (11 digits total)
  if (normalized.countryCode === COUNTRY_CODES.BRAZIL) {
    const phoneWithoutCountry = normalized.normalized;
    
    // If phone has 11 digits (new format with 9)
    if (phoneWithoutCountry.length === 11) {
      const areaCode = phoneWithoutCountry.substring(0, 2);
      const firstDigit = phoneWithoutCountry.substring(2, 3);
      
      // If it's a mobile number (starts with 9)
      if (firstDigit === "9") {
        // Create variation WITHOUT the 9th digit (old format)
        const withoutNinth = areaCode + phoneWithoutCountry.substring(3);
        variations.push(withoutNinth);                           // "2798385883"
        variations.push(normalized.countryCode + withoutNinth);  // "552798385883"
      }
    }
    
    // If phone has 10 digits (old format without 9)
    if (phoneWithoutCountry.length === 10) {
      const areaCode = phoneWithoutCountry.substring(0, 2);
      const firstDigit = phoneWithoutCountry.substring(2, 3);
      
      // If it's a mobile number (starts with 9, 8, 7, or 6)
      if (["9", "8", "7", "6"].includes(firstDigit)) {
        // Create variation WITH the 9th digit (new format)
        const withNinth = areaCode + "9" + phoneWithoutCountry.substring(2);
        variations.push(withNinth);                           // "27998385883"
        variations.push(normalized.countryCode + withNinth);  // "5527998385883"
      }
    }
  }

  return [...new Set(variations)]; // Remove duplicates
}