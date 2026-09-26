-- Invoices carry their own currency. Existing rows default to PKR, matching the
-- Pakistan-based bank details already on file.
CREATE TYPE "Currency" AS ENUM ('MYR', 'PKR');
ALTER TABLE "Invoice" ADD COLUMN "currency" "Currency" NOT NULL DEFAULT 'PKR';
