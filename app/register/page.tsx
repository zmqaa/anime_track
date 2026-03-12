"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function RegisterPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, name }),
      });

      const data = await res.json();

      if (res.ok) {
        router.push("/login?registered=true");
      } else {
        setError(data.error || "注册失败");
      }
    } catch (err) {
      setError("网络错误，请稍后再试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#09090b] text-white">
      <div className="w-full max-w-md p-8 glass-panel border border-white/10 rounded-3xl shadow-2xl">
        <div className="text-center mb-10">
          <div className="w-16 h-16 bg-purple-600 rounded-2xl mx-auto mb-4 flex items-center justify-center shadow-lg shadow-purple-500/20">
            <span className="text-2xl font-bold">A</span>
          </div>
          <h1 className="text-2xl font-light tracking-tight">创建新账号</h1>
          <p className="text-zinc-500 text-sm mt-2">加入你的 Anime Track</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-500 p-3 rounded-xl text-sm text-center">
              {error}
            </div>
          )}
          
          <div>
            <label className="block text-xs font-medium text-zinc-500 mb-2 uppercase tracking-widest">显示名称</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="您的昵称"
              className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl px-4 py-3 focus:outline-none focus:ring-1 focus:ring-purple-500 transition-all font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-500 mb-2 uppercase tracking-widest">用户名</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="用于登录的账号"
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
              placeholder="••••••••"
              className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl px-4 py-3 focus:outline-none focus:ring-1 focus:ring-purple-500 transition-all font-mono"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-white text-black font-medium py-3 rounded-xl hover:bg-zinc-200 transition-colors disabled:opacity-50"
          >
            {loading ? "正在注册..." : "立即注册"}
          </button>

          <div className="text-center mt-6">
            <p className="text-zinc-500 text-sm">
              已有账号？{" "}
              <Link href="/login" className="text-purple-400 hover:text-purple-300">
                去登录
              </Link>
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}
