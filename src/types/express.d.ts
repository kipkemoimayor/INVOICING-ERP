import { AuthTokenPayload } from "../modules/auth/auth.types";

declare module "express-serve-static-core" {
  interface Request {
    user?: AuthTokenPayload;
  }
}
