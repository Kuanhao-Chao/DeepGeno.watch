import { sha256 } from "./util.js";
import { invariant } from "./errors.js";
import type { PublicProjection } from "./publication.js";
import type { PublishedPaper } from "@deepgeno/contracts";
import { stableJson } from "./util.js";

export type SealedPublicProjection = Readonly<{
  path: string;
  bytes: string;
  encoding: "base64";
  sha256: string;
}>;

export type PrivateRelease = Readonly<{
  schemaVersion: "1.0";
  id: string;
  draftId: string;
  publicationSlug: string;
  publicationPath: string;
  publicationSha256: string;
  createdAt: string;
  projection: SealedPublicProjection;
}>;

export type DeliveryState = "pending" | "pr-open" | "merged" | "failed";

export type DeliveryRemoteReceipt = Readonly<{
  repository: string;
  branch: string;
  headSha: string;
  pullRequestNumber: number;
  pullRequestUrl: string;
}>;

export type DeliveryFailure = Readonly<{
  code: "pull-request-closed";
  message: string;
}>;

export type DeliveryTransitionDetails = Readonly<{
  remote?: DeliveryRemoteReceipt;
  failure?: DeliveryFailure;
}>;

export type Delivery = Readonly<{
  schemaVersion: "1.0";
  id: string;
  releaseId: string;
  slug: string;
  projectionPath: string;
  projectionSha256: string;
  state: DeliveryState;
  createdAt: string;
  updatedAt: string;
  remote?: DeliveryRemoteReceipt;
  failure?: DeliveryFailure;
}>;

export function sealPublicProjection(
  projection: PublicProjection,
  details: {
    draftId: string;
    publicationPath: string;
    publicationSha256: string;
    createdAt: string;
  },
): PrivateRelease {
  assertProjection(projection);
  invariant(
    /^[a-f0-9]{64}$/i.test(details.publicationSha256),
    "publication_digest_invalid",
    "Private publication digest must be SHA-256",
  );
  return Object.freeze({
    schemaVersion: "1.0",
    id: `release-${projection.slug}-${projection.sha256.slice(0, 12)}`,
    draftId: details.draftId,
    publicationSlug: projection.slug,
    publicationPath: details.publicationPath,
    publicationSha256: details.publicationSha256,
    createdAt: details.createdAt,
    projection: Object.freeze({
      path: projection.path,
      bytes: Buffer.from(projection.bytes).toString("base64"),
      encoding: "base64",
      sha256: projection.sha256,
    }),
  });
}

export function projectionFromRelease(
  release: PrivateRelease,
): PublicProjection {
  validateRelease(release);
  const bytes = new Uint8Array(Buffer.from(release.projection.bytes, "base64"));
  invariant(
    sha256(bytes) === release.projection.sha256,
    "release_digest_mismatch",
    "Private release projection bytes do not match their sealed digest",
  );
  return Object.freeze({
    version: "1.0",
    slug: release.publicationSlug,
    path: release.projection.path,
    bytes,
    sha256: release.projection.sha256,
  });
}

export function createPendingDelivery(
  release: PrivateRelease,
  createdAt: string,
): Delivery {
  const projection = projectionFromRelease(release);
  return Object.freeze({
    schemaVersion: "1.0",
    id: `delivery-${release.id}`,
    releaseId: release.id,
    slug: projection.slug,
    projectionPath: projection.path,
    projectionSha256: projection.sha256,
    state: "pending",
    createdAt,
    updatedAt: createdAt,
  });
}

export function transitionDelivery(
  delivery: Delivery,
  state: DeliveryState,
  updatedAt: string,
  details: DeliveryTransitionDetails = {},
): Delivery {
  validateDelivery(delivery);
  const allowed: Readonly<Record<DeliveryState, readonly DeliveryState[]>> = {
    pending: ["pr-open", "merged", "failed"],
    "pr-open": ["merged", "failed"],
    merged: [],
    failed: ["pending"],
  };
  if (delivery.state === state) {
    if (state === "pending" || Object.keys(details).length === 0)
      return delivery;
    const reconciled = deliveryWithTransition(
      delivery,
      state,
      delivery.updatedAt,
      details,
    );
    invariant(
      stableJson(reconciled) === stableJson(delivery),
      "delivery_receipt_conflict",
      `Delivery ${delivery.id} already records different remote receipt metadata`,
    );
    return delivery;
  }
  invariant(
    allowed[delivery.state].includes(state),
    "delivery_transition_invalid",
    `Cannot transition delivery from ${delivery.state} to ${state}`,
  );
  return deliveryWithTransition(delivery, state, updatedAt, details);
}

