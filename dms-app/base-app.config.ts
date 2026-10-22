import { createElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { StartBaseAppOptions } from '@lark-base-open/base-database-app-sdk/page';
import App from './page/src/App';
const queryClient = new QueryClient();
export default {
  app: App,
  providers: (children) =>
    createElement(QueryClientProvider, { client: queryClient }, children),
} satisfies StartBaseAppOptions;
