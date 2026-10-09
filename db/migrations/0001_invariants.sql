-- Invariants from doc 03.7 that span tables, plus storage settings drizzle cannot express.

-- Rate-limit counters need no crash safety.
ALTER TABLE "rate_limits" SET UNLOGGED;
--> statement-breakpoint

-- A role belongs to exactly one organisation type: the prefix before the first "_".
CREATE FUNCTION membership_role_matches_org() RETURNS trigger AS $$
DECLARE
  org_type text;
BEGIN
  SELECT type::text INTO org_type FROM organisations WHERE id = NEW.organisation_id;
  IF split_part(NEW.role::text, '_', 1) <> org_type THEN
    RAISE EXCEPTION 'role % does not belong to a % organisation', NEW.role, org_type
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER memberships_role_matches_org
  BEFORE INSERT OR UPDATE OF role, organisation_id ON memberships
  FOR EACH ROW EXECUTE FUNCTION membership_role_matches_org();
--> statement-breakpoint

-- A paper copy's tenant must publish the copy's language.
CREATE FUNCTION copy_language_supported() RETURNS trigger AS $$
BEGIN
  IF NEW.tenant_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM tenants WHERE id = NEW.tenant_id AND NEW.language = ANY(languages)
  ) THEN
    RAISE EXCEPTION 'tenant does not publish language %', NEW.language
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER article_versions_language_supported
  BEFORE INSERT OR UPDATE OF tenant_id, language ON article_versions
  FOR EACH ROW EXECUTE FUNCTION copy_language_supported();
--> statement-breakpoint

-- Audit rows and stats are never edited by hand (stats only grow).
CREATE FUNCTION audit_events_immutable() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.user_id IS NULL AND OLD.user_id IS NOT NULL
     AND NEW.action = OLD.action AND NEW.detail = OLD.detail AND NEW.created_at = OLD.created_at THEN
    RETURN NEW; -- the user was deleted (ON DELETE SET NULL)
  END IF;
  RAISE EXCEPTION 'audit events cannot be changed' USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER audit_events_no_update
  BEFORE UPDATE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION audit_events_immutable();
