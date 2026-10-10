"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eventStaffAccess } from "@/lib/staff-access";

export interface ExpenseState { success?: boolean; message?: string }
const schema = z.object({ id: z.uuid(), revision: z.coerce.number().int().min(0), ropingId: z.union([z.literal(""),z.uuid()]), category: z.enum(["arena","cattle","labor","awards","other"]),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/, "Enter an amount with up to two decimal places.").transform(value => Math.round(Number(value)*100)).pipe(z.number().int().min(1).max(100000000)), note: z.string().trim().max(500), operation: z.enum(["save","remove"]) });
export async function saveExpense(eventId: string, _: ExpenseState, form: FormData): Promise<ExpenseState> {
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { message: parsed.error.issues[0]?.message };
  const access = await eventStaffAccess(eventId,"can_finance_event");
  if (!access) return { message: "Financial access is required." };
  const data = parsed.data;
  const {error} = await access.supabase.rpc("save_event_expense", {target_event:eventId,target_id:data.id,expected_revision:data.revision,target_roping:data.ropingId||null,expense_category:data.category,expense_amount:data.amount,expense_note:data.note,void_expense:data.operation==="remove"});
  if(error) return {message:error.message};
  revalidatePath(`/events/${eventId}/profitability`);
  revalidatePath(`/events/${eventId}`);
  return {success:true,message:data.operation==="remove"?"Expense removed.":"Expense saved."};
}
