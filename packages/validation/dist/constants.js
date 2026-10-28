"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LANGUAGE_MAX = exports.GENDER_VALUES = exports.ADDRESS_LABELS = exports.EXPERIENCE_LEVELS = void 0;
/** Mirrors `ExperienceLevel` in `@samona/types` and the Prisma enum. */
exports.EXPERIENCE_LEVELS = [
    'UNDER_1_YEAR',
    'ONE_TO_THREE',
    'THREE_TO_FIVE',
    'FIVE_TO_TEN',
    'TEN_PLUS',
];
/** Mirrors `AddressLabel` in `@samona/types` and the Prisma enum. */
exports.ADDRESS_LABELS = ['HOME', 'WORK', 'OTHER'];
/** Mirrors `Gender` in `@samona/types` and the Prisma enum. */
exports.GENDER_VALUES = ['MALE', 'FEMALE', 'OTHER'];
/** Upper bound on languages a Pro can list. */
exports.LANGUAGE_MAX = 8;
//# sourceMappingURL=constants.js.map