/* eslint-disable */
import * as Router from 'expo-router';

export * from 'expo-router';

declare module 'expo-router' {
  export namespace ExpoRouter {
    export interface __routes<T extends string | object = string> {
      hrefInputParams: { pathname: Router.RelativePathString, params?: Router.UnknownInputParams } | { pathname: Router.ExternalPathString, params?: Router.UnknownInputParams } | { pathname: `/chat`; params?: Router.UnknownInputParams; } | { pathname: `/`; params?: Router.UnknownInputParams; } | { pathname: `/missions`; params?: Router.UnknownInputParams; } | { pathname: `/settings`; params?: Router.UnknownInputParams; } | { pathname: `/_sitemap`; params?: Router.UnknownInputParams; } | { pathname: `/missions/[threadId]`, params: Router.UnknownInputParams & { threadId: string | number; } };
      hrefOutputParams: { pathname: Router.RelativePathString, params?: Router.UnknownOutputParams } | { pathname: Router.ExternalPathString, params?: Router.UnknownOutputParams } | { pathname: `/chat`; params?: Router.UnknownOutputParams; } | { pathname: `/`; params?: Router.UnknownOutputParams; } | { pathname: `/missions`; params?: Router.UnknownOutputParams; } | { pathname: `/settings`; params?: Router.UnknownOutputParams; } | { pathname: `/_sitemap`; params?: Router.UnknownOutputParams; } | { pathname: `/missions/[threadId]`, params: Router.UnknownOutputParams & { threadId: string; } };
      href: Router.RelativePathString | Router.ExternalPathString | `/chat${`?${string}` | `#${string}` | ''}` | `/${`?${string}` | `#${string}` | ''}` | `/missions${`?${string}` | `#${string}` | ''}` | `/settings${`?${string}` | `#${string}` | ''}` | `/_sitemap${`?${string}` | `#${string}` | ''}` | { pathname: Router.RelativePathString, params?: Router.UnknownInputParams } | { pathname: Router.ExternalPathString, params?: Router.UnknownInputParams } | { pathname: `/chat`; params?: Router.UnknownInputParams; } | { pathname: `/`; params?: Router.UnknownInputParams; } | { pathname: `/missions`; params?: Router.UnknownInputParams; } | { pathname: `/settings`; params?: Router.UnknownInputParams; } | { pathname: `/_sitemap`; params?: Router.UnknownInputParams; } | `/missions/${Router.SingleRoutePart<T>}${`?${string}` | `#${string}` | ''}` | { pathname: `/missions/[threadId]`, params: Router.UnknownInputParams & { threadId: string | number; } };
    }
  }
}
