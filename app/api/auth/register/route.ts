import { NextResponse } from 'next/server';
import bcrypt from 'bcrypt';
import { query } from '@/lib/db';

interface ExistingUserRow {
  id: number;
}

export async function POST(request: Request) {
  try {
    const { username, password, name } = await request.json();

    if (!username || !password) {
      return NextResponse.json({ error: '请提供用户名和密码' }, { status: 400 });
    }

    // 检查用户是否已存在
    const existingUsers = await query<ExistingUserRow[]>('SELECT id FROM users WHERE username = ?', [username]);
    if (existingUsers && existingUsers.length > 0) {
      return NextResponse.json({ error: '用户名已存在' }, { status: 400 });
    }

    // 加密密码
    const passwordHash = await bcrypt.hash(password, 10);

    // 插入新用户
    await query(
      'INSERT INTO users (username, password_hash, name) VALUES (?, ?, ?)',
      [username, passwordHash, name || username]
    );

    return NextResponse.json({ message: '注册成功' }, { status: 201 });
  } catch (error: unknown) {
    console.error('Registration error:', error);
    return NextResponse.json({ error: '注册过程中出现错误' }, { status: 500 });
  }
}
