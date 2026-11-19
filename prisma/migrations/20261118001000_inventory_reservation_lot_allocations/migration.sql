-- Existing promises remain unchanged and are treated as unallocated legacy reservations.
ALTER TABLE "EnterpriseInventoryReservation" ADD COLUMN "lotAllocations" JSONB;
