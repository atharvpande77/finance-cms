import { CircleAlert } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function FormError({ message, id }: { message?: string; id?: string }) {
  if (!message) return null;
  return (
    <Alert variant="destructive" id={id} data-error>
      <CircleAlert strokeWidth={1.75} />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
