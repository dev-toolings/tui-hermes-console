import { type ButtonHTMLAttributes, type ReactNode } from "react";

type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  label: string;
  children: ReactNode;
};

export function IconButton({ label, children, type = "button", ...props }: IconButtonProps) {
  return (
    <button className="icon-button" type={type} aria-label={label} title={label} {...props}>
      {children}
    </button>
  );
}
