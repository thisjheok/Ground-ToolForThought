import { SessionStore } from "../../state/sessionStore";
import { runCreateSessionFlow } from "./startSession";

export async function newSession(store: SessionStore) {
  await runCreateSessionFlow(store);
}
