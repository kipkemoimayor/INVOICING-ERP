export type AuthTokenPayload = {
  sub: string;
  email: string;
  roles: string[];
  permissions: string[];
};

export type AuthenticatedUser = AuthTokenPayload & {
  firstName: string;
  lastName: string;
  status: string;
};
