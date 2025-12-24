export enum Role {
  READER = 'reader',
  EDITOR = 'editor',
  ADMIN = 'admin'
}

export interface User {
  id: string;
  username: string;
  password: string; // hashed
  role: Role;
  createdAt: Date;
}

export interface AuthUser {
  id: string;
  username: string;
  role: Role;
}