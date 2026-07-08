'use client'

import { DesktopSidebar } from './DesktopSidebar'
import { TopBar } from './TopBar'
import { BottomNav } from './BottomNav'

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="flex min-h-screen w-full bg-background">
        <DesktopSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar />
          <div className="flex flex-1 flex-col pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-0">
            {children}
          </div>
        </div>
      </div>
      <BottomNav />
    </>
  )
}
