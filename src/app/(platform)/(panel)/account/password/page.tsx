import type { Metadata } from "next";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/panel/PageHeader";
import { requireUser } from "@/server/auth/current";
import { PasswordForm } from "./PasswordForm";

export const metadata: Metadata = { title: "Change password" };

export default async function ChangePasswordPage() {
  await requireUser();
  return (
    <>
      <PageHeader
        title="Change password"
        description="This sign-in stays open. Any other sign-ins of yours are ended."
      />
      <Card className="max-w-lg">
        <CardContent>
          <PasswordForm />
        </CardContent>
      </Card>
    </>
  );
}
