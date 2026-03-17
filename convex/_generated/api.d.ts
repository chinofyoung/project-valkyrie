/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as activities from "../activities.js";
import type * as ai from "../ai.js";
import type * as aiAnalyses from "../aiAnalyses.js";
import type * as bestEfforts from "../bestEfforts.js";
import type * as chat from "../chat.js";
import type * as chatMessages from "../chatMessages.js";
import type * as strava from "../strava.js";
import type * as syncStatus from "../syncStatus.js";
import type * as trainingPlans from "../trainingPlans.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  activities: typeof activities;
  ai: typeof ai;
  aiAnalyses: typeof aiAnalyses;
  bestEfforts: typeof bestEfforts;
  chat: typeof chat;
  chatMessages: typeof chatMessages;
  strava: typeof strava;
  syncStatus: typeof syncStatus;
  trainingPlans: typeof trainingPlans;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
