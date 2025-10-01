export type UserRole = 'super-admin' | 'company-admin' | 'company-user';



export interface UserProfile {
  uid: string;
  email: string;
  role: UserRole;
  companyId: string;
  name?: string;
}

export interface Company {
  id: string;
  name: string;
  adminUids: string[];
  enabledAgents?: string[];
}