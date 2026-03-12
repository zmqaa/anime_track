"use client";

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import { navigationItems, config } from '@/lib/config';

interface SidebarLayoutProps {
  children: React.ReactNode;
}

export default function SidebarLayout({ children }: SidebarLayoutProps) {
  const { data: session } = useSession();
  const [collapsed, setCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const pathname = usePathname();

  const isGuest = (session?.user as any)?.role === 'guest';
  const menuItems = [...navigationItems];

  return (
    <div className="flex h-screen overflow-hidden bg-transparent relative">
      {/* 手机端头部 */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-zinc-950/80 backdrop-blur-xl border-b border-white/5 z-30 flex items-center justify-between px-4">
        <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-primary to-purple-400 bg-clip-text text-transparent">
          {config.appName}
        </h1>
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="p-2 hover:bg-white/5 rounded-lg transition-all duration-200"
          aria-label="菜单"
        >
          <svg className="w-6 h-6 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={isMobileMenuOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} />
          </svg>
        </button>
      </div>

      {/* 手机端遮罩 */}
      {isMobileMenuOpen && (
        <div 
          className="lg:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* 侧边栏 */}
      <aside 
        className={`
          ${collapsed ? 'lg:w-20' : 'lg:w-64'} 
          fixed lg:relative inset-y-0 left-0 z-50 transform 
          ${isMobileMenuOpen ? 'translate-x-0 w-64' : '-translate-x-full w-64 lg:translate-x-0'}
          bg-zinc-950/90 lg:bg-zinc-950/40 backdrop-blur-xl border-r border-white/5 
          transition-all duration-300 flex flex-col
        `}
      >
        {/* Logo (仅桌面端显示) */}
        <div className="hidden lg:flex h-16 items-center justify-between px-4 border-b border-border/50">
          {!collapsed && (
            <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-primary to-purple-400 bg-clip-text text-transparent">
              {config.appName}
            </h1>
          )}
          {isGuest && !collapsed && (
            <span className="ml-2 px-2 py-0.5 text-[10px] bg-zinc-800 text-zinc-400 border border-white/5 rounded-full">
              访客模式
            </span>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-2 hover:bg-white/5 rounded-lg transition-all duration-200 hover:text-primary"
            aria-label={collapsed ? '展开' : '收起'}
          >
            <svg 
              className="w-5 h-5" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d={collapsed ? "M9 5l7 7-7 7" : "M15 19l-7-7 7-7"} 
              />
            </svg>
          </button>
        </div>

        {/* 导航 */}
        <nav className="flex-1 py-4 lg:py-4 space-y-1 mt-16 lg:mt-0">
          {menuItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setIsMobileMenuOpen(false)}
                className={`
                  relative flex items-center gap-3 px-4 py-3 mx-2 rounded-xl
                  transition-all duration-300 group overflow-hidden
                  ${isActive
                    ? 'bg-primary/10 text-primary border border-primary/20 shadow-[0_0_15px_rgba(139,92,246,0.15)]'
                    : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200 hover:translate-x-1'
                  }
                `}
                title={item.description}
              >
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-primary rounded-r-full shadow-[0_0_10px_rgba(139,92,246,0.6)]" />
                )}
                {/* 活跃状态下的光效背景 */}
                 {isActive && (
                    <div className="absolute inset-0 bg-gradient-to-r from-primary/10 to-transparent opacity-50" />
                 )}
                
                <span className={`text-sm font-medium tracking-wide relative z-10 ${isActive ? 'font-semibold' : ''}`}>
                  {collapsed ? item.label.charAt(0) : item.label}
                </span>
                {!collapsed && !isActive && (
                  <span className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity text-xs text-primary/50">
                    →
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* 底部信息 */}
        <div className="p-4 border-t border-border/50 bg-black/20">
          {!collapsed && (
            <div className="flex flex-col gap-2">
              <div className="text-xs text-zinc-500 space-y-1">
                <p className="font-mono opacity-50">{config.version}</p>
                <p className="opacity-70">{config.startDate}</p>
              </div>
              <button 
                onClick={() => signOut()}
                className="text-xs flex items-center gap-2 text-zinc-400 hover:text-red-400 transition-colors py-1 cursor-pointer"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                退出登录
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* 主内容区 */}
      <main className="flex-1 overflow-y-auto relative z-10 scroll-smooth bg-black/5 backdrop-blur-[1px] pt-16 lg:pt-0">
        {children}
      </main>
    </div>
  );
}