export function validateDelivery(delivery: Delivery): void {
  const candidate = delivery as Partial<Delivery>;
  const allowedKeys = new Set([
    "schemaVersion",
    "id",
    "releaseId",
    "slug",
    "projectionPath",
    "projectionSha256",
    "state",
    "createdAt",
    "updatedAt",
    "remote",
    "failure",
  ]);
  invariant(
    Object.keys(candidate).every((key) => allowedKeys.has(key)) &&
    candidate.schemaVersion === "1.0" &&
      typeof candidate.id === "string" &&
      /^delivery-release-[a-z0-9][a-z0-9-]*$/.test(candidate.id) &&
      typeof candidate.releaseId === "string" &&
      candidate.id === `delivery-${candidate.releaseId}` &&
      typeof candidate.slug === "string" &&
      /^[a-z0-9][a-z0-9-]*$/.test(candidate.slug) &&
      candidate.projectionPath ===
        `content/public/papers/${candidate.slug}.md` &&
      typeof candidate.projectionSha256 === "string" &&
      /^[a-f0-9]{64}$/i.test(candidate.projectionSha256) &&
      typeof candidate.state === "string" &&
      ["pending", "pr-open", "merged", "failed"].includes(candidate.state) &&
      typeof candidate.createdAt === "string" &&
      !Number.isNaN(Date.parse(candidate.createdAt)) &&
      typeof candidate.updatedAt === "string" &&
      !Number.isNaN(Date.parse(candidate.updatedAt)) &&
      remoteHasOnlyAllowedKeys(candidate.remote) &&
      failureHasOnlyAllowedKeys(candidate.failure),
    "delivery_invalid",
    "Private delivery record is invalid",
  );
  if (candidate.state === "pending") {
    invariant(
      candidate.remote === undefined && candidate.failure === undefined,
      "delivery_invalid",
      "A pending delivery cannot contain a remote receipt or failure",
    );
    return;
  }
  validateRemoteReceipt(candidate.remote, candidate.slug);
  if (candidate.state === "failed") {
    validateFailure(candidate.failure);
  } else {
    invariant(
      candidate.failure === undefined,
      "delivery_invalid",
      "An active delivery cannot contain failure metadata",
    );
  }
}

export function validateRelease(release: PrivateRelease): void {
  const candidate = release as Partial<PrivateRelease>;
  const projection = candidate.projection as Partial<SealedPublicProjection>;
  invariant(
    candidate.schemaVersion === "1.0" &&
      typeof candidate.id === "string" &&
      typeof candidate.draftId === "string" &&
      typeof candidate.publicationSlug === "string" &&
      /^[a-z0-9][a-z0-9-]*$/.test(candidate.publicationSlug) &&
      typeof candidate.publicationSha256 === "string" &&
      /^[a-f0-9]{64}$/i.test(candidate.publicationSha256) &&
      candidate.publicationPath ===
        `data/private/publications/${candidate.publicationSlug}.json` &&
      projection &&
      projection.path ===
        `content/public/papers/${candidate.publicationSlug}.md` &&
      projection.encoding === "base64" &&
      typeof projection.sha256 === "string" &&
      /^[a-f0-9]{64}$/i.test(projection.sha256) &&
      typeof projection.bytes === "string" &&
      Buffer.from(projection.bytes, "base64").toString("base64") ===
        projection.bytes &&
      candidate.id ===
        `release-${candidate.publicationSlug}-${projection.sha256.slice(0, 12)}`,
    "release_invalid",
    "Private release metadata is invalid",
  );
}

