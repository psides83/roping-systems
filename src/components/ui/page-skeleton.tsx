import type { ReactNode } from "react";

function Bar({ className = "h-4 w-32" }: { className?: string }) {
  return <div className={`loading-skeleton rounded ${className}`} />;
}

function Header() {
  return <div className="space-y-3 border-b border-[#dfe4e1] pb-6"><Bar className="h-7 w-56 max-w-full" /><Bar className="h-3 w-80 max-w-full" /></div>;
}

function Rows({ count = 6 }: { count?: number }) {
  return <div className="overflow-hidden rounded-md border border-[#dfe4e1] bg-white">
    <div className="flex flex-wrap items-center gap-3 border-b border-[#e7ebe8] p-4"><Bar className="h-9 w-56 max-w-full" /><Bar className="h-9 w-28" /></div>
    <div className="divide-y divide-[#e7ebe8]">{Array.from({ length: count }, (_, index) => <div key={index} className="flex items-center gap-4 px-5 py-5">
      <Bar className="h-9 w-9 shrink-0" /><div className="min-w-0 flex-1 space-y-2"><Bar className={`h-3 ${index % 2 ? "w-36" : "w-44"} max-w-full`} /><Bar className="h-2.5 w-24" /></div><Bar className="hidden h-3 w-24 sm:block" /><Bar className="h-5 w-16" />
    </div>)}</div>
  </div>;
}

function Stats() {
  return <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className="space-y-4 rounded-md border border-[#dfe4e1] bg-white p-5"><Bar className="h-3 w-20" /><Bar className="h-7 w-14" /></div>)}</div>;
}

function Form() {
  return <div className="border-y border-[#dfe4e1] bg-white p-5"><div className="flex flex-wrap gap-x-6 gap-y-5">{Array.from({ length: 6 }, (_, index) => <div key={index} className="w-56 max-w-full space-y-2"><Bar className="h-3 w-24" /><Bar className="h-10 w-full" /></div>)}</div></div>;
}

function LoadingRegion({ children, label = "Loading page" }: { children: ReactNode; label?: string }) {
  return <div role="status" aria-live="polite" aria-busy="true"><span className="sr-only">{label}</span><div aria-hidden="true" className="space-y-6">{children}</div></div>;
}

export function PageSkeleton({ variant = "list" }: { variant?: "list" | "dashboard" | "event" | "live" | "payouts" | "settings" }) {
  return <LoadingRegion><Header />
    {variant === "dashboard" || variant === "event" ? <Stats /> : null}
    {variant === "settings" ? <Form /> : variant === "payouts" ? <div className="space-y-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className="flex items-center justify-between gap-4 rounded-md border border-[#dfe4e1] bg-white p-5"><div className="min-w-0 space-y-3"><Bar className="h-4 w-40 max-w-full" /><Bar className="h-3 w-56 max-w-full" /></div><Bar className="h-9 w-9 shrink-0" /></div>)}</div>
      : variant === "live" ? <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px]"><Rows /><Form /></div>
      : <Rows />}
  </LoadingRegion>;
}

export function PublicPageSkeleton() {
  return <div className="min-h-screen bg-[#f5f6f7]"><div aria-hidden="true" className="border-b border-[#dfe4e1] bg-white px-4 py-5"><div className="mx-auto flex max-w-6xl items-center gap-3"><Bar className="h-11 w-14" /><Bar className="h-5 w-48" /></div></div>
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6"><LoadingRegion label="Loading results"><Header /><div className="grid items-start gap-6 lg:grid-cols-[260px_minmax(0,1fr)]"><div className="space-y-5"><Bar className="h-9 w-56 max-w-full" />{Array.from({ length: 4 }, (_, index) => <div key={index} className="space-y-2 border-b border-[#dfe4e1] py-3"><Bar className="h-3 w-36" /><Bar className="h-3 w-48" /></div>)}</div><div className="min-w-0 space-y-5"><Header /><Rows /></div></div></LoadingRegion></div>
  </div>;
}

export function AppBootSkeleton() {
  return <div className="min-h-screen bg-[#f5f6f7] lg:grid lg:grid-cols-[244px_minmax(0,1fr)]"><aside aria-hidden="true" className="hidden min-h-screen space-y-6 border-r border-[#dfe4e1] bg-white p-5 lg:block"><Bar className="h-9 w-44" />{Array.from({ length: 7 }, (_, index) => <Bar key={index} className="h-8 w-full" />)}</aside><div className="min-w-0"><div aria-hidden="true" className="h-16 border-b border-[#dfe4e1] bg-white" /><div className="p-4 sm:p-6 lg:p-8"><PageSkeleton /></div></div></div>;
}
