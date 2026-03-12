import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcrypt';

import { query } from '@/lib/db';

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        username: { label: 'Username', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) {
          return null;
        }

        if (credentials.username === 'guest' && credentials.password === 'guest') {
          return {
            id: '999',
            name: '访客朋友',
            username: 'guest',
            role: 'guest',
          };
        }

        const users = await query<any[]>(
          'SELECT id, username, password_hash, name, role FROM users WHERE username = ?',
          [credentials.username]
        );

        if (users && users.length > 0) {
          const user = users[0];
          const isValid = await bcrypt.compare(credentials.password, user.password_hash);
          if (isValid) {
            return {
              id: user.id.toString(),
              name: user.name,
              username: user.username,
              role: user.role,
            };
          }
        }

        return null;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }: any) {
      if (user) {
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }: any) {
      if (session.user) {
        (session.user as any).role = token.role;
      }
      return session;
    },
  },
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: 'jwt',
  },
  secret: process.env.NEXTAUTH_SECRET,
};