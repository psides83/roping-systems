"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActiveProducer } from "@/lib/producers";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { formatProperNoun } from "@/lib/utils";

export interface ClassificationFormState {
  success?: boolean;
  message?: string;
  errors?: Record<string, string[]>;
}

const optionalAgeSchema = z
  .union([
    z.literal(""),
    z.coerce.number().int().min(0, "Age cannot be negative.").max(120),
  ])
  .transform((value) => (value === "" ? null : value));

const optionalUuidSchema = z
  .union([z.literal(""), z.uuid()])
  .transform((value) => (value === "" ? null : value));

const optionalClassificationNumberSchema = z
  .union([
    z.literal(""),
    z.coerce
      .number()
      .min(0, "Classification number cannot be negative.")
      .max(100)
      .refine(
        (value) => Number.isInteger(value * 10),
        "Use no more than one decimal place.",
      ),
  ])
  .transform((value) => (value === "" ? null : value));

const optionalHandicapAdjustmentSchema = z
  .union([
    z.literal(""),
    z.coerce
      .number()
      .min(-60, "The adjustment cannot subtract more than 60 seconds.")
      .max(60, "The adjustment cannot add more than 60 seconds."),
  ])
  .transform((value) => (value === "" ? null : value));

const disciplineSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Division name is required.")
      .transform(formatProperNoun),
    description: z.string().trim(),
    genderPolicy: z.enum(["open", "women_only"]),
    maleYouthMaximumAge: optionalAgeSchema,
    maleSeniorMinimumAge: optionalAgeSchema,
    maleClassificationDisciplineId: optionalUuidSchema,
    maleMinimumClassificationNumber: optionalClassificationNumberSchema,
  })
  .superRefine((data, context) => {
    if (
      data.genderPolicy === "women_only" &&
      data.maleYouthMaximumAge !== null &&
      data.maleSeniorMinimumAge !== null &&
      data.maleYouthMaximumAge >= data.maleSeniorMinimumAge
    )
      context.addIssue({
        code: "custom",
        path: ["maleSeniorMinimumAge"],
        message: "Senior minimum age must be above the youth maximum age.",
      });
    if (
      data.genderPolicy === "women_only" &&
      Boolean(data.maleClassificationDisciplineId) !==
        (data.maleMinimumClassificationNumber !== null)
    )
      context.addIssue({
        code: "custom",
        path: ["maleMinimumClassificationNumber"],
        message:
          "Choose a classification division and enter its minimum number.",
      });
  });

const updateDisciplineSchema = disciplineSchema.extend({
  disciplineId: z.uuid(),
  isActive: z.string().optional(),
});

const classificationSchema = z
  .object({
    disciplineId: z.uuid(),
    name: z
      .string()
      .trim()
      .min(1, "Classification name is required.")
      .transform(formatProperNoun),
    description: z.string().trim(),
    classificationNumber: z.coerce
      .number()
      .min(0, "Classification number cannot be negative.")
      .max(100)
      .refine(
        (value) => Number.isInteger(value * 10),
        "Use no more than one decimal place.",
      ),
    eligibilityType: z.enum(["skill", "open", "age"]),
    minimumAge: optionalAgeSchema,
    maximumAge: optionalAgeSchema,
    ropingUse: z.enum(["standalone", "handicap", "both"]),
    handicapAdjustmentSeconds: optionalHandicapAdjustmentSchema,
  })
  .superRefine((data, context) => {
    if (
      data.eligibilityType === "age" &&
      data.minimumAge === null &&
      data.maximumAge === null
    ) {
      context.addIssue({
        code: "custom",
        path: ["minimumAge"],
        message: "Enter a minimum age, maximum age, or both.",
      });
    }
    if (
      data.minimumAge !== null &&
      data.maximumAge !== null &&
      data.minimumAge > data.maximumAge
    ) {
      context.addIssue({
        code: "custom",
        path: ["maximumAge"],
        message: "Maximum age must be at least the minimum age.",
      });
    }
    if (
      data.ropingUse !== "standalone" &&
      data.handicapAdjustmentSeconds === null
    )
      context.addIssue({
        code: "custom",
        path: ["handicapAdjustmentSeconds"],
        message: "Enter the final time adjustment for this classification.",
      });
  });

const updateClassificationSchema = classificationSchema.extend({
  classificationId: z.uuid(),
  isActive: z.string().optional(),
});
const idSchema = z.uuid();

async function getManagerContext() {
  if (!isSupabaseConfigured()) return null;
  const producer = await getActiveProducer();
  if (!producer || producer.role === "viewer") return null;
  return { producer, supabase: await createClient() };
}

