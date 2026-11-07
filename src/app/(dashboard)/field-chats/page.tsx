import { Suspense } from "react";

import { FieldChatsOffice } from "@/components/site-access/field-chats-office";

/** 后台「手机沟通记录」 (JB127). */
export default function FieldChatsPage() {
  return (
    <Suspense>
      <FieldChatsOffice />
    </Suspense>
  );
}
