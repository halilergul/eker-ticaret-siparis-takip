export const ROUTES = {
  HOME: "/",
  LOGIN: "/login",
  DASHBOARD: "/dashboard",
} as const;

export type Route = (typeof ROUTES)[keyof typeof ROUTES];
