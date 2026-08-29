import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createPendingDelivery,
  projectionFromRelease,
  sealPublicProjection,
  transitionDelivery,
} from "./release.js";
import type { PublicProjection } from "./publication.js";
import { GitFileStateStore } from "./store.js";

const createdAt = "2026-08-28T07:00:00.000Z";
const roots: string[] = [];
const projection: PublicProjection = Object.freeze({
  version: "1.0",
  slug: "sealed-paper-a1b2c3d",
  path: "content/public/papers/sealed-paper-a1b2c3d.md",
  bytes: new TextEncoder().encode("---\ntitle: Sealed paper\n---\n"),
  sha256: "d125ca584b5fee3bb7e0bc1b3d097919887e8e6f784be15eecf9ce0167dd2b52",
});

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("private publication releases", () => {
  it("seals and restores the exact approved projection bytes", () => {
    const release = sealPublicProjection(projection, {
      draftId: "draft-paper-r1",
      publicationPath: "data/private/publications/sealed-paper-a1b2c3d.json",
      publicationSha256: "a".repeat(64),
      createdAt,
    });

    expect(release).toMatchObject({
      id: "release-sealed-paper-a1b2c3d-d125ca584b5f",
      publicationSlug: projection.slug,
      projection: {
        path: projection.path,
        sha256: projection.sha256,
        encoding: "base64",
      },
    });
    expect(projectionFromRelease(release)).toEqual(projection);
  });

  it("refuses release bytes whose digest does not match the sealed metadata", () => {
    const release = sealPublicProjection(projection, {
      draftId: "draft-paper-r1",
      publicationPath: "data/private/publications/sealed-paper-a1b2c3d.json",
      publicationSha256: "a".repeat(64),
      createdAt,
    });

    expect(() =>
      projectionFromRelease({
        ...release,
        projection: {
          ...release.projection,
          bytes: Buffer.from("changed bytes").toString("base64"),
        },
      }),
    ).toThrowError(
      expect.objectContaining({ code: "release_digest_mismatch" }),
    );
  });

  it("preserves every sealed byte without text decoding", () => {
    const binary: PublicProjection = Object.freeze({
      version: "1.0",
      slug: "binary-paper-a1b2c3d",
      path: "content/public/papers/binary-paper-a1b2c3d.md",
      bytes: Uint8Array.from([0xff, 0x00, 0x61]),
      sha256:
        "f9789675a25a87605b0d60387568e25cda7b568653ecdc42e9248588dc70acd5",
    });

    const release = sealPublicProjection(binary, {
      draftId: "draft-paper-r1",
      publicationPath: "data/private/publications/binary-paper-a1b2c3d.json",
      publicationSha256: "a".repeat(64),
      createdAt,
    });

    expect([...projectionFromRelease(release).bytes]).toEqual([
      0xff, 0x00, 0x61,
    ]);
  });

  it("refuses a projection whose path is not linked to its slug", () => {
    expect(() =>
      sealPublicProjection(
        { ...projection, path: "content/public/papers/other-paper.md" },
        {
          draftId: "draft-paper-r1",
          publicationPath:
            "data/private/publications/sealed-paper-a1b2c3d.json",
          publicationSha256: "a".repeat(64),
          createdAt,
        },
      ),
    ).toThrowError(expect.objectContaining({ code: "projection_invalid" }));
  });
});

