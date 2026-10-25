export type Role = 'owner' | 'admin' | 'recruiter' | 'viewer';
export const WRITE_ROLES: Role[] = ['owner', 'admin', 'recruiter'];
export const ADMIN_ROLES: Role[] = ['owner', 'admin'];
export const canWrite = (role: Role) => WRITE_ROLES.includes(role);
