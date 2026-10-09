import { redirect } from "next/navigation";
import { getActiveProducer } from "@/lib/producers";

export default async function NewBulletinPage() {
  const producer = await getActiveProducer();
  if (!producer || !["owner", "admin"].includes(producer.role)) redirect("/settings/news");
  redirect(`/settings/news/${crypto.randomUUID()}?new=1`);
}
