import { DetailDialog } from "@/components/shared/detail-dialog";
import DetailRoute from "@/app/(dashboard)/roles/[id]/page";

/**
 * `/roles/<id>` opened from inside the app (T-243).
 *
 * The page itself renders unchanged, inside the dialog: whatever it reads and
 * whatever it shows, this shows the same, and neither can drift from the
 * other. A direct visit to the address does not come through here at all - it
 * renders the full page, which is how old links and notifications keep
 * working.
 */
export default function ModalRoleDetail(
  props: PageProps<"/roles/[id]">,
) {
  return (
    <DetailDialog>
      <DetailRoute {...props} />
    </DetailDialog>
  );
}
