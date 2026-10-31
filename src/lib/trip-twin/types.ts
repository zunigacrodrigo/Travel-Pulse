import { z } from "zod";

export const evidenceStatusSchema = z.enum(["verified", "estimated", "stale", "unknown"]);
export type EvidenceStatus = z.infer<typeof evidenceStatusSchema>;

export const activityImportanceSchema = z.enum(["fixed", "high", "normal", "optional"]);
export type ActivityImportance = z.infer<typeof activityImportanceSchema>;

const isoDateTime = z.string().datetime({ offset: true });
const coordinateSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  placeId: z.string().min(1).optional(),
});

export const evidenceSchema = z.object({
  status: evidenceStatusSchema,
  sourceId: z.string().min(1).nullable(),
  observedAt: isoDateTime.nullable(),
  expiresAt: isoDateTime.nullable().optional(),
});
export type Evidence = z.infer<typeof evidenceSchema>;

export const tripSchema = z.object({
  id: z.string().min(1).max(100),
  destination: z.string().min(1).max(120),
  startAt: isoDateTime,
  endAt: isoDateTime,
  timeZone: z.string().min(1).max(80),
  budget: z.object({ amount: z.number().nonnegative(), currency: z.string().regex(/^[A-Z]{3}$/) }),
  travelers: z.number().int().min(1).max(20),
}).refine((trip) => Date.parse(trip.endAt) > Date.parse(trip.startAt), {
  message: "endAt debe ser posterior a startAt", path: ["endAt"],
});
export type Trip = z.infer<typeof tripSchema>;

export const activitySchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().min(1).max(160),
  category: z.string().max(100).optional(),
  location: coordinateSchema,
  durationMinutes: z.number().int().min(1).max(1440),
  importance: activityImportanceSchema,
  fixedStart: isoDateTime.optional(),
  startNotBefore: isoDateTime.optional(),
  openingHours: z.array(z.object({ start: isoDateTime, end: isoDateTime }).refine((w) => Date.parse(w.end) > Date.parse(w.start))).optional(),
  cost: z.object({ amount: z.number().nonnegative().nullable(), currency: z.string().regex(/^[A-Z]{3}$/), basis: z.enum(["per_person", "per_group", "unknown"]) }),
  travelMinutesFromPrevious: z.number().int().min(0).max(1440).nullable(),
  travelEvidence: evidenceSchema,
  hoursEvidence: evidenceSchema,
  costEvidence: evidenceSchema,
  demoData: z.boolean().default(false),
});
export type Activity = z.infer<typeof activitySchema>;

export const planItemSchema = z.object({
  activityId: z.string(),
  order: z.number().int().positive(),
  plannedStart: isoDateTime,
  plannedEnd: isoDateTime,
  travelMinutesFromPrevious: z.number().int().nonnegative().nullable(),
  travelEvidenceStatus: evidenceStatusSchema,
  status: z.enum(["planned", "completed", "cancelled"]),
});
export type PlanItem = z.infer<typeof planItemSchema>;

export const planViolationSchema = z.object({
  code: z.string(),
  severity: z.enum(["hard", "warning"]),
  activityIds: z.array(z.string()),
  message: z.string(),
});
export type PlanViolation = z.infer<typeof planViolationSchema>;

export const tripPlanSchema = z.object({
  id: z.string(),
  tripId: z.string(),
  version: z.number().int().positive(),
  status: z.enum(["draft", "feasible", "infeasible"]),
  items: z.array(planItemSchema),
  estimatedTotalCost: z.number().nonnegative().nullable(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  violations: z.array(planViolationSchema),
  createdAt: isoDateTime,
  parentPlanId: z.string().nullable(),
  demoData: z.boolean(),
});
export type TripPlan = z.infer<typeof tripPlanSchema>;

export const planChangeSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("activity_cancelled"), activityId: z.string().min(1), description: z.string().max(300).optional() }),
  z.object({ type: z.literal("delay"), activityId: z.string().min(1), delayMinutes: z.number().int().min(1).max(720), description: z.string().max(300).optional() }),
  z.object({ type: z.literal("budget_changed"), amount: z.number().nonnegative(), description: z.string().max(300).optional() }),
  z.object({ type: z.literal("manual"), description: z.string().min(1).max(300) }),
]);
export type PlanChange = z.infer<typeof planChangeSchema>;

export const planRequestSchema = z.object({
  trip: tripSchema,
  activities: z.array(activitySchema).min(1).max(100),
  now: isoDateTime.optional(),
  basePlan: tripPlanSchema.optional(),
  change: planChangeSchema.optional(),
});
export type PlanRequest = z.infer<typeof planRequestSchema>;
