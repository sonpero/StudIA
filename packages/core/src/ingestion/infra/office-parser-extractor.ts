import officeParser from "officeparser";
import { err, ok, type Result } from "../../shared/index.js";
import { promoteHeadings } from "../domain/promote-headings.js";
import type { DocumentExtractor, ExtractionError, ExtractionOutput } from "../domain/ports.js";
import type { SourceType } from "../domain/types.js";

const SUPPORTED: SourceType[] = ["pdf", "docx", "pptx"];

export class OfficeParserExtractor implements DocumentExtractor {
  supports(sourceType: SourceType): boolean {
    return SUPPORTED.includes(sourceType);
  }

  async extract(input: { bytes: Buffer; sourceType: SourceType }): Promise<Result<ExtractionOutput, ExtractionError>> {
    try {
      const rawText: string = await officeParser.parseOfficeAsync(input.bytes);
      return ok({ markdown: promoteHeadings(rawText), legible: true });
    } catch (error) {
      return err({ kind: "corrupted-file", message: error instanceof Error ? error.message : String(error) });
    }
  }
}