async function classificationDisciplineIsAvailable(
  context: NonNullable<Awaited<ReturnType<typeof getManagerContext>>>,
  disciplineId: string | null,
) {
  if (!disciplineId) return true;
  const { data } = await context.supabase
    .from("divisions")
    .select("id")
    .eq("id", disciplineId)
    .eq("producer_id", context.producer.id)
    .single();
  return Boolean(data);
}

export async function createDiscipline(
  _state: ClassificationFormState,
  formData: FormData,
): Promise<ClassificationFormState> {
  const parsed = disciplineSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
  const context = await getManagerContext();
  if (!context)
    return { message: "Sign in with manager access to create divisions." };
  if (
    !(await classificationDisciplineIsAvailable(
      context,
      parsed.data.maleClassificationDisciplineId,
    ))
  )
    return {
      errors: {
        maleClassificationDisciplineId: [
          "Choose a classification division from this producer.",
        ],
      },
    };

  const { error } = await context.supabase.from("divisions").insert({
    producer_id: context.producer.id,
    name: parsed.data.name,
    description: parsed.data.description || null,
    review_after_event_count: null,
    gender_policy: parsed.data.genderPolicy,
    male_youth_maximum_age:
      parsed.data.genderPolicy === "women_only"
        ? parsed.data.maleYouthMaximumAge
        : null,
    male_senior_minimum_age:
      parsed.data.genderPolicy === "women_only"
        ? parsed.data.maleSeniorMinimumAge
        : null,
    male_classification_division_id:
      parsed.data.genderPolicy === "women_only"
        ? parsed.data.maleClassificationDisciplineId
        : null,
    male_minimum_classification_number:
      parsed.data.genderPolicy === "women_only"
        ? parsed.data.maleMinimumClassificationNumber
        : null,
  });
  if (error)
    return {
      message:
        error.code === "23505"
          ? "A division with that name already exists."
          : error.message,
    };

  revalidatePath("/settings/classifications");
  return { success: true, message: "Division created." };
}

export async function createClassification(
  _state: ClassificationFormState,
  formData: FormData,
): Promise<ClassificationFormState> {
  const parsed = classificationSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
  const context = await getManagerContext();
  if (!context)
    return {
      message: "Sign in with manager access to create classifications.",
    };

  const { data: discipline } = await context.supabase
    .from("divisions")
    .select("id")
    .eq("id", parsed.data.disciplineId)
    .eq("producer_id", context.producer.id)
    .single();
  if (!discipline)
    return { message: "That division is not available in this producer." };

  const { error } = await context.supabase.from("classifications").insert({
    producer_id: context.producer.id,
    division_id: discipline.id,
    name: parsed.data.name,
    description: parsed.data.description || null,
    rank:
      parsed.data.eligibilityType === "skill"
        ? parsed.data.classificationNumber
        : 0,
    eligibility_type: parsed.data.eligibilityType,
    minimum_age:
      parsed.data.eligibilityType === "age" ? parsed.data.minimumAge : null,
    maximum_age:
      parsed.data.eligibilityType === "age" ? parsed.data.maximumAge : null,
    standalone_enabled: parsed.data.ropingUse !== "handicap",
    handicap_adjustment_seconds:
      parsed.data.ropingUse === "standalone"
        ? null
        : -parsed.data.handicapAdjustmentSeconds!,
  });
  if (error)
    return {
      message:
        error.code === "23505"
          ? "That classification already exists in this division."
          : error.message,
    };

  revalidatePath("/settings/classifications");
  revalidatePath("/settings/roping-templates");
  revalidatePath("/events");
  return { success: true, message: "Classification created." };
}

export async function updateDiscipline(
  _state: ClassificationFormState,
  formData: FormData,
): Promise<ClassificationFormState> {
  const parsed = updateDisciplineSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
  const context = await getManagerContext();
  if (!context)
    return { message: "Sign in with manager access to edit divisions." };
  if (
    !(await classificationDisciplineIsAvailable(
      context,
      parsed.data.maleClassificationDisciplineId,
    ))
  )
    return {
      errors: {
        maleClassificationDisciplineId: [
          "Choose a classification division from this producer.",
        ],
      },
    };

  const { error } = await context.supabase
    .from("divisions")
    .update({
      name: parsed.data.name,
      description: parsed.data.description || null,
      is_active: parsed.data.isActive === "on",
      gender_policy: parsed.data.genderPolicy,
      male_youth_maximum_age:
        parsed.data.genderPolicy === "women_only"
          ? parsed.data.maleYouthMaximumAge
          : null,
      male_senior_minimum_age:
        parsed.data.genderPolicy === "women_only"
          ? parsed.data.maleSeniorMinimumAge
          : null,
      male_classification_division_id:
        parsed.data.genderPolicy === "women_only"
          ? parsed.data.maleClassificationDisciplineId
          : null,
      male_minimum_classification_number:
        parsed.data.genderPolicy === "women_only"
          ? parsed.data.maleMinimumClassificationNumber
          : null,
    })
    .eq("id", parsed.data.disciplineId)
    .eq("producer_id", context.producer.id);
  if (error)
    return {
      message:
        error.code === "23505"
          ? "A division with that name already exists."
          : error.message,
    };
  revalidatePath("/settings/classifications");
  revalidatePath("/settings/roping-templates");
  return { success: true, message: "Division updated." };
}

