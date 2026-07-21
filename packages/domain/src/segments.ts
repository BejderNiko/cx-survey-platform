import { z } from "zod";

/**
 * Segment definitions: a flat AND-list of filters over panelist fields,
 * custom attributes, tags, and activity. Stored in segments.definition and
 * compiled to SQL by the web data layer.
 */

export const segmentFilterField = z.enum([
  "lifecycle",
  "language",
  "gender",
  "country",
  "city",
  "postal_code",
  "customer_status",
  "recruitment_source",
  "birth_year",
  "email",
  "tag",            // value = tag name
  "attribute",      // key = custom field key
  "consent",        // value = purpose with granted status
  "last_contact_days_gt", // no contact within N days
]);
export type SegmentFilterField = z.infer<typeof segmentFilterField>;

export const segmentFilter = z.object({
  field: segmentFilterField,
  key: z.string().optional(),   // custom attribute key when field = attribute
  op: z.enum(["eq", "ne", "in", "gte", "lte", "contains", "has", "not_has"]),
  value: z.unknown(),
});
export type SegmentFilter = z.infer<typeof segmentFilter>;

export const segmentDefinition = z.object({
  filters: z.array(segmentFilter),
});
export type SegmentDefinition = z.infer<typeof segmentDefinition>;
