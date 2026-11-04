import ChangeWorkspace from "./changes/page";
import GraphWorkspace from "./graph-workspace";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function Home() {
  // The hosted objective-led workspace is built separately from this Next app.
  if (process.env.VERCEL) redirect("/workspace");
  // Preserve the existing hosted experience until durable storage is configured.
  const persistentWorkspace =
    !process.env.VERCEL &&
    (process.env.NODE_ENV !== "production" ||
      Boolean(process.env.FORMA_CHANGE_DB));
  return persistentWorkspace ? <ChangeWorkspace /> : <GraphWorkspace />;
}
