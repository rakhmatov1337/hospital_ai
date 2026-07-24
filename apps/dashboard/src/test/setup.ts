// jest-dom matchers wired into Vitest's expect (also augments the types).
import '@testing-library/jest-dom/vitest';
// Initialise i18n once so components using useTranslation resolve defaults.
import '../lib/i18n';
