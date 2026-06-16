import { cn } from "@/lib/utils";

type PublicSectionWatermarkProps = {
  image?: string;
  position?: "right" | "left" | "center";
  className?: string;
};

const positionClasses = {
  right:
    "right-[-72px] top-[-56px] h-[300px] w-[300px] sm:right-[-120px] sm:top-[-90px] sm:h-[520px] sm:w-[520px] lg:h-[680px] lg:w-[680px]",
  left:
    "left-[-72px] bottom-[-72px] h-[300px] w-[300px] sm:left-[-140px] sm:bottom-[-120px] sm:h-[520px] sm:w-[520px] lg:h-[680px] lg:w-[680px]",
  center:
    "left-1/2 top-1/2 h-[360px] w-[360px] -translate-x-1/2 -translate-y-1/2 sm:h-[620px] sm:w-[620px] lg:h-[820px] lg:w-[820px]",
};

export function PublicSectionWatermark({
  image = "/watermarks/dtsc-watermark.png",
  position = "right",
  className,
}: PublicSectionWatermarkProps) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
    >
      <div
        className={cn(
          "absolute bg-contain bg-center bg-no-repeat opacity-[0.055] blur-[1.5px] saturate-150",
          "mix-blend-screen",
          positionClasses[position],
          className
        )}
        style={{ backgroundImage: `url(${image})` }}
      />
    </div>
  );
}
