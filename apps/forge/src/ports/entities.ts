/**
 * Custom entity rows and indexes (ARCHITECTURE §7.3). This is the TypeScript mirror of
 * `app.storage.entities` in manifest.yml; test/manifest.test.ts checks they agree.
 *
 * Entity names must be lower-case in the manifest, so the spec's `driveSession` entity is
 * `drive-session` (recorded deviation).
 */
import type { FeatureVector, MembershipState } from "@tt/engine";

export const ENTITY_NAMES = ["event", "cluster", "vehicle", "drive-session"] as const;
export type EntityName = (typeof ENTITY_NAMES)[number];

/** Attribute types the manifest allows. */
export type EntityAttributeType = "string" | "integer" | "float" | "boolean" | "any";

/** `event` row, key = event issueId. */
export interface EventRow {
  readonly issueKey: string;
  readonly projectKey: string;
  /** `"<type>|<variant>"` (engine `bucketId`). */
  readonly bucket: string;
  readonly type: string;
  readonly variant: string;
  readonly build: string;
  /** Epoch seconds. */
  readonly occurredAt: number;
  readonly status: MembershipState;
  /** Cluster issueId, or `""`. */
  readonly clusterId: string;
  /** Proposal id from the last recluster, or `""`. */
  readonly proposalId: string;
  /** Distance to the nearest accepted neighbour; `-1` when there is none. */
  readonly nnDist: number;
  /** Engine `chipsToMask`. */
  readonly chipsMask: number;
  readonly features: FeatureVector;
  readonly engine: string;
  readonly synthetic: boolean;
  /** Epoch seconds. */
  readonly indexedAt: number;
}

/** `cluster` row, key = cluster issueId. Cache fields are JSON produced by the services. */
export interface ClusterRow {
  readonly issueKey: string;
  readonly projectKey: string;
  readonly bucket: string;
  readonly nameDet: string;
  readonly memberCount: number;
  readonly firstBuild: string;
  readonly ownerRule: string;
  readonly status: string;
  readonly profile: unknown;
  readonly onset: unknown;
  readonly coverage: unknown;
  /** Epoch seconds. */
  readonly updatedAt: number;
  readonly synthetic: boolean;
}

/** `vehicle` row, key = vehicleId. */
export interface VehicleRow {
  readonly vehicleId: string;
  readonly label: string;
  readonly variant: string;
  readonly sensors: unknown;
  readonly calibration: unknown;
  readonly synthetic: boolean;
}

/** `drive-session` row, key = sessionId. */
export interface DriveSessionRow {
  readonly sessionId: string;
  readonly vehicleId: string;
  readonly variant: string;
  readonly build: string;
  /** Epoch seconds (start of the session's day or the session start). */
  readonly date: number;
  readonly km: number;
  readonly odd: readonly string[];
  /** e.g. `seed`, `import`. */
  readonly source: string;
  readonly synthetic: boolean;
}

export interface EntityRows {
  readonly event: EventRow;
  readonly cluster: ClusterRow;
  readonly vehicle: VehicleRow;
  readonly "drive-session": DriveSessionRow;
}

export interface EntityIndexSpec<A extends string> {
  readonly name: string;
  readonly partition: readonly A[];
  readonly range: readonly A[];
}

export interface EntitySpec<R> {
  readonly attributes: { readonly [K in keyof R & string]: EntityAttributeType };
  readonly indexes: readonly EntityIndexSpec<keyof R & string>[];
}

/** Exactly what manifest.yml declares. */
export const ENTITY_SPECS: { readonly [E in EntityName]: EntitySpec<EntityRows[E]> } = {
  event: {
    attributes: {
      issueKey: "string",
      projectKey: "string",
      bucket: "string",
      type: "string",
      variant: "string",
      build: "string",
      occurredAt: "integer",
      status: "string",
      clusterId: "string",
      proposalId: "string",
      nnDist: "float",
      chipsMask: "integer",
      features: "any",
      engine: "string",
      synthetic: "boolean",
      indexedAt: "integer",
    },
    indexes: [
      { name: "by-bucket", partition: ["projectKey", "bucket"], range: ["occurredAt"] },
      { name: "by-cluster", partition: ["clusterId"], range: ["occurredAt"] },
      { name: "by-status", partition: ["projectKey", "status"], range: ["occurredAt"] },
    ],
  },
  cluster: {
    attributes: {
      issueKey: "string",
      projectKey: "string",
      bucket: "string",
      nameDet: "string",
      memberCount: "integer",
      firstBuild: "string",
      ownerRule: "string",
      status: "string",
      profile: "any",
      onset: "any",
      coverage: "any",
      updatedAt: "integer",
      synthetic: "boolean",
    },
    indexes: [
      { name: "by-project", partition: ["projectKey"], range: ["updatedAt"] },
      { name: "by-project-bucket", partition: ["projectKey", "bucket"], range: ["memberCount"] },
    ],
  },
  vehicle: {
    attributes: { vehicleId: "string", label: "string", variant: "string", sensors: "any", calibration: "any", synthetic: "boolean" },
    indexes: [{ name: "by-variant", partition: ["variant"], range: ["vehicleId"] }],
  },
  "drive-session": {
    attributes: {
      sessionId: "string",
      vehicleId: "string",
      variant: "string",
      build: "string",
      date: "integer",
      km: "float",
      odd: "any",
      source: "string",
      synthetic: "boolean",
    },
    indexes: [
      { name: "by-variant", partition: ["variant"], range: ["date"] },
      { name: "by-vehicle", partition: ["vehicleId"], range: ["date"] },
    ],
  },
};
