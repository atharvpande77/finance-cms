import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** A new password and its repeat, with the rules or the problems found (04.12). */
export function NewPasswordFields({ problems }: { problems?: string[] }) {
  return (
    <>
      <div className="grid gap-2">
        <Label htmlFor="newPassword">New password</Label>
        <Input
          id="newPassword"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          required
          minLength={10}
          maxLength={200}
          aria-describedby="password-rules"
        />
        {problems?.length ? (
          <ul id="password-rules" className="grid gap-1 text-sm text-destructive" data-problems>
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        ) : (
          <p id="password-rules" className="text-sm text-pretty text-muted-foreground">
            At least 10 characters, with letters and a number. Avoid common passwords and your own
            name.
          </p>
        )}
      </div>
      <div className="grid gap-2">
        <Label htmlFor="confirmPassword">Repeat the new password</Label>
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
        />
      </div>
    </>
  );
}
