import { randomUUID } from "node:crypto";
class IdentifierGenerator {
    generateSessionIdentifier(): string {
        return randomUUID().replace(/-/g, "").slice(0, 12);
    }
}
export { IdentifierGenerator };
