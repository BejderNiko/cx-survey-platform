import type { ComponentProps } from "react";

/** Små stregikoner (16×16, currentColor) til navigation og lister. */

function Svg(props: ComponentProps<"svg">) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={16}
      height={16}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    />
  );
}

export function IconHome(props: ComponentProps<"svg">) {
  return (
    <Svg {...props}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
      <path d="M10 21v-6h4v6" />
    </Svg>
  );
}

export function IconPanel(props: ComponentProps<"svg">) {
  return (
    <Svg {...props}>
      <circle cx={9} cy={8} r={3.2} />
      <path d="M3.5 20c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5" />
      <circle cx={17} cy={9} r={2.4} />
      <path d="M16 15.2c2.3.2 4 1.7 4.5 4.3" />
    </Svg>
  );
}

export function IconStudy(props: ComponentProps<"svg">) {
  return (
    <Svg {...props}>
      <path d="M21 4 3.6 10.3a.5.5 0 0 0 .03.95L10 13l2.7 6.4a.5.5 0 0 0 .94.02L21 4Z" />
      <path d="M10 13l11-9" />
    </Svg>
  );
}

export function IconChart(props: ComponentProps<"svg">) {
  return (
    <Svg {...props}>
      <path d="M4 20V6" />
      <path d="M4 20h16" />
      <path d="M8.5 16v-5" />
      <path d="M13 16V8" />
      <path d="M17.5 16v-3" />
    </Svg>
  );
}


export function IconCog(props: ComponentProps<"svg">) {
  return (
    <Svg {...props}>
      <circle cx={12} cy={12} r={3} />
      <path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2-1.2L14.2 3h-4l-.4 2.4a7 7 0 0 0-2 1.2l-2.3-.9-2 3.4 2 1.5a7 7 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-.9a7 7 0 0 0 2 1.2l.4 2.4h4l.4-2.4a7 7 0 0 0 2-1.2l2.3.9 2-3.4-2-1.5c.07-.4.1-.8.1-1.2Z" />
    </Svg>
  );
}

export function IconSearch(props: ComponentProps<"svg">) {
  return (
    <Svg {...props}>
      <circle cx={11} cy={11} r={6.5} />
      <path d="m20 20-4.4-4.4" />
    </Svg>
  );
}
