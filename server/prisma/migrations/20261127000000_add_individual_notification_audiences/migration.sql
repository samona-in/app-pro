-- One-to-one admin notifications.
--
-- AudienceType already had a dormant `CUSTOM` value, but it carried no surface
-- information and was never implemented in the sender. Two explicit values let
-- the server reject a pro/customer mix before any delivery is attempted, while
-- leaving every existing campaign value and row untouched.

-- AlterEnum
ALTER TYPE "AudienceType" ADD VALUE 'INDIVIDUAL_PRO';
ALTER TYPE "AudienceType" ADD VALUE 'INDIVIDUAL_CUSTOMER';
