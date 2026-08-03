import { redirect } from "next/navigation";

export default function CompaniesPage() {
  // The old combined company list is no longer an Admin workflow. The two
  // dedicated pages carry the correct create semantics for each company type.
  redirect("/contractor-partners");
}
