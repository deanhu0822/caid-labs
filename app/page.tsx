import ChangeWorkspace from "./changes/page";
import GraphWorkspace from "./graph-workspace";

export const dynamic = "force-dynamic";

export default function Home() {
  // Preserve the existing hosted experience until durable storage is configured.
  const persistentWorkspace =
    !process.env.VERCEL &&
    (process.env.NODE_ENV !== "production" ||
      Boolean(process.env.FORMA_CHANGE_DB));
  return persistentWorkspace ? <ChangeWorkspace /> : <GraphWorkspace />;
}
