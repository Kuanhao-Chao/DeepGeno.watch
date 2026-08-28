import { XMLParser } from "fast-xml-parser";
import {
  EvidencePacketSchema,
  type EvidenceDocument,
  type EvidencePacket,
  type EvidenceReference,
  type Paper,
} from "@deepgeno/contracts";
import type { Enrichment } from "./ports.js";
import { compactText, sha256, stableJson } from "./util.js";

const ASSEMBLER_VERSION = "evidence-v1";
const MAX_FULL_TEXT_PARAGRAPHS = 180;
const MAX_FULL_TEXT_CHARACTERS = 120_000;

export function assembleEvidence(
  paper: Paper,
  enrichment: Enrichment,
  assembledAt: string,
  upstreamWarnings: readonly string[] = [],
): EvidencePacket {
  const abstract = paper.abstract;
  if (!abstract)
    throw new TypeError(`Paper ${paper.id} has no complete abstract`);
  const documents: EvidenceDocument[] = [];
  const references: EvidenceReference[] = [];
  const abstractDocumentId = `doc-abstract-${sha256(abstract).slice(0, 12)}`;
  documents.push({
    id: abstractDocumentId,
    kind: "abstract",
    title: `${paper.title} — abstract`,
    sourceUrl: paper.landingUrl,
    retrievedAt: assembledAt,
    mediaType: "text/plain",
    access: "abstract-access",
    contentSha256: sha256(abstract),
  });
  references.push({
    id: "E0001",
    documentId: abstractDocumentId,
    kind: "abstract",
    locator: { section: "Abstract", paragraph: 1 },
    text: abstract,
    textSha256: sha256(abstract),
  });

  const warnings: string[] = [...upstreamWarnings];
  let scope: EvidencePacket["scope"] = "abstract-only";
  const fullText = enrichment.fullText;
  if (fullText?.content) {
    const fullTextDocumentId = `doc-fulltext-${sha256(fullText.content).slice(0, 12)}`;
    documents.push({
      id: fullTextDocumentId,
      kind: fullText.format === "jats" ? "jats" : "html",
      title: `${paper.title} — full text`,
      sourceUrl: fullText.sourceUrl,
      retrievedAt: assembledAt,
      mediaType: fullText.format === "jats" ? "application/xml" : "text/plain",
      ...(fullText.license ? { license: fullText.license } : {}),
      access: "open",
      contentSha256: sha256(fullText.content),
    });
    const paragraphs =
      fullText.format === "jats"
        ? extractJatsParagraphs(fullText.content)
        : extractPlainParagraphs(fullText.content);
    const usable = paragraphs.filter(
      (paragraph) => paragraph.text.length >= 40,
    );
    const selected: Paragraph[] = [];
    let selectedCharacters = 0;
    for (const paragraph of usable) {
      if (selected.length >= MAX_FULL_TEXT_PARAGRAPHS) break;
      if (selectedCharacters + paragraph.text.length > MAX_FULL_TEXT_CHARACTERS)
        break;
      selected.push(paragraph);
      selectedCharacters += paragraph.text.length;
    }
    selected.forEach((paragraph, index) => {
      const id = `E${String(index + 2).padStart(4, "0")}`;
      references.push({
        id,
        documentId: fullTextDocumentId,
        kind: /figure|table/i.test(paragraph.section) ? "caption" : "body",
        locator: { section: paragraph.section, paragraph: paragraph.paragraph },
        text: paragraph.text,
        textSha256: sha256(paragraph.text),
      });
    });
    if (selected.length > 0) {
      scope =
        selected.length < usable.length ? "partial-full-text" : "full-text";
      if (selected.length < usable.length) {
        warnings.push(
          `Full text was capped at ${MAX_FULL_TEXT_PARAGRAPHS} evidence paragraphs or ${MAX_FULL_TEXT_CHARACTERS} characters.`,
        );
      }
    } else {
      warnings.push(
        "Open full text was available but yielded no usable paragraphs; synthesis uses the abstract.",
      );
    }
  }
  const core = {
    schemaVersion: "1.0" as const,
    id: `evidence-${paper.id}-${sha256(stableJson(references)).slice(0, 12)}`,
    paperId: paper.id,
    scope,
    documents,
    references,
    assembledAt,
    assemblerVersion: ASSEMBLER_VERSION,
    warnings,
  };
  return EvidencePacketSchema.parse({
    ...core,
    inputSha256: sha256(stableJson(core)),
  });
}

interface Paragraph {
  section: string;
  paragraph: number;
  text: string;
}

function extractPlainParagraphs(content: string): Paragraph[] {
  return content
    .split(/\n\s*\n/)
    .map(compactText)
    .filter(Boolean)
    .map((text, index) => ({
      section: "Full text",
      paragraph: index + 1,
      text,
    }));
}

function extractJatsParagraphs(xml: string): Paragraph[] {
  const results: Paragraph[] = [];
  const sections = [...xml.matchAll(/<sec\b[^>]*>([\s\S]*?)<\/sec>/gi)];
  const blocks = sections.length
    ? sections.map((match) => match[1] ?? "")
    : [xml];
  for (const block of blocks) {
    const title = decodeXml(
      block.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "Full text",
    );
    const paragraphs = [
      ...block.matchAll(/<(p|caption)\b[^>]*>([\s\S]*?)<\/\1>/gi),
    ];
    paragraphs.forEach((match, index) => {
      const text = decodeXml(match[2] ?? "");
      if (text)
        results.push({
          section:
            match[1]?.toLowerCase() === "caption" ? `${title} figure` : title,
          paragraph: index + 1,
          text,
        });
    });
  }
  return results;
}

function decodeXml(value: string): string {
  try {
    const parser = new XMLParser({
      ignoreAttributes: true,
      processEntities: false,
    });
    const parsed = parser.parse(
      `<root>${value.replace(/<xref\b[^>]*>[\s\S]*?<\/xref>/gi, " ")}</root>`,
    ) as { root?: unknown };
    return compactText(flattenText(parsed.root).join(" "));
  } catch {
    return compactText(value.replace(/<[^>]+>/g, " "));
  }
}

function flattenText(value: unknown): string[] {
  if (typeof value === "string" || typeof value === "number")
    return [String(value)];
  if (Array.isArray(value)) return value.flatMap(flattenText);
  if (value && typeof value === "object")
    return Object.values(value).flatMap(flattenText);
  return [];
}
