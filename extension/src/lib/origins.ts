import { DEFAULT_ORIGIN, DEV_ORIGINS, PROD_ORIGINS } from "../origins";

export { DEFAULT_ORIGIN };

export const ALLOWED_ORIGINS = import.meta.env.MODE === "development" ? [...PROD_ORIGINS, ...DEV_ORIGINS] : PROD_ORIGINS;
