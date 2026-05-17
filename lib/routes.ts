export const ROUTES = {
  HOME: "/",
  LOGIN: "/login",
  DASHBOARD: "/dashboard",
  ORDER_DETAIL: (id: string) => `/dashboard/orders/${id}`,
  PRICE_CHANGES: "/dashboard/price-changes",
  PRODUCT_DETAIL: (id: string) => `/dashboard/products/${id}`,
  SETTINGS: "/dashboard/settings",
} as const;
