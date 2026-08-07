import SpaDashboard from "@/app/components/SpaDashboard";
import { getSettingsAction, listFieldsAction, listRecordsAction } from "@/app/lib/action";

export default async function Home() {
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