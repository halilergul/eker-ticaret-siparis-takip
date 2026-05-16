export const ROUTES = {
  HOME: "/",
  LOGIN: "/login",
  DASHBOARD: "/dashboard",
  ORDER_DETAIL: (id: string) => `/dashboard/orders/${id}`,
} as const;