export async function updateClassification(
  _state: ClassificationFormState,
  formData: FormData,
): Promise<ClassificationFormState> {
  const parsed = updateClassificationSchema.safeParse(
    Object.fromEntries(formData),
  );
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
  const context = await getManagerContext();
  if (!context)
    return { message: "Sign in with manager access to edit classifications." };

  const { data: discipline } = await context.supabase
    .from("divisions")
    .select("id")
    .eq("id", parsed.data.disciplineId)
    .eq("producer_id", context.producer.id)
    .single();
  if (!discipline)
    return { message: "That division is not available in this producer." };
  const { error } = await context.supabase
    .from("classifications")
    .update({
      name: parsed.data.name,
      description: parsed.data.description || null,
      rank:
        parsed.data.eligibilityType === "skill"
          ? parsed.data.classificationNumber
          : 0,
      eligibility_type: parsed.data.eligibilityType,
      minimum_age:
        parsed.data.eligibilityType === "age" ? parsed.data.minimumAge : null,
      maximum_age:
        parsed.data.eligibilityType === "age" ? parsed.data.maximumAge : null,
      standalone_enabled: parsed.data.ropingUse !== "handicap",
      handicap_adjustment_seconds:
        parsed.data.ropingUse === "standalone"
          ? null
          : -parsed.data.handicapAdjustmentSeconds!,
      is_active: parsed.data.isActive === "on",
    })
    .eq("id", parsed.data.classificationId)
    .eq("division_id", discipline.id)
    .eq("producer_id", context.producer.id);
  if (error)
    return {
      message:
        error.code === "23505"
          ? "That classification already exists in this division."
          : error.message,
    };
  revalidatePath("/settings/classifications");
  revalidatePath("/settings/roping-templates");
  revalidatePath("/events");
  return { success: true, message: "Classification updated." };
}

function deletionMessage(
  error: { code?: string; message: string },
  record: "division" | "classification",
) {
  if (error.code !== "23503") return error.message;
  return record === "division"
    ? "This division is still used by classifications, roping templates, members, or event history. Remove those connections before deleting it."
    : "This classification is still used by a member, incentive rule, or event history. Remove those connections before deleting it.";
}

export async function deleteDiscipline(
  disciplineId: string,
): Promise<ClassificationFormState> {
  const parsed = idSchema.safeParse(disciplineId);
  if (!parsed.success) return { message: "Choose a valid division." };
  const context = await getManagerContext();
  if (!context)
    return { message: "Sign in with manager access to delete divisions." };
  const { data, error } = await context.supabase
    .from("divisions")
    .delete()
    .eq("id", parsed.data)
    .eq("producer_id", context.producer.id)
    .select("id")
    .maybeSingle();
  if (error) return { message: deletionMessage(error, "division") };
  if (!data) return { message: "That division is no longer available." };
  revalidatePath("/settings/classifications");
  revalidatePath("/settings/roping-templates");
  return { success: true, message: "Division deleted." };
}

export async function deleteClassification(
  classificationId: string,
): Promise<ClassificationFormState> {
  const parsed = idSchema.safeParse(classificationId);
  if (!parsed.success) return { message: "Choose a valid classification." };
  const context = await getManagerContext();
  if (!context)
    return {
      message: "Sign in with manager access to delete classifications.",
    };
  const { data, error } = await context.supabase
    .from("classifications")
    .delete()
    .eq("id", parsed.data)
    .eq("producer_id", context.producer.id)
    .select("id")
    .maybeSingle();
  if (error) return { message: deletionMessage(error, "classification") };
  if (!data) return { message: "That classification is no longer available." };
  revalidatePath("/settings/classifications");
  revalidatePath("/settings/roping-templates");
  return { success: true, message: "Classification deleted." };
}
