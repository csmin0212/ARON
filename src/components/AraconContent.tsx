import { splitAraconText } from "@/lib/aracon";

const SIZE_CLASS = {
  sm: "h-14 w-14",
  md: "h-20 w-20",
  lg: "h-24 w-24",
} as const;

export default function AraconContent({
  text,
  size = "md",
}: {
  text: string;
  size?: keyof typeof SIZE_CLASS;
}) {
  return (
    <>
      {splitAraconText(text).map((part, index) =>
        typeof part === "string" ? (
          <span key={index}>{part}</span>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={`${part.id}-${index}`}
            src={part.src}
            alt={part.label}
            title={part.token}
            className={`${SIZE_CLASS[size]} mx-0.5 inline-block align-middle object-contain`}
          />
        ),
      )}
    </>
  );
}
