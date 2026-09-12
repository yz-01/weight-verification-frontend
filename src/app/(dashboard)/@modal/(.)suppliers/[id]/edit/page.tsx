import { FormDialog } from "@/components/shared/form-dialog";
import EditRoute from "@/app/(dashboard)/suppliers/[id]/edit/page";

/**
 * `/suppliers/[id]/edit` opened from inside the app (T-216).
 *
 * The page itself is rendered unchanged, inside the dialog: whatever it passes
 * to the form, this passes the same, and neither can drift from the other. A
 * direct visit to the address does not come through here at all - it renders
 * the full page, which is how the old links and bookmarks keep working.
 */
export default function ModalSupplierEdit(props: PageProps<"/suppliers/[id]/edit">) {
  return (
    <FormDialog>
      <EditRoute {...props} />
    </FormDialog>
  );
}
