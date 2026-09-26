-- Client records get phone + notes so the Clients screen can hold a full contact.
ALTER TABLE "Client" ADD COLUMN "contactPhone" TEXT;
ALTER TABLE "Client" ADD COLUMN "notes" TEXT;
