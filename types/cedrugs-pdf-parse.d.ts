declare module "@cedrugs/pdf-parse" {
  export type PdfParseResult = {
    text?: string;
    numpages?: number;
    numrender?: number;
    info?: unknown;
    metadata?: unknown;
    version?: string;
  };

  export default function parsePdf(buffer: Buffer | Uint8Array | ArrayBuffer): Promise<PdfParseResult>;
}
