import { startBaseApp } from "@lark-base-open/base-database-app-sdk/page";
import options from "../../base-app.config";
import "@lark-base-open/base-database-app-sdk/page/styles.css";
import "./index.css";

const application = startBaseApp(options);
void application.ready.catch(() =>
  console.warn("DMS could not connect to the host."),
);
if (import.meta.hot) import.meta.hot.dispose(() => application.dispose());