export function validateDeliveryReleaseLink(
  delivery: Delivery,
  release: PrivateRelease,
): void {
  validateDelivery(delivery);
  validateRelease(release);
  invariant(
    delivery.releaseId === release.id &&
      delivery.slug === release.publicationSlug &&
      delivery.projectionPath === release.projection.path &&
      delivery.projectionSha256 === release.projection.sha256,
    "delivery_release_mismatch",
    "Private delivery does not match its sealed release",
  );
}

export function validateReleasePublicationLink(
  release: PrivateRelease,
  publication: PublishedPaper,
): void {
  validateRelease(release);
  invariant(
    release.publicationSlug === publication.slug &&
      release.publicationPath ===
        `data/private/publications/${publication.slug}.json` &&
      release.publicationSha256 === sha256(stableJson(publication)) &&
      release.draftId === publication.review.draftId,
    "release_publication_mismatch",
    "Private release does not match its immutable publication",
  );
}

function assertProjection(projection: PublicProjection): void {
  invariant(
    projection.version === "1.0" &&
      /^[a-z0-9][a-z0-9-]*$/.test(projection.slug) &&
      projection.path === `content/public/papers/${projection.slug}.md` &&
      /^[a-f0-9]{64}$/i.test(projection.sha256),
    "projection_invalid",
    "Public projection metadata is invalid",
  );
  invariant(
    sha256(projection.bytes) === projection.sha256,
    "projection_digest_mismatch",
    "Public projection bytes do not match their digest",
  );
}

function deliveryWithTransition(
  delivery: Delivery,
  state: DeliveryState,
  updatedAt: string,
  details: DeliveryTransitionDetails,
): Delivery {
  const next = {
    ...delivery,
    state,
    updatedAt,
  } as {
    -readonly [Key in keyof Delivery]: Delivery[Key];
  };
  delete next.remote;
  delete next.failure;
  if (state !== "pending") {
    if (details.remote) next.remote = Object.freeze({ ...details.remote });
    if (details.failure)
      next.failure = Object.freeze({ ...details.failure });
  }
  const frozen = Object.freeze(next);
  validateDelivery(frozen);
  return frozen;
}

function remoteHasOnlyAllowedKeys(
  remote: DeliveryRemoteReceipt | undefined,
): boolean {
  if (remote === undefined) return true;
  if (remote === null || typeof remote !== "object") return false;
  const allowed = new Set([
    "repository",
    "branch",
    "headSha",
    "pullRequestNumber",
    "pullRequestUrl",
  ]);
  return Object.keys(remote).every((key) => allowed.has(key));
}

function failureHasOnlyAllowedKeys(
  failure: DeliveryFailure | undefined,
): boolean {
  if (failure === undefined) return true;
  if (failure === null || typeof failure !== "object") return false;
  const allowed = new Set(["code", "message"]);
  return Object.keys(failure).every((key) => allowed.has(key));
}

function validateRemoteReceipt(
  remote: DeliveryRemoteReceipt | undefined,
  slug: string | undefined,
): asserts remote is DeliveryRemoteReceipt {
  const repository = remote?.repository;
  const pullRequestNumber = remote?.pullRequestNumber;
  invariant(
    typeof slug === "string" &&
      typeof repository === "string" &&
      /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(
        repository,
      ) &&
      remote?.branch === `deepgeno/publish/${slug}` &&
      typeof remote.headSha === "string" &&
      /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(remote.headSha) &&
      Number.isInteger(pullRequestNumber) &&
      (pullRequestNumber ?? 0) > 0 &&
      remote.pullRequestUrl ===
        `https://github.com/${repository}/pull/${pullRequestNumber}`,
    "delivery_remote_invalid",
    "Private delivery remote receipt is invalid",
  );
}

function validateFailure(
  failure: DeliveryFailure | undefined,
): asserts failure is DeliveryFailure {
  invariant(
    failure?.code === "pull-request-closed" &&
      failure.message ===
        "The public delivery pull request was closed without merging.",
    "delivery_failure_invalid",
    "Private delivery failure metadata is invalid",
  );
}
