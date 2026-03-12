"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    handleLogin(username, password);
  };

  const handleLogin = async (u: string, p: string) => {
    const res = await signIn("credentials", {
      username: u,
      password: p,
      redirect: false,
    });

    if (res?.error) {
      setError("登录失败，请检查用户名或密码");
    } else {
      router.push("/");
      router.refresh();
    }
  };

  const handleGuestLogin = () => {
    handleLogin("guest", "guest");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#09090b] text-white">
      <div className="w-full max-w-md p-8 glass-panel border border-white/10 rounded-3xl shadow-2xl">
        <div className="text-center mb-10">
          <div className="w-16 h-16 bg-purple-600 rounded-2xl mx-auto mb-4 flex items-center justify-center shadow-lg shadow-purple-500/20">
            <span className="text-2xl font-bold">A</span>
          </div>
          <h1 className="text-2xl font-light tracking-tight">Anime Track</h1>
          <p className="text-zinc-500 text-sm mt-2">登录后开始记录你的追番进度</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-xs font-medium text-zinc-500 mb-2 uppercase tracking-widest">用户名</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl px-4 py-3 focus:outline-none focus:ring-1 focus:ring-purple-500 transition-all font-mono"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500 mb-2 uppercase tracking-widest">密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl px-4 py-3 focus:outline-none focus:ring-1 focus:ring-purple-500 transition-all font-mono"
              required
            />
          </div>

          {error && <p className="text-red-500 text-xs text-center">{error}</p>}

          <button
            type="submit"
            className="w-full py-3 bg-white text-black rounded-xl font-semibold hover:bg-zinc-200 transition-all shadow-lg shadow-white/5 active:scale-95"
          >
            进入追番库
          </button>

          <button
            type="button"
            onClick={handleGuestLogin}
            className="w-full py-3 bg-zinc-900 border border-zinc-800 text-zinc-400 rounded-xl font-medium hover:bg-zinc-800 hover:text-white transition-all active:scale-95"
          >
            以访客身份进入
          </button>

          <div className="text-center mt-6">
            <p className="text-zinc-500 text-sm">
              还没有账号？{" "}
              <a href="/register" className="text-purple-400 hover:text-purple-300">
                立即注册
              </a>
            </p>
          </div>
        </form>

        <div className="mt-8 pt-8 border-t border-white/5 text-center text-[10px] text-zinc-600 font-mono tracking-widest">
          ANIME_TRACK_v1.0 // SECURE_ACCESS
        </div>
      </div>
    </div>
  );
}
