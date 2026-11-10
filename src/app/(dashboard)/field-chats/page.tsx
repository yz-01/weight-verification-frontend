import { Suspense } from "react";

import { FieldChatsOffice } from "@/components/site-access/field-chats-office";

/** 后台「沟通记录」 (JB127; renamed by JB158). */
export default function FieldChatsPage() {
  return (
    <Suspense>
      <FieldChatsOffice />
    </Suspense>
  );
}