describe("delivery outbox states", () => {
  const release = sealPublicProjection(projection, {
    draftId: "draft-paper-r1",
    publicationPath: "data/private/publications/sealed-paper-a1b2c3d.json",
    publicationSha256: "a".repeat(64),
    createdAt,
  });

  it("creates a pending delivery for a sealed release", () => {
    expect(createPendingDelivery(release, createdAt)).toEqual({
      schemaVersion: "1.0",
      id: "delivery-release-sealed-paper-a1b2c3d-d125ca584b5f",
      releaseId: release.id,
      slug: projection.slug,
      projectionPath: projection.path,
      projectionSha256: projection.sha256,
      state: "pending",
      createdAt,
      updatedAt: createdAt,
    });
  });

  it("allows retryable and remote delivery transitions", () => {
    const pending = createPendingDelivery(release, createdAt);
    const failed = transitionDelivery(
      pending,
      "failed",
      "2026-08-28T07:01:00.000Z",
    );
    const retry = transitionDelivery(
      failed,
      "pending",
      "2026-08-28T07:02:00.000Z",
    );
    const open = transitionDelivery(
      retry,
      "pr-open",
      "2026-08-28T07:03:00.000Z",
    );
    const merged = transitionDelivery(
      open,
      "merged",
      "2026-08-28T07:04:00.000Z",
    );

    expect([failed.state, retry.state, open.state, merged.state]).toEqual([
      "failed",
      "pending",
      "pr-open",
      "merged",
    ]);
    expect(merged.updatedAt).toBe("2026-08-28T07:04:00.000Z");
  });

  it("treats same-state reconciliation as idempotent", () => {
    const pending = createPendingDelivery(release, createdAt);
    expect(
      transitionDelivery(pending, "pending", "2026-08-28T07:01:00.000Z"),
    ).toBe(pending);
  });

  it("rejects skipping directly from pending to merged and reopening merged", () => {
    const pending = createPendingDelivery(release, createdAt);
    expect(() => transitionDelivery(pending, "merged", createdAt)).toThrowError(
      expect.objectContaining({ code: "delivery_transition_invalid" }),
    );
    const merged = transitionDelivery(
      transitionDelivery(pending, "pr-open", createdAt),
      "merged",
      createdAt,
    );
    expect(() => transitionDelivery(merged, "pending", createdAt)).toThrowError(
      expect.objectContaining({ code: "delivery_transition_invalid" }),
    );
  });

  it("persists only legal delivery transitions linked to their sealed release", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "deepgeno-release-"));
    roots.push(root);
    const store = new GitFileStateStore(root);
    await store.saveDelivery(createPendingDelivery(release, createdAt));

    const advanced = await store.transitionDelivery(
      release,
      "pending",
      "pr-open",
      "2026-08-28T07:01:00.000Z",
    );

    expect(advanced.delivery.state).toBe("pr-open");
    expect((await store.loadDeliveryForRelease(release))?.state).toBe(
      "pr-open",
    );
    await expect(
      store.transitionDelivery(
        release,
        "pr-open",
        "pending",
        "2026-08-28T07:02:00.000Z",
      ),
    ).rejects.toMatchObject({ code: "delivery_transition_invalid" });
  });

  it("rejects a loaded delivery that does not match its sealed release", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "deepgeno-release-"));
    roots.push(root);
    const store = new GitFileStateStore(root);
    const deliveryPath = await store.saveDelivery(
      createPendingDelivery(release, createdAt),
    );
    const stored = JSON.parse(await readFile(deliveryPath, "utf8")) as Record<
      string,
      unknown
    >;
    await writeFile(
      deliveryPath,
      JSON.stringify({ ...stored, projectionSha256: "b".repeat(64) }),
      "utf8",
    );

    await expect(store.loadDeliveryForRelease(release)).rejects.toMatchObject({
      code: "delivery_release_mismatch",
    });
  });

  it("serializes concurrent compare-and-swap delivery transitions", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "deepgeno-release-"));
    roots.push(root);
    const first = new GitFileStateStore(root);
    const second = new GitFileStateStore(root);
    await first.saveDelivery(createPendingDelivery(release, createdAt));

    const results = await Promise.allSettled([
      first.transitionDelivery(
        release,
        "pending",
        "pr-open",
        "2026-08-28T07:01:00.000Z",
      ),
      second.transitionDelivery(
        release,
        "pending",
        "failed",
        "2026-08-28T07:01:00.000Z",
      ),
    ]);

    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === "rejected")[0],
    ).toMatchObject({
      reason: { code: "delivery_state_conflict" },
    });
  });

  it("rejects raw writes outside private state even through a test-only cast", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "deepgeno-release-"));
    roots.push(root);
    const store = new GitFileStateStore(root) as unknown as {
      writeText(target: string, content: string): Promise<void>;
    };
    const target = path.join(root, "content", "public", "papers", "bad.md");

    await expect(store.writeText(target, "bad")).rejects.toMatchObject({
      code: "path_outside_root",
    });
    await expect(readFile(target, "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
});
