-- #1187: Align the database return-line disposition with validated RETAIL lifecycle.
-- A service is credited without stock movement; an undelivered article releases
-- its reservation without a fictitious physical return. This only broadens
-- the accepted enum-like values; all tenant FKs and amount checks remain intact.
ALTER TABLE "EnterpriseRetailInvoiceReturnLine"
  DROP CONSTRAINT "retail_invoice_return_line_disposition_check";

ALTER TABLE "EnterpriseRetailInvoiceReturnLine"
  ADD CONSTRAINT "retail_invoice_return_line_disposition_check"
  CHECK ("stockDisposition" IN (
    'RESTOCK', 'QUARANTINE', 'DISPOSE', 'SERVICE_CREDIT', 'UNDELIVERED_CREDIT'
  ));
