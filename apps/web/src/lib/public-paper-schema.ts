import { PublicPaperSchema, type PublicPaper } from "@deepgeno/contracts";
import { z } from "zod";

/**
 * Astro expects hydrated Date values, while the canonical public contract uses
 * deterministic ISO strings. This adapter changes only that runtime representation;
 * every public field and cross-reference rule remains owned by PublicPaperSchema.
 */
export const publicPaperContentSchema = z
  .preprocess(normalizeYamlDates, PublicPaperSchema)
  .transform(hydrateDates);

function normalizeYamlDates(value: unknown): unknown {
  if (!isRecord(value)) return value;

  const provenance = isRecord(value.provenance) ? value.provenance : undefined;
  const generation = isRecord(provenance?.generation)
    ? provenance.generation
    : undefined;
  const review = isRecord(provenance?.review) ? provenance.review : undefined;

  return {
    ...value,
    ...(value.publicationDate !== undefined
      ? { publicationDate: normalizeDateOnly(value.publicationDate) }
      : {}),
    publishedAt: normalizeDateTime(value.publishedAt),
    updatedAt: normalizeDateTime(value.updatedAt),
    ...(provenance
      ? {
          provenance: {
            ...provenance,
            ...(generation
              ? {
                  generation: {
                    ...generation,
                    generatedAt: normalizeDateTime(generation.generatedAt),
                  },
                }
              : {}),
            ...(review
              ? {
                  review: {
                    ...review,
                    approvedAt: normalizeDateTime(review.approvedAt),
                  },
                }
              : {}),
          },
        }
      : {}),
  };
}

function hydrateDates(paper: PublicPaper) {
  const {
    publicationDate,
    publishedAt,
    updatedAt,
    provenance,
    ...publicFields
  } = paper;
  return {
    ...publicFields,
    ...(publicationDate ? { publicationDate: new Date(publicationDate) } : {}),
    publishedAt: new Date(publishedAt),
    updatedAt: new Date(updatedAt),
    provenance: {
      ...provenance,
      generation: {
        ...provenance.generation,
        generatedAt: new Date(provenance.generation.generatedAt),
      },
      review: {
        ...provenance.review,
        approvedAt: new Date(provenance.review.approvedAt),
      },
    },
  };
}

function normalizeDateOnly(value: unknown): unknown {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value;
}

function normalizeDateTime(value: unknown): unknown {
  return value instanceof Date ? value.toISOString() : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
