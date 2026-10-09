import { resetTestDatabase } from "../test-db";

export default function setup() {
  resetTestDatabase({ seed: true });
}
