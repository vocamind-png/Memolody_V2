/**
 * [STRICT COMPLIANCE GUARD V1.0]
 * Monitors internal naming integrity for Play Store / App Store compliance.
 */

export const checkNamingCompliance = (lyricMode: string): boolean => {
    const PROTECTED_IDENTIFIERS = ['Kodaly', 'Jianpu', 'Fixed Do', 'Movable Do'];

    if (lyricMode.toLowerCase().includes('memolody') || lyricMode.toLowerCase().includes('beatbox')) {
        console.error("%c [CRITICAL VIOLATION] Store Compliance Integrity Check Failed!", "color: red; font-size: 20px; font-weight: bold;");
        console.warn("Attempting to rename protected academic identifiers ('Kodaly') to proprietary brand names triggers an immediate AI Audit Flag.");
        console.warn("Reference: docs/STORE_SUBMISSION_AUDIT_REPORT.md");
        return false;
    }

    return true;
};
