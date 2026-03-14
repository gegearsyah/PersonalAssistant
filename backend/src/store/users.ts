import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { createHash, scryptSync, randomBytes, timingSafeEqual } from 'crypto';
import { config } from '../config.js';

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: string;
}

const USERS_FILE = join(config.dataDir, 'users.json');

async function ensureDir(): Promise<void> {
  await mkdir(config.dataDir, { recursive: true });
}

async function readUsers(): Promise<User[]> {
  try {
    const data = await readFile(USERS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function writeUsers(users: User[]): Promise<void> {
  await ensureDir();
  await writeFile(USERS_FILE, JSON.stringify(users, null, 2), 'utf-8');
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const computed = scryptSync(password, salt, 64).toString('hex');
  try {
    return timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(computed, 'hex'));
  } catch {
    return false;
  }
}

export async function findUserByEmail(email: string): Promise<User | null> {
  const users = await readUsers();
  const normalized = email.trim().toLowerCase();
  return users.find((u) => u.email === normalized) ?? null;
}

export async function findUserById(id: string): Promise<User | null> {
  const users = await readUsers();
  return users.find((u) => u.id === id) ?? null;
}

export async function createUser(email: string, password: string): Promise<User> {
  const normalized = email.trim().toLowerCase();
  if (!normalized || password.length < 6) {
    throw new Error('Email and password (min 6 characters) required');
  }
  const users = await readUsers();
  if (users.some((u) => u.email === normalized)) {
    throw new Error('Email already registered');
  }
  const user: User = {
    id: createHash('sha256').update(normalized + Date.now()).digest('hex').slice(0, 24),
    email: normalized,
    passwordHash: hashPassword(password),
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  await writeUsers(users);
  return user;
}

export async function verifyUser(email: string, password: string): Promise<User | null> {
  const user = await findUserByEmail(email);
  if (!user || !verifyPassword(password, user.passwordHash)) return null;
  return user;
}
