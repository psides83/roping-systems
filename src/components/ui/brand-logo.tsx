import Image from "next/image";

export function BrandLogo({ className = "w-40", decorative = false }: { className?: string; decorative?: boolean }) {
  return <span className={`block shrink-0 overflow-hidden rounded-lg bg-[#f3f0e7] p-2 ${className}`}>
    <span className="relative block aspect-[1.65] overflow-hidden">
      <Image src="/roping-systems-branding.png" alt={decorative ? "" : "Roping Systems"}
        width={1246} height={1246} sizes="(max-width: 640px) 280px, 400px"
        className="absolute inset-x-0 top-0 h-auto w-full -translate-y-[18%]" />
    </span>
  </span>;
}
