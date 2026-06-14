import { cn } from "@/lib/utils";

type PublicSectionWatermarkProps = {
  image?: string;
  position?: "right" | "left" | "center";
  className?: string;
};

const positionClasses = {
  right: "right-[-140px] top-[-90px] h-[520px] w-[520px] sm:h-[680px] sm:w-[680px]",
  left: "left-[-160px] bottom-[-140px] h-[520px] w-[520px] sm:h-[680px] sm:w-[680px]",
  center: "left-1/2 top-1/2 h-[620px] w-[620px] -translate-x-1/2 -translate-y-1/2 sm:h-[820px] sm:w-[820px]",
};

export function PublicSectionWatermark({
  image = "/watermarks/dtsc-watermark.png",
  position = "right",
  className,
}: PublicSectionWatermarkProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute z-0 bg-contain bg-center bg-no-repeat opacity-[0.055] blur-[1.5px] saturate-150",
        "mix-blend-screen",
        positionClasses[position],
        className
      )}
      style={{ backgroundImage: `url(${image})` }}
    />
  );
}