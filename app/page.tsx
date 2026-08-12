import { cookies } from "next/headers";
import SpaDashboard from "@/app/components/SpaDashboard";
import {
  getSettingsAction,
  listFieldsAction,
  listRecordsAction,
} from "@/app/lib/action";

export default async function Home() {
  const cookieStore = await cookies();
  const session = cookieStore.get("lark_web_session")?.value;

  // const isAdmin = session === "admin";

  const settings = await getSettingsAction();
  const fieldsResult = await listFieldsAction();
  const recordsResult = await listRecordsAction({ pageSize: 20 });

  return (
    <SpaDashboard
      settings={settings}
      fieldsResult={fieldsResult}
      recordsResult={recordsResult}
    />
  );
}